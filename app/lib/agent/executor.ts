/**
 * Agent executor: main loop for processing user messages via Claude API.
 * Handles tool_use → execute → tool_result → continue pattern.
 * Designed for Cloudflare Workers 30s CPU limit (single-step execution).
 */

import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import { messages, agentConfig } from "~/db/schema";
import type { ClaudeResponse, ClaudeContentBlock } from "./claude-client";
import { callClaude, callClaudeStream, parseSSEStream, CLAUDE_MODEL } from "./claude-client";
import { buildConversationContext } from "./context-builder";
import { buildSystemPrompt } from "./system-prompt";
import { AGENT_TOOLS, getToolsForAutonomyLevel, TOOL_MIN_AUTONOMY } from "./tool-registry";
import {
  createDiscovery,
  updateDiscovery,
  promoteDiscovery,
  addExperiment,
  completeExperiment,
  addEvidence,
  decideNext,
  decideNotNow,
  decideDeadEnd,
  requestExtension,
} from "./tools/discovery-tools";
import {
  listDiscoveries,
  getDiscoveryDetail,
  searchSimilar,
  getMetrics,
  getRadarItems,
  listUsers,
  getWeeklyReview,
  getRecallQueue,
} from "./tools/query-tools";

function generateId(): string {
  return crypto.randomUUID();
}

interface ExecuteResult {
  assistantText: string;
  toolCalls: Array<{
    name: string;
    input: Record<string, unknown>;
    result: string;
  }>;
  tokensUsed: { input: number; output: number };
}

async function executeTool(
  db: DB,
  toolName: string,
  toolInput: Record<string, unknown>,
  autonomyLevel?: number
): Promise<string> {
  // Enforce autonomy level at execution time
  if (autonomyLevel !== undefined) {
    const minLevel = TOOL_MIN_AUTONOMY[toolName] ?? 3;
    if (autonomyLevel < minLevel) {
      return JSON.stringify({
        error: `현재 자율도 레벨(${autonomyLevel})에서는 이 도구(${toolName})를 사용할 수 없습니다. 최소 레벨 ${minLevel} 필요.`,
        suggestion: "설정에서 자율도 레벨을 올리거나, 관리자에게 요청하세요.",
      });
    }
  }

  switch (toolName) {
    case "create_discovery":
      return createDiscovery(db, toolInput as Parameters<typeof createDiscovery>[1]);
    case "update_discovery":
      return updateDiscovery(db, toolInput as Parameters<typeof updateDiscovery>[1]);
    case "promote_discovery":
      return promoteDiscovery(db, toolInput as Parameters<typeof promoteDiscovery>[1]);
    case "add_experiment":
      return addExperiment(db, toolInput as Parameters<typeof addExperiment>[1]);
    case "complete_experiment":
      return completeExperiment(db, toolInput as Parameters<typeof completeExperiment>[1]);
    case "add_evidence":
      return addEvidence(db, toolInput as Parameters<typeof addEvidence>[1]);
    case "decide_next":
      return decideNext(db, toolInput as Parameters<typeof decideNext>[1]);
    case "decide_not_now":
      return decideNotNow(db, toolInput as Parameters<typeof decideNotNow>[1]);
    case "decide_dead_end":
      return decideDeadEnd(db, toolInput as Parameters<typeof decideDeadEnd>[1]);
    case "request_extension":
      return requestExtension(db, toolInput as Parameters<typeof requestExtension>[1]);
    case "list_discoveries":
      return listDiscoveries(db, toolInput as Parameters<typeof listDiscoveries>[1]);
    case "get_discovery_detail":
      return getDiscoveryDetail(db, toolInput as Parameters<typeof getDiscoveryDetail>[1]);
    case "search_similar":
      return searchSimilar(db, toolInput as Parameters<typeof searchSimilar>[1]);
    case "get_metrics":
      return getMetrics(db);
    case "get_radar_items":
      return getRadarItems(db, toolInput as Parameters<typeof getRadarItems>[1]);
    case "get_weekly_review":
      return getWeeklyReview(db);
    case "get_recall_queue":
      return getRecallQueue(db);
    case "list_users":
      return listUsers(db);
    default:
      return JSON.stringify({ error: `알 수 없는 도구: ${toolName}` });
  }
}

/**
 * Execute one agent turn: send user message → get Claude response → handle tools → return final text.
 * Supports multi-step tool use (up to 5 consecutive tool calls per turn).
 */
export type AgentEvent =
  | { type: "tool_call"; name: string; input: Record<string, unknown>; result: string };

