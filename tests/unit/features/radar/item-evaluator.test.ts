/**
 * ItemEvaluator 단위 테스트
 *
 * 대상: app/features/radar/service/item-evaluator.ts
 * - parseEvalResponse: JSON 파싱 + 검증 + clamp
 * - getUnevaluatedItems: 미평가 아이템 쿼리 + 테넌트 격리
 * - evaluateBatch: LLM 모킹 배치 평가
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, type TestDB } from "tests/helpers/db";
import type { DB } from "~/db";
import {
  users,
  tenants,
  tenantMembers,
  radarSources,
  radarItems,
} from "~/db";
import { radarItemMetrics } from "~/features/radar/db/schema";

// ─── Top-level mocks ────────────────────────────────────────────────────

const { mockCallLLM, mockRecord } = vi.hoisted(() => ({
  mockCallLLM: vi.fn(),
  mockRecord: vi.fn().mockResolvedValue({ usageEventId: "test-id", totalCostUsd: 0 }),
}));

vi.mock("~/lib/ai", () => {
  class BudgetBlockedError extends Error {
    name = "BudgetBlockedError";
    constructor(public readonly decisionId: string) {
      super("예산 한도 초과로 LLM 호출이 차단되었습니다");
    }
  }
  return { callLLM: mockCallLLM, BudgetBlockedError };
});

vi.mock("~/features/cost/service/usage-recorder", () => ({
  UsageRecorder: class {
    record = mockRecord;
  },
}));

// import after mocks are set up
import { ItemEvaluator } from "~/features/radar/service/item-evaluator";

// ─── 상수 ───────────────────────────────────────────────────────────────

const TENANT_ID = "t-eval-test";
const TENANT_ID_2 = "t-eval-other";
const USER_ID = "user-eval-1";
const SOURCE_ID = "src-eval-1";

// ─── Setup ──────────────────────────────────────────────────────────────

let db: TestDB;
let evaluator: ItemEvaluator;

function asDB(d: TestDB) {
  return d as unknown as DB;
}

function seedBase() {
  db.insert(users)
    .values({ id: USER_ID, email: "eval@test.com", name: "Eval User", role: "admin" })
    .run();

  db.insert(tenants)
    .values({ id: TENANT_ID, name: "Eval Tenant", slug: "eval-test", ownerUserId: USER_ID })
    .run();

  db.insert(tenantMembers)
    .values({ id: "tm-e1", tenantId: TENANT_ID, userId: USER_ID })
    .run();
}

function seedSource(id: string, tenantId = TENANT_ID) {
  db.insert(radarSources)
    .values({
      id,
      name: `Source ${id}`,
      sourceType: "rss",
      url: `https://${id}.com`,
      tenantId,
      userId: USER_ID,
      status: "ACTIVE",
      collectionType: "auto",
    })
    .run();
}

function seedItems(sourceId: string, count: number, prefix = "item") {
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < count; i++) {
    db.insert(radarItems)
      .values({
        id: `${prefix}-${sourceId}-${i}`,
        sourceId,
        urlHash: `hash-${prefix}-${sourceId}-${i}`,
        url: `https://example.com/${prefix}-${i}`,
        title: `Item ${i}`,
        titleKo: `아이템 ${i}`,
        summary: `Summary of item ${i}`,
        summaryKo: `아이템 ${i} 요약`,
        collectedAt: new Date(now * 1000),
      })
      .run();
  }
}

function seedEvaluated(itemId: string) {
  db.insert(radarItemMetrics)
    .values({
      id: `rim-${itemId}`,
      itemId,
      tenantId: TENANT_ID,
      topicRelevance: 0.7,
      novelty: 0.5,
      quality: 0.6,
      compositeScore: 0.6,
      modelVersion: "test-model",
      evaluatedAt: new Date(),
    })
    .run();
}

function makeLLMResponse(scores: { topicRelevance: number; novelty: number; quality: number }) {
  return {
    model: "claude-haiku-4-5-20251001",
    content: [{ type: "text" as const, text: JSON.stringify(scores) }],
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

beforeEach(() => {
  db = createTestDb();
  evaluator = new ItemEvaluator(asDB(db));
  seedBase();
  mockCallLLM.mockReset();
  mockRecord.mockReset().mockResolvedValue({ usageEventId: "test-id", totalCostUsd: 0 });
});

// ─── Tests ──────────────────────────────────────────────────────────────

describe("ItemEvaluator", () => {
  // ══════════════════════════════════════════════
  // parseEvalResponse
  // ══════════════════════════════════════════════
  describe("parseEvalResponse", () => {
    it("정상 JSON 파싱", () => {
      const result = evaluator.parseEvalResponse(
        '{"topicRelevance":0.85,"novelty":0.72,"quality":0.68}',
      );
      expect(result).toEqual({
        topicRelevance: 0.85,
        novelty: 0.72,
        quality: 0.68,
      });
    });

    it("markdown 코드블록 래핑 처리", () => {
      const result = evaluator.parseEvalResponse(
        '```json\n{"topicRelevance":0.9,"novelty":0.6,"quality":0.7}\n```',
      );
      expect(result).toEqual({
        topicRelevance: 0.9,
        novelty: 0.6,
        quality: 0.7,
      });
    });

    it("잘못된 JSON → null", () => {
      expect(evaluator.parseEvalResponse("not json")).toBeNull();
    });

    it("필드 누락 → null", () => {
      expect(
        evaluator.parseEvalResponse('{"topicRelevance":0.5,"novelty":0.3}'),
      ).toBeNull();
    });

    it("범위 초과 → clamp", () => {
      const result = evaluator.parseEvalResponse(
        '{"topicRelevance":1.5,"novelty":-0.3,"quality":0.5}',
      );
      expect(result).toEqual({
        topicRelevance: 1.0,
        novelty: 0.0,
        quality: 0.5,
      });
    });

    it("빈 문자열 → null", () => {
      expect(evaluator.parseEvalResponse("")).toBeNull();
    });

    it("필드가 문자열 타입 → null", () => {
      expect(
        evaluator.parseEvalResponse(
          '{"topicRelevance":"high","novelty":0.5,"quality":0.5}',
        ),
      ).toBeNull();
    });
  });

  // ══════════════════════════════════════════════
  // getUnevaluatedItems
  // ══════════════════════════════════════════════
  describe("getUnevaluatedItems", () => {
    it("미평가 아이템만 반환", async () => {
      seedSource(SOURCE_ID);
      seedItems(SOURCE_ID, 3);
      seedEvaluated(`item-${SOURCE_ID}-0`); // 이미 평가됨

      const items = await evaluator.getUnevaluatedItems(TENANT_ID, 10);
      expect(items).toHaveLength(2);
      expect(items.map((i) => i.id)).not.toContain(`item-${SOURCE_ID}-0`);
    });

    it("limit 적용", async () => {
      seedSource(SOURCE_ID);
      seedItems(SOURCE_ID, 5);

      const items = await evaluator.getUnevaluatedItems(TENANT_ID, 2);
      expect(items).toHaveLength(2);
    });

    it("테넌트 격리", async () => {
      db.insert(tenants)
        .values({ id: TENANT_ID_2, name: "Other Tenant", slug: "other-test", ownerUserId: USER_ID })
        .run();

      seedSource(SOURCE_ID, TENANT_ID);
      seedSource("src-other", TENANT_ID_2);
      seedItems(SOURCE_ID, 3);
      seedItems("src-other", 2, "other");

      const items = await evaluator.getUnevaluatedItems(TENANT_ID, 10);
      expect(items).toHaveLength(3);
      expect(items.every((i) => i.tenantId === TENANT_ID)).toBe(true);
    });

    it("모두 평가 완료 → 빈 배열", async () => {
      seedSource(SOURCE_ID);
      seedItems(SOURCE_ID, 2);
      seedEvaluated(`item-${SOURCE_ID}-0`);
      seedEvaluated(`item-${SOURCE_ID}-1`);

      const items = await evaluator.getUnevaluatedItems(TENANT_ID, 10);
      expect(items).toHaveLength(0);
    });

    it("소스 없으면 빈 배열", async () => {
      const items = await evaluator.getUnevaluatedItems(TENANT_ID, 10);
      expect(items).toHaveLength(0);
    });
  });

  // ══════════════════════════════════════════════
  // evaluateBatch (LLM 모킹)
  // ══════════════════════════════════════════════
  describe("evaluateBatch", () => {
    it("빈 배치 — 아이템 없으면 즉시 반환", async () => {
      seedSource(SOURCE_ID);

      const result = await evaluator.evaluateBatch({
        tenantId: TENANT_ID,
        limit: 10,
        env: {},
      });

      expect(result.evaluated).toBe(0);
      expect(result.skipped).toBe(0);
      expect(result.budgetBlocked).toBe(false);
      expect(mockCallLLM).not.toHaveBeenCalled();
    });

    it("LLM 호출 성공 → evaluated 증가 + DB UPSERT", async () => {
      seedSource(SOURCE_ID);
      seedItems(SOURCE_ID, 2);

      mockCallLLM.mockResolvedValue(
        makeLLMResponse({ topicRelevance: 0.8, novelty: 0.6, quality: 0.7 }),
      );

      const result = await evaluator.evaluateBatch({
        tenantId: TENANT_ID,
        limit: 10,
        env: { ANTHROPIC_API_KEY: "test-key" },
      });

      expect(result.evaluated).toBe(2);
      expect(result.skipped).toBe(0);
      expect(mockCallLLM).toHaveBeenCalledTimes(2);

      // DB에 메트릭 기록 확인
      const metrics = db.select().from(radarItemMetrics).all();
      expect(metrics).toHaveLength(2);
      expect(metrics[0].topicRelevance).toBe(0.8);
      expect(metrics[0].evaluatedAt).not.toBeNull();
    });

    it("LLM 부분 실패 — 일부만 skip", async () => {
      seedSource(SOURCE_ID);
      seedItems(SOURCE_ID, 3);

      let callCount = 0;
      mockCallLLM.mockImplementation(() => {
        callCount++;
        if (callCount === 2) throw new Error("LLM call failed");
        return makeLLMResponse({ topicRelevance: 0.7, novelty: 0.5, quality: 0.6 });
      });

      const result = await evaluator.evaluateBatch({
        tenantId: TENANT_ID,
        limit: 10,
        env: { ANTHROPIC_API_KEY: "test-key" },
      });

      expect(result.evaluated).toBe(2);
      expect(result.skipped).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it("BudgetBlockedError → 배치 즉시 중단", async () => {
      seedSource(SOURCE_ID);
      seedItems(SOURCE_ID, 3);

      // BudgetBlockedError를 mocked 모듈에서 가져옴
      const { BudgetBlockedError } = await import("~/lib/ai");
      mockCallLLM.mockRejectedValue(new BudgetBlockedError("dec-1"));

      const result = await evaluator.evaluateBatch({
        tenantId: TENANT_ID,
        limit: 10,
        env: { ANTHROPIC_API_KEY: "test-key" },
      });

      expect(result.budgetBlocked).toBe(true);
      expect(result.evaluated).toBe(0);
      // 첫 호출에서 즉시 중단 → 나머지 아이템은 호출 안 함
      expect(mockCallLLM).toHaveBeenCalledTimes(1);
    });

    it("JSON 파싱 실패 → skip 처리", async () => {
      seedSource(SOURCE_ID);
      seedItems(SOURCE_ID, 1);

      mockCallLLM.mockResolvedValue({
        model: "claude-haiku-4-5-20251001",
        content: [{ type: "text", text: "invalid response" }],
        usage: { input_tokens: 50, output_tokens: 20 },
      });

      const result = await evaluator.evaluateBatch({
        tenantId: TENANT_ID,
        limit: 10,
        env: { ANTHROPIC_API_KEY: "test-key" },
      });

      expect(result.evaluated).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.errors[0]).toContain("JSON 파싱 실패");
    });
  });
});
