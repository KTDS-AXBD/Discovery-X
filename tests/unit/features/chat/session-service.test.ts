import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../../helpers/db";
import { users, tenants, tenantMembers, conversations, agentSessionsV2 } from "~/db";
import { ChatSessionService } from "~/features/chat/service/session.service";

describe("ChatSessionService", () => {
  let db: TestDB;
  let svc: ChatSessionService;

  beforeEach(() => {
    db = createTestDb();
    svc = new ChatSessionService(db as never);

    // 시드 데이터
    db.insert(users)
      .values([
        { id: "u1", email: "u1@test.com", name: "User 1", role: "user" },
        { id: "u2", email: "u2@test.com", name: "User 2", role: "user" },
      ])
      .run();

    db.insert(tenants)
      .values([{ id: "t1", name: "Team 1", slug: "team-1", ownerUserId: "u1" }])
      .run();

    db.insert(tenantMembers)
      .values([
        { id: "tm1", tenantId: "t1", userId: "u1" },
        { id: "tm2", tenantId: "t1", userId: "u2" },
      ])
      .run();
  });

  // ─── listSessions ─────────────────────────────────────────────────

  describe("listSessions", () => {
    it("userId 스코프로 세션 목록을 조회한다", async () => {
      await svc.createSessionWithConversation("u1");
      await svc.createSessionWithConversation("u1");
      await svc.createSessionWithConversation("u2");

      const u1Sessions = await svc.listSessions("u1");
      expect(u1Sessions).toHaveLength(2);

      const u2Sessions = await svc.listSessions("u2");
      expect(u2Sessions).toHaveLength(1);
    });

    it("limit과 offset을 적용한다", async () => {
      await svc.createSessionWithConversation("u1");
      await svc.createSessionWithConversation("u1");
      await svc.createSessionWithConversation("u1");

      const page = await svc.listSessions("u1", 2, 0);
      expect(page).toHaveLength(2);

      const page2 = await svc.listSessions("u1", 2, 2);
      expect(page2).toHaveLength(1);
    });

    it("startedAt 내림차순으로 정렬된다", async () => {
      await svc.createSessionWithConversation("u1");
      await svc.createSessionWithConversation("u1");

      const sessions = await svc.listSessions("u1");
      for (let i = 0; i < sessions.length - 1; i++) {
        expect(sessions[i].startedAt!.getTime()).toBeGreaterThanOrEqual(
          sessions[i + 1].startedAt!.getTime(),
        );
      }
    });
  });

  // ─── createSessionWithConversation ────────────────────────────────

  describe("createSessionWithConversation", () => {
    it("세션과 대화를 동시에 생성한다", async () => {
      const result = await svc.createSessionWithConversation("u1");
      expect(result.sessionId).toBeDefined();
      expect(result.conversationId).toBeDefined();
    });

    it("conversation title이 [agent:{sessionId}] 형식이다", async () => {
      const result = await svc.createSessionWithConversation("u1");

      const conv = db
        .select()
        .from(conversations)
        .where(require("drizzle-orm").eq(conversations.id, result.conversationId))
        .get();

      expect(conv!.title).toBe(`[agent:${result.sessionId}]`);
    });

    it("agentSessionsV2 레코드가 생성된다", async () => {
      const result = await svc.createSessionWithConversation("u1");

      const session = db
        .select()
        .from(agentSessionsV2)
        .where(require("drizzle-orm").eq(agentSessionsV2.id, result.sessionId))
        .get();

      expect(session).toBeDefined();
      expect(session!.userId).toBe("u1");
      expect(session!.tokenCount).toBe(0);
    });
  });

  // ─── findOrCreateConversation ─────────────────────────────────────

  describe("findOrCreateConversation", () => {
    it("기존 conversation이 있으면 해당 ID를 반환한다", async () => {
      const { sessionId, conversationId } =
        await svc.createSessionWithConversation("u1");

      const found = await svc.findOrCreateConversation("u1", sessionId);
      expect(found).toBe(conversationId);
    });

    it("기존 conversation이 없으면 새로 생성한다", async () => {
      const convId = await svc.findOrCreateConversation("u1", "new-session-id");
      expect(convId).toBeDefined();

      const conv = db
        .select()
        .from(conversations)
        .where(require("drizzle-orm").eq(conversations.id, convId))
        .get();

      expect(conv!.title).toBe("[agent:new-session-id]");
    });
  });

  // ─── createConversation ───────────────────────────────────────────

  describe("createConversation", () => {
    it("conversation을 생성한다", async () => {
      const result = await svc.createConversation({
        userId: "u1",
        tenantId: "t1",
        title: "My Chat",
      });
      expect(result.id).toBeDefined();
      expect(result.title).toBe("My Chat");
    });

    it("title 미지정 시 '새 대화'가 기본값이다", async () => {
      const result = await svc.createConversation({
        userId: "u1",
        tenantId: "t1",
      });
      expect(result.title).toBe("새 대화");
    });
  });

  // ─── deleteConversation ───────────────────────────────────────────

  describe("deleteConversation", () => {
    it("소유권 일치 시 삭제한다", async () => {
      const { id } = await svc.createConversation({
        userId: "u1",
        tenantId: "t1",
        title: "To Delete",
      });
      const result = await svc.deleteConversation(id, "u1", "t1");
      expect(result).toEqual({ success: true });
    });

    it("소유권 불일치 시 null을 반환한다", async () => {
      const { id } = await svc.createConversation({
        userId: "u1",
        tenantId: "t1",
        title: "Not Mine",
      });
      const result = await svc.deleteConversation(id, "u2", "t1");
      expect(result).toBeNull();
    });
  });

  // ─── listConversations ────────────────────────────────────────────

  describe("listConversations", () => {
    it("userId + tenantId로 목록을 조회한다", async () => {
      await svc.createConversation({ userId: "u1", tenantId: "t1", title: "A" });
      await svc.createConversation({ userId: "u1", tenantId: "t1", title: "B" });
      await svc.createConversation({ userId: "u2", tenantId: "t1", title: "C" });

      const list = await svc.listConversations("u1", "t1");
      expect(list).toHaveLength(2);
    });

    it("limit을 적용한다", async () => {
      await svc.createConversation({ userId: "u1", tenantId: "t1", title: "A" });
      await svc.createConversation({ userId: "u1", tenantId: "t1", title: "B" });
      await svc.createConversation({ userId: "u1", tenantId: "t1", title: "C" });

      const list = await svc.listConversations("u1", "t1", 2);
      expect(list).toHaveLength(2);
    });
  });
});
