/**
 * Agent streaming executor: SSE 스트리밍 기반 채팅 응답 생성.
 * executor.ts에서 분리된 스트리밍 전용 모듈.
 */

import type { DB } from "~/db";
import type { ClaudeContentBlock } from "~/lib/ai";
import { parseSSEStream, callLLM, BudgetBlockedError } from "~/lib/ai";
import { callLLMStream } from "~/lib/ai";
import type { FallbackContext } from "~/lib/ai";
import { messages as messagesTable, evidence } from "~/db";
import { eq, and } from "drizzle-orm";
import { buildConversationContext } from "./context-builder";
import { buildSystemPrompt, buildIdeaSystemPrompt } from "./system-prompt";
import { getToolsForAutonomyLevel, IDEA_TOOLS } from "./tool-registry";
import { sendBudgetWarning, addSummaryHeader } from "./agent-utils";
import { SoulEngine } from "~/features/chat/agent/soul-engine";
import { SessionManager } from "~/features/chat/agent/session-manager";
import { MemoryLifecycle } from "~/features/chat/agent/memory-lifecycle";
import {
  prepareAgentPipeline,
  processToolBlocks,
  saveAndFinalize,
  MAX_TOOL_ROUNDS,
  type ToolCallResult,
} from "./agent-pipeline";
import { extractCitationsFromToolResults, buildCitationBlock } from "./citation-builder";

/** SoulEngine + SessionManager 통합 옵션 (Graph Layer 활성화 시 사용) */
export interface StreamOptions {
  env?: Record<string, string | undefined>;
  sessionId?: string;
  userId?: string;
}

type SendFn = (ctrl: ReadableStreamDefaultController<Uint8Array>, data: Record<string, unknown>) => void;

interface StreamRoundResult {
  assistantText: string;
  toolUseBlocks: ClaudeContentBlock[];
  stopReason?: string;
  inputTokensDelta: number;
  outputTokensDelta: number;
}

/** Claude SSE 스트림을 소비하며 text_delta/tool_start를 클라이언트에 전달, 결과를 반환. */
async function consumeClaudeStream(
  rawStream: ReadableStream<Uint8Array>,
  controller: ReadableStreamDefaultController<Uint8Array>,
  send: SendFn,
): Promise<StreamRoundResult> {
  let assistantText = "";
  const contentBlocks: ClaudeContentBlock[] = [];
  let currentBlockIndex = -1;
  let currentToolInput = "";
  let stopReason: string | undefined;
  let inputTokensDelta = 0;
  let outputTokensDelta = 0;

  for await (const event of parseSSEStream(rawStream)) {
    switch (event.type) {
      case "message_start":
        if (event.message?.usage) inputTokensDelta += event.message.usage.input_tokens;
        break;
      case "content_block_start":
        currentBlockIndex = event.index ?? -1;
        if (event.content_block) {
          contentBlocks[currentBlockIndex] = { ...event.content_block };
          if (event.content_block.type === "tool_use") {
            currentToolInput = "";
            send(controller, { type: "tool_start", name: event.content_block.name });
          }
        }
        break;
      case "content_block_delta":
        if (event.delta?.type === "text_delta" && event.delta.text) {
          assistantText += event.delta.text;
          send(controller, { type: "text_delta", content: event.delta.text });
        } else if (event.delta?.type === "input_json_delta" && event.delta.partial_json) {
          currentToolInput += event.delta.partial_json;
        }
        break;
      case "content_block_stop":
        if (currentBlockIndex >= 0 && contentBlocks[currentBlockIndex]?.type === "tool_use") {
          try { contentBlocks[currentBlockIndex].input = JSON.parse(currentToolInput); }
          catch { contentBlocks[currentBlockIndex].input = {}; }
        }
        break;
      case "message_delta":
        if (event.delta?.stop_reason) stopReason = event.delta.stop_reason;
        if (event.usage) outputTokensDelta += event.usage.output_tokens;
        break;
    }
  }

  return {
    assistantText,
    toolUseBlocks: contentBlocks.filter((b) => b?.type === "tool_use"),
    stopReason,
    inputTokensDelta,
    outputTokensDelta,
  };
}

