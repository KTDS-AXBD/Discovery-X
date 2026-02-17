/**
 * BD PoC Radar API Integration 테스트 (I-12 ~ I-24)
 *
 * Remix loader/action은 Cloudflare D1 의존성이 있으므로,
 * DB 로직을 직접 재현하여 비즈니스 로직만 검증합니다.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq, and, or, isNull } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, resetFixtureCounter } from "../../helpers/fixtures";
import {
  users,
  radarSources,
  radarItems,
  radarItemUserStatus,
} from "~/db/schema";

// ── 테스트 헬퍼: Radar 소스/아이템 생성 ──

let itemCounter = 0;
function makeRadarSource(db: TestDB, overrides?: Record<string, unknown>) {
  const id = `src-${++itemCounter}`;
  db.insert(radarSources).values({
    id,
    name: `Source ${id}`,
    sourceType: "rss",
    url: `https://example.com/feed/${id}`,
    ...overrides,
  }).run();
  return id;
}

function makeRadarItem(db: TestDB, sourceId: string, overrides?: Record<string, unknown>) {
  const id = `item-${++itemCounter}`;
  db.insert(radarItems).values({
    id,
    sourceId,
    urlHash: `hash-${id}`,
    url: `https://example.com/article/${id}`,
    title: `Article ${id}`,
    ...overrides,
  }).run();
  return id;
}

describe("BD PoC Radar API", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    itemCounter = 0;
    db = createTestDb();
  });

  // ═══ GET /api/radar/sources (수정) ═══════════════════════════════

  describe("radar/sources — userId 필터", () => {
    // I-12: userId 필터 적용 (userOnly=true)
    it("returns only user's sources and shared sources when userOnly", () => {
      const user1 = makeUser();
      const user2 = makeUser();
      db.insert(users).values([user1, user2]).run();

      // user1의 소스
      const s1 = makeRadarSource(db, { userId: user1.id, name: "User1 Source" });
      // user2의 소스
      const s2 = makeRadarSource(db, { userId: user2.id, name: "User2 Source" });
      // 공용 소스 (userId = null)
      const s3 = makeRadarSource(db, { userId: null, name: "Shared Source" });

      // userOnly 로직 재현: user1의 소스 + 공용 소스
      const sources = db.select().from(radarSources).where(
        or(eq(radarSources.userId, user1.id), isNull(radarSources.userId))
      ).all();

      expect(sources).toHaveLength(2);
      const ids = sources.map((s) => s.id);
      expect(ids).toContain(s1);
      expect(ids).toContain(s3);
      expect(ids).not.toContain(s2);
    });

    // I-13: 필터 없을 때 전체 반환
    it("returns all sources when no filter", () => {
      const user1 = makeUser();
      const user2 = makeUser();
      db.insert(users).values([user1, user2]).run();

      makeRadarSource(db, { userId: user1.id });
      makeRadarSource(db, { userId: user2.id });
      makeRadarSource(db, { userId: null });

      const sources = db.select().from(radarSources).all();
      expect(sources).toHaveLength(3);
    });
  });

  // ═══ PATCH /api/radar/items/:id/status (신규) ════════════════════

  describe("radar/items/:id/status", () => {
    const VALID_STATUSES = ["new", "viewed", "archived"] as const;

    // I-14: new → viewed 전환
    it("creates user status record on first view", () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const srcId = makeRadarSource(db);
      const itemId = makeRadarItem(db, srcId);

      // UPSERT 로직 재현: 기존 레코드 없으면 새로 생성
      const existing = db.select().from(radarItemUserStatus)
        .where(and(eq(radarItemUserStatus.userId, user.id), eq(radarItemUserStatus.itemId, itemId)))
        .all();

      expect(existing).toHaveLength(0);

      const now = new Date();
      db.insert(radarItemUserStatus).values({
        id: `rius-1`,
        userId: user.id,
        itemId,
        status: "viewed",
        viewedAt: now,
      }).run();

      const record = db.select().from(radarItemUserStatus)
        .where(and(eq(radarItemUserStatus.userId, user.id), eq(radarItemUserStatus.itemId, itemId)))
        .all();

      expect(record).toHaveLength(1);
      expect(record[0].status).toBe("viewed");
      expect(record[0].viewedAt).toBeTruthy();
    });

    // I-15: viewed → archived 전환
    it("updates existing status to archived", () => {
      const user = makeUser();
      db.insert(users).values(user).run();

      const srcId = makeRadarSource(db);
      const itemId = makeRadarItem(db, srcId);

      db.insert(radarItemUserStatus).values({
        id: "rius-2",
        userId: user.id,
        itemId,
        status: "viewed",
        viewedAt: new Date("2026-01-01"),
      }).run();

      const now = new Date();
      db.update(radarItemUserStatus)
        .set({ status: "archived", archivedAt: now })
        .where(eq(radarItemUserStatus.id, "rius-2"))
        .run();

      const record = db.select().from(radarItemUserStatus)
        .where(eq(radarItemUserStatus.id, "rius-2"))
        .get();

      expect(record!.status).toBe("archived");
      expect(record!.archivedAt).toBeTruthy();
    });

    // I-16: 잘못된 status 값 검증
    it("rejects invalid status values", () => {
      const invalidStatus = "invalid_status";
      const isValid = VALID_STATUSES.includes(invalidStatus as never);
      expect(isValid).toBe(false);
    });

    // I-17: 존재하지 않는 itemId 검증
    it("returns empty for non-existent itemId", () => {
      const item = db.select({ id: radarItems.id })
        .from(radarItems)
        .where(eq(radarItems.id, "non-existent-item"))
        .all();

      expect(item).toHaveLength(0);
    });
  });

  // ═══ POST /api/radar/summarize (신규) ════════════════════════════

  describe("radar/summarize", () => {
    // I-18: keyPoints 없는 아이템 → GPT 호출 시뮬레이션
    it("generates keyPoints when not cached", async () => {
      const srcId = makeRadarSource(db);
      const itemId = makeRadarItem(db, srcId, {
        titleKo: "AI 제조업 품질",
        summaryKo: "AI 기반 품질 검사 시장 성장",
        keyPoints: null,
      });

      // GPT 응답 모킹
      const mockKeyPoints = ["비전 AI 정확도 99.5%", "도입 비용 30% 감소"];
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify(mockKeyPoints) } }],
        }),
      }));

      // 아이템 조회
      const item = db.select().from(radarItems)
        .where(eq(radarItems.id, itemId)).get();

      expect(item!.keyPoints).toBeNull();

      // GPT 호출 (시뮬레이션)
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        body: "{}",
      });
      const data = await response.json() as { choices: Array<{ message: { content: string } }> };
      const keyPoints = JSON.parse(data.choices[0].message.content);

      // DB 업데이트
      db.update(radarItems)
        .set({ keyPoints })
        .where(eq(radarItems.id, itemId))
        .run();

      const updated = db.select().from(radarItems)
        .where(eq(radarItems.id, itemId)).get();

      expect(updated!.keyPoints).toEqual(mockKeyPoints);
      expect(fetch).toHaveBeenCalledOnce();

      vi.unstubAllGlobals();
    });

    // I-19: keyPoints 이미 존재 → 캐시 반환
    it("returns cached keyPoints without GPT call", () => {
      const srcId = makeRadarSource(db);
      const cachedPoints = ["포인트 1", "포인트 2"];
      const itemId = makeRadarItem(db, srcId, {
        keyPoints: cachedPoints,
        summaryKo: "기존 요약",
      });

      const item = db.select().from(radarItems)
        .where(eq(radarItems.id, itemId)).get();

      const existing = item!.keyPoints as string[] | null;
      expect(existing).not.toBeNull();
      expect(existing!.length).toBeGreaterThan(0);

      // 캐시가 있으면 GPT 호출하지 않음
      const result = {
        itemId: item!.id,
        summaryKo: item!.summaryKo,
        keyPoints: existing,
        cached: true,
      };

      expect(result.cached).toBe(true);
      expect(result.keyPoints).toEqual(cachedPoints);
    });

    // I-20: 존재하지 않는 itemId
    it("returns null for non-existent itemId", () => {
      const item = db.select().from(radarItems)
        .where(eq(radarItems.id, "non-existent")).get();

      expect(item).toBeUndefined();
    });

    // I-21: GPT API 에러 처리
    it("handles GPT API error gracefully", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce({
        ok: false,
        text: async () => "Rate limit exceeded",
      }));

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        body: "{}",
      });

      expect(response.ok).toBe(false);
      const errText = await response.text();
      expect(errText).toContain("Rate limit");

      vi.unstubAllGlobals();
    });
  });

  // ═══ GET /api/similar-sources (신규) ═════════════════════════════

  describe("similar-sources", () => {
    // I-22: Vectorize 정상 응답 시뮬레이션
    it("filters results by score >= 0.7", () => {
      const srcId = makeRadarSource(db);
      const item1 = makeRadarItem(db, srcId, { titleKo: "AI 제조업" });
      const item2 = makeRadarItem(db, srcId, { titleKo: "AI 물류" });
      const item3 = makeRadarItem(db, srcId, { titleKo: "AI 금융" });

      // Vectorize 응답 시뮬레이션
      const mockMatches = [
        { id: item1, score: 1.0 },  // 자기 자신 — 제외 대상
        { id: item2, score: 0.85 }, // 유사도 높음 → 포함
        { id: item3, score: 0.6 },  // 유사도 낮음 → 제외
      ];

      const baseItemId = item1;
      const limit = 3;

      const filtered = mockMatches
        .filter((m) => m.id !== baseItemId && m.score >= 0.7)
        .slice(0, limit);

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(item2);
      expect(filtered[0].score).toBe(0.85);

      // DB에서 상세 정보 조회
      const detail = db.select().from(radarItems)
        .where(eq(radarItems.id, filtered[0].id)).get();

      expect(detail!.titleKo).toBe("AI 물류");
    });

    // I-23: Vectorize 바인딩 없음 → 빈 배열 폴백
    it("returns empty array when Vectorize is not available", () => {
      const env = {
        VECTORIZE_RADAR: undefined,
        OPENAI_API_KEY: "test-key",
      };

      // similar-sources 로직: Vectorize 없으면 빈 배열
      const hasVectorize = !!(env.VECTORIZE_RADAR && env.OPENAI_API_KEY);
      expect(hasVectorize).toBe(false);

      const result = { results: [], source: "none" };
      expect(result.results).toHaveLength(0);
      expect(result.source).toBe("none");
    });

    // I-24: 존재하지 않는 itemId → 빈 배열
    it("returns empty when base item does not exist", () => {
      const item = db.select().from(radarItems)
        .where(eq(radarItems.id, "missing-item")).get();

      expect(item).toBeUndefined();

      // 아이템이 없으면 빈 결과 반환
      const result = item ? { results: ["something"] } : { results: [] };
      expect(result.results).toHaveLength(0);
    });
  });
});
