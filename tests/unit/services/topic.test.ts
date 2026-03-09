/**
 * TopicService 단위 테스트
 * 대상: app/lib/services/topic.service.ts
 *
 * 메서드:
 * - list(teamId, opts?) — teamId 필터, status/limit 옵션
 * - getById(id) — Topic + members 조회, null 반환
 * - create(data) — Topic INSERT + 생성자 owner 자동 추가
 * - update(id, data) — name/description 수정
 * - archive(id) — status → 'archived'
 * - addMember(topicId, userId, role) — 멤버 추가
 * - removeMember(topicId, userId) — 멤버 제거
 * - updateMemberRole(topicId, userId, role) — 역할 변경
 * - getMembers(topicId) — users JOIN 멤버 목록
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb } from "tests/helpers/db";
import type { DB } from "~/db";
import { TopicService } from "~/features/topic/service/topic.service";
import { NotFoundError } from "~/lib/errors";
import { users, tenants, topics, topicMembers } from "~/db";

let db: ReturnType<typeof createTestDb>;
let service: TopicService;

const TEAM_ID = "team-topic-test";
const USER_A = "user-topic-a";
const USER_B = "user-topic-b";
const USER_C = "user-topic-c";

beforeAll(() => {
  db = createTestDb();
  service = new TopicService(db as unknown as DB);

  // ── 기본 테스트 데이터 시드 ──

  // 사용자
  db.insert(users)
    .values([
      { id: USER_A, email: "topic-a@test.com", name: "토픽 사용자 A", role: "admin" },
      { id: USER_B, email: "topic-b@test.com", name: "토픽 사용자 B", role: "user" },
      { id: USER_C, email: "topic-c@test.com", name: "토픽 사용자 C", role: "user" },
    ])
    .run();

  // 테넌트 (topics.teamId 용)
  db.insert(tenants)
    .values([
      { id: TEAM_ID, name: "Topic Test Team", slug: "topic-test", ownerUserId: USER_A },
      { id: "team-other", name: "Other Team", slug: "topic-other", ownerUserId: USER_A },
    ])
    .run();

  // 시드 토픽 (list 테스트용)
  db.insert(topics)
    .values([
      {
        id: "topic-active-1",
        teamId: TEAM_ID,
        name: "활성 토픽 1",
        description: "설명 1",
        status: "active",
        createdBy: USER_A,
      },
      {
        id: "topic-active-2",
        teamId: TEAM_ID,
        name: "활성 토픽 2",
        status: "active",
        createdBy: USER_B,
      },
      {
        id: "topic-archived",
        teamId: TEAM_ID,
        name: "아카이브 토픽",
        status: "archived",
        createdBy: USER_A,
      },
      {
        id: "topic-other-team",
        teamId: "team-other",
        name: "다른 팀 토픽",
        status: "active",
        createdBy: USER_A,
      },
    ])
    .run();

  // 시드 멤버 (getMembers/getById 테스트용)
  db.insert(topicMembers)
    .values([
      { topicId: "topic-active-1", userId: USER_A, role: "owner" },
      { topicId: "topic-active-1", userId: USER_B, role: "editor" },
    ])
    .run();
});

// ============================================================================
// 1. list
// ============================================================================

describe("TopicService", () => {
  describe("list", () => {
    it("teamId 필터 — 해당 팀의 Topic만 반환", async () => {
      const items = await service.list(TEAM_ID);
      const ids = items.map((t) => t.id);

      expect(ids).toContain("topic-active-1");
      expect(ids).toContain("topic-active-2");
      expect(ids).toContain("topic-archived");
      // 다른 팀 토픽은 미포함
      expect(ids).not.toContain("topic-other-team");
    });

    it("status 옵션 — active만 필터", async () => {
      const items = await service.list(TEAM_ID, { status: "active" });

      expect(items.every((t) => t.status === "active")).toBe(true);
      expect(items).toHaveLength(2);
    });

    it("status 옵션 — archived 필터", async () => {
      const items = await service.list(TEAM_ID, { status: "archived" });

      expect(items).toHaveLength(1);
      expect(items[0].id).toBe("topic-archived");
    });

    it("limit 옵션 — 결과 수 제한", async () => {
      const items = await service.list(TEAM_ID, { limit: 1 });

      expect(items).toHaveLength(1);
    });

    it("기본 limit 50 — 옵션 미지정 시 최대 50개", async () => {
      const items = await service.list(TEAM_ID);

      // 시드 데이터 3건이므로 전부 반환
      expect(items.length).toBeLessThanOrEqual(50);
      expect(items).toHaveLength(3);
    });
  });

  // ============================================================================
  // 2. getById
  // ============================================================================

  describe("getById", () => {
    it("존재하는 ID — Topic + members 반환", async () => {
      const detail = await service.getById("topic-active-1");

      expect(detail).not.toBeNull();
      expect(detail!.topic.id).toBe("topic-active-1");
      expect(detail!.topic.name).toBe("활성 토픽 1");
      expect(detail!.members).toHaveLength(2);
    });

    it("members에 user 정보(name, email) 포함", async () => {
      const detail = await service.getById("topic-active-1");
      const ownerMember = detail!.members.find((m) => m.userId === USER_A);

      expect(ownerMember).toBeDefined();
      expect(ownerMember!.name).toBe("토픽 사용자 A");
      expect(ownerMember!.email).toBe("topic-a@test.com");
      expect(ownerMember!.role).toBe("owner");
    });

    it("존재하지 않는 ID — null 반환", async () => {
      const detail = await service.getById("non-existent-topic");
      expect(detail).toBeNull();
    });
  });

  // ============================================================================
  // 3. create
  // ============================================================================

  describe("create", () => {
    it("Topic 생성 + 기본 필드 확인", async () => {
      const created = await service.create({
        teamId: TEAM_ID,
        name: "새 토픽",
        description: "새 토픽 설명",
        createdBy: USER_A,
      });

      expect(created.name).toBe("새 토픽");
      expect(created.description).toBe("새 토픽 설명");
      expect(created.teamId).toBe(TEAM_ID);
      expect(created.createdBy).toBe(USER_A);
      expect(created.status).toBe("active");
      expect(created.id).toBeDefined();
    });

    it("생성자가 owner로 자동 추가됨", async () => {
      const created = await service.create({
        teamId: TEAM_ID,
        name: "오너 확인용 토픽",
        createdBy: USER_B,
      });

      const members = await service.getMembers(created.id);

      expect(members).toHaveLength(1);
      expect(members[0].userId).toBe(USER_B);
      expect(members[0].role).toBe("owner");
    });

    it("description 미지정 시 null", async () => {
      const created = await service.create({
        teamId: TEAM_ID,
        name: "설명 없는 토픽",
        createdBy: USER_A,
      });

      expect(created.description).toBeNull();
    });
  });

  // ============================================================================
  // 4. update
  // ============================================================================

  describe("update", () => {
    it("name 수정", async () => {
      const created = await service.create({
        teamId: TEAM_ID,
        name: "수정 전",
        createdBy: USER_A,
      });

      const updated = await service.update(created.id, { name: "수정 후" });

      expect(updated.name).toBe("수정 후");
    });

    it("description 수정", async () => {
      const created = await service.create({
        teamId: TEAM_ID,
        name: "설명 수정 테스트",
        createdBy: USER_A,
      });

      const updated = await service.update(created.id, {
        description: "새 설명",
      });

      expect(updated.description).toBe("새 설명");
    });

    it("존재하지 않는 Topic — Error throw", async () => {
      await expect(
        service.update("non-existent", { name: "수정" }),
      ).rejects.toThrow(NotFoundError);
    });
  });

  // ============================================================================
  // 5. archive
  // ============================================================================

  describe("archive", () => {
    it("status를 archived로 변경", async () => {
      const created = await service.create({
        teamId: TEAM_ID,
        name: "아카이브 테스트",
        createdBy: USER_A,
      });

      await service.archive(created.id);

      const detail = await service.getById(created.id);
      expect(detail!.topic.status).toBe("archived");
    });

    it("존재하지 않는 Topic — Error throw", async () => {
      await expect(service.archive("non-existent")).rejects.toThrow(
        NotFoundError,
      );
    });
  });

  // ============================================================================
  // 6. addMember / removeMember / updateMemberRole
  // ============================================================================

  describe("멤버 관리", () => {
    it("addMember — 멤버 추가 (기본 역할 editor)", async () => {
      const created = await service.create({
        teamId: TEAM_ID,
        name: "멤버 추가 테스트",
        createdBy: USER_A,
      });

      await service.addMember(created.id, USER_C);
      const members = await service.getMembers(created.id);

      const added = members.find((m) => m.userId === USER_C);
      expect(added).toBeDefined();
      expect(added!.role).toBe("editor");
    });

    it("addMember — 역할 지정 (viewer)", async () => {
      const created = await service.create({
        teamId: TEAM_ID,
        name: "뷰어 추가 테스트",
        createdBy: USER_A,
      });

      await service.addMember(created.id, USER_B, "viewer");
      const members = await service.getMembers(created.id);

      const viewer = members.find((m) => m.userId === USER_B);
      expect(viewer).toBeDefined();
      expect(viewer!.role).toBe("viewer");
    });

    it("removeMember — 멤버 제거", async () => {
      const created = await service.create({
        teamId: TEAM_ID,
        name: "멤버 제거 테스트",
        createdBy: USER_A,
      });

      await service.addMember(created.id, USER_B);
      await service.removeMember(created.id, USER_B);

      const members = await service.getMembers(created.id);
      const removed = members.find((m) => m.userId === USER_B);
      expect(removed).toBeUndefined();
    });

    it("updateMemberRole — 역할 변경", async () => {
      const created = await service.create({
        teamId: TEAM_ID,
        name: "역할 변경 테스트",
        createdBy: USER_A,
      });

      await service.addMember(created.id, USER_C, "editor");
      await service.updateMemberRole(created.id, USER_C, "viewer");

      const members = await service.getMembers(created.id);
      const updated = members.find((m) => m.userId === USER_C);
      expect(updated!.role).toBe("viewer");
    });
  });

  // ============================================================================
  // 7. getMembers
  // ============================================================================

  describe("getMembers", () => {
    it("users JOIN — userId, name, email, role, joinedAt 반환", async () => {
      const members = await service.getMembers("topic-active-1");

      expect(members).toHaveLength(2);
      for (const m of members) {
        expect(m.userId).toBeDefined();
        expect(m.name).toBeDefined();
        expect(m.email).toBeDefined();
        expect(m.role).toBeDefined();
        expect(m.joinedAt).toBeDefined();
      }
    });

    it("멤버가 없는 Topic — 빈 배열", async () => {
      const members = await service.getMembers("topic-archived");
      expect(members).toEqual([]);
    });
  });
});
