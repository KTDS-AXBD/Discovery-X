/**
 * Agent executor: main loop for processing user messages via Claude API.
 * Handles tool_use → execute → tool_result → continue pattern.
 * Designed for Cloudflare Workers 30s CPU limit (single-step execution).
 */

import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import { messages, agentConfig, conversations, radarItems } from "~/db/schema";
import type { ClaudeContentBlock } from "./claude-client";
import { callClaude, callClaudeStream, parseSSEStream, CLAUDE_MODEL } from "./claude-client";
import { buildConversationContext } from "./context-builder";
import { buildSystemPrompt, buildIdeaSystemPrompt } from "./system-prompt";
import { getToolsForAutonomyLevel, IDEA_TOOLS } from "./tool-registry";
import { executeTool } from "./tool-handlers";
import { generateId, updateTokenUsage, sendBudgetWarning, addSummaryHeader } from "./agent-utils";
import { SoulEngine } from "~/lib/agent/soul-engine";
import { SessionManager } from "~/lib/agent/session-manager";
import { MemoryLifecycle } from "~/lib/agent/memory-lifecycle";
import { isFeatureEnabled } from "~/lib/feature-flags";

interface ExecuteResult {
  assistantText: string;
  toolCalls: Array<{
    name: string;
    input: Record<string, unknown>;
    result: string;
  }>;
  tokensUsed: { input: number; output: number };
}

/**
 * Execute one agent turn: send user message → get Claude response → handle tools → return final text.
 * Supports multi-step tool use (up to 12 consecutive tool calls per turn).
 */
export type AgentEvent =
  | { type: "tool_call"; name: string; input: Record<string, unknown>; result: string };

