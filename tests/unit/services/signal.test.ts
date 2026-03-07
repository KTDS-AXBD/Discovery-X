/**
 * SignalService 단위 테스트
 *
 * 대상: app/lib/services/signal.service.ts
 * - list (팀별 + 필터), create, updateStatus, getByTopic, dismiss
 *
 * 주의: sharedSignals.id는 autoincrement integer (UUID 아님)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb } from "tests/helpers/db";
import type { DB } from "~/db";
import { SignalService } from "~/features/topic/service/signal.service";
import { sharedSignals } from "~/db/schema-v2";
import { eq } from "drizzle-orm";

let db: ReturnType<typeof createTestDb>;
let service: SignalService;

const TEAM_ID = "team-signal-1";
const OTHER_TEAM_ID = "team-signal-2";
const TOPIC_ID = "topic-1";
const TOPIC_ID_2 = "topic-2";
const SOURCE_USER = "user-signal-src";

beforeAll(() => {
  db = createTestDb();
  service = new SignalService(db as unknown as DB);

  // 시그널 시드 데이터 삽입 (sharedSignals에는 FK 제약 없음)
  db.insert(sharedSignals)
    .values([
      { sourceUserId: SOURCE_USER, teamId: TEAM_ID, topicId: TOPIC_ID, contentSummary: "시그널 A", score: 0.9, status: "pending" },
      { sourceUserId: SOURCE_USER, teamId: TEAM_ID, topicId: TOPIC_ID, contentSummary: "시그널 B", score: 0.7, status: "reviewed" },
      { sourceUserId: SOURCE_USER, teamId: TEAM_ID, topicId: TOPIC_ID_2, contentSummary: "시그널 C", score: 0.5, status: "pending" },
      { sourceUserId: SOURCE_USER, teamId: OTHER_TEAM_ID, topicId: TOPIC_ID, contentSummary: "다른팀 시그널", score: 0.8, status: "pending" },
    ])
    .run();
});

// ============================================================================
// list
// ============================================================================

describe("SignalService", () => {
  describe("list", () => {
    it("팀별 시그널 목록 조회 — score 내림차순", async () => {
      const result = await service.list(TEAM_ID);

      expect(result.length).toBe(3);
      expect(result.every((s) => s.teamId === TEAM_ID)).toBe(true);
      // score 내림차순 확인
      expect(result[0].score).toBeGreaterThanOrEqual(result[1].score);
      expect(result[1].score).toBeGreaterThanOrEqual(result[2].score);
    });

    it("다른 팀의 시그널은 포함되지 않음", async () => {
      const result = await service.list(TEAM_ID);
      expect(result.every((s) => s.teamId === TEAM_ID)).toBe(true);
    });

    it("topicId 필터", async () => {
      const result = await service.list(TEAM_ID, { topicId: TOPIC_ID });

      expect(result.length).toBe(2);
      expect(result.every((s) => s.topicId === TOPIC_ID)).toBe(true);
    });

    it("status 필터", async () => {
      const result = await service.list(TEAM_ID, { status: "reviewed" });

      expect(result.length).toBe(1);
      expect(result[0].status).toBe("reviewed");
    });

    it("limit 필터", async () => {
      const result = await service.list(TEAM_ID, { limit: 1 });

      expect(result.length).toBe(1);
    });

    it("빈 결과 — 존재하지 않는 팀", async () => {
      const result = await service.list("no-team");

      expect(result).toHaveLength(0);
    });
  });

  // ============================================================================
  // create
  // ============================================================================

  describe("create", () => {
    it("시그널 생성 + returning 결과 검증", async () => {
      const created = await service.create({
        sourceUserId: SOURCE_USER,
        teamId: TEAM_ID,
        topicId: TOPIC_ID,
        contentSummary: "새 시그널",
        score: 0.95,
      });

      expect(created).toBeDefined();
      expect(created.id).toBeTypeOf("number");
      expect(created.contentSummary).toBe("새 시그널");
      expect(created.score).toBe(0.95);
      expect(created.status).toBe("pending"); // 기본값
    });
  });

  // ============================================================================
  // updateStatus
  // ============================================================================

  describe("updateStatus", () => {
    it("상태 변경 (routedTo 없음)", async () => {
      // 첫 번째 시그널의 id 조회
      const all = db.select().from(sharedSignals).where(eq(sharedSignals.teamId, TEAM_ID)).all();
      const target = all[0];

      await service.updateStatus(target.id, "actioned");

      const updated = db.select().from(sharedSignals).where(eq(sharedSignals.id, target.id)).get();
      expect(updated!.status).toBe("actioned");
    });

    it("상태 변경 + routedTo 설정", async () => {
      const all = db.select().from(sharedSignals).where(eq(sharedSignals.teamId, TEAM_ID)).all();
      const target = all[1];

      await service.updateStatus(target.id, "reviewed", "user-reviewer-1");

      const updated = db.select().from(sharedSignals).where(eq(sharedSignals.id, target.id)).get();
      expect(updated!.status).toBe("reviewed");
      expect(updated!.routedTo).toBe("user-reviewer-1");
    });
  });

  // ============================================================================
  // getByTopic
  // ============================================================================

  describe("getByTopic", () => {
    it("Topic별 시그널 조회 — score 내림차순", async () => {
      const result = await service.getByTopic(TOPIC_ID);

      expect(result.length).toBeGreaterThanOrEqual(2);
      // 팀과 무관하게 topicId로 조회
      expect(result.every((s) => s.topicId === TOPIC_ID)).toBe(true);
      // score 내림차순
      for (let i = 1; i < result.length; i++) {
        expect(result[i - 1].score).toBeGreaterThanOrEqual(result[i].score);
      }
    });

    it("존재하지 않는 topic → 빈 배열", async () => {
      const result = await service.getByTopic("no-topic");

      expect(result).toHaveLength(0);
    });
  });

  // ============================================================================
  // dismiss
  // ============================================================================

  describe("dismiss", () => {
    it("시그널 무시 처리 — status → 'dismissed'", async () => {
      const all = db.select().from(sharedSignals).where(eq(sharedSignals.teamId, TEAM_ID)).all();
      const target = all[all.length - 1]; // 마지막 시그널

      await service.dismiss(target.id);

      const updated = db.select().from(sharedSignals).where(eq(sharedSignals.id, target.id)).get();
      expect(updated!.status).toBe("dismissed");
    });
  });
});
