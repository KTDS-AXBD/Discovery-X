/**
 * MemoryLifecycle 테스트
 *
 * 테스트 대상:
 * - addDailyLog: 콘텐츠 저장, tokenCount 자동 계산, logDate 자동 설정, category/importance 파라미터
 * - savePreference: importance 항상 1.0
 * - getMemories: 전체 조회 / 타입별 필터 / limit
 * - promoteDailyLog: daily_log → long_term 타입 변경 + archivedAt null
 * - compact: 30일 초과 → archived_at, 90일 초과 + importance < 0.3 → 삭제, summarizer 머지
 * - enforceTokenBudget: 예산 내/초과 처리
 * - estimateTokens: 한국어 기준 ~3.5자/토큰 (간접 확인)
 */

import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { MemoryLifecycle } from "~/features/chat/agent/memory-lifecycle";
import { agentMemoryV2 } from "~/db/schema-v2";
import { users } from "~/db";
import { MemoryType } from "~/lib/types/enums";
import { eq, sql } from "drizzle-orm";
import type { DB } from "~/db";

// ─── 헬퍼 ──────────────────────────────────────────────────────────────

function asDB(db: TestDB) {
  return db as unknown as DB;
}

const TEST_USER_ID = "mem-test-user-001";

// ─── 테스트 ─────────────────────────────────────────────────────────────

