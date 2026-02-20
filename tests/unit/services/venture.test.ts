/**
 * VentureService 단위 테스트
 * 대상: app/lib/services/venture.service.ts
 *
 * VentureService는 sprint.repository.ts 함수들을 위임하는 얇은 래퍼이므로
 * 실제 DB 연동을 통해 CRUD 동작을 검증한다.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb } from "tests/helpers/db";
import type { DB } from "~/db";
import { VentureService } from "~/lib/services/venture.service";
import { users, tenants, tenantMembers } from "~/db/schema";
import { vdSprints } from "~/features/venture/db/schema";
import { eq } from "drizzle-orm";

let db: ReturnType<typeof createTestDb>;
let service: VentureService;

const TENANT_ID = "t-venture-test";
const USER_ID = "user-venture-1";

// 사전 삽입할 스프린트 ID
const SPRINT_DRAFT = "sprint-draft-1";
const SPRINT_RUNNING = "sprint-running-1";

beforeAll(() => {
  db = createTestDb();
  service = new VentureService(db as unknown as DB);

  // ── 기본 데이터 ──

  db.insert(users)
    .values({ id: USER_ID, email: "venture@test.com", name: "Venture User", role: "admin" })
    .run();

  db.insert(tenants)
    .values({ id: TENANT_ID, name: "Venture Tenant", slug: "venture-test", ownerUserId: USER_ID })
    .run();

  db.insert(tenantMembers)
    .values({ id: "tm-venture-1", tenantId: TENANT_ID, userId: USER_ID })
    .run();

  // 스프린트 시드 데이터
  const now = new Date();
  db.insert(vdSprints)
    .values([
      {
        id: SPRINT_DRAFT,
        name: "Draft Sprint",
        status: "DRAFT",
        ownerId: USER_ID,
        tenantId: TENANT_ID,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: SPRINT_RUNNING,
        name: "Running Sprint",
        status: "RUNNING",
        ownerId: USER_ID,
        tenantId: TENANT_ID,
        startedAt: now,
        currentDay: 2,
        createdAt: new Date(now.getTime() - 1000),
        updatedAt: now,
      },
    ])
    .run();
});

// ============================================================================
// 1. listSprints
// ============================================================================

describe("VentureService", () => {
  describe("listSprints", () => {
    it("필터 없이 — 전체 스프린트 반환", async () => {
      const sprints = await service.listSprints();
      expect(sprints.length).toBeGreaterThanOrEqual(2);
    });

    it("status 필터 — 특정 상태만 반환", async () => {
      const drafts = await service.listSprints({ status: ["DRAFT"] });
      expect(drafts.every((s) => s.status === "DRAFT")).toBe(true);
      expect(drafts.some((s) => s.id === SPRINT_DRAFT)).toBe(true);
    });

    it("ownerId 필터", async () => {
      const sprints = await service.listSprints({ ownerId: USER_ID });
      expect(sprints.every((s) => s.ownerId === USER_ID)).toBe(true);
    });

    it("tenantId 필터", async () => {
      const sprints = await service.listSprints({ tenantId: TENANT_ID });
      expect(sprints.every((s) => s.tenantId === TENANT_ID)).toBe(true);
    });

    it("존재하지 않는 owner — 빈 배열", async () => {
      const sprints = await service.listSprints({ ownerId: "non-existent" });
      expect(sprints).toEqual([]);
    });
  });

  // ============================================================================
  // 2. getSprintById
  // ============================================================================

  describe("getSprintById", () => {
    it("존재하는 ID — 스프린트 반환", async () => {
      const sprint = await service.getSprintById(SPRINT_DRAFT);
      expect(sprint).not.toBeNull();
      expect(sprint!.name).toBe("Draft Sprint");
      expect(sprint!.status).toBe("DRAFT");
    });

    it("존재하지 않는 ID — null 반환", async () => {
      const sprint = await service.getSprintById("non-existent");
      expect(sprint).toBeNull();
    });
  });

  // ============================================================================
  // 3. createSprint
  // ============================================================================

  describe("createSprint", () => {
    it("스프린트 생성 — DRAFT 상태로 생성, currentDay=0", async () => {
      const sprint = await service.createSprint({
        name: "새 스프린트",
        description: "테스트 설명",
        ownerId: USER_ID,
        tenantId: TENANT_ID,
      });

      expect(sprint.name).toBe("새 스프린트");
      expect(sprint.description).toBe("테스트 설명");
      expect(sprint.status).toBe("DRAFT");
      expect(sprint.currentDay).toBe(0);
      expect(sprint.ownerId).toBe(USER_ID);

      // DB에서 확인
      const fromDb = await service.getSprintById(sprint.id);
      expect(fromDb).not.toBeNull();
      expect(fromDb!.name).toBe("새 스프린트");
    });

    it("config 포함 생성", async () => {
      const sprint = await service.createSprint({
        name: "Config Sprint",
        ownerId: USER_ID,
        config: { maxOpportunities: 20, shortlistSize: 5 },
      });

      const fromDb = await service.getSprintById(sprint.id);
      expect(fromDb!.config).toEqual({
        maxOpportunities: 20,
        shortlistSize: 5,
      });
    });
  });

  // ============================================================================
  // 4. updateSprint
  // ============================================================================

  describe("updateSprint", () => {
    it("이름/설명 업데이트", async () => {
      const updated = await service.updateSprint(SPRINT_DRAFT, {
        name: "수정된 스프린트",
        description: "수정된 설명",
      });

      expect(updated).not.toBeNull();
      expect(updated!.name).toBe("수정된 스프린트");
      expect(updated!.description).toBe("수정된 설명");
    });

    it("존재하지 않는 스프린트 — null 반환", async () => {
      const updated = await service.updateSprint("non-existent", {
        name: "없는 스프린트",
      });
      expect(updated).toBeNull();
    });

    it("currentDay 업데이트", async () => {
      const updated = await service.updateSprint(SPRINT_RUNNING, {
        currentDay: 3,
      });

      expect(updated!.currentDay).toBe(3);
    });
  });

  // ============================================================================
  // 5. updateSprintStatus
  // ============================================================================

  describe("updateSprintStatus", () => {
    it("DRAFT → RUNNING 전환 시 startedAt 자동 설정", async () => {
      // 전용 스프린트 생성
      const sprint = await service.createSprint({
        name: "상태 전환 테스트",
        ownerId: USER_ID,
      });

      const updated = await service.updateSprintStatus(sprint.id, "RUNNING");

      expect(updated!.status).toBe("RUNNING");
      expect(updated!.startedAt).toBeTruthy();
      expect(updated!.currentDay).toBe(1);
    });

    it("→ COMPLETED 전환 시 completedAt 자동 설정", async () => {
      const sprint = await service.createSprint({
        name: "완료 전환 테스트",
        ownerId: USER_ID,
      });
      await service.updateSprintStatus(sprint.id, "RUNNING");
      const updated = await service.updateSprintStatus(sprint.id, "COMPLETED");

      expect(updated!.status).toBe("COMPLETED");
      expect(updated!.completedAt).toBeTruthy();
    });

    it("존재하지 않는 스프린트 — null 반환", async () => {
      const updated = await service.updateSprintStatus("non-existent", "RUNNING");
      expect(updated).toBeNull();
    });
  });

  // ============================================================================
  // 6. deleteSprint
  // ============================================================================

  describe("deleteSprint", () => {
    it("스프린트 삭제 후 조회 시 null", async () => {
      const sprint = await service.createSprint({
        name: "삭제할 스프린트",
        ownerId: USER_ID,
      });

      await service.deleteSprint(sprint.id);

      const fromDb = await service.getSprintById(sprint.id);
      expect(fromDb).toBeNull();
    });

    it("존재하지 않는 스프린트 삭제 — 에러 없이 완료", async () => {
      await expect(
        service.deleteSprint("non-existent"),
      ).resolves.toBeUndefined();
    });
  });
});
