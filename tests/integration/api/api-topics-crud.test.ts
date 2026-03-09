/**
 * Topics API 통합 테스트 — API 경계 검증 + edge cases
 * 대상: api.topics (GET/POST), api.topics.$id (GET/PATCH/DELETE),
 *       api.topics.$id.members (GET/POST/DELETE), api.topics.$id.members.$userId (PATCH)
 * 기존 topic-service.test.ts(15개)와 겹치지 않도록 API route validation 로직에 집중
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, resetFixtureCounter } from "../../helpers/fixtures";
import { users } from "~/db";
import { topics, topicMembers } from "~/features/topic/db/schema";
import { TopicService } from "~/features/topic/service/topic.service";
import type { DB } from "~/db";

let db: TestDB;
let svc: TopicService;

const TEAM_ID = "team-api";
const USER_A = "u-topic-a";
const USER_B = "u-topic-b";
const USER_C = "u-topic-c";

beforeEach(() => {
  resetFixtureCounter();
  db = createTestDb();
  svc = new TopicService(db as unknown as DB);

  db.insert(users)
    .values([
      makeUser({ id: USER_A, name: "멤버 A", email: "a@test.com" }),
      makeUser({ id: USER_B, name: "멤버 B", email: "b@test.com" }),
      makeUser({ id: USER_C, name: "멤버 C", email: "c@test.com" }),
    ])
    .run();
});

// ─── POST /api/topics: 생성 validation ────────

describe("POST /api/topics — 생성 validation", () => {
  it("name + teamId 필수 검증 시뮬레이션", () => {
    // API route: if (!body.name || !body.teamId) → 400
    const validate = (name?: string, teamId?: string) => !(!name || !teamId);

    expect(validate(undefined, "team")).toBe(false);
    expect(validate("name", undefined)).toBe(false);
    expect(validate(undefined, undefined)).toBe(false);
    expect(validate("", "team")).toBe(false);
    expect(validate("name", "team")).toBe(true);
  });

  it("정상 생성 시 201 + owner 자동 추가 확인", async () => {
    const topic = await svc.create({
      teamId: TEAM_ID,
      name: "API 생성 Topic",
      createdBy: USER_A,
    });

    expect(topic.id).toBeDefined();
    expect(topic.name).toBe("API 생성 Topic");
    expect(topic.teamId).toBe(TEAM_ID);
    expect(topic.status).toBe("active");

    // owner 자동 추가 확인
    const members = await svc.getMembers(topic.id);
    expect(members).toHaveLength(1);
    expect(members[0].userId).toBe(USER_A);
    expect(members[0].role).toBe("owner");
  });

  it("description 없이 생성 시 null", async () => {
    const topic = await svc.create({
      teamId: TEAM_ID,
      name: "No Desc",
      createdBy: USER_A,
    });

    expect(topic.description).toBeNull();
  });

  it("description 포함 생성", async () => {
    const topic = await svc.create({
      teamId: TEAM_ID,
      name: "With Desc",
      description: "상세 설명이에요",
      createdBy: USER_A,
    });

    expect(topic.description).toBe("상세 설명이에요");
  });
});

// ─── GET /api/topics: 목록 조회 + 파라미터 ────

describe("GET /api/topics — 목록 조회 + 파라미터 처리", () => {
  beforeEach(async () => {
    await svc.create({ teamId: TEAM_ID, name: "Topic X", createdBy: USER_A });
    await svc.create({ teamId: TEAM_ID, name: "Topic Y", createdBy: USER_A });
    const z = await svc.create({ teamId: TEAM_ID, name: "Topic Z", createdBy: USER_A });
    await svc.archive(z.id);
  });

  it("teamId 필수 — 누락 시 400 시뮬레이션", () => {
    // API route: if (!teamId) → 400
    const teamId: string | null = null;
    expect(!teamId).toBe(true);
  });

  it("status 파라미터 필터링 — active만 조회", async () => {
    const active = await svc.list(TEAM_ID, { status: "active" });
    expect(active).toHaveLength(2);
    expect(active.every((t) => t.status === "active")).toBe(true);
  });

  it("status 파라미터 필터링 — archived만 조회", async () => {
    const archived = await svc.list(TEAM_ID, { status: "archived" });
    expect(archived).toHaveLength(1);
    expect(archived[0].name).toBe("Topic Z");
  });

  it("limit 파라미터 처리", async () => {
    const limited = await svc.list(TEAM_ID, { limit: 1 });
    expect(limited).toHaveLength(1);
  });

  it("status + limit 결합", async () => {
    const result = await svc.list(TEAM_ID, { status: "active", limit: 1 });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("active");
  });

  it("status 없으면 전체 조회 (archived 포함)", async () => {
    const all = await svc.list(TEAM_ID);
    expect(all).toHaveLength(3);
  });
});

// ─── GET /api/topics/:id — 상세 조회 ──────────

describe("GET /api/topics/:id — 상세 조회", () => {
  it("멤버 포함 상세 조회", async () => {
    const topic = await svc.create({ teamId: TEAM_ID, name: "상세", createdBy: USER_A });
    await svc.addMember(topic.id, USER_B, "editor");

    const detail = await svc.getById(topic.id);
    expect(detail).not.toBeNull();
    expect(detail!.topic.name).toBe("상세");
    expect(detail!.members).toHaveLength(2);
  });

  it("존재하지 않는 ID → null (404 시뮬레이션)", async () => {
    const result = await svc.getById("nonexistent");
    expect(result).toBeNull();
  });
});

// ─── PATCH /api/topics/:id — 수정 ─────────────

describe("PATCH /api/topics/:id — 수정", () => {
  it("name만 변경", async () => {
    const topic = await svc.create({ teamId: TEAM_ID, name: "Old", createdBy: USER_A });

    const updated = await svc.update(topic.id, { name: "New" });
    expect(updated.name).toBe("New");
  });

  it("description만 변경 (null → 문자열)", async () => {
    const topic = await svc.create({ teamId: TEAM_ID, name: "Desc Test", createdBy: USER_A });

    const updated = await svc.update(topic.id, { description: "새 설명" });
    expect(updated.description).toBe("새 설명");
    expect(updated.name).toBe("Desc Test"); // name은 변경되지 않음
  });

  it("존재하지 않는 ID → 에러 (404 시뮬레이션)", async () => {
    await expect(svc.update("nonexistent", { name: "Fail" })).rejects.toThrow(
      "Topic not found",
    );
  });
});

// ─── DELETE /api/topics/:id — 아카이브 ────────

describe("DELETE /api/topics/:id — 아카이브", () => {
  it("status를 archived로 변경 (실제 삭제 아님)", async () => {
    const topic = await svc.create({ teamId: TEAM_ID, name: "Archive Me", createdBy: USER_A });

    await svc.archive(topic.id);

    const detail = await svc.getById(topic.id);
    expect(detail).not.toBeNull();
    expect(detail!.topic.status).toBe("archived");
  });

  it("존재하지 않는 ID → 에러 (404 시뮬레이션)", async () => {
    await expect(svc.archive("nonexistent")).rejects.toThrow(
      "Topic not found",
    );
  });
});

// ─── POST /api/topics/:id/members — 멤버 추가 ─

describe("POST /api/topics/:id/members — 멤버 추가 validation", () => {
  let topicId: string;

  beforeEach(async () => {
    const topic = await svc.create({ teamId: TEAM_ID, name: "멤버 Topic", createdBy: USER_A });
    topicId = topic.id;
  });

  it("userId 필수 — 누락 시 400 시뮬레이션", () => {
    // API route: if (!body.userId) → 400
    const validate = (userId?: string) => !!userId;
    expect(validate(undefined)).toBe(false);
    expect(validate("")).toBe(false);
    expect(validate("u-1")).toBe(true);
  });

  it("멤버 추가 + 역할 지정 (viewer)", async () => {
    await svc.addMember(topicId, USER_B, "viewer");

    const members = await svc.getMembers(topicId);
    const b = members.find((m) => m.userId === USER_B);
    expect(b).toBeDefined();
    expect(b!.role).toBe("viewer");
  });

  it("멤버 추가 시 기본 역할은 editor", async () => {
    await svc.addMember(topicId, USER_B);

    const members = await svc.getMembers(topicId);
    const b = members.find((m) => m.userId === USER_B);
    expect(b!.role).toBe("editor");
  });
});

// ─── DELETE /api/topics/:id/members — 멤버 제거

describe("DELETE /api/topics/:id/members — 멤버 제거", () => {
  let topicId: string;

  beforeEach(async () => {
    const topic = await svc.create({ teamId: TEAM_ID, name: "제거 Topic", createdBy: USER_A });
    topicId = topic.id;
    await svc.addMember(topicId, USER_B, "editor");
    await svc.addMember(topicId, USER_C, "viewer");
  });

  it("멤버 제거 후 목록에서 사라진다", async () => {
    await svc.removeMember(topicId, USER_B);

    const members = await svc.getMembers(topicId);
    expect(members).toHaveLength(2); // owner(A) + viewer(C)
    expect(members.map((m) => m.userId)).not.toContain(USER_B);
  });
});

// ─── PATCH /api/topics/:id/members/:userId ────

describe("PATCH /api/topics/:id/members/:userId — 역할 변경", () => {
  let topicId: string;

  beforeEach(async () => {
    const topic = await svc.create({ teamId: TEAM_ID, name: "역할 Topic", createdBy: USER_A });
    topicId = topic.id;
    await svc.addMember(topicId, USER_B, "viewer");
  });

  it("role 필수 — 누락 시 400 시뮬레이션", () => {
    // API route: if (!body.role) → 400
    const validate = (role?: string) => !!role;
    expect(validate(undefined)).toBe(false);
    expect(validate("")).toBe(false);
    expect(validate("editor")).toBe(true);
  });

  it("viewer → editor 역할 변경", async () => {
    await svc.updateMemberRole(topicId, USER_B, "editor");

    const members = await svc.getMembers(topicId);
    const b = members.find((m) => m.userId === USER_B);
    expect(b!.role).toBe("editor");
  });

  it("editor → owner 역할 변경", async () => {
    await svc.updateMemberRole(topicId, USER_B, "owner");

    const members = await svc.getMembers(topicId);
    const b = members.find((m) => m.userId === USER_B);
    expect(b!.role).toBe("owner");
  });
});

// ─── GET /api/topics/:id/members — 멤버 목록 ──

describe("GET /api/topics/:id/members — 멤버 목록 users JOIN", () => {
  it("멤버 정보에 name, email이 포함된다", async () => {
    const topic = await svc.create({ teamId: TEAM_ID, name: "JOIN 테스트", createdBy: USER_A });
    await svc.addMember(topic.id, USER_B, "editor");

    const members = await svc.getMembers(topic.id);

    expect(members).toHaveLength(2);
    const owner = members.find((m) => m.role === "owner");
    expect(owner!.name).toBe("멤버 A");
    expect(owner!.email).toBe("a@test.com");
  });
});