export async function executeAgentTurn(
  db: DB,
  apiKey: string,
  conversationId: string,
  userMessage: string,
  onEvent?: (event: AgentEvent) => void
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
  const systemPrompt = buildSystemPrompt(agentCfg);
  const modelId = agentCfg?.modelId || CLAUDE_MODEL;
  const autonomyLevel = agentCfg?.autonomyLevel ?? 3;
  const filteredTools = getToolsForAutonomyLevel(autonomyLevel);
  const allToolCalls: ExecuteResult["toolCalls"] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const MAX_TOOL_ROUNDS = 5;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const contextMessages = await buildConversationContext(db, conversationId);

    const response: ClaudeResponse = await callClaude(apiKey, {
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
        content: assistantText,
      });

      // Update token usage
      await updateTokenUsage(db, totalInputTokens + totalOutputTokens);

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
        toolResult = await executeTool(db, toolName, toolInput, autonomyLevel);
      } catch (e) {
        toolResult = JSON.stringify({
          error: e instanceof Error ? e.message : "도구 실행 오류",
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

  // If we hit max rounds, save what we have
  await db.insert(messages).values({
    id: generateId(),
    conversationId,
    role: "assistant",
    content: "도구 호출 제한에 도달했습니다. 결과를 확인해주세요.",
  });

  await updateTokenUsage(db, totalInputTokens + totalOutputTokens);

  return {
    assistantText: "도구 호출 제한에 도달했습니다. 결과를 확인해주세요.",
    toolCalls: allToolCalls,
    tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
  };
}

async function updateTokenUsage(db: DB, tokensUsed: number) {
  const today = new Date().toISOString().slice(0, 10);
  const config = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.id, "default"))
    .limit(1);

  if (config[0]) {
    const isNewDay = config[0].tokenResetDate !== today;
    await db
      .update(agentConfig)
      .set({
        tokensUsedToday: isNewDay ? tokensUsed : (config[0].tokensUsedToday + tokensUsed),
        tokenResetDate: today,
        updatedAt: new Date(),
      })
      .where(eq(agentConfig.id, "default"));
  }
}

/**
 * Streaming variant: uses callClaudeStream + parseSSEStream for real-time text deltas.
 * SSE events: text_delta, tool_start, tool_call, budget_warning, done, error
 */
export function createAgentStreamResponse(
  db: DB,
  apiKey: string,
  conversationId: string,
  userMessage: string
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
        const systemPrompt = buildSystemPrompt(agentCfg);
        const modelId = agentCfg?.modelId || CLAUDE_MODEL;
        const autonomyLevel = agentCfg?.autonomyLevel ?? 3;
        const filteredTools = getToolsForAutonomyLevel(autonomyLevel);
        let totalInputTokens = 0;
        let totalOutputTokens = 0;

        const MAX_TOOL_ROUNDS = 5;

        for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
          const contextMessages = await buildConversationContext(db, conversationId);

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
              content: assistantText,
            });

            await updateTokenUsage(db, totalInputTokens + totalOutputTokens);
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
              toolResult = await executeTool(db, toolName, toolInput, autonomyLevel);
            } catch (e) {
              toolResult = JSON.stringify({
                error: e instanceof Error ? e.message : "도구 실행 오류",
              });
            }

            await db.insert(messages).values({
              id: generateId(),
              conversationId,
              role: "tool_result",
              content: toolResult,
              toolName: toolUseId,
            });

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
          // Continue to next round for tool_result → Claude response
        }

        // Max rounds reached
        await db.insert(messages).values({
          id: generateId(),
          conversationId,
          role: "assistant",
          content: "도구 호출 제한에 도달했습니다. 결과를 확인해주세요.",
        });

        await updateTokenUsage(db, totalInputTokens + totalOutputTokens);
        send(controller, { type: "text_delta", content: "도구 호출 제한에 도달했습니다. 결과를 확인해주세요." });
        send(controller, { type: "done", tokensUsed: { input: totalInputTokens, output: totalOutputTokens } });
        controller.close();
      } catch (error) {
        send(controller, {
          type: "error",
          message: error instanceof Error ? error.message : "Unknown error",
        });
        controller.close();
      }
    },
  });
}

async function sendBudgetWarning(
  db: DB,
  controller: ReadableStreamDefaultController<Uint8Array>,
  send: (ctrl: ReadableStreamDefaultController<Uint8Array>, data: Record<string, unknown>) => void
) {
  const configAfter = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.id, "default"))
    .limit(1);

  const cfg = configAfter[0];
  if (cfg) {
    const percentUsed = Math.round((cfg.tokensUsedToday / cfg.dailyTokenBudget) * 100);
    if (percentUsed > 80) {
      send(controller, {
        type: "budget_warning",
        tokensUsedToday: cfg.tokensUsedToday,
        dailyTokenBudget: cfg.dailyTokenBudget,
        percentUsed,
      });
    }
  }
}