export async function executeAgentTurn(
  db: DB,
  apiKey: string,
  conversationId: string,
  userMessage: string,
  onEvent?: (event: AgentEvent) => void,
  tenantId?: string
): Promise<ExecuteResult> {
  // Save user message
  await db.insert(messages).values({
    id: generateId(),
    conversationId,
    role: "user",
    content: userMessage,
  });

  // Get agent config
  const config = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.id, "default"))
    .limit(1);

  const agentCfg = config[0] || null;

  // BD PoC: 소스 컨텍스트 조회 (conversation.sourceItemId → radarItem)
  let sourceContext: { title?: string; summaryKo?: string; url?: string; keyPoints?: string[] } | null = null;
  try {
    const conv = await db.select({ sourceItemId: conversations.sourceItemId })
      .from(conversations).where(eq(conversations.id, conversationId)).limit(1);
    if (conv[0]?.sourceItemId) {
      const item = await db.select({
        title: radarItems.title, titleKo: radarItems.titleKo,
        summaryKo: radarItems.summaryKo, url: radarItems.url,
        keyPoints: radarItems.keyPoints,
      }).from(radarItems).where(eq(radarItems.id, conv[0].sourceItemId)).limit(1);
      if (item[0]) {
        sourceContext = {
          title: item[0].titleKo || item[0].title || undefined,
          summaryKo: item[0].summaryKo || undefined,
          url: item[0].url || undefined,
          keyPoints: (item[0].keyPoints as string[]) || undefined,
        };
      }
    }
  } catch { /* sourceContext is optional */ }

  const systemPrompt = buildSystemPrompt(agentCfg, sourceContext);
  const modelId = agentCfg?.modelId || CLAUDE_MODEL;
  const autonomyLevel = agentCfg?.autonomyLevel ?? 3;
  const filteredTools = getToolsForAutonomyLevel(autonomyLevel);
  const allToolCalls: ExecuteResult["toolCalls"] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const MAX_TOOL_ROUNDS = 12;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const contextMessages = await buildConversationContext(db, conversationId, modelId);

    const response = await callClaude(apiKey, {
      model: modelId,
      max_tokens: 4096,
      system: systemPrompt,
      messages: contextMessages,
      tools: filteredTools.length > 0 ? filteredTools : undefined,
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Extract text and tool_use blocks
    const textBlocks = response.content.filter((b) => b.type === "text");
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    const assistantText = textBlocks.map((b) => b.text || "").join("");

    if (toolUseBlocks.length === 0 || response.stop_reason !== "tool_use") {
      // No tool calls — save assistant message and return
      await db.insert(messages).values({
        id: generateId(),
        conversationId,
        role: "assistant",
        content: addSummaryHeader(assistantText),
      });

      // Update token usage
      await updateTokenUsage(db, totalInputTokens + totalOutputTokens, {
        conversationId,
        mode: "default",
        model: modelId,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        toolRounds: round,
        tenantId,
      });

      return {
        assistantText,
        toolCalls: allToolCalls,
        tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
      };
    }

    // Process tool calls
    for (let idx = 0; idx < toolUseBlocks.length; idx++) {
      const toolBlock = toolUseBlocks[idx];
      const toolName = toolBlock.name!;
      const toolInput = toolBlock.input as Record<string, unknown>;
      const toolUseId = toolBlock.id!;

      // Save tool_use message (only first block carries assistantText to avoid duplication)
      await db.insert(messages).values({
        id: toolUseId,
        conversationId,
        role: "tool_use",
        content: idx === 0 ? assistantText : "",
        toolName,
        toolInput,
      });

      // Execute tool
      let toolResult: string;
      try {
        toolResult = await executeTool(db, toolName, toolInput, autonomyLevel, tenantId);
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : "도구 실행 오류";
        toolResult = JSON.stringify({
          error: `도구 '${toolName}' 실행 실패: ${errorMessage}`,
          suggestion: "입력값을 확인하고 다시 시도해보세요.",
          retryable: false,
        });
      }

      // Save tool_result message
      await db.insert(messages).values({
        id: generateId(),
        conversationId,
        role: "tool_result",
        content: toolResult,
        toolName: toolUseId, // Store tool_use_id in toolName for context builder
      });

      allToolCalls.push({ name: toolName, input: toolInput, result: toolResult });
      onEvent?.({ type: "tool_call", name: toolName, input: toolInput, result: toolResult });
    }
  }

  // If we hit max rounds, save what we have with tool summary
  const toolSummary = allToolCalls.map((tc) => tc.name).join(", ");
  const maxRoundsMessage = `도구 호출 제한(${MAX_TOOL_ROUNDS}회)에 도달했습니다. 수행한 도구: ${toolSummary || "없음"}. 추가 작업이 필요하면 이어서 요청해주세요.`;

  await db.insert(messages).values({
    id: generateId(),
    conversationId,
    role: "assistant",
    content: maxRoundsMessage,
  });

  await updateTokenUsage(db, totalInputTokens + totalOutputTokens, {
    conversationId,
    mode: "default",
    model: modelId,
    inputTokens: totalInputTokens,
    outputTokens: totalOutputTokens,
    toolRounds: MAX_TOOL_ROUNDS,
    tenantId,
  });

  return {
    assistantText: maxRoundsMessage,
    toolCalls: allToolCalls,
    tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
  };
}

/**
 * Streaming variant: uses callClaudeStream + parseSSEStream for real-time text deltas.
 * SSE events: text_delta, tool_start, tool_call, budget_warning, done, error
 */
/** SoulEngine + SessionManager 통합 옵션 (Graph Layer 활성화 시 사용) */
export interface StreamOptions {
  env?: Record<string, string | undefined>;
  sessionId?: string;
  userId?: string;
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
        // Save user message
        await db.insert(messages).values({
          id: generateId(),
          conversationId,
          role: "user",
          content: userMessage,
        });

        // Get agent config
        const cfgRows = await db
          .select()
          .from(agentConfig)
          .where(eq(agentConfig.id, "default"))
          .limit(1);

        const agentCfg = cfgRows[0] || null;

        // BD PoC: 소스 컨텍스트 조회
        let sourceCtx: { title?: string; summaryKo?: string; url?: string; keyPoints?: string[] } | null = null;
        try {
          const conv = await db.select({ sourceItemId: conversations.sourceItemId })
            .from(conversations).where(eq(conversations.id, conversationId)).limit(1);
          if (conv[0]?.sourceItemId) {
            const item = await db.select({
              title: radarItems.title, titleKo: radarItems.titleKo,
              summaryKo: radarItems.summaryKo, url: radarItems.url,
              keyPoints: radarItems.keyPoints,
            }).from(radarItems).where(eq(radarItems.id, conv[0].sourceItemId)).limit(1);
            if (item[0]) {
              sourceCtx = {
                title: item[0].titleKo || item[0].title || undefined,
                summaryKo: item[0].summaryKo || undefined,
                url: item[0].url || undefined,
                keyPoints: (item[0].keyPoints as string[]) || undefined,
              };
            }
          }
        } catch { /* optional */ }

