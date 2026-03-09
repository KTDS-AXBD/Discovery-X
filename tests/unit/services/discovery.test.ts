/**
 * DiscoveryService 단위 테스트
 * 대상: app/lib/services/discovery.service.ts
 *
 * - list/getById/getDetail/create/transition/changeOwner/getAllowedTransitions/getActivityLogs
 * - DiscoveryValidationRules.validateTransition() 실제 호출 (mock 없음)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb } from "tests/helpers/db";
import type { DB } from "~/db";
import { DiscoveryService } from "~/features/discovery/service";
import {
  discoveries,
  experiments,
  evidence,
  users,
  eventLogs,
  tenants,
  tenantMembers,
} from "~/db";
import { ALLOWED_TRANSITIONS } from "~/lib/constants/status";
import { eq } from "drizzle-orm";

let db: ReturnType<typeof createTestDb>;
let service: DiscoveryService;

const TENANT_ID = "t-disc-test";
const USER_A = "user-disc-a";
const USER_B = "user-disc-b";
const USER_REVIEWER = "user-disc-reviewer";

beforeAll(() => {
  db = createTestDb();
  service = new DiscoveryService(db as unknown as DB);

  // ── 기본 테스트 데이터 ──

  // 사용자
  db.insert(users)
    .values([
      { id: USER_A, email: "a@test.com", name: "사용자 A", role: "admin" },
      { id: USER_B, email: "b@test.com", name: "사용자 B", role: "user" },
      {
        id: USER_REVIEWER,
        email: "reviewer@test.com",
        name: "리뷰어",
        role: "gatekeeper",
      },
    ])
    .run();

  // 테넌트
  db.insert(tenants)
    .values([
      { id: TENANT_ID, name: "Discovery Test Tenant", slug: "disc-test", ownerUserId: USER_A },
      { id: "t-other", name: "Other Tenant", slug: "other-test", ownerUserId: USER_A },
    ])
    .run();

  db.insert(tenantMembers)
    .values([
      { id: "tm-disc-a", tenantId: TENANT_ID, userId: USER_A },
      { id: "tm-disc-b", tenantId: TENANT_ID, userId: USER_B },
    ])
    .run();

  // 상태별 Discovery 시드 데이터
  const now = new Date();
  const eightDaysAgo = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
  const pastDue = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

  db.insert(discoveries)
    .values([
      {
        id: "disc-inbox-1",
        title: "Inbox Discovery",
        seedSummary: "인박스 테스트",
        status: "DISCOVERY",
        sourceType: "article",
        ownerId: USER_A,
        tenantId: TENANT_ID,
        createdAt: now,
        updatedAt: now,
      },
      {
        // 7일 초과된 DISCOVERY → isInboxOverdue = true
        id: "disc-inbox-overdue",
        title: "Overdue Inbox",
        seedSummary: "7일 넘은 인박스",
        status: "DISCOVERY",
        sourceType: "other",
        ownerId: USER_A,
        tenantId: TENANT_ID,
        createdAt: eightDaysAgo,
        updatedAt: eightDaysAgo,
      },
      {
        id: "disc-idea-1",
        title: "Idea Card",
        seedSummary: "아이디어 카드",
        status: "IDEA_CARD",
        sourceType: "issue",
        ownerId: USER_B,
        reviewerId: USER_REVIEWER,
        tenantId: TENANT_ID,
        createdAt: now,
        updatedAt: now,
        dueDate: pastDue, // isOpenOverdue = true
      },
      {
        id: "disc-hypothesis",
        title: "Hypothesis Discovery",
        seedSummary: "가설 단계",
        status: "HYPOTHESIS",
        sourceType: "internal_pain",
        ownerId: USER_A,
        tenantId: TENANT_ID,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "disc-hold",
        title: "Hold Discovery",
        seedSummary: "보류 상태",
        status: "HOLD",
        sourceType: "other",
        ownerId: USER_A,
        tenantId: TENANT_ID,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: "disc-drop",
        title: "Drop Discovery",
        seedSummary: "중단 상태",
        status: "DROP",
        sourceType: "other",
        ownerId: USER_A,
        tenantId: TENANT_ID,
        createdAt: now,
        updatedAt: now,
      },
      {
        // 다른 테넌트 소속 — 목록 조회에서 격리 확인용
        id: "disc-other-tenant",
        title: "Other Tenant",
        seedSummary: "다른 테넌트",
        status: "DISCOVERY",
        sourceType: "other",
        ownerId: USER_A,
        tenantId: "t-other",
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();

  // experiments (getDetail 검증용)
  db.insert(experiments)
    .values({
      id: "exp-1",
      discoveryId: "disc-idea-1",
      hypothesis: "가설 1",
      minimalAction: "최소 행동",
      deadline: new Date("2026-03-01"),
      expectedEvidence: "예상 근거",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  // evidence (getDetail 검증용)
  db.insert(evidence)
    .values({
      id: "ev-1",
      discoveryId: "disc-idea-1",
      type: "DATA",
      strength: "A",
      content: "데이터 기반 근거",
      createdById: USER_A,
    })
    .run();
});

// ============================================================================
// 1. list
// ============================================================================

describe("DiscoveryService", () => {
  describe("list", () => {
    it("tenant scope — 해당 테넌트의 Discovery만 반환", async () => {
      const items = await service.list({ tenantId: TENANT_ID });
      const ids = items.map((d) => d.id);

      // 다른 테넌트 데이터는 포함되지 않아야 함
      expect(ids).not.toContain("disc-other-tenant");
      // 현재 테넌트 데이터는 포함
      expect(ids).toContain("disc-inbox-1");
      expect(ids).toContain("disc-idea-1");
    });

    it("상태 필터 — 특정 status로 조회", async () => {
      const items = await service.list({
        tenantId: TENANT_ID,
        status: "IDEA_CARD",
      });

      expect(items.every((d) => d.status === "IDEA_CARD")).toBe(true);
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe("disc-idea-1");
    });

    it("OVERDUE 필터 — dueDate 초과 IDEA_CARD/HYPOTHESIS만 반환", async () => {
      const items = await service.list({
        tenantId: TENANT_ID,
        status: "OVERDUE",
      });

      // disc-idea-1은 IDEA_CARD이면서 dueDate가 과거
      expect(items.some((d) => d.id === "disc-idea-1")).toBe(true);
      // DISCOVERY 상태는 OVERDUE 필터에 포함 안 됨
      expect(items.some((d) => d.status === "DISCOVERY")).toBe(false);
    });

    it("ownerName 매핑 — Owner 이름이 포함된다", async () => {
      const items = await service.list({ tenantId: TENANT_ID });
      const inbox = items.find((d) => d.id === "disc-inbox-1");
      expect(inbox?.ownerName).toBe("사용자 A");

      const idea = items.find((d) => d.id === "disc-idea-1");
      expect(idea?.ownerName).toBe("사용자 B");
    });

    it("isInboxOverdue — 7일 초과 DISCOVERY에 true", async () => {
      const items = await service.list({ tenantId: TENANT_ID });
      const overdue = items.find((d) => d.id === "disc-inbox-overdue");
      expect(overdue?.isInboxOverdue).toBe(true);

      const recent = items.find((d) => d.id === "disc-inbox-1");
      expect(recent?.isInboxOverdue).toBe(false);
    });

    it("isOpenOverdue — IDEA_CARD/HYPOTHESIS + dueDate 초과 시 true", async () => {
      const items = await service.list({ tenantId: TENANT_ID });
      const overdue = items.find((d) => d.id === "disc-idea-1");
      expect(overdue?.isOpenOverdue).toBe(true);

      // DISCOVERY 상태는 isOpenOverdue 해당 안 됨
      const inbox = items.find((d) => d.id === "disc-inbox-1");
      expect(inbox?.isOpenOverdue).toBe(false);
    });
  });

  // ============================================================================
  // 2. getById
  // ============================================================================

  describe("getById", () => {
    it("존재하는 ID — Discovery 반환", async () => {
      const d = await service.getById("disc-inbox-1");
      expect(d).not.toBeNull();
      expect(d!.title).toBe("Inbox Discovery");
      expect(d!.status).toBe("DISCOVERY");
    });

    it("존재하지 않는 ID — null 반환", async () => {
      const d = await service.getById("non-existent-id");
      expect(d).toBeNull();
    });
  });

  // ============================================================================
  // 3. getDetail
  // ============================================================================

  describe("getDetail", () => {
    it("Discovery + owner/reviewer/experiments/evidence 병렬 조회", async () => {
      const detail = await service.getDetail("disc-idea-1");
      expect(detail).not.toBeNull();

      // Discovery
      expect(detail!.discovery.id).toBe("disc-idea-1");

      // Owner
      expect(detail!.owner).not.toBeNull();
      expect(detail!.owner!.id).toBe(USER_B);

      // Reviewer
      expect(detail!.reviewer).not.toBeNull();
      expect(detail!.reviewer!.id).toBe(USER_REVIEWER);

      // Experiments
      expect(detail!.experiments).toHaveLength(1);
      expect(detail!.experiments[0].id).toBe("exp-1");

      // Evidence
      expect(detail!.evidence).toHaveLength(1);
      expect(detail!.evidence[0].id).toBe("ev-1");
    });

    it("gatekeeper 없는 경우 null", async () => {
      const detail = await service.getDetail("disc-idea-1");
      expect(detail!.gatekeeper).toBeNull();
    });

    it("존재하지 않는 Discovery — null 반환", async () => {
      const detail = await service.getDetail("non-existent");
      expect(detail).toBeNull();
    });
  });

  // ============================================================================
  // 4. create
  // ============================================================================

  describe("create", () => {
    it("Discovery 생성 + DISCOVERY 상태 + eventLog 기록", async () => {
      const created = await service.create(
        {
          title: "새 발견",
          seedSummary: "테스트 시드",
          sourceType: "article",
          ownerId: USER_A,
          tenantId: TENANT_ID,
        },
        USER_A,
      );

      expect(created.title).toBe("새 발견");
      expect(created.status).toBe("DISCOVERY");
      expect(created.ownerId).toBe(USER_A);
      expect(created.tenantId).toBe(TENANT_ID);

      // eventLog에 CREATE_DISCOVERY 기록 확인
      const logs = db
        .select()
        .from(eventLogs)
        .where(eq(eventLogs.discoveryId, created.id))
        .all();

      expect(logs).toHaveLength(1);
      expect(logs[0].eventType).toBe("CREATE_DISCOVERY");
      expect(logs[0].actorId).toBe(USER_A);
    });
  });

  // ============================================================================
  // 5. transition
  // ============================================================================

  describe("transition", () => {
    it("유효한 전환 — DISCOVERY → IDEA_CARD", async () => {
      // 전용 Discovery 생성
      const disc = await service.create(
        {
          title: "전환 테스트",
          seedSummary: "전환용",
          sourceType: "other",
          ownerId: USER_A,
          tenantId: TENANT_ID,
        },
        USER_A,
      );

      const updated = await service.transition(
        disc.id,
        "IDEA_CARD",
        USER_A,
      );

      expect(updated.status).toBe("IDEA_CARD");

      // STATUS_TRANSITION 이벤트 로그 확인
      const logs = db
        .select()
        .from(eventLogs)
        .where(eq(eventLogs.discoveryId, disc.id))
        .all();

      const transitionLog = logs.find(
        (l) => l.eventType === "STATUS_TRANSITION",
      );
      expect(transitionLog).toBeDefined();

      const metadata = transitionLog!.metadata as Record<string, unknown>;
      expect(metadata.fromStatus).toBe("DISCOVERY");
      expect(metadata.toStatus).toBe("IDEA_CARD");
    });

    it("유효한 전환 — DISCOVERY → HOLD", async () => {
      const disc = await service.create(
        {
          title: "HOLD 전환",
          seedSummary: "HOLD용",
          sourceType: "other",
          ownerId: USER_A,
          tenantId: TENANT_ID,
        },
        USER_A,
      );

      const updated = await service.transition(disc.id, "HOLD", USER_A);
      expect(updated.status).toBe("HOLD");
    });

    it("무효한 전환 — DISCOVERY → EXPERIMENT → ValidationError throw", async () => {
      await expect(
        service.transition("disc-inbox-1", "EXPERIMENT", USER_A),
      ).rejects.toThrow("전환할 수 없습니다");
    });

    it("무효한 전환 — DROP에서는 어디로도 전환 불가", async () => {
      await expect(
        service.transition("disc-drop", "DISCOVERY", USER_A),
      ).rejects.toThrow();
    });

    it("존재하지 않는 Discovery — Error throw", async () => {
      await expect(
        service.transition("non-existent", "IDEA_CARD", USER_A),
      ).rejects.toThrow("not found");
    });
  });

  // ============================================================================
  // 6. changeOwner
  // ============================================================================

  describe("changeOwner", () => {
    it("DISCOVERY 상태에서 Owner 변경 성공", async () => {
      const disc = await service.create(
        {
          title: "Owner 변경 테스트",
          seedSummary: "변경용",
          sourceType: "other",
          ownerId: USER_A,
          tenantId: TENANT_ID,
        },
        USER_A,
      );

      await service.changeOwner({
        discoveryId: disc.id,
        newOwnerId: USER_B,
        actorId: USER_A,
        handoverNote: "인수인계 테스트",
      });

      const updated = await service.getById(disc.id);
      expect(updated!.ownerId).toBe(USER_B);

      // CHANGE_OWNER 이벤트 로그 확인
      const logs = db
        .select()
        .from(eventLogs)
        .where(eq(eventLogs.discoveryId, disc.id))
        .all();

      const changeLog = logs.find((l) => l.eventType === "CHANGE_OWNER");
      expect(changeLog).toBeDefined();

      const metadata = changeLog!.metadata as Record<string, unknown>;
      expect(metadata.previousOwnerId).toBe(USER_A);
      expect(metadata.newOwnerId).toBe(USER_B);
      expect(metadata.handoverNote).toBe("인수인계 테스트");
    });

    it("IDEA_CARD 상태에서도 Owner 변경 가능", async () => {
      const disc = await service.create(
        {
          title: "IDEA_CARD Owner 변경",
          seedSummary: "변경용",
          sourceType: "other",
          ownerId: USER_A,
          tenantId: TENANT_ID,
        },
        USER_A,
      );
      await service.transition(disc.id, "IDEA_CARD", USER_A);

      await service.changeOwner({
        discoveryId: disc.id,
        newOwnerId: USER_B,
        actorId: USER_A,
      });

      const updated = await service.getById(disc.id);
      expect(updated!.ownerId).toBe(USER_B);
    });

    it("HOLD 상태에서 Owner 변경 불가 — Error throw", async () => {
      await expect(
        service.changeOwner({
          discoveryId: "disc-hold",
          newOwnerId: USER_B,
          actorId: USER_A,
        }),
      ).rejects.toThrow("활성 상태");
    });

    it("존재하지 않는 Discovery — Error throw", async () => {
      await expect(
        service.changeOwner({
          discoveryId: "non-existent",
          newOwnerId: USER_B,
          actorId: USER_A,
        }),
      ).rejects.toThrow("not found");
    });
  });

  // ============================================================================
  // 7. getAllowedTransitions
  // ============================================================================

  describe("getAllowedTransitions", () => {
    it("DISCOVERY — [IDEA_CARD, HOLD, DROP]", () => {
      expect(service.getAllowedTransitions("DISCOVERY")).toEqual(
        ALLOWED_TRANSITIONS["DISCOVERY"],
      );
    });

    it("HANDOFF — 빈 배열 (종단 상태)", () => {
      expect(service.getAllowedTransitions("HANDOFF")).toEqual([]);
    });

    it("DROP — 빈 배열 (종단 상태)", () => {
      expect(service.getAllowedTransitions("DROP")).toEqual([]);
    });

    it("알 수 없는 상태 — 빈 배열", () => {
      expect(service.getAllowedTransitions("UNKNOWN")).toEqual([]);
    });

    it("HOLD — 여러 복귀 상태 허용", () => {
      const allowed = service.getAllowedTransitions("HOLD");
      expect(allowed).toContain("DISCOVERY");
      expect(allowed).toContain("IDEA_CARD");
      expect(allowed).toContain("DROP");
    });
  });

  // ============================================================================
  // 8. getActivityLogs
  // ============================================================================

  describe("getActivityLogs", () => {
    it("Discovery의 이벤트 로그 반환 (최신 순)", async () => {
      // disc-idea-1에 이벤트 삽입
      db.insert(eventLogs)
        .values([
          {
            id: "log-act-1",
            actorId: USER_A,
            discoveryId: "disc-idea-1",
            eventType: "TEST_EVENT_1",
            metadata: { order: 1 },
          },
          {
            id: "log-act-2",
            actorId: USER_B,
            discoveryId: "disc-idea-1",
            eventType: "TEST_EVENT_2",
            metadata: { order: 2 },
          },
        ])
        .run();

      const logs = await service.getActivityLogs("disc-idea-1");

      expect(logs.length).toBeGreaterThanOrEqual(2);
      // discoveryId가 일치하는 로그만 반환
      expect(logs.every((l) => l.discoveryId === "disc-idea-1")).toBe(true);
    });

    it("이벤트가 없는 Discovery — 빈 배열 반환", async () => {
      const logs = await service.getActivityLogs("disc-hold");
      expect(logs).toEqual([]);
    });
  });
});