/** 도구 결과를 JSON 파싱 후 SSE tool_call 이벤트로 전송. */
function sendToolResults(
  results: ToolCallResult[],
  controller: ReadableStreamDefaultController<Uint8Array>,
  send: SendFn,
  executedToolNames: string[],
) {
  for (const tc of results) {
    executedToolNames.push(tc.name);
    let parsedResult: unknown;
    try { parsedResult = JSON.parse(tc.result); } catch { parsedResult = tc.result; }
    send(controller, { type: "tool_call", name: tc.name, input: tc.input, result: parsedResult });
  }
}

// ─── Insight Extraction ─────────────────────────────────────────────────

const SYSTEM_AGENT_ID = "system-agent";

const INSIGHT_EXTRACTION_PROMPT = `당신은 비즈니스 발굴 대화에서 검증 가능한 인사이트를 추출하는 분석가입니다.

다음 대화 내용에서 사실적 근거가 될 수 있는 인사이트를 추출하세요.

규칙:
- 각 인사이트는 독립적으로 검증 가능한 주장이어야 합니다
- 의견이나 감정이 아닌, 데이터나 사실에 기반한 내용만 추출하세요
- 최대 3개까지만 추출하세요
- 추출할 인사이트가 없으면 빈 배열을 반환하세요

JSON 형식으로 응답하세요:
{
  "insights": [
    {
      "content": "인사이트 내용 (200자 이내)",
      "type": "DATA | USER | ASSUMPTION | ARTIFACT | REF",
      "strength": "B | C | D"
    }
  ]
}`;

/** 대화의 tool_use 메시지에서 discoveryId를 추출 */
export async function findDiscoveryIdFromConversation(
  db: DB,
  conversationId: string,
): Promise<string | null> {
  const toolMessages = await db
    .select({ toolInput: messagesTable.toolInput })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.conversationId, conversationId),
        eq(messagesTable.role, "tool_use"),
      ),
    )
    .limit(20);

  for (const msg of toolMessages) {
    if (msg.toolInput && typeof msg.toolInput === "object") {
      const input = msg.toolInput as Record<string, unknown>;
      if (typeof input.discoveryId === "string") {
        return input.discoveryId;
      }
    }
  }
  return null;
}

/** LLM으로 대화 텍스트에서 인사이트를 추출하고 Evidence 후보로 저장 */
export async function extractAndSaveInsights(
  db: DB,
  conversationId: string,
  discoveryId: string,
  conversationText: string,
  env?: Record<string, string | undefined>,
): Promise<void> {
  const apiKey = env?.ANTHROPIC_API_KEY || "";
  const aiCtx = env ? { env } : undefined;

  const response = await callLLM(
    apiKey,
    {
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      temperature: 0.1,
      system: INSIGHT_EXTRACTION_PROMPT,
      messages: [{ role: "user", content: conversationText.slice(0, 2000) }],
    },
    aiCtx,
  );

  const textContent = response.content?.find(
    (b: { type: string }) => b.type === "text",
  ) as { type: "text"; text: string } | undefined;
  if (!textContent?.text) return;

  let parsed: {
    insights: Array<{ content: string; type: string; strength: string }>;
  };
  try {
    parsed = JSON.parse(textContent.text);
  } catch {
    return;
  }

  if (!parsed.insights?.length) return;

  for (const insight of parsed.insights.slice(0, 3)) {
    if (!insight.content || insight.content.length < 10) continue;

    await db.insert(evidence).values({
      id: crypto.randomUUID(),
      discoveryId,
      type: insight.type || "ASSUMPTION",
      strength: insight.strength || "C",
      content: insight.content.slice(0, 400),
      reliabilityLabel: "hypothesis",
      createdById: SYSTEM_AGENT_ID,
    });
  }
}