        const isIdeasMode = mode === "ideas";
        const autonomyLevel = agentCfg?.autonomyLevel ?? 3;

        // SoulEngine 분기: Feature Flag 활성화 + userId 전달 시 Graph Projection 기반 프롬프트
        const useGraphProjection =
          !isIdeasMode &&
          !!streamOptions?.env &&
          !!streamOptions?.userId &&
          isFeatureEnabled(streamOptions.env, "graphLayer");

        let systemPrompt: string;
        if (isIdeasMode) {
          systemPrompt = buildIdeaSystemPrompt(sourceCtx);
        } else if (useGraphProjection && streamOptions?.userId) {
          const soulEngine = new SoulEngine({
            db,
            userId: streamOptions.userId,
            autonomyLevel,
            useGraphProjection: true,
          });
          const result = await soulEngine.buildPrompt();
          systemPrompt = result.systemPrompt;
        } else {
          systemPrompt = buildSystemPrompt(agentCfg, sourceCtx);
        }

        const modelId = agentCfg?.modelId || CLAUDE_MODEL;
        const filteredTools = isIdeasMode
          ? IDEA_TOOLS
          : getToolsForAutonomyLevel(autonomyLevel);
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        const executedToolNames: string[] = [];

        const MAX_TOOL_ROUNDS = 12;

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const contextMessages = await buildConversationContext(db, conversationId, modelId);

          const rawStream = await callClaudeStream(apiKey, {
            model: modelId,
            max_tokens: 4096,
            system: systemPrompt,
            messages: contextMessages,
            tools: filteredTools.length > 0 ? filteredTools : undefined,
          });

          // Parse SSE stream from Claude
          let assistantText = "";
          const contentBlocks: ClaudeContentBlock[] = [];
          let currentBlockIndex = -1;
          let currentToolInput = "";
          let stopReason: string | undefined;

          for await (const event of parseSSEStream(rawStream)) {
            switch (event.type) {
              case "message_start":
                if (event.message?.usage) {
                  totalInputTokens += event.message.usage.input_tokens;
                }
                break;

              case "content_block_start":
                currentBlockIndex = event.index ?? -1;
                if (event.content_block) {
                  contentBlocks[currentBlockIndex] = { ...event.content_block };
                  if (event.content_block.type === "tool_use") {
                    currentToolInput = "";
                    send(controller, {
                      type: "tool_start",
                      name: event.content_block.name,
                    });
                  }
                }
                break;

              case "content_block_delta":
                if (event.delta?.type === "text_delta" && event.delta.text) {
                  assistantText += event.delta.text;
                  send(controller, {
                    type: "text_delta",
                    content: event.delta.text,
                  });
                } else if (event.delta?.type === "input_json_delta" && event.delta.partial_json) {
                  currentToolInput += event.delta.partial_json;
                }
                break;

              case "content_block_stop":
                if (currentBlockIndex >= 0 && contentBlocks[currentBlockIndex]?.type === "tool_use") {
                  try {
                    contentBlocks[currentBlockIndex].input = JSON.parse(currentToolInput);
                  } catch {
                    contentBlocks[currentBlockIndex].input = {};
                  }
                }
                break;

              case "message_delta":
                if (event.delta?.stop_reason) {
                  stopReason = event.delta.stop_reason;
                }
                if (event.usage) {
                  totalOutputTokens += event.usage.output_tokens;
                }
                break;
            }
          }

          const toolUseBlocks = contentBlocks.filter((b) => b?.type === "tool_use");

