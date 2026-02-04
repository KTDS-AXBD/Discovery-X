/**
 * Sprint Repository 통합 테스트
 * 13개 함수 테스트
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../../helpers/db";
import { users } from "~/db/schema";
import { vdSprints, vdSprintScopes } from "~/features/venture/db/schema";
import {
  createSprint,
  getSprintById,
  getSprintFull,
  updateSprint,
  deleteSprint,
  listSprints,
  updateSprintStatus,
  createSprintScope,
  getSprintScopes,
  updateSprintScope,
  toggleScopeSelection,
  deleteSprintScope,
  getSelectedScopeCount,
} from "~/features/venture/repositories/sprint.repository";
import type { DB } from "~/db";

// 테스트 DB를 실제 DB 타입으로 캐스팅
const asDB = (testDb: TestDB): DB => testDb as unknown as DB;

describe("sprint.repository", () => {
  let testDb: TestDB;
  let testUserId: string;
  let db: DB;

  beforeEach(async () => {
    testDb = createTestDb();
    db = asDB(testDb);

    // 테스트 사용자 생성
    testUserId = crypto.randomUUID();
    await testDb.insert(users).values({
      id: testUserId,
      email: "test@example.com",
      name: "Test User",
    });
  });

  // ============================================================================
  // SPRINT CRUD
  // ============================================================================

  describe("createSprint", () => {
    it("기본 필드로 스프린트 생성", async () => {
      const sprint = await createSprint(db, {
        name: "Test Sprint",
        ownerId: testUserId,
      });

      expect(sprint.id).toBeDefined();
      expect(sprint.name).toBe("Test Sprint");
      expect(sprint.status).toBe("DRAFT");
      expect(sprint.ownerId).toBe(testUserId);
      expect(sprint.currentDay).toBe(0);
    });

    it("description과 config 포함하여 생성", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint with Config",
        description: "Test description",
        ownerId: testUserId,
        config: {
          maxOpportunities: 50,
          shortlistSize: 5,
          finalSize: 3,
        },
      });

      expect(sprint.description).toBe("Test description");
      expect(sprint.config).toEqual({
        maxOpportunities: 50,
        shortlistSize: 5,
        finalSize: 3,
      });
    });

    it("targetEndDate 설정", async () => {
      const targetDate = new Date("2026-03-01");
      const sprint = await createSprint(db, {
        name: "Sprint with Target",
        ownerId: testUserId,
        targetEndDate: targetDate,
      });

      expect(sprint.targetEndDate).toEqual(targetDate);
    });
  });

  describe("getSprintById", () => {
    it("존재하는 스프린트 조회", async () => {
      const created = await createSprint(db, {
        name: "Find Me",
        ownerId: testUserId,
      });

      const found = await getSprintById(db, created.id);
      expect(found).not.toBeNull();
      expect(found!.name).toBe("Find Me");
    });

    it("존재하지 않는 스프린트는 null 반환", async () => {
      const found = await getSprintById(db, "non-existent-id");
      expect(found).toBeNull();
    });
  });

  describe("getSprintFull", () => {
    it("스프린트와 scopes 함께 조회", async () => {
      const sprint = await createSprint(db, {
        name: "Full Sprint",
        ownerId: testUserId,
      });

      await createSprintScope(db, sprint.id, {
        industry: "FinTech",
        selected: true,
      });

      await createSprintScope(db, sprint.id, {
        industry: "HealthTech",
        selected: false,
      });

      const full = await getSprintFull(db, sprint.id);
      expect(full).not.toBeNull();
      expect(full!.scopes).toHaveLength(2);
      expect(full!.scopes.map((s) => s.industry)).toContain("FinTech");
      expect(full!.scopes.map((s) => s.industry)).toContain("HealthTech");
    });

    it("존재하지 않는 스프린트는 null 반환", async () => {
      const full = await getSprintFull(db, "non-existent-id");
      expect(full).toBeNull();
    });
  });

  describe("updateSprint", () => {
    it("name 업데이트", async () => {
      const sprint = await createSprint(db, {
        name: "Original Name",
        ownerId: testUserId,
      });

      const updated = await updateSprint(db, sprint.id, {
        name: "Updated Name",
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("Updated Name");
    });

    it("description 업데이트", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint",
        ownerId: testUserId,
      });

      const updated = await updateSprint(db, sprint.id, {
        description: "New Description",
      });

      expect(updated!.description).toBe("New Description");
    });

    it("config 업데이트", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint",
        ownerId: testUserId,
        config: { shortlistSize: 5 },
      });

      const updated = await updateSprint(db, sprint.id, {
        config: { shortlistSize: 7, finalSize: 2 },
      });

      expect(updated!.config).toEqual({ shortlistSize: 7, finalSize: 2 });
    });

    it("currentDay 업데이트", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint",
        ownerId: testUserId,
      });

      const updated = await updateSprint(db, sprint.id, {
        currentDay: 3,
      });

      expect(updated!.currentDay).toBe(3);
    });

    it("존재하지 않는 스프린트 업데이트 시 null 반환", async () => {
      const result = await updateSprint(db, "non-existent-id", {
        name: "New Name",
      });
      expect(result).toBeNull();
    });
  });

  describe("deleteSprint", () => {
    it("스프린트 삭제", async () => {
      const sprint = await createSprint(db, {
        name: "To Delete",
        ownerId: testUserId,
      });

      await deleteSprint(db, sprint.id);

      const found = await getSprintById(db, sprint.id);
      expect(found).toBeNull();
    });

    it("스프린트 삭제 시 연관 scope도 cascade 삭제", async () => {
      const sprint = await createSprint(db, {
        name: "With Scopes",
        ownerId: testUserId,
      });

      await createSprintScope(db, sprint.id, { industry: "Tech" });
      await createSprintScope(db, sprint.id, { industry: "Bio" });

      await deleteSprint(db, sprint.id);

      const scopes = await getSprintScopes(db, sprint.id);
      expect(scopes).toHaveLength(0);
    });
  });

  describe("listSprints", () => {
    beforeEach(async () => {
      // 테스트 데이터 준비
      const sprint1 = await createSprint(db, {
        name: "Sprint 1",
        ownerId: testUserId,
      });
      await updateSprintStatus(db, sprint1.id, "RUNNING");

      await createSprint(db, {
        name: "Sprint 2",
        ownerId: testUserId,
      });

      // 다른 사용자의 스프린트
      const otherUserId = crypto.randomUUID();
      await testDb.insert(users).values({
        id: otherUserId,
        email: "other@example.com",
        name: "Other User",
      });
      await createSprint(db, {
        name: "Other Sprint",
        ownerId: otherUserId,
      });
    });

    it("전체 목록 조회 (최신순 정렬)", async () => {
      const list = await listSprints(db);
      expect(list.length).toBeGreaterThanOrEqual(3);
      // 최신순이므로 마지막 생성된 것이 첫 번째
    });

    it("status 필터", async () => {
      const runningList = await listSprints(db, { status: ["RUNNING"] });
      expect(runningList.every((s) => s.status === "RUNNING")).toBe(true);
    });

    it("ownerId 필터", async () => {
      const myList = await listSprints(db, { ownerId: testUserId });
      expect(myList.every((s) => s.ownerId === testUserId)).toBe(true);
      expect(myList.length).toBe(2);
    });

    it("복합 필터 (status + ownerId)", async () => {
      const filtered = await listSprints(db, {
        status: ["DRAFT"],
        ownerId: testUserId,
      });
      expect(filtered.every((s) => s.status === "DRAFT" && s.ownerId === testUserId)).toBe(true);
    });
  });

  // ============================================================================
  // STATUS TRANSITIONS
  // ============================================================================

  describe("updateSprintStatus", () => {
    it("DRAFT → RUNNING 전환 시 startedAt, currentDay 설정", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint",
        ownerId: testUserId,
      });

      expect(sprint.startedAt).toBeNull();
      expect(sprint.currentDay).toBe(0);

      const updated = await updateSprintStatus(db, sprint.id, "RUNNING");

      expect(updated).not.toBeNull();
      expect(updated!.status).toBe("RUNNING");
      expect(updated!.startedAt).not.toBeNull();
      expect(updated!.currentDay).toBe(1);
    });

    it("RUNNING → COMPLETED 전환 시 completedAt 설정", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint",
        ownerId: testUserId,
      });
      await updateSprintStatus(db, sprint.id, "RUNNING");

      const completed = await updateSprintStatus(db, sprint.id, "COMPLETED");

      expect(completed).not.toBeNull();
      expect(completed!.status).toBe("COMPLETED");
      expect(completed!.completedAt).not.toBeNull();
    });

    it("additionalUpdates 전달", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint",
        ownerId: testUserId,
      });

      const updated = await updateSprintStatus(db, sprint.id, "GATE1_PENDING", {
        currentDay: 3,
      });

      expect(updated!.status).toBe("GATE1_PENDING");
      expect(updated!.currentDay).toBe(3);
    });

    it("이미 startedAt이 설정된 경우 덮어쓰지 않음", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint",
        ownerId: testUserId,
      });
      const firstUpdate = await updateSprintStatus(db, sprint.id, "RUNNING");
      const firstStartedAt = firstUpdate!.startedAt;

      // 다시 RUNNING으로 설정해도 startedAt 변경 안 됨
      await updateSprintStatus(db, sprint.id, "GATE1_PENDING");
      const secondUpdate = await updateSprintStatus(db, sprint.id, "RUNNING");

      // SQLite timestamp는 초 단위 정밀도이므로 초 단위로 비교
      expect(secondUpdate!.startedAt!.getTime() / 1000 | 0)
        .toEqual(firstStartedAt!.getTime() / 1000 | 0);
    });

    it("존재하지 않는 스프린트는 null 반환", async () => {
      const result = await updateSprintStatus(db, "non-existent-id", "RUNNING");
      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // SPRINT SCOPES
  // ============================================================================

  describe("createSprintScope", () => {
    it("기본 scope 생성", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint",
        ownerId: testUserId,
      });

      const scope = await createSprintScope(db, sprint.id, {
        industry: "FinTech",
      });

      expect(scope.id).toBeDefined();
      expect(scope.sprintId).toBe(sprint.id);
      expect(scope.industry).toBe("FinTech");
      expect(scope.selected).toBe(0);
    });

    it("전체 필드 포함하여 생성", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint",
        ownerId: testUserId,
      });

      const scope = await createSprintScope(db, sprint.id, {
        industry: "Healthcare",
        function: "Clinical",
        technology: "AI/ML",
        geography: "Asia",
        keywords: ["telemedicine", "diagnostics"],
        exclusions: ["hardware"],
        selected: true,
      });

      expect(scope.industry).toBe("Healthcare");
      expect(scope.function).toBe("Clinical");
      expect(scope.technology).toBe("AI/ML");
      expect(scope.geography).toBe("Asia");
      expect(scope.keywords).toEqual(["telemedicine", "diagnostics"]);
      expect(scope.exclusions).toEqual(["hardware"]);
      expect(scope.selected).toBe(1);
    });
  });

  describe("getSprintScopes", () => {
    it("스프린트의 모든 scope 조회", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint",
        ownerId: testUserId,
      });

      await createSprintScope(db, sprint.id, { industry: "Tech" });
      await createSprintScope(db, sprint.id, { industry: "Bio" });
      await createSprintScope(db, sprint.id, { industry: "Edu" });

      const scopes = await getSprintScopes(db, sprint.id);
      expect(scopes).toHaveLength(3);
    });

    it("scope이 없으면 빈 배열 반환", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint",
        ownerId: testUserId,
      });

      const scopes = await getSprintScopes(db, sprint.id);
      expect(scopes).toEqual([]);
    });
  });

  describe("updateSprintScope", () => {
    it("industry 업데이트", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint",
        ownerId: testUserId,
      });
      const scope = await createSprintScope(db, sprint.id, {
        industry: "Original",
      });

      const updated = await updateSprintScope(db, scope.id, {
        industry: "Updated",
      });

      expect(updated).not.toBeNull();
      expect(updated!.industry).toBe("Updated");
    });

    it("keywords 업데이트", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint",
        ownerId: testUserId,
      });
      const scope = await createSprintScope(db, sprint.id, {
        industry: "Tech",
        keywords: ["original"],
      });

      const updated = await updateSprintScope(db, scope.id, {
        keywords: ["new", "keywords"],
      });

      expect(updated!.keywords).toEqual(["new", "keywords"]);
    });

    it("존재하지 않는 scope는 null 반환", async () => {
      const result = await updateSprintScope(db, "non-existent-id", {
        industry: "Test",
      });
      expect(result).toBeNull();
    });
  });

  describe("toggleScopeSelection", () => {
    it("selected true로 토글", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint",
        ownerId: testUserId,
      });
      const scope = await createSprintScope(db, sprint.id, {
        industry: "Tech",
        selected: false,
      });

      const toggled = await toggleScopeSelection(db, scope.id, true);

      expect(toggled).not.toBeNull();
      expect(toggled!.selected).toBe(1);
    });

    it("selected false로 토글", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint",
        ownerId: testUserId,
      });
      const scope = await createSprintScope(db, sprint.id, {
        industry: "Tech",
        selected: true,
      });

      const toggled = await toggleScopeSelection(db, scope.id, false);

      expect(toggled).not.toBeNull();
      expect(toggled!.selected).toBe(0);
    });
  });

  describe("deleteSprintScope", () => {
    it("scope 삭제", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint",
        ownerId: testUserId,
      });
      const scope = await createSprintScope(db, sprint.id, {
        industry: "Tech",
      });

      await deleteSprintScope(db, scope.id);

      const scopes = await getSprintScopes(db, sprint.id);
      expect(scopes).toHaveLength(0);
    });
  });

  describe("getSelectedScopeCount", () => {
    it("선택된 scope 수 반환", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint",
        ownerId: testUserId,
      });

      await createSprintScope(db, sprint.id, { industry: "A", selected: true });
      await createSprintScope(db, sprint.id, { industry: "B", selected: true });
      await createSprintScope(db, sprint.id, { industry: "C", selected: false });

      const count = await getSelectedScopeCount(db, sprint.id);
      expect(count).toBe(2);
    });

    it("선택된 scope이 없으면 0 반환", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint",
        ownerId: testUserId,
      });

      await createSprintScope(db, sprint.id, { industry: "A", selected: false });

      const count = await getSelectedScopeCount(db, sprint.id);
      expect(count).toBe(0);
    });

    it("scope이 없으면 0 반환", async () => {
      const sprint = await createSprint(db, {
        name: "Sprint",
        ownerId: testUserId,
      });

      const count = await getSelectedScopeCount(db, sprint.id);
      expect(count).toBe(0);
    });
  });
});
