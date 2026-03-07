import { eq, and, lt, sql, asc, isNull } from "drizzle-orm";
import type { DB } from "~/db";
import { agentMemoryV2 } from "~/db/schema-v2";
import type { AgentMemoryV2 } from "~/db/schema-v2";
import { MemoryType } from "~/lib/types/enums";
import type { MemoryTypeValue } from "~/lib/types/enums";

/** compact() 수행 결과 */
export interface CompactionResult {
  archived: number;
  deleted: number;
  merged: number;
  totalTokensBefore: number;
  totalTokensAfter: number;
}

/**
 * Agent Memory 3단계 수명 관리 엔진.
 *
 * - daily_log: 30일 후 archive → 90일 + importance < 0.3 → 삭제
 * - long_term: 수동 승격만, compaction 대상 아님
 * - learned_pref: 삭제 대상 아님 (예산 강제 정리에서도 제외)
 */
export class MemoryLifecycle {
  constructor(private db: DB) {}

  // ─── 토큰 추정 (한국어 기준 ~3.5자/토큰) ────────────────────────
  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 3.5);
  }

  // ─── 결정/액션 키워드 포함 여부 ────────────────────────────────
  private containsDecisionKeywords(content: string): boolean {
    const keywords = ["결정", "변경", "승인", "반려", "중단", "진행", "확정", "철회", "보류"];
    return keywords.some((kw) => content.includes(kw));
  }

  // ─── 사용자 전체 토큰 합계 ────────────────────────────────────────
  private async sumTokens(userId: string): Promise<number> {
    const [row] = await this.db
      .select({
        total: sql<number>`coalesce(sum(${agentMemoryV2.tokenCount}), 0)`,
      })
      .from(agentMemoryV2)
      .where(eq(agentMemoryV2.userId, userId));
    return row?.total ?? 0;
  }

  // ─── 주간 Cron: 전체 compaction ──────────────────────────────────
  async compact(
    userId: string,
    summarizer?: (contents: string[]) => Promise<string>,
  ): Promise<CompactionResult> {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    const totalTokensBefore = await this.sumTokens(userId);

    // 1) 30일 초과 daily_log → archived_at 설정
    const archiveResult = await this.db
      .update(agentMemoryV2)
      .set({ archivedAt: now })
      .where(
        and(
          eq(agentMemoryV2.userId, userId),
          eq(agentMemoryV2.memoryType, MemoryType.DAILY_LOG),
          isNull(agentMemoryV2.archivedAt),
          lt(agentMemoryV2.createdAt, thirtyDaysAgo)
        )
      )
      .returning({ id: agentMemoryV2.id });

    // 2) 90일 초과 + importance < 0.3 → 삭제
    const deleteResult = await this.db
      .delete(agentMemoryV2)
      .where(
        and(
          eq(agentMemoryV2.userId, userId),
          sql`${agentMemoryV2.archivedAt} IS NOT NULL`,
          lt(agentMemoryV2.importance, 0.3),
          lt(agentMemoryV2.createdAt, ninetyDaysAgo)
        )
      )
      .returning({ id: agentMemoryV2.id });

    // 3) 고중요도(≥0.7) + 결정/액션 키워드 포함 아카이브 daily_log → LLM 요약 → long_term 승격
    let merged = 0;
    if (summarizer) {
      const candidateLogs = await this.db
        .select()
        .from(agentMemoryV2)
        .where(
          and(
            eq(agentMemoryV2.userId, userId),
            eq(agentMemoryV2.memoryType, MemoryType.DAILY_LOG),
            sql`${agentMemoryV2.importance} >= 0.7`,
            sql`${agentMemoryV2.archivedAt} IS NOT NULL`,
          ),
        )
        .orderBy(asc(agentMemoryV2.createdAt))
        .limit(20);

      // 결정/액션 키워드 포함 시 우선 승격 대상
      const highImportanceLogs = candidateLogs.filter(
        (log) => this.containsDecisionKeywords(log.content),
      );

      if (highImportanceLogs.length >= 3) {
        try {
          const contents = highImportanceLogs.map((l) => l.content);
          const summary = await summarizer(contents);
          const tokenCount = this.estimateTokens(summary);

          // long_term으로 요약 저장
          await this.db.insert(agentMemoryV2).values({
            userId,
            memoryType: MemoryType.LONG_TERM,
            content: summary,
            category: "auto_merged",
            importance: 0.8,
            tokenCount,
          });

          // 원본 daily_log 삭제
          const ids = highImportanceLogs.map((l) => l.id);
          for (const id of ids) {
            await this.db
              .delete(agentMemoryV2)
              .where(eq(agentMemoryV2.id, id));
          }

          merged = highImportanceLogs.length;
        } catch {
          // LLM 호출 실패 시 skip — 다음 compact에서 재시도
        }
      }
    }

    const totalTokensAfter = await this.sumTokens(userId);

    return {
      archived: archiveResult.length,
      deleted: deleteResult.length,
      merged,
      totalTokensBefore,
      totalTokensAfter,
    };
  }

  // ─── 토큰 예산 초과 시 강제 정리 ─────────────────────────────────
  async enforceTokenBudget(
    userId: string,
    budgetTokens: number
  ): Promise<number> {
    const currentTotal = await this.sumTokens(userId);
    if (currentTotal <= budgetTokens) return 0;

    // importance 낮은 순으로 조회 (learned_pref 제외)
    const candidates = await this.db
      .select({ id: agentMemoryV2.id, tokenCount: agentMemoryV2.tokenCount })
      .from(agentMemoryV2)
      .where(
        and(
          eq(agentMemoryV2.userId, userId),
          sql`${agentMemoryV2.memoryType} != ${MemoryType.LEARNED_PREF}`
        )
      )
      .orderBy(asc(agentMemoryV2.importance));

    let tokensToFree = currentTotal - budgetTokens;
    let deletedCount = 0;

    for (const candidate of candidates) {
      if (tokensToFree <= 0) break;

      await this.db
        .delete(agentMemoryV2)
        .where(eq(agentMemoryV2.id, candidate.id));

      tokensToFree -= candidate.tokenCount;
      deletedCount++;
    }

    return deletedCount;
  }

  // ─── daily_log 추가 ──────────────────────────────────────────────
  async addDailyLog(
    userId: string,
    content: string,
    category?: string,
    importance?: number
  ): Promise<void> {
    const tokenCount = this.estimateTokens(content);
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    await this.db.insert(agentMemoryV2).values({
      userId,
      memoryType: MemoryType.DAILY_LOG,
      content,
      category: category ?? null,
      importance: importance ?? 0.5,
      tokenCount,
      logDate: today,
    });
  }

  // ─── daily_log → long_term 승격 ──────────────────────────────────
  async promoteDailyLog(memoryId: number): Promise<void> {
    await this.db
      .update(agentMemoryV2)
      .set({
        memoryType: MemoryType.LONG_TERM,
        archivedAt: null, // 승격 시 아카이브 해제
      })
      .where(
        and(
          eq(agentMemoryV2.id, memoryId),
          eq(agentMemoryV2.memoryType, MemoryType.DAILY_LOG)
        )
      );
  }

  // ─── learned_pref 저장 ────────────────────────────────────────────
  async savePreference(
    userId: string,
    content: string,
    category?: string
  ): Promise<void> {
    const tokenCount = this.estimateTokens(content);

    await this.db.insert(agentMemoryV2).values({
      userId,
      memoryType: MemoryType.LEARNED_PREF,
      content,
      category: category ?? null,
      importance: 1.0, // 선호도는 항상 최고 중요도
      tokenCount,
    });
  }

  // ─── 사용자 메모리 조회 (타입별 필터) ─────────────────────────────
  async getMemories(
    userId: string,
    type?: MemoryTypeValue,
    limit?: number
  ): Promise<AgentMemoryV2[]> {
    const conditions = [eq(agentMemoryV2.userId, userId)];
    if (type) {
      conditions.push(eq(agentMemoryV2.memoryType, type));
    }

    const query = this.db
      .select()
      .from(agentMemoryV2)
      .where(and(...conditions))
      .orderBy(sql`${agentMemoryV2.createdAt} DESC`);

    if (limit) {
      return query.limit(limit);
    }
    return query;
  }
}