          if (toolUseBlocks.length === 0 || stopReason !== "tool_use") {
            // No tool calls — save and finish
            await db.insert(messages).values({
              id: generateId(),
              conversationId,
              role: "assistant",
              content: addSummaryHeader(assistantText),
            });

            await updateTokenUsage(db, totalInputTokens + totalOutputTokens, {
              conversationId,
              mode: isIdeasMode ? "ideas" : "default",
              model: modelId,
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              toolRounds: round,
              tenantId,
            });
            // SessionManager 토큰 집계
            if (streamOptions?.sessionId) {
              try {
                const sm = new SessionManager(db);
                await sm.updateTokenCount(streamOptions.sessionId, totalInputTokens, totalOutputTokens);
              } catch { /* 세션 집계 실패는 비치명적 */ }
            }
            // Memory flush: 대화 요약을 daily_log로 저장
            if (streamOptions?.userId && streamOptions?.env && isFeatureEnabled(streamOptions.env, "memoryLifecycle")) {
              try {
                const ml = new MemoryLifecycle(db);
                const summary = assistantText.slice(0, 500);
                await ml.addDailyLog(streamOptions.userId, summary, "conversation");
              } catch { /* 메모리 저장 실패는 비치명적 */ }
            }
            await sendBudgetWarning(db, controller, send);
            send(controller, { type: "done", tokensUsed: { input: totalInputTokens, output: totalOutputTokens } });
            controller.close();
            return;
          }

          // Process tool calls
          for (let idx = 0; idx < toolUseBlocks.length; idx++) {
            const toolBlock = toolUseBlocks[idx];
            const toolName = toolBlock.name!;
            const toolInput = (toolBlock.input || {}) as Record<string, unknown>;
            const toolUseId = toolBlock.id || generateId();

            await db.insert(messages).values({
              id: toolUseId,
              conversationId,
              role: "tool_use",
              content: idx === 0 ? assistantText : "",
              toolName,
              toolInput,
            });

            let toolResult: string;
            try {
              toolResult = await executeTool(db, toolName, toolInput, autonomyLevel, tenantId);
            } catch (e) {
              const errorMessage = e instanceof Error ? e.message : "도구 실행 오류";
              toolResult = JSON.stringify({
                error: `도구 '${toolName}' 실행 실패: ${errorMessage}`,
                suggestion: "입력값을 확인하고 다시 시도해보세요.",
                retryable: false,
              });
            }

            await db.insert(messages).values({
              id: generateId(),
              conversationId,
              role: "tool_result",
              content: toolResult,
              toolName: toolUseId,
            });

            executedToolNames.push(toolName);
            // Send tool_call event with result
            let parsedResult: unknown;
            try {
              parsedResult = JSON.parse(toolResult);
            } catch {
              parsedResult = toolResult;
            }
            send(controller, {
              type: "tool_call",
              name: toolName,
              input: toolInput,
              result: parsedResult,
            });
          }
          // Rate limit mitigation: wait between tool rounds in ideas mode
          if (isIdeasMode && round < MAX_TOOL_ROUNDS - 1) {
            await new Promise((r) => setTimeout(r, 2000));
          }
          // Continue to next round for tool_result → Claude response
        }

        // Max rounds reached
        const streamToolSummary = executedToolNames.join(", ");
        const streamMaxRoundsMsg = `도구 호출 제한(${MAX_TOOL_ROUNDS}회)에 도달했습니다. 수행한 도구: ${streamToolSummary || "없음"}. 추가 작업이 필요하면 이어서 요청해주세요.`;

        await db.insert(messages).values({
          id: generateId(),
          conversationId,
          role: "assistant",
          content: streamMaxRoundsMsg,
        });

        await updateTokenUsage(db, totalInputTokens + totalOutputTokens, {
          conversationId,
          mode: isIdeasMode ? "ideas" : "default",
          model: modelId,
          inputTokens: totalInputTokens,
          outputTokens: totalOutputTokens,
          toolRounds: MAX_TOOL_ROUNDS,
          tenantId,
        });
        // SessionManager 토큰 집계 (max rounds)
        if (streamOptions?.sessionId) {
          try {
            const sm = new SessionManager(db);
            await sm.updateTokenCount(streamOptions.sessionId, totalInputTokens, totalOutputTokens);
          } catch { /* 세션 집계 실패는 비치명적 */ }
        }
        // Memory flush: 대화 요약을 daily_log로 저장 (max rounds)
        if (streamOptions?.userId && streamOptions?.env && isFeatureEnabled(streamOptions.env, "memoryLifecycle")) {
          try {
            const ml = new MemoryLifecycle(db);
            const summary = streamMaxRoundsMsg.slice(0, 500);
            await ml.addDailyLog(streamOptions.userId, summary, "conversation");
          } catch { /* 메모리 저장 실패는 비치명적 */ }
        }
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
