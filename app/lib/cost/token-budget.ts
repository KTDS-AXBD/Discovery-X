import { eq, and, gte, sql } from "drizzle-orm";
import type { DB } from "~/db";
import { agentMemoryV2 } from "~/db/schema-v2";
import { usageEvents } from "~/features/cost/db/schema";
import { MemoryLifecycle } from "~/features/chat/agent/memory-lifecycle";

// ─── 상수 ──────────────────────────────────────────────────────────────
/** 사용자별 메모리 토큰 예산 (활성 레코드 합계 상한) */
export const USER_MEMORY_BUDGET = 100_000;

/** 월간 LLM 호출 토큰 예산 */
export const MONTHLY_LLM_BUDGET = 2_000_000;

// ─── 인터페이스 ─────────────────────────────────────────────────────────
/** 예산 상태 조회 결과 */
export interface BudgetStatus {
  memoryUsed: number;
  memoryLimit: number;
  memoryOk: boolean;
  monthlyUsed: number;
  monthlyLimit: number;
  monthlyOk: boolean;
  /** 월간 예산 리셋 일시 (다음 달 1일 00:00 UTC) */
  resetDate: Date;
}

/**
 * Token Budget Manager.
 *
 * 두 축으로 예산을 관리한다:
 * - 메모리 토큰: agent_memory_v2의 활성(비아카이브) 레코드 토큰 합계 (100K)
 * - 월간 LLM 사용량: usage_events 월간 집계 (2M)
 */
export class TokenBudgetManager {
  constructor(private db: DB) {}

  // ─── 예산 상태 확인 ──────────────────────────────────────────────
  async checkBudget(userId: string): Promise<BudgetStatus> {
    const [memoryUsed, monthlyUsed] = await Promise.all([
      this.getMemoryTokenCount(userId),
      this.getMonthlyUsage(userId),
    ]);

    return {
      memoryUsed,
      memoryLimit: USER_MEMORY_BUDGET,
      memoryOk: memoryUsed <= USER_MEMORY_BUDGET,
      monthlyUsed,
      monthlyLimit: MONTHLY_LLM_BUDGET,
      monthlyOk: monthlyUsed <= MONTHLY_LLM_BUDGET,
      resetDate: getNextMonthStart(),
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
          sql`${agentMemoryV2.archivedAt} IS NULL`,
        ),
      );
    return row?.total ?? 0;
  }

  // ─── 월간 LLM 사용량 (usage_events 직접 조회) ───────────────────
  async getMonthlyUsage(userId: string): Promise<number> {
    const monthStart = getCurrentMonthStart();

    const [row] = await this.db
      .select({
        total: sql<number>`coalesce(sum(${usageEvents.inputTokens} + ${usageEvents.outputTokens}), 0)`,
      })
      .from(usageEvents)
      .where(
        and(
          eq(usageEvents.userId, userId),
          gte(usageEvents.createdAt, monthStart),
        ),
      );
    return row?.total ?? 0;
  }

  // ─── 메모리 예산 강제 적용 (MemoryLifecycle 위임) ─────────────────
  /**
   * 활성 메모리 토큰이 USER_MEMORY_BUDGET을 초과하면
   * importance 낮은 순으로 삭제하여 예산 이내로 맞춘다.
   * @returns 삭제된 레코드 수
   */
  async enforceMemoryBudget(userId: string): Promise<number> {
    const lifecycle = new MemoryLifecycle(this.db);
    return lifecycle.enforceTokenBudget(userId, USER_MEMORY_BUDGET);
  }

  // ─── LLM 호출 허용 여부 ──────────────────────────────────────────
  /**
   * 월간 사용량 + 예상 토큰이 한도 이내인지 확인한다.
   * estimatedTokens를 생략하면 현재 사용량만으로 판단한다.
   */
  async isLLMCallAllowed(
    userId: string,
    estimatedTokens = 0,
  ): Promise<boolean> {
    const monthlyUsed = await this.getMonthlyUsage(userId);
    return monthlyUsed + estimatedTokens <= MONTHLY_LLM_BUDGET;
  }

  // ─── 예산 초과 여부 (하위 호환) ───────────────────────────────────
  async isOverBudget(userId: string): Promise<boolean> {
    const status = await this.checkBudget(userId);
    return !status.memoryOk || !status.monthlyOk;
  }
}

// ─── 날짜 유틸 (모듈 내부) ──────────────────────────────────────────
/** 이번 달 1일 00:00 UTC */
function getCurrentMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** 다음 달 1일 00:00 UTC */
function getNextMonthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}
