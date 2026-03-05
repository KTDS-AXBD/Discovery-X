/**
 * Agent streaming executor: SSE 스트리밍 기반 채팅 응답 생성.
 * executor.ts에서 분리된 스트리밍 전용 모듈.
 */

import type { DB } from "~/db";
import type { ClaudeContentBlock } from "./claude-client";
import { parseSSEStream } from "./claude-client";
import { callLLMStream } from "~/lib/ai";
import type { FallbackContext } from "~/lib/ai";
import { buildConversationContext } from "./context-builder";
import { buildSystemPrompt, buildIdeaSystemPrompt } from "./system-prompt";
import { getToolsForAutonomyLevel, IDEA_TOOLS } from "./tool-registry";
import { sendBudgetWarning, addSummaryHeader } from "./agent-utils";
import { SoulEngine } from "~/lib/agent/soul-engine";
import { SessionManager } from "~/lib/agent/session-manager";
import { MemoryLifecycle } from "~/lib/agent/memory-lifecycle";
import { isFeatureEnabled } from "~/lib/feature-flags";
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

async function flushSessionMemory(
  db: DB,
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
  if (streamOptions?.userId && streamOptions?.env && isFeatureEnabled(streamOptions.env, "memoryLifecycle")) {
    try {
      const ml = new MemoryLifecycle(db);
      await ml.addDailyLog(streamOptions.userId, text.slice(0, 500), "conversation");
    } catch { /* 메모리 저장 실패는 비치명적 */ }
  }
}

export function createAgentStreamResponse(
  db: DB,
  apiKey: string,
  conversationId: string,
  userMessage: string,
  tenantId?: string,
  mode?: "default" | "ideas",
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
        const isIdeasMode = mode === "ideas";

        // System prompt: 3-branch logic (ideas / graph projection / default)
        const useGraphProjection =
          !isIdeasMode &&
          !!streamOptions?.env &&
          !!streamOptions?.userId &&
          isFeatureEnabled(streamOptions.env, "graphLayer");

        let systemPrompt: string;
        if (isIdeasMode) {
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

        const filteredTools = isIdeasMode
          ? IDEA_TOOLS
          : getToolsForAutonomyLevel(ctx.autonomyLevel);
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        const executedToolNames: string[] = [];
        const allToolResults: ToolCallResult[] = [];

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const contextMessages = await buildConversationContext(db, conversationId, ctx.modelId);

          const aiCtx: FallbackContext | undefined = streamOptions?.env ? { env: streamOptions.env } : undefined;
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
            if (allToolResults.length > 0) {
              const citations = extractCitationsFromToolResults(allToolResults);
              const citationBlock = buildCitationBlock(citations);
              if (citationBlock) {
                send(controller, { type: "text_delta", content: citationBlock });
                finalText += citationBlock;
              }
            }

            // No tool calls — save and finish
            await saveAndFinalize(db, conversationId, addSummaryHeader(finalText), {
              mode: isIdeasMode ? "ideas" : "default",
              model: ctx.modelId,
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              toolRounds: round,
              tenantId,
            });
            await flushSessionMemory(db, streamOptions, totalInputTokens, totalOutputTokens, finalText);
            await sendBudgetWarning(db, controller, send);
            send(controller, { type: "done", tokensUsed: { input: totalInputTokens, output: totalOutputTokens } });
            controller.close();
            return;
          }

          // Process tool calls via shared pipeline
          const results = await processToolBlocks(
            db, conversationId, toolUseBlocks, assistantText, ctx.autonomyLevel, tenantId
          );
          sendToolResults(results, controller, send, executedToolNames);
          allToolResults.push(...results);

          // Rate limit mitigation: wait between tool rounds in ideas mode
          if (isIdeasMode && round < MAX_TOOL_ROUNDS - 1) {
            await new Promise((r) => setTimeout(r, 2000));
          }
        }

        // Max rounds reached
        const streamToolSummary = executedToolNames.join(", ");
        const streamMaxRoundsMsg = `도구 호출 제한(${MAX_TOOL_ROUNDS}회)에 도달했습니다. 수행한 도구: ${streamToolSummary || "없음"}. 추가 작업이 필요하면 이어서 요청해주세요.`;

        await saveAndFinalize(db, conversationId, streamMaxRoundsMsg, {
          mode: isIdeasMode ? "ideas" : "default",
          model: ctx.modelId,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          toolRounds: MAX_TOOL_ROUNDS,
          tenantId,
        });
        await flushSessionMemory(db, streamOptions, totalInputTokens, totalOutputTokens, streamMaxRoundsMsg);
        send(controller, { type: "text_delta", content: streamMaxRoundsMsg });
        send(controller, { type: "done", tokensUsed: { input: totalInputTokens, output: totalOutputTokens } });
        controller.close();
      } catch (error) {
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
