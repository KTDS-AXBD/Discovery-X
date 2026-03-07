import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../../helpers/db";
import { users } from "~/db";
import { topics, sharedSignals } from "~/features/topic/db/schema";
import { SignalService } from "~/features/topic/service/signal.service";

describe("SignalService", () => {
  let db: TestDB;
  let svc: SignalService;

  beforeEach(() => {
    db = createTestDb();
    svc = new SignalService(db as never);

    // 시드 데이터
    db.insert(users)
      .values([
        { id: "u1", email: "u1@test.com", name: "User 1", role: "user" },
        { id: "u2", email: "u2@test.com", name: "User 2", role: "user" },
      ])
      .run();

    db.insert(topics)
      .values([
        { id: "tp-1", teamId: "team1", name: "AI Research", createdBy: "u1" },
        { id: "tp-2", teamId: "team1", name: "Cloud Infra", createdBy: "u2" },
      ])
      .run();
  });

  // ─── create ─────────────────────────────────────────────────────────

  describe("create", () => {
    it("시그널을 생성하고 returning 결과를 확인한다", async () => {
      const signal = await svc.create({
        sourceUserId: "u1",
        teamId: "team1",
        topicId: "tp-1",
        contentSummary: "AI 트렌드 시그널",
        score: 0.85,
      });

      expect(signal.id).toBeDefined();
      expect(signal.contentSummary).toBe("AI 트렌드 시그널");
      expect(signal.score).toBe(0.85);
      expect(signal.status).toBe("pending");
    });
  });

  // ─── list ───────────────────────────────────────────────────────────

  describe("list", () => {
    beforeEach(async () => {
      await svc.create({ sourceUserId: "u1", teamId: "team1", topicId: "tp-1", contentSummary: "Sig A", score: 0.9 });
      await svc.create({ sourceUserId: "u1", teamId: "team1", topicId: "tp-2", contentSummary: "Sig B", score: 0.5 });
      await svc.create({ sourceUserId: "u2", teamId: "team2", topicId: null, contentSummary: "Sig C", score: 0.7 });
    });

    it("팀별 시그널 목록을 조회한다", async () => {
      const list = await svc.list("team1");
      expect(list).toHaveLength(2);
    });

    it("topicId로 필터링한다", async () => {
      const list = await svc.list("team1", { topicId: "tp-1" });
      expect(list).toHaveLength(1);
      expect(list[0].contentSummary).toBe("Sig A");
    });

    it("status로 필터링한다", async () => {
      const all = await svc.list("team1");
      const first = all[0];
      await svc.updateStatus(first.id, "reviewed");

      const reviewed = await svc.list("team1", { status: "reviewed" });
      expect(reviewed).toHaveLength(1);
    });

    it("limit을 적용한다", async () => {
      const list = await svc.list("team1", { limit: 1 });
      expect(list).toHaveLength(1);
    });

    it("score 내림차순으로 정렬된다", async () => {
      const list = await svc.list("team1");
      expect(list[0].score).toBeGreaterThanOrEqual(list[1].score);
    });
  });

  // ─── updateStatus ─────────────────────────────────────────────────

  describe("updateStatus", () => {
    it("상태를 변경하고 routedTo를 설정한다", async () => {
      const signal = await svc.create({
        sourceUserId: "u1",
        teamId: "team1",
        contentSummary: "Route Test",
        score: 0.8,
      });
      await svc.updateStatus(signal.id, "actioned", "u2");

      const list = await svc.list("team1", { status: "actioned" });
      expect(list).toHaveLength(1);
      expect(list[0].routedTo).toBe("u2");
    });
  });

  // ─── getByTopic ───────────────────────────────────────────────────

  describe("getByTopic", () => {
    it("Topic별 시그널을 score 내림차순으로 조회한다", async () => {
      await svc.create({ sourceUserId: "u1", teamId: "team1", topicId: "tp-1", contentSummary: "Low", score: 0.3 });
      await svc.create({ sourceUserId: "u2", teamId: "team1", topicId: "tp-1", contentSummary: "High", score: 0.9 });

      const list = await svc.getByTopic("tp-1");
      expect(list).toHaveLength(2);
      expect(list[0].score).toBeGreaterThan(list[1].score);
    });
  });

  // ─── dismiss ──────────────────────────────────────────────────────

  describe("dismiss", () => {
    it("status를 dismissed로 변경한다", async () => {
      const signal = await svc.create({
        sourceUserId: "u1",
        teamId: "team1",
        contentSummary: "Dismiss Me",
        score: 0.4,
      });
      await svc.dismiss(signal.id);

      const list = await svc.list("team1", { status: "dismissed" });
      expect(list).toHaveLength(1);
      expect(list[0].id).toBe(signal.id);
    });
  });

  // ─── listWithDetails ──────────────────────────────────────────────

  describe("listWithDetails", () => {
    beforeEach(async () => {
      await svc.create({ sourceUserId: "u1", teamId: "team1", topicId: "tp-1", contentSummary: "Detail A", score: 0.8 });
      await svc.create({ sourceUserId: "u2", teamId: "team1", topicId: "tp-2", contentSummary: "Detail B", score: 0.6 });
    });

    it("JOIN 결과에 topicName과 sourceUserName이 포함된다", async () => {
      const list = await svc.listWithDetails("team1");
      expect(list).toHaveLength(2);

      const itemA = list.find((s) => s.contentSummary === "Detail A")!;
      expect(itemA.topicName).toBe("AI Research");
      expect(itemA.sourceUserName).toBe("User 1");
    });

    it("topicId 필터를 적용한다", async () => {
      const list = await svc.listWithDetails("team1", { topicId: "tp-2" });
      expect(list).toHaveLength(1);
      expect(list[0].topicName).toBe("Cloud Infra");
    });

    it("status 필터를 적용한다", async () => {
      const all = await svc.listWithDetails("team1");
      await svc.dismiss(all[0].id);

      const dismissed = await svc.listWithDetails("team1", { status: "dismissed" });
      expect(dismissed).toHaveLength(1);
    });
  });
});
