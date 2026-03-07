/**
 * Agent 파이프라인 공통 모듈: executor의 executeAgentTurn/createAgentStreamResponse 공유 로직.
 *
 * 3개 함수로 Agent 턴의 공통 단계를 추출:
 * 1. prepareAgentPipeline — 사용자 메시지 저장 + 설정/소스 컨텍스트 로드
 * 2. processToolBlocks — 도구 실행 + DB 저장 루프
 * 3. saveAndFinalize — 어시스턴트 응답 저장 + 토큰 사용량 기록
 */

import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import { messages, agentConfig, conversations, radarItems } from "~/db/schema";
import type { ClaudeContentBlock } from "~/lib/ai";
import { CLAUDE_MODEL } from "~/lib/ai";
import { executeTool } from "./tool-handlers";
import { generateId, updateTokenUsage, type TokenUsageMeta } from "./agent-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SourceContext {
  title?: string;
  summaryKo?: string;
  url?: string;
  keyPoints?: string[];
}

export interface AgentPipelineContext {
  agentCfg: typeof agentConfig.$inferSelect | null;
  sourceContext: SourceContext | null;
  modelId: string;
  autonomyLevel: number;
}

export interface ToolCallResult {
  name: string;
  input: Record<string, unknown>;
  result: string;
}

export const MAX_TOOL_ROUNDS = 12;

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/** 사용자 메시지를 DB에 저장하고, Agent 설정 + 소스 컨텍스트를 로드한다. */
export async function prepareAgentPipeline(
  db: DB,
  conversationId: string,
  userMessage: string,
): Promise<AgentPipelineContext> {
  // 1. 사용자 메시지 저장
  await db.insert(messages).values({
    id: generateId(),
    conversationId,
    role: "user",
    content: userMessage,
  });

  // 2. Agent 설정 로드
  const config = await db
    .select()
    .from(agentConfig)
    .where(eq(agentConfig.id, "default"))
    .limit(1);

  const agentCfg = config[0] || null;

  // 3. BD PoC: 소스 컨텍스트 조회 (conversation.sourceItemId -> radarItem)
  let sourceContext: SourceContext | null = null;
  try {
    const conv = await db
      .select({ sourceItemId: conversations.sourceItemId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (conv[0]?.sourceItemId) {
      const item = await db
        .select({
          title: radarItems.title,
          titleKo: radarItems.titleKo,
          summaryKo: radarItems.summaryKo,
          url: radarItems.url,
          keyPoints: radarItems.keyPoints,
        })
        .from(radarItems)
        .where(eq(radarItems.id, conv[0].sourceItemId))
        .limit(1);

      if (item[0]) {
        sourceContext = {
          title: item[0].titleKo || item[0].title || undefined,
          summaryKo: item[0].summaryKo || undefined,
          url: item[0].url || undefined,
          keyPoints: (item[0].keyPoints as string[]) || undefined,
        };
      }
    }
  } catch {
    /* sourceContext is optional */
  }

  // 4. 결과 반환
  return {
    agentCfg,
    sourceContext,
    modelId: agentCfg?.modelId || CLAUDE_MODEL,
    autonomyLevel: agentCfg?.autonomyLevel ?? 3,
  };
}

/** 도구 블록 배열을 순회하며 실행하고, 사용/결과 메시지를 DB에 저장한다. */
export async function processToolBlocks(
  db: DB,
  conversationId: string,
  toolUseBlocks: ClaudeContentBlock[],
  assistantText: string,
  autonomyLevel: number,
  tenantId?: string,
  env?: Record<string, string>,
): Promise<ToolCallResult[]> {
  const results: ToolCallResult[] = [];

  for (let idx = 0; idx < toolUseBlocks.length; idx++) {
    const toolBlock = toolUseBlocks[idx];
    const toolName = toolBlock.name!;
    const toolInput = (toolBlock.input || {}) as Record<string, unknown>;
    const toolUseId = toolBlock.id || generateId();

    // tool_use 메시지 저장 (첫 블록만 assistantText 포함, 중복 방지)
    await db.insert(messages).values({
      id: toolUseId,
      conversationId,
      role: "tool_use",
      content: idx === 0 ? assistantText : "",
      toolName,
      toolInput,
    });

    // 도구 실행
    let toolResult: string;
    try {
      toolResult = await executeTool(db, toolName, toolInput, autonomyLevel, tenantId, env);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "도구 실행 오류";
      toolResult = JSON.stringify({
        error: `도구 '${toolName}' 실행 실패: ${errorMessage}`,
        suggestion: "입력값을 확인하고 다시 시도해보세요.",
        retryable: false,
      });
    }

    // tool_result 메시지 저장 (toolName 필드에 toolUseId를 저장하여 context builder에서 매핑)
    await db.insert(messages).values({
      id: generateId(),
      conversationId,
      role: "tool_result",
      content: toolResult,
      toolName: toolUseId,
    });

    results.push({ name: toolName, input: toolInput, result: toolResult });
  }

  return results;
}

/** 어시스턴트 최종 응답을 DB에 저장하고 토큰 사용량을 기록한다. */
export async function saveAndFinalize(
  db: DB,
  conversationId: string,
  assistantContent: string,
  usage: {
    mode: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    toolRounds: number;
    tenantId?: string;
  },
): Promise<void> {
  // 어시스턴트 메시지 저장
  await db.insert(messages).values({
    id: generateId(),
    conversationId,
    role: "assistant",
    content: assistantContent,
  });

  // 토큰 사용량 기록
  await updateTokenUsage(db, usage.inputTokens + usage.outputTokens, {
    conversationId,
    mode: usage.mode as TokenUsageMeta["mode"],
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    toolRounds: usage.toolRounds,
    tenantId: usage.tenantId,
  });
}
