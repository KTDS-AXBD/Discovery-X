/**
 * Agent 유틸리티: ID 생성, 토큰 사용량 추적, 응답 포맷팅.
 * executor.ts에서 분리하여 관심사 분리.
 */

import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import { agentConfig } from "~/db";
import { tokenUsageLogs } from "~/db/token-usage-schema";
import { CLAUDE_MODEL } from "~/lib/ai";

export function generateId(): string {
  return crypto.randomUUID();
}

export interface TokenUsageMeta {
  conversationId?: string | null;
  mode?: "default" | "ideas" | "direct";
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  toolRounds?: number;
  tenantId?: string | null;
}

export async function updateTokenUsage(db: DB, tokensUsed: number, meta?: TokenUsageMeta) {
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

  // Log to token_usage_logs for historical tracking
  if (meta) {
    try {
      await db.insert(tokenUsageLogs).values({
        id: crypto.randomUUID(),
        conversationId: meta.conversationId || null,
        mode: meta.mode || "default",
        model: meta.model || CLAUDE_MODEL,
        inputTokens: meta.inputTokens || 0,
        outputTokens: meta.outputTokens || 0,
        totalTokens: tokensUsed,
        toolRounds: meta.toolRounds || 0,
        tenantId: meta.tenantId || null,
      });
    } catch {
      // Non-critical: don't fail the main operation if logging fails
    }
  }
}

export async function sendBudgetWarning(
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

/** 500자 이상 응답 상단에 첫 문장 기반 요약 blockquote를 삽입한다. */
export function addSummaryHeader(text: string): string {
  if (text.length < 500) return text;
  const firstSentence = text.match(/^[^.!?]*[.!?]/)?.[0]?.trim();
  if (!firstSentence || firstSentence.length > 120) return text;
  return `> **요약**: ${firstSentence}\n\n${text}`;
}
