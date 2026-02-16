import { eq, and, gte, sql } from "drizzle-orm";
import type { DB } from "~/db";
import { agentMemoryV2 } from "~/db/schema-v2";
import { tokenUsageLogs } from "~/db/token-usage-schema";

/** 예산 상태 조회 결과 */
export interface BudgetStatus {
  memoryTokensUsed: number;
  memoryTokensLimit: number;
  memoryOk: boolean;
  monthlyTokensUsed: number;
  monthlyTokensLimit: number;
  monthlyOk: boolean;
}

/**
 * Token Budget Manager.
 *
 * 두 축으로 예산을 관리한다:
 * - 메모리 토큰: agent_memory_v2의 활성(비아카이브) 레코드 토큰 합계
 * - 월간 LLM 사용량: token_usage_logs의 이번 달 input+output 토큰 합계
 */
export class TokenBudgetManager {
  private readonly USER_MEMORY_BUDGET = 100_000;
  private readonly MONTHLY_LLM_BUDGET = 2_000_000;

  constructor(private db: DB) {}

  // ─── 예산 상태 확인 ──────────────────────────────────────────────
  async checkBudget(userId: string): Promise<BudgetStatus> {
    const [memoryTokensUsed, monthlyTokensUsed] = await Promise.all([
      this.getMemoryTokenCount(userId),
      this.getMonthlyLLMUsage(userId),
    ]);

    return {
      memoryTokensUsed,
      memoryTokensLimit: this.USER_MEMORY_BUDGET,
      memoryOk: memoryTokensUsed <= this.USER_MEMORY_BUDGET,
      monthlyTokensUsed,
      monthlyTokensLimit: this.MONTHLY_LLM_BUDGET,
      monthlyOk: monthlyTokensUsed <= this.MONTHLY_LLM_BUDGET,
    };
  }

  // ─── 메모리 토큰 합계 (활성 레코드만) ────────────────────────────
  async getMemoryTokenCount(userId: string): Promise<number> {
    const [row] = await this.db
      .select({
        total: sql<number>`coalesce(sum(${agentMemoryV2.tokenCount}), 0)`,
      })
      .from(agentMemoryV2)
      .where(
        and(
          eq(agentMemoryV2.userId, userId),
          sql`${agentMemoryV2.archivedAt} IS NULL`
        )
      );
    return row?.total ?? 0;
  }

  // ─── 월간 LLM 사용량 (tenantId = userId 매핑) ────────────────────
  async getMonthlyLLMUsage(userId: string): Promise<number> {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [row] = await this.db
      .select({
        total: sql<number>`coalesce(sum(${tokenUsageLogs.inputTokens} + ${tokenUsageLogs.outputTokens}), 0)`,
      })
      .from(tokenUsageLogs)
      .where(
        and(
          eq(tokenUsageLogs.tenantId, userId),
          gte(tokenUsageLogs.createdAt, monthStart)
        )
      );
    return row?.total ?? 0;
  }

  // ─── 예산 초과 여부 ──────────────────────────────────────────────
  async isOverBudget(userId: string): Promise<boolean> {
    const status = await this.checkBudget(userId);
    return !status.memoryOk || !status.monthlyOk;
  }
}