// ─── Session Memory Flush ───────────────────────────────────────────────

async function flushSessionMemory(
  db: DB,
  conversationId: string,
  streamOptions: StreamOptions | undefined,
  totalInput: number,
  totalOutput: number,
  text: string
): Promise<void> {
  if (streamOptions?.sessionId) {
    try {
      const sm = new SessionManager(db);
      await sm.updateTokenCount(streamOptions.sessionId, totalInput, totalOutput);
    } catch { /* 세션 집계 실패는 비치명적 */ }
  }
  if (streamOptions?.userId && streamOptions?.env) {
    try {
      const ml = new MemoryLifecycle(db);
      await ml.addDailyLog(streamOptions.userId, text.slice(0, 500), "conversation");
    } catch { /* 메모리 저장 실패는 비치명적 */ }
  }

  // 인사이트 추출: 대화에 연결된 Discovery가 있으면 Evidence 후보 생성
  if (streamOptions?.env) {
    try {
      const discoveryId = await findDiscoveryIdFromConversation(db, conversationId);
      if (discoveryId) {
        await extractAndSaveInsights(
          db, conversationId, discoveryId, text,
          streamOptions.env as Record<string, string>,
        );
      }
    } catch { /* 인사이트 추출 실패는 비치명적 */ }
  }
}

