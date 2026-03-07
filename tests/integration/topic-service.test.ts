import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../helpers/db";
import { users } from "~/db/schema";
import { topics, topicMembers } from "~/db/schema-v2";
import { TopicService } from "~/features/topic/service/topic.service";

describe("TopicService", () => {
  let db: TestDB;
  let svc: TopicService;

  beforeEach(() => {
    db = createTestDb();
    svc = new TopicService(db as never);

    // 시드 데이터: users
    db.insert(users)
      .values([
        { id: "u1", email: "u1@test.com", name: "User 1", role: "user" },
        { id: "u2", email: "u2@test.com", name: "User 2", role: "user" },
        { id: "u3", email: "u3@test.com", name: "User 3", role: "user" },
      ])
      .run();
  });

  // ─── create ──────────────────────────────────────────────────────────

  describe("create", () => {
    it("Topic 생성 시 생성자가 자동 owner로 추가된다", async () => {
      const topic = await svc.create({
        teamId: "team1",
        name: "AI Research",
        description: "AI 연구 주제",
        createdBy: "u1",
      });

      expect(topic.id).toBeDefined();
      expect(topic.name).toBe("AI Research");
      expect(topic.teamId).toBe("team1");
      expect(topic.createdBy).toBe("u1");
      expect(topic.status).toBe("active");

      // owner 멤버 자동 추가 확인
      const members = await svc.getMembers(topic.id);
      expect(members).toHaveLength(1);
      expect(members[0].userId).toBe("u1");
      expect(members[0].role).toBe("owner");
    });

    it("description 없이도 생성할 수 있다", async () => {
      const topic = await svc.create({
        teamId: "team1",
        name: "Minimal Topic",
        createdBy: "u1",
      });

      expect(topic.name).toBe("Minimal Topic");
      expect(topic.description).toBeNull();
    });
  });

  // ─── list ────────────────────────────────────────────────────────────

  describe("list", () => {
    beforeEach(async () => {
      await svc.create({ teamId: "team1", name: "Topic A", createdBy: "u1" });
      await svc.create({ teamId: "team1", name: "Topic B", createdBy: "u1" });
      await svc.create({ teamId: "team2", name: "Topic C", createdBy: "u2" });
    });

    it("테넌트별 Topic 목록을 조회한다", async () => {
      const list = await svc.list("team1");

      expect(list).toHaveLength(2);
      expect(list.map((t) => t.name)).toContain("Topic A");
      expect(list.map((t) => t.name)).toContain("Topic B");
    });

    it("아카이브된 Topic은 status 필터로 제외할 수 있다", async () => {
      const allTopics = await svc.list("team1");
      const topicA = allTopics.find((t) => t.name === "Topic A")!;
      await svc.archive(topicA.id);

      const activeOnly = await svc.list("team1", { status: "active" });

      expect(activeOnly).toHaveLength(1);
      expect(activeOnly[0].name).toBe("Topic B");
    });
  });

  // ─── getById ─────────────────────────────────────────────────────────

  describe("getById", () => {
    it("존재하는 Topic을 멤버 포함하여 조회한다", async () => {
      const created = await svc.create({
        teamId: "team1",
        name: "Detail Topic",
        createdBy: "u1",
      });
      await svc.addMember(created.id, "u2", "editor");

      const detail = await svc.getById(created.id);

      expect(detail).not.toBeNull();
      expect(detail!.topic.name).toBe("Detail Topic");
      expect(detail!.members).toHaveLength(2);
      expect(detail!.members.map((m) => m.userId).sort()).toEqual(["u1", "u2"]);
    });

    it("존재하지 않는 ID는 null을 반환한다", async () => {
      const result = await svc.getById("nonexistent-id");
      expect(result).toBeNull();
    });
  });

  // ─── update ──────────────────────────────────────────────────────────

  describe("update", () => {
    it("이름과 설명을 업데이트한다", async () => {
      const created = await svc.create({
        teamId: "team1",
        name: "Old Name",
        description: "Old desc",
        createdBy: "u1",
      });

      const updated = await svc.update(created.id, {
        name: "New Name",
        description: "New desc",
      });

      expect(updated.name).toBe("New Name");
      expect(updated.description).toBe("New desc");
    });

    it("존재하지 않는 Topic 업데이트 시 에러를 던진다", async () => {
      await expect(
        svc.update("nonexistent", { name: "Fail" }),
      ).rejects.toThrow("Topic을 찾을 수 없습니다");
    });
  });

  // ─── archive ─────────────────────────────────────────────────────────

  describe("archive", () => {
    it("상태를 archived로 변경한다", async () => {
      const created = await svc.create({
        teamId: "team1",
        name: "To Archive",
        createdBy: "u1",
      });

      await svc.archive(created.id);

      const detail = await svc.getById(created.id);
      expect(detail!.topic.status).toBe("archived");
    });

    it("존재하지 않는 Topic 아카이브 시 에러를 던진다", async () => {
      await expect(svc.archive("nonexistent")).rejects.toThrow(
        "Topic을 찾을 수 없습니다",
      );
    });
  });

  // ─── addMember ───────────────────────────────────────────────────────

  describe("addMember", () => {
    it("멤버를 추가한다 (기본 역할 editor)", async () => {
      const created = await svc.create({
        teamId: "team1",
        name: "Member Test",
        createdBy: "u1",
      });

      await svc.addMember(created.id, "u2");

      const members = await svc.getMembers(created.id);
      const u2Member = members.find((m) => m.userId === "u2");
      expect(u2Member).toBeDefined();
      expect(u2Member!.role).toBe("editor");
    });

    it("중복 추가 시 에러가 발생한다 (composite PK 제약)", async () => {
      const created = await svc.create({
        teamId: "team1",
        name: "Dup Test",
        createdBy: "u1",
      });

      // u1은 이미 owner로 추가됨
      await expect(svc.addMember(created.id, "u1", "viewer")).rejects.toThrow();
    });
  });

  // ─── removeMember ────────────────────────────────────────────────────

  describe("removeMember", () => {
    it("멤버를 제거한다", async () => {
      const created = await svc.create({
        teamId: "team1",
        name: "Remove Test",
        createdBy: "u1",
      });
      await svc.addMember(created.id, "u2", "editor");

      await svc.removeMember(created.id, "u2");

      const members = await svc.getMembers(created.id);
      expect(members).toHaveLength(1);
      expect(members[0].userId).toBe("u1");
    });
  });

  // ─── updateMemberRole ────────────────────────────────────────────────

  describe("updateMemberRole", () => {
    it("역할을 변경한다 (viewer → editor)", async () => {
      const created = await svc.create({
        teamId: "team1",
        name: "Role Test",
        createdBy: "u1",
      });
      await svc.addMember(created.id, "u2", "viewer");

      await svc.updateMemberRole(created.id, "u2", "editor");

      const members = await svc.getMembers(created.id);
      const u2Member = members.find((m) => m.userId === "u2");
      expect(u2Member!.role).toBe("editor");
    });
  });

  // ─── getMembers ──────────────────────────────────────────────────────

  describe("getMembers", () => {
    it("특정 Topic의 멤버 목록을 users JOIN으로 조회한다", async () => {
      const created = await svc.create({
        teamId: "team1",
        name: "Members Query",
        createdBy: "u1",
      });
      await svc.addMember(created.id, "u2", "editor");
      await svc.addMember(created.id, "u3", "viewer");

      const members = await svc.getMembers(created.id);

      expect(members).toHaveLength(3);

      const owner = members.find((m) => m.role === "owner");
      expect(owner).toBeDefined();
      expect(owner!.name).toBe("User 1");
      expect(owner!.email).toBe("u1@test.com");

      const viewer = members.find((m) => m.role === "viewer");
      expect(viewer).toBeDefined();
      expect(viewer!.userId).toBe("u3");
    });
  });
});
