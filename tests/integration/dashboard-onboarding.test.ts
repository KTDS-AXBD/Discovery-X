import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "../helpers/db";
import { DashboardService } from "~/features/dashboard/service/dashboard.service";
import {
  discoveries,
  experiments,
  evidence,
  users,
  tenants,
  DiscoveryStatus,
} from "~/db/schema";
import { eq } from "drizzle-orm";
import type { DB } from "~/db";

// ============================================================================
// 온보딩 플로우 통합 테스트
// Discovery 생성 → 실험 → 근거 → 결정(닫기)까지 step 0→1→2→3→4 전이 검증
// ============================================================================

describe("DashboardService.getOnboardingState — 온보딩 플로우", () => {
  let db: TestDB;
  let svc: DashboardService;
  const TENANT_ID = "t-onboard";
  const USER_ID = "u-owner";

  beforeEach(() => {
    db = createTestDb();
    svc = new DashboardService(db as unknown as DB);

    // 시드 데이터: user + tenant
    db.insert(users)
      .values({ id: USER_ID, email: "owner@test.com", name: "Owner", role: "user" })
      .run();
    db.insert(tenants)
      .values({ id: TENANT_ID, name: "Test Tenant", slug: "test", ownerUserId: USER_ID })
      .run();
  });

  // ─── 헬퍼: Discovery 삽입 ──────────────────────────────────────────────
  function insertDiscovery(overrides: {
    id: string;
    status?: string;
    createdByAgent?: number;
    createdAt?: number;
  }) {
    db.insert(discoveries)
      .values({
        id: overrides.id,
        title: `Discovery ${overrides.id}`,
        seedSummary: "test seed",
        sourceType: "article",
        status: overrides.status ?? DiscoveryStatus.DISCOVERY,
        tenantId: TENANT_ID,
        ownerId: USER_ID,
        createdByAgent: overrides.createdByAgent ?? 0,
        createdAt: new Date((overrides.createdAt ?? 1000) * 1000),
      })
      .run();
  }

  // ─── 헬퍼: Experiment 삽입 ─────────────────────────────────────────────
  function insertExperiment(id: string, discoveryId: string) {
    db.insert(experiments)
      .values({
        id,
        discoveryId,
        hypothesis: "테스트 가설",
        minimalAction: "테스트 최소 행동",
        deadline: new Date("2026-03-15"),
        expectedEvidence: "예상 근거",
      })
      .run();
  }

  // ─── 헬퍼: Evidence 삽입 ───────────────────────────────────────────────
  function insertEvidence(id: string, discoveryId: string) {
    db.insert(evidence)
      .values({
        id,
        discoveryId,
        type: "OBSERVATION",
        strength: "B",
        content: "테스트 근거 내용",
        createdById: USER_ID,
      })
      .run();
  }

  // ─── 헬퍼: Discovery 상태 변경 ─────────────────────────────────────────
  // NOTE: 실제 코드에서는 DiscoveryValidationRules.validateTransition() 경유 필수
  //       테스트에서는 DB 직접 조작으로 각 상태를 설정
  function updateDiscoveryStatus(id: string, status: string) {
    db.update(discoveries)
      .set({ status })
      .where(eq(discoveries.id, id))
      .run();
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 1. 전체 플로우: step 0 → 1 → 2 → 3 → 4 (HOLD)
  // ═══════════════════════════════════════════════════════════════════════

  describe("전체 플로우 (HOLD 결정)", () => {
    it("step 0: Discovery 없으면 step 0", async () => {
      const state = await svc.getOnboardingState(TENANT_ID);

      expect(state.step).toBe(0);
      expect(state.firstDiscoveryId).toBeNull();
      expect(state.hasExperiment).toBe(false);
      expect(state.hasEvidence).toBe(false);
      expect(state.hasClosed).toBe(false);
    });

    it("step 1: Discovery 생성 → step 1", async () => {
      insertDiscovery({ id: "d-flow-1" });

      const state = await svc.getOnboardingState(TENANT_ID);

      expect(state.step).toBe(1);
      expect(state.firstDiscoveryId).toBe("d-flow-1");
      expect(state.firstDiscoveryStatus).toBe(DiscoveryStatus.DISCOVERY);
      expect(state.hasExperiment).toBe(false);
      expect(state.hasEvidence).toBe(false);
      expect(state.hasClosed).toBe(false);
    });

    it("step 2: Experiment 추가 → step 2", async () => {
      insertDiscovery({ id: "d-flow-2" });
      insertExperiment("exp-1", "d-flow-2");

      const state = await svc.getOnboardingState(TENANT_ID);

      expect(state.step).toBe(2);
      expect(state.firstDiscoveryId).toBe("d-flow-2");
      expect(state.hasExperiment).toBe(true);
      expect(state.hasEvidence).toBe(false);
      expect(state.hasClosed).toBe(false);
    });

    it("step 3: Evidence 추가 → step 3", async () => {
      insertDiscovery({ id: "d-flow-3" });
      insertExperiment("exp-2", "d-flow-3");
      insertEvidence("ev-1", "d-flow-3");

      const state = await svc.getOnboardingState(TENANT_ID);

      expect(state.step).toBe(3);
      expect(state.firstDiscoveryId).toBe("d-flow-3");
      expect(state.hasExperiment).toBe(true);
      expect(state.hasEvidence).toBe(true);
      expect(state.hasClosed).toBe(false);
    });

    it("step 4: HOLD로 전환 → step 4", async () => {
      insertDiscovery({ id: "d-flow-4" });
      insertExperiment("exp-3", "d-flow-4");
      insertEvidence("ev-2", "d-flow-4");
      // NOTE: 실제로는 validateTransition() 경유 필수
      updateDiscoveryStatus("d-flow-4", DiscoveryStatus.HOLD);

      const state = await svc.getOnboardingState(TENANT_ID);

      expect(state.step).toBe(4);
      expect(state.firstDiscoveryId).toBe("d-flow-4");
      expect(state.hasExperiment).toBe(true);
      expect(state.hasEvidence).toBe(true);
      expect(state.hasClosed).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 2. DROP 결정 → step 4
  // ═══════════════════════════════════════════════════════════════════════

  describe("DROP 결정", () => {
    it("Evidence 추가 후 DROP 전환 → step 4", async () => {
      insertDiscovery({ id: "d-drop-1" });
      insertExperiment("exp-drop-1", "d-drop-1");
      insertEvidence("ev-drop-1", "d-drop-1");
      // NOTE: 실제로는 validateTransition() 경유 필수
      updateDiscoveryStatus("d-drop-1", DiscoveryStatus.DROP);

      const state = await svc.getOnboardingState(TENANT_ID);

      expect(state.step).toBe(4);
      expect(state.hasClosed).toBe(true);
    });

    it("HANDOFF 전환도 step 4", async () => {
      insertDiscovery({ id: "d-handoff-1" });
      // NOTE: 실제로는 validateTransition() 경유 필수
      updateDiscoveryStatus("d-handoff-1", DiscoveryStatus.HANDOFF);

      const state = await svc.getOnboardingState(TENANT_ID);

      expect(state.step).toBe(4);
      expect(state.hasClosed).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 3. AI Discovery는 온보딩에 영향 없음
  // ═══════════════════════════════════════════════════════════════════════

  describe("AI Discovery (createdByAgent=1) 필터링", () => {
    it("AI Discovery만 있으면 step 0 유지", async () => {
      insertDiscovery({ id: "d-ai-1", createdByAgent: 1 });
      insertDiscovery({ id: "d-ai-2", createdByAgent: 1 });

      const state = await svc.getOnboardingState(TENANT_ID);

      expect(state.step).toBe(0);
      expect(state.firstDiscoveryId).toBeNull();
    });

    it("AI Discovery에 실험/근거가 있어도 step 0 유지", async () => {
      insertDiscovery({ id: "d-ai-3", createdByAgent: 1 });
      insertExperiment("exp-ai-1", "d-ai-3");
      insertEvidence("ev-ai-1", "d-ai-3");

      const state = await svc.getOnboardingState(TENANT_ID);

      expect(state.step).toBe(0);
    });

    it("AI Discovery가 닫혀도 step에 영향 없음", async () => {
      insertDiscovery({ id: "d-ai-closed", createdByAgent: 1, status: DiscoveryStatus.HOLD });

      const state = await svc.getOnboardingState(TENANT_ID);

      expect(state.step).toBe(0);
      expect(state.hasClosed).toBe(false);
    });

    it("인간 Discovery 1개 + AI Discovery 닫힘 → 인간 기준으로만 판정 (step 1)", async () => {
      insertDiscovery({ id: "d-human-1", createdAt: 100 });
      insertDiscovery({ id: "d-ai-mix", createdByAgent: 1, status: DiscoveryStatus.DROP });

      const state = await svc.getOnboardingState(TENANT_ID);

      expect(state.step).toBe(1);
      expect(state.firstDiscoveryId).toBe("d-human-1");
      expect(state.hasClosed).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // 4. 엣지 케이스
  // ═══════════════════════════════════════════════════════════════════════

  describe("엣지 케이스", () => {
    it("다른 테넌트의 Discovery는 무시", async () => {
      const otherTenantId = "t-other";
      db.insert(tenants)
        .values({ id: otherTenantId, name: "Other", slug: "other", ownerUserId: USER_ID })
        .run();
      insertDiscovery({ id: "d-other-tenant" });
      // 다른 테넌트에 직접 삽입
      db.insert(discoveries)
        .values({
          id: "d-foreign",
          title: "Foreign Discovery",
          seedSummary: "foreign",
          sourceType: "article",
          status: DiscoveryStatus.HOLD,
          tenantId: otherTenantId,
          ownerId: USER_ID,
          createdByAgent: 0,
          createdAt: new Date(500 * 1000),
        })
        .run();

      const state = await svc.getOnboardingState(TENANT_ID);

      // TENANT_ID에는 d-other-tenant(DISCOVERY)만 있으므로 step 1
      expect(state.step).toBe(1);
      expect(state.hasClosed).toBe(false);
    });

    it("두 번째 Discovery가 닫혀도 step 4 (hasClosed는 전체 인간 Discovery 중 any)", async () => {
      insertDiscovery({ id: "d-first", createdAt: 100 });
      insertDiscovery({ id: "d-second", createdAt: 200, status: DiscoveryStatus.DROP });

      const state = await svc.getOnboardingState(TENANT_ID);

      // 두 번째가 DROP → hasClosed = true → step 4
      expect(state.step).toBe(4);
      expect(state.firstDiscoveryId).toBe("d-first");
      expect(state.hasClosed).toBe(true);
    });

    it("Evidence만 있고 Experiment 없어도 step 3", async () => {
      insertDiscovery({ id: "d-ev-only" });
      insertEvidence("ev-no-exp", "d-ev-only");

      const state = await svc.getOnboardingState(TENANT_ID);

      // hasEvidence = true → step 3 (evidence 체크가 experiment보다 우선)
      expect(state.step).toBe(3);
      expect(state.hasExperiment).toBe(false);
      expect(state.hasEvidence).toBe(true);
    });
  });
});