describe("MemoryLifecycle", () => {
  let db: TestDB;
  let lifecycle: MemoryLifecycle;

  beforeAll(() => {
    db = createTestDb();

    // 테스트 유저 생성
    db.insert(users).values({
      id: TEST_USER_ID,
      email: "mem-test@example.com",
      name: "MemoryTester",
    }).run();

    lifecycle = new MemoryLifecycle(asDB(db));
  });

  // ─── addDailyLog ───────────────────────────────────────────────────

  describe("addDailyLog", () => {
    it("콘텐츠 저장 + tokenCount 자동 계산 + logDate 자동 설정", async () => {
      const content = "오늘의 실험 결과를 기록합니다";
      await lifecycle.addDailyLog(TEST_USER_ID, content);

      const rows = await db
        .select()
        .from(agentMemoryV2)
        .where(eq(agentMemoryV2.userId, TEST_USER_ID));

      const last = rows[rows.length - 1];
      expect(last.content).toBe(content);
      expect(last.memoryType).toBe(MemoryType.DAILY_LOG);
      expect(last.tokenCount).toBe(Math.ceil(content.length / 3.5));
      expect(last.logDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(last.importance).toBe(0.5); // 기본값
    });

    it("category, importance 파라미터가 적용된다", async () => {
      await lifecycle.addDailyLog(TEST_USER_ID, "카테고리 테스트", "research", 0.8);

      const rows = await db
        .select()
        .from(agentMemoryV2)
        .where(eq(agentMemoryV2.userId, TEST_USER_ID));

      const last = rows[rows.length - 1];
      expect(last.category).toBe("research");
      expect(last.importance).toBe(0.8);
    });
  });

  // ─── savePreference ────────────────────────────────────────────────

  describe("savePreference", () => {
    it("importance 항상 1.0으로 저장된다", async () => {
      await lifecycle.savePreference(TEST_USER_ID, "한국어 응답 선호", "language");

      const rows = await db
        .select()
        .from(agentMemoryV2)
        .where(
          eq(agentMemoryV2.memoryType, MemoryType.LEARNED_PREF)
        );

      const pref = rows.find((r) => r.content === "한국어 응답 선호");
      expect(pref).toBeDefined();
      expect(pref!.importance).toBe(1.0);
      expect(pref!.category).toBe("language");
    });
  });

  // ─── getMemories ──────────────────────────────────────────────────

  describe("getMemories", () => {
    it("전체 조회 — 해당 유저의 모든 메모리 반환", async () => {
      const all = await lifecycle.getMemories(TEST_USER_ID);
      expect(all.length).toBeGreaterThanOrEqual(3); // addDailyLog x2 + savePreference x1
    });

    it("타입별 필터 — learned_pref만 조회", async () => {
      const prefs = await lifecycle.getMemories(TEST_USER_ID, MemoryType.LEARNED_PREF);
      expect(prefs.length).toBeGreaterThanOrEqual(1);
      expect(prefs.every((p) => p.memoryType === MemoryType.LEARNED_PREF)).toBe(true);
    });

    it("limit 적용 — 지정 개수만 반환", async () => {
      const limited = await lifecycle.getMemories(TEST_USER_ID, undefined, 1);
      expect(limited.length).toBe(1);
    });
  });

  // ─── promoteDailyLog ──────────────────────────────────────────────

  describe("promoteDailyLog", () => {
    it("daily_log → long_term 타입 변경 + archivedAt null", async () => {
      // 새 daily_log 추가
      await lifecycle.addDailyLog(TEST_USER_ID, "승격 대상 로그");
      const rows = await db
        .select()
        .from(agentMemoryV2)
        .where(eq(agentMemoryV2.userId, TEST_USER_ID));
      const target = rows.find((r) => r.content === "승격 대상 로그")!;

      await lifecycle.promoteDailyLog(target.id);

      const [updated] = await db
        .select()
        .from(agentMemoryV2)
        .where(eq(agentMemoryV2.id, target.id));

      expect(updated.memoryType).toBe(MemoryType.LONG_TERM);
      expect(updated.archivedAt).toBeNull();
    });
  });

  // ─── compact ──────────────────────────────────────────────────────

  describe("compact", () => {
    const COMPACT_USER = "compact-user-001";

    beforeAll(() => {
      db.insert(users).values({
        id: COMPACT_USER,
        email: "compact@example.com",
        name: "CompactTester",
      }).run();
    });

    it("30일 초과 daily_log → archived_at 설정", async () => {
      // 31일 전 daily_log 직접 insert
      db.run(sql`
        INSERT INTO agent_memory_v2 (user_id, memory_type, content, importance, token_count, created_at)
        VALUES (${COMPACT_USER}, 'daily_log', '30일 테스트 로그', 0.5, 10, unixepoch() - 86400 * 31)
      `);

      const result = await lifecycle.compact(COMPACT_USER);
      expect(result.archived).toBeGreaterThanOrEqual(1);

      const rows = await db
        .select()
        .from(agentMemoryV2)
        .where(eq(agentMemoryV2.userId, COMPACT_USER));
      const archived = rows.find((r) => r.content === "30일 테스트 로그");
      expect(archived?.archivedAt).not.toBeNull();
    });

    it("90일 초과 + importance < 0.3 → 삭제", async () => {
      const COMPACT_USER_90 = "compact-user-90d";
      db.insert(users).values({
        id: COMPACT_USER_90,
        email: "compact90@example.com",
        name: "Compact90Tester",
      }).run();

      // 91일 전, importance 0.1, archivedAt 설정된 로그
      db.run(sql`
        INSERT INTO agent_memory_v2 (user_id, memory_type, content, importance, token_count, created_at, archived_at)
        VALUES (${COMPACT_USER_90}, 'daily_log', '90일 삭제 대상', 0.1, 5, unixepoch() - 86400 * 91, unixepoch() - 86400 * 60)
      `);

      const result = await lifecycle.compact(COMPACT_USER_90);
      expect(result.deleted).toBeGreaterThanOrEqual(1);

      const remaining = await db
        .select()
        .from(agentMemoryV2)
        .where(eq(agentMemoryV2.userId, COMPACT_USER_90));
      const deleted = remaining.find((r) => r.content === "90일 삭제 대상");
      expect(deleted).toBeUndefined();
    });

    it("summarizer 제공 시 고중요도 로그 머지 (3개 이상, 결정 키워드 포함)", async () => {
      const MERGE_USER = "merge-user-001";
      db.insert(users).values({
        id: MERGE_USER,
        email: "merge@example.com",
        name: "MergeTester",
      }).run();

      // 고중요도 + archived + 결정 키워드 포함 로그 3개
      const contents = [
        "프로젝트 A 진행 결정",
        "프로젝트 B 중단 확정",
        "프로젝트 C 승인 완료",
      ];
      for (const c of contents) {
        db.run(sql`
          INSERT INTO agent_memory_v2 (user_id, memory_type, content, importance, token_count, created_at, archived_at)
          VALUES (${MERGE_USER}, 'daily_log', ${c}, 0.8, 10, unixepoch() - 86400 * 35, unixepoch() - 86400 * 2)
        `);
      }

      const summarizer = async (texts: string[]) =>
        `요약: ${texts.length}건 병합`;

      const result = await lifecycle.compact(MERGE_USER, summarizer);
      expect(result.merged).toBe(3);

      // 병합된 long_term 메모리 확인
      const longTerms = await db
        .select()
        .from(agentMemoryV2)
        .where(eq(agentMemoryV2.userId, MERGE_USER));
      const merged = longTerms.find((r) =>
        r.memoryType === MemoryType.LONG_TERM && r.category === "auto_merged"
      );
      expect(merged).toBeDefined();
      expect(merged!.content).toBe("요약: 3건 병합");
    });

    it("summarizer 없으면 merged=0", async () => {
      const NO_SUM_USER = "no-sum-user-001";
      db.insert(users).values({
        id: NO_SUM_USER,
        email: "nosum@example.com",
        name: "NoSumTester",
      }).run();

      // 고중요도 + archived + 결정 키워드
      for (let i = 0; i < 3; i++) {
        db.run(sql`
          INSERT INTO agent_memory_v2 (user_id, memory_type, content, importance, token_count, created_at, archived_at)
          VALUES (${NO_SUM_USER}, 'daily_log', ${"결정 로그 " + i}, 0.8, 10, unixepoch() - 86400 * 35, unixepoch() - 86400 * 2)
        `);
      }

      const result = await lifecycle.compact(NO_SUM_USER);
      expect(result.merged).toBe(0);
    });
  });

  // ─── enforceTokenBudget ────────────────────────────────────────────

  describe("enforceTokenBudget", () => {
    it("예산 내 → 삭제 0", async () => {
      const BUDGET_OK_USER = "budget-ok-001";
      db.insert(users).values({
        id: BUDGET_OK_USER,
        email: "budgetok@example.com",
        name: "BudgetOk",
      }).run();

      await lifecycle.addDailyLog(BUDGET_OK_USER, "짧은 메모");
      const deleted = await lifecycle.enforceTokenBudget(BUDGET_OK_USER, 100000);
      expect(deleted).toBe(0);
    });

    it("예산 초과 → importance 낮은 순 삭제, learned_pref 제외", async () => {
      const BUDGET_OVER_USER = "budget-over-001";
      db.insert(users).values({
        id: BUDGET_OVER_USER,
        email: "budgetover@example.com",
        name: "BudgetOver",
      }).run();

      // learned_pref (importance 1.0) — 삭제 대상 아님
      await lifecycle.savePreference(BUDGET_OVER_USER, "선호도 데이터");

      // daily_log 여러 개 (importance 낮은 순으로 삭제)
      await lifecycle.addDailyLog(BUDGET_OVER_USER, "a".repeat(100), undefined, 0.1);
      await lifecycle.addDailyLog(BUDGET_OVER_USER, "b".repeat(100), undefined, 0.2);
      await lifecycle.addDailyLog(BUDGET_OVER_USER, "c".repeat(100), undefined, 0.9);

      // 예산을 매우 작게 → 삭제 발생
      const deleted = await lifecycle.enforceTokenBudget(BUDGET_OVER_USER, 1);
      expect(deleted).toBeGreaterThanOrEqual(1);

      // learned_pref는 남아 있어야 함
      const remaining = await db
        .select()
        .from(agentMemoryV2)
        .where(eq(agentMemoryV2.userId, BUDGET_OVER_USER));
      const prefRemains = remaining.find(
        (r) => r.memoryType === MemoryType.LEARNED_PREF
      );
      expect(prefRemains).toBeDefined();
    });
  });

  // ─── estimateTokens (간접 확인) ────────────────────────────────────

  describe("estimateTokens (간접 확인)", () => {
    it("한국어 기준 ~3.5자/토큰으로 tokenCount 계산", async () => {
      const TOKENS_USER = "tokens-user-001";
      db.insert(users).values({
        id: TOKENS_USER,
        email: "tokens@example.com",
        name: "TokensTester",
      }).run();

      const content = "가나다라마바사아자차카타파하"; // 14자
      await lifecycle.addDailyLog(TOKENS_USER, content);

      const rows = await db
        .select()
        .from(agentMemoryV2)
        .where(eq(agentMemoryV2.userId, TOKENS_USER));
      const last = rows[rows.length - 1];
      // Math.ceil(14 / 3.5) = 4
      expect(last.tokenCount).toBe(Math.ceil(14 / 3.5));
      expect(last.tokenCount).toBe(4);
    });
  });
});