export function createAgentStreamResponse(
  db: DB,
  apiKey: string,
  conversationId: string,
  userMessage: string,
  tenantId?: string,
  purpose?: "chat" | "analysis",
  streamOptions?: StreamOptions,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  function send(controller: ReadableStreamDefaultController<Uint8Array>, data: Record<string, unknown>) {
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
  }

  return new ReadableStream({
    async start(controller) {
      try {
        const ctx = await prepareAgentPipeline(db, conversationId, userMessage);
        const isAnalysis = purpose === "analysis";

        // System prompt: 3-branch logic (ideas / graph projection / default)
        const useGraphProjection =
          !isAnalysis &&
          !!streamOptions?.env &&
          !!streamOptions?.userId &&
          true;

        let systemPrompt: string;
        if (isAnalysis) {
          systemPrompt = buildIdeaSystemPrompt(ctx.sourceContext);
        } else if (useGraphProjection && streamOptions?.userId) {
          const soulEngine = new SoulEngine({
            db,
            userId: streamOptions.userId,
            autonomyLevel: ctx.autonomyLevel,
            useGraphProjection: true,
          });
          const result = await soulEngine.buildPrompt();
          systemPrompt = result.systemPrompt;
        } else {
          systemPrompt = buildSystemPrompt(ctx.agentCfg, ctx.sourceContext);
        }

        const filteredTools = isAnalysis
          ? IDEA_TOOLS
          : getToolsForAutonomyLevel(ctx.autonomyLevel);
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        const executedToolNames: string[] = [];
        const allToolResults: ToolCallResult[] = [];

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const contextMessages = await buildConversationContext(db, conversationId, ctx.modelId);

          const purpose = isAnalysis ? "analysis" : "chat";
          const aiCtx: FallbackContext | undefined = streamOptions?.env
            ? { env: streamOptions.env, db, userId: streamOptions.userId, tenantId, purpose }
            : undefined;
          const rawStream = await callLLMStream(apiKey, {
            model: ctx.modelId,
            max_tokens: 4096,
            system: systemPrompt,
            messages: contextMessages,
            tools: filteredTools.length > 0 ? filteredTools : undefined,
          }, aiCtx);

          const streamResult = await consumeClaudeStream(rawStream, controller, send);
          totalInputTokens += streamResult.inputTokensDelta;
          totalOutputTokens += streamResult.outputTokensDelta;
          const { assistantText, toolUseBlocks, stopReason } = streamResult;

          if (toolUseBlocks.length === 0 || stopReason !== "tool_use") {
            // 인용 블록 후처리: 도구 결과에서 참조 엔티티 추출
            let finalText = assistantText;
            const hasGeneralLabel = assistantText.includes("일반 지식 기반 답변");
            let needsGeneralLabel = false;

            if (allToolResults.length > 0) {
              const citations = extractCitationsFromToolResults(allToolResults);
              const citationBlock = buildCitationBlock(citations);
              if (citationBlock) {
                send(controller, { type: "text_delta", content: citationBlock });
                finalText += citationBlock;
              } else if (!hasGeneralLabel) {
                needsGeneralLabel = true;
              }
            } else if (!hasGeneralLabel) {
              needsGeneralLabel = true;
            }

            if (needsGeneralLabel) {
              const label = "\n\n> [일반 지식 기반 답변 — Discovery 데이터 미참조]\n";
              send(controller, { type: "text_delta", content: label });
              finalText += label;
            }

            // No tool calls — save and finish
            await saveAndFinalize(db, conversationId, addSummaryHeader(finalText), {
              purpose: isAnalysis ? "analysis" : "chat",
              model: ctx.modelId,
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              toolRounds: round,
              tenantId,
              userId: streamOptions?.userId,
            });
            await flushSessionMemory(db, conversationId, streamOptions, totalInputTokens, totalOutputTokens, finalText);
            await sendBudgetWarning(db, controller, send);
            send(controller, { type: "done", tokensUsed: { input: totalInputTokens, output: totalOutputTokens } });
            controller.close();
            return;
          }

          // Process tool calls via shared pipeline
          const results = await processToolBlocks(
            db, conversationId, toolUseBlocks, assistantText, ctx.autonomyLevel, tenantId,
            streamOptions?.env as Record<string, string> | undefined,
          );
          sendToolResults(results, controller, send, executedToolNames);
          allToolResults.push(...results);

          // Rate limit mitigation: wait between tool rounds in analysis mode
          if (isAnalysis && round < MAX_TOOL_ROUNDS - 1) {
            await new Promise((r) => setTimeout(r, 2000));
          }
        }

        // Max rounds reached
        const streamToolSummary = executedToolNames.join(", ");
        const streamMaxRoundsMsg = `도구 호출 제한(${MAX_TOOL_ROUNDS}회)에 도달했습니다. 수행한 도구: ${streamToolSummary || "없음"}. 추가 작업이 필요하면 이어서 요청해주세요.`;

        await saveAndFinalize(db, conversationId, streamMaxRoundsMsg, {
          purpose: isAnalysis ? "analysis" : "chat",
          model: ctx.modelId,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          toolRounds: MAX_TOOL_ROUNDS,
          tenantId,
          userId: streamOptions?.userId,
        });
        await flushSessionMemory(db, conversationId, streamOptions, totalInputTokens, totalOutputTokens, streamMaxRoundsMsg);
        send(controller, { type: "text_delta", content: streamMaxRoundsMsg });
        send(controller, { type: "done", tokensUsed: { input: totalInputTokens, output: totalOutputTokens } });
        controller.close();
      } catch (error) {
        if (error instanceof BudgetBlockedError) {
          send(controller, {
            type: "error",
            message: "예산 한도를 초과하여 AI 응답을 생성할 수 없습니다.",
            errorType: "budget_blocked",
            retryable: false,
            suggestion: "관리자 → 비용 관리에서 예산 정책을 확인하세요.",
          });
          controller.close();
          return;
        }

        const isApiError = error instanceof Error && (
          error.message.includes("API") ||
          error.message.includes("401") ||
          error.message.includes("429") ||
          error.message.includes("500") ||
          error.message.includes("overloaded")
        );
        send(controller, {
          type: "error",
          message: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
          errorType: isApiError ? "api_error" : "internal_error",
          retryable: isApiError,
          suggestion: isApiError
            ? "잠시 후 다시 시도해주세요."
            : "문제가 지속되면 새 대화를 시작해보세요.",
        });
        controller.close();
      }
    },
  });
}
