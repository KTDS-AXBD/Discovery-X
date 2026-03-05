/**
 * Agent executor: 비스트리밍 에이전트 턴 실행.
 * 스트리밍은 executor-stream.ts 참조.
 */

import type { DB } from "~/db";
import { callLLM } from "~/lib/ai";
import type { FallbackContext } from "~/lib/ai";
import { buildConversationContext } from "./context-builder";
import { buildSystemPrompt } from "./system-prompt";
import { getToolsForAutonomyLevel } from "./tool-registry";
import { addSummaryHeader } from "./agent-utils";
import {
  prepareAgentPipeline,
  processToolBlocks,
  saveAndFinalize,
  MAX_TOOL_ROUNDS,
  type ToolCallResult,
} from "./agent-pipeline";

interface ExecuteResult {
  assistantText: string;
  toolCalls: ToolCallResult[];
  tokensUsed: { input: number; output: number };
}

export type AgentEvent =
  | { type: "tool_call"; name: string; input: Record<string, unknown>; result: string };

/**
 * Execute one agent turn: send user message → get Claude response → handle tools → return final text.
 * Supports multi-step tool use (up to 12 consecutive tool calls per turn).
 */
export async function executeAgentTurn(
  db: DB,
  apiKey: string,
  conversationId: string,
  userMessage: string,
  onEvent?: (event: AgentEvent) => void,
  tenantId?: string,
  env?: Record<string, string | undefined>,
): Promise<ExecuteResult> {
  const aiCtx: FallbackContext | undefined = env ? { env } : undefined;
  const ctx = await prepareAgentPipeline(db, conversationId, userMessage);
  const systemPrompt = buildSystemPrompt(ctx.agentCfg, ctx.sourceContext);
  const filteredTools = getToolsForAutonomyLevel(ctx.autonomyLevel);
  const allToolCalls: ToolCallResult[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const contextMessages = await buildConversationContext(db, conversationId, ctx.modelId);

    const response = await callLLM(apiKey, {
      model: ctx.modelId,
      max_tokens: 4096,
      system: systemPrompt,
      messages: contextMessages,
      tools: filteredTools.length > 0 ? filteredTools : undefined,
    }, aiCtx);

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    const textBlocks = response.content.filter((b) => b.type === "text");
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    const assistantText = textBlocks.map((b) => b.text || "").join("");

    if (toolUseBlocks.length === 0 || response.stop_reason !== "tool_use") {
      await saveAndFinalize(db, conversationId, addSummaryHeader(assistantText), {
        mode: "default",
        model: ctx.modelId,
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

    // Process tool calls via shared pipeline
    const results = await processToolBlocks(
      db, conversationId, toolUseBlocks, assistantText, ctx.autonomyLevel, tenantId
    );
    for (const tc of results) {
      allToolCalls.push(tc);
      onEvent?.({ type: "tool_call", name: tc.name, input: tc.input, result: tc.result });
    }
  }

  // Max rounds reached
  const toolSummary = allToolCalls.map((tc) => tc.name).join(", ");
  const maxRoundsMessage = `도구 호출 제한(${MAX_TOOL_ROUNDS}회)에 도달했습니다. 수행한 도구: ${toolSummary || "없음"}. 추가 작업이 필요하면 이어서 요청해주세요.`;

  await saveAndFinalize(db, conversationId, maxRoundsMessage, {
    mode: "default",
    model: ctx.modelId,
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
