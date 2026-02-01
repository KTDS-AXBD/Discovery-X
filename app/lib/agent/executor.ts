/**
 * Agent executor: main loop for processing user messages via Claude API.
 * Handles tool_use → execute → tool_result → continue pattern.
 * Designed for Cloudflare Workers 30s CPU limit (single-step execution).
 */

import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import { messages, agentConfig } from "~/db/schema";
import type { ClaudeResponse } from "./claude-client";
import { callClaude } from "./claude-client";
import { buildConversationContext } from "./context-builder";
import { buildSystemPrompt } from "./system-prompt";
import { AGENT_TOOLS } from "./tool-registry";
import {
  createDiscovery,
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
  toolInput: Record<string, unknown>
): Promise<string> {
  switch (toolName) {
    case "create_discovery":
      return createDiscovery(db, toolInput as Parameters<typeof createDiscovery>[1]);
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

  const systemPrompt = buildSystemPrompt(config[0] || null);
  const allToolCalls: ExecuteResult["toolCalls"] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const MAX_TOOL_ROUNDS = 5;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const contextMessages = await buildConversationContext(db, conversationId);

    const response: ClaudeResponse = await callClaude(apiKey, {
      max_tokens: 4096,
      system: systemPrompt,
      messages: contextMessages,
      tools: AGENT_TOOLS,
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
        toolResult = await executeTool(db, toolName, toolInput);
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
 * Streaming variant: returns a ReadableStream of SSE events.
 * Each event is a JSON object with type and data.
 */
export function createAgentStreamResponse(
  db: DB,
  apiKey: string,
  conversationId: string,
  userMessage: string
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      try {
        const result = await executeAgentTurn(
          db, apiKey, conversationId, userMessage,
          (event) => {
            // Stream tool_call events as they happen
            try {
              const parsed = JSON.parse(event.result);
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "tool_call", name: event.name, input: event.input, result: parsed })}\n\n`
                )
              );
            } catch {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ type: "tool_call", name: event.name, input: event.input, result: event.result })}\n\n`
                )
              );
            }
          }
        );

        // Send final text
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "text", content: result.assistantText })}\n\n`
          )
        );

        // Send done
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "done", tokensUsed: result.tokensUsed })}\n\n`
          )
        );

        controller.close();
      } catch (error) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", message: error instanceof Error ? error.message : "Unknown error" })}\n\n`
          )
        );
        controller.close();
      }
    },
  });
}
