/**
 * DashboardService.getOnboardingState() 단위 테스트
 * 대상: app/lib/services/dashboard.service.ts
 *
 * Step 판별 로직:
 * - step 0: 인간 생성 Discovery가 없는 경우 (createdByAgent=0 기준)
 * - step 1: Discovery 있지만 Experiment 없음
 * - step 2: Experiment 있지만 Evidence 없음
 * - step 3: Evidence 있지만 아직 닫히지 않음
 * - step 4: 닫힌 Discovery가 있음 (HOLD/DROP/HANDOFF)
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb } from "tests/helpers/db";
import type { DB } from "~/db";
import { DashboardService } from "~/features/dashboard/service/dashboard.service";
import {
  discoveries,
  experiments,
  evidence,
  users,
  tenants,
  tenantMembers,
} from "~/db/schema";

let db: ReturnType<typeof createTestDb>;
let service: DashboardService;

const TENANT_ID = "t-onboard-test";
const TENANT_EMPTY = "t-onboard-empty";
const USER_ID = "user-onboard-1";

beforeAll(() => {
  db = createTestDb();
  service = new DashboardService(db as unknown as DB);

  // ── 기본 데이터 ──
  db.insert(users)
    .values([
      { id: USER_ID, email: "onboard@test.com", name: "온보딩 유저", role: "admin" },
    ])
    .run();

  db.insert(tenants)
    .values([
      { id: TENANT_ID, name: "Onboarding Tenant", slug: "onboard-test", ownerUserId: USER_ID },
      { id: TENANT_EMPTY, name: "Empty Tenant", slug: "onboard-empty", ownerUserId: USER_ID },
    ])
    .run();

  db.insert(tenantMembers)
    .values([
      { id: "tm-onboard-1", tenantId: TENANT_ID, userId: USER_ID },
      { id: "tm-onboard-2", tenantId: TENANT_EMPTY, userId: USER_ID },
    ])
    .run();
});

describe("DashboardService.getOnboardingState", () => {
  it("step 0: 인간 Discovery가 없을 때", async () => {
    const result = await service.getOnboardingState(TENANT_EMPTY);

    expect(result).toEqual({
      step: 0,
      firstDiscoveryId: null,
      firstDiscoveryStatus: null,
      hasExperiment: false,
      hasEvidence: false,
      hasClosed: false,
    });
  });

  it("step 0: AI 생성 Discovery만 있을 때 (createdByAgent=1)", async () => {
    const tenantId = "t-ai-only";
    db.insert(tenants)
      .values([{ id: tenantId, name: "AI Only", slug: "ai-only", ownerUserId: USER_ID }])
      .run();

    db.insert(discoveries)
      .values([
        {
          id: "disc-ai-1",
          title: "AI Discovery",
          seedSummary: "AI가 만든 것",
          status: "DISCOVERY",
          sourceType: "article",
          ownerId: USER_ID,
          tenantId,
          createdByAgent: 1,
        },
      ])
      .run();

    const result = await service.getOnboardingState(tenantId);

    expect(result.step).toBe(0);
    expect(result.firstDiscoveryId).toBeNull();
    expect(result.hasClosed).toBe(false);
  });

  it("step 1: 인간 Discovery 있으나 Experiment 없음", async () => {
    const tenantId = "t-step1";
    db.insert(tenants)
      .values([{ id: tenantId, name: "Step1", slug: "step1", ownerUserId: USER_ID }])
      .run();

    db.insert(discoveries)
      .values([
        {
          id: "disc-step1-human",
          title: "첫 번째 인간 Discovery",
          seedSummary: "인간이 만듬",
          status: "DISCOVERY",
          sourceType: "article",
          ownerId: USER_ID,
          tenantId,
          createdByAgent: 0,
        },
      ])
      .run();

    const result = await service.getOnboardingState(tenantId);

    expect(result.step).toBe(1);
    expect(result.firstDiscoveryId).toBe("disc-step1-human");
    expect(result.firstDiscoveryStatus).toBe("DISCOVERY");
    expect(result.hasExperiment).toBe(false);
    expect(result.hasEvidence).toBe(false);
    expect(result.hasClosed).toBe(false);
  });

  it("step 2: Experiment 있으나 Evidence 없음", async () => {
    const tenantId = "t-step2";
    const discId = "disc-step2-exp";
    db.insert(tenants)
      .values([{ id: tenantId, name: "Step2", slug: "step2", ownerUserId: USER_ID }])
      .run();

    db.insert(discoveries)
      .values([
        {
          id: discId,
          title: "실험 있는 Discovery",
          seedSummary: "실험 테스트",
          status: "EXPERIMENT",
          sourceType: "internal_pain",
          ownerId: USER_ID,
          tenantId,
          createdByAgent: 0,
        },
      ])
      .run();

    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    db.insert(experiments)
      .values([
        {
          id: "exp-step2-1",
          discoveryId: discId,
          hypothesis: "테스트 가설",
          minimalAction: "테스트 행동",
          deadline,
          expectedEvidence: "기대 결과",
        },
      ])
      .run();

    const result = await service.getOnboardingState(tenantId);

    expect(result.step).toBe(2);
    expect(result.firstDiscoveryId).toBe(discId);
    expect(result.hasExperiment).toBe(true);
    expect(result.hasEvidence).toBe(false);
    expect(result.hasClosed).toBe(false);
  });

  it("step 3: Evidence 있으나 아직 닫히지 않음", async () => {
    const tenantId = "t-step3";
    const discId = "disc-step3-evi";
    db.insert(tenants)
      .values([{ id: tenantId, name: "Step3", slug: "step3", ownerUserId: USER_ID }])
      .run();

    db.insert(discoveries)
      .values([
        {
          id: discId,
          title: "근거 있는 Discovery",
          seedSummary: "근거 테스트",
          status: "EVIDENCE_REVIEW",
          sourceType: "article",
          ownerId: USER_ID,
          tenantId,
          createdByAgent: 0,
        },
      ])
      .run();

    const deadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    db.insert(experiments)
      .values([
        {
          id: "exp-step3-1",
          discoveryId: discId,
          hypothesis: "가설",
          minimalAction: "행동",
          deadline,
          expectedEvidence: "기대",
        },
      ])
      .run();

    db.insert(evidence)
      .values([
        {
          id: "evi-step3-1",
          discoveryId: discId,
          type: "quantitative",
          strength: "strong",
          content: "근거 내용",
          createdById: USER_ID,
        },
      ])
      .run();

    const result = await service.getOnboardingState(tenantId);

    expect(result.step).toBe(3);
    expect(result.firstDiscoveryId).toBe(discId);
    expect(result.hasExperiment).toBe(true);
    expect(result.hasEvidence).toBe(true);
    expect(result.hasClosed).toBe(false);
  });

  it("step 4: Discovery status가 HOLD → 닫힘", async () => {
    const tenantId = "t-step4-hold";
    const discId = "disc-step4-hold";
    db.insert(tenants)
      .values([{ id: tenantId, name: "Step4Hold", slug: "step4-hold", ownerUserId: USER_ID }])
      .run();

    db.insert(discoveries)
      .values([
        {
          id: discId,
          title: "HOLD된 Discovery",
          seedSummary: "HOLD 테스트",
          status: "HOLD",
          sourceType: "article",
          ownerId: USER_ID,
          tenantId,
          createdByAgent: 0,
        },
      ])
      .run();

    const result = await service.getOnboardingState(tenantId);

    expect(result.step).toBe(4);
    expect(result.firstDiscoveryId).toBe(discId);
    expect(result.hasClosed).toBe(true);
    expect(result.hasExperiment).toBe(true);
    expect(result.hasEvidence).toBe(true);
  });

  it("step 4: Discovery status가 DROP → 닫힘", async () => {
    const tenantId = "t-step4-drop";
    const discId = "disc-step4-drop";
    db.insert(tenants)
      .values([{ id: tenantId, name: "Step4Drop", slug: "step4-drop", ownerUserId: USER_ID }])
      .run();

    db.insert(discoveries)
      .values([
        {
          id: discId,
          title: "DROP된 Discovery",
          seedSummary: "DROP 테스트",
          status: "DROP",
          sourceType: "article",
          ownerId: USER_ID,
          tenantId,
          createdByAgent: 0,
        },
      ])
      .run();

    const result = await service.getOnboardingState(tenantId);

    expect(result.step).toBe(4);
    expect(result.firstDiscoveryId).toBe(discId);
    expect(result.hasClosed).toBe(true);
  });

  it("step 4: Discovery status가 HANDOFF → 닫힘", async () => {
    const tenantId = "t-step4-handoff";
    const discId = "disc-step4-handoff";
    db.insert(tenants)
      .values([{ id: tenantId, name: "Step4Handoff", slug: "step4-handoff", ownerUserId: USER_ID }])
      .run();

    db.insert(discoveries)
      .values([
        {
          id: discId,
          title: "HANDOFF된 Discovery",
          seedSummary: "HANDOFF 테스트",
          status: "HANDOFF",
          sourceType: "article",
          ownerId: USER_ID,
          tenantId,
          createdByAgent: 0,
        },
      ])
      .run();

    const result = await service.getOnboardingState(tenantId);

    expect(result.step).toBe(4);
    expect(result.firstDiscoveryId).toBe(discId);
    expect(result.hasClosed).toBe(true);
  });

  it("step 4: 여러 Discovery 중 하나만 닫혀도 step 4", async () => {
    const tenantId = "t-step4-mixed";
    db.insert(tenants)
      .values([{ id: tenantId, name: "Step4Mixed", slug: "step4-mixed", ownerUserId: USER_ID }])
      .run();

    db.insert(discoveries)
      .values([
        {
          id: "disc-mixed-open",
          title: "열린 Discovery",
          seedSummary: "열린 상태",
          status: "DISCOVERY",
          sourceType: "article",
          ownerId: USER_ID,
          tenantId,
          createdByAgent: 0,
        },
        {
          id: "disc-mixed-closed",
          title: "닫힌 Discovery",
          seedSummary: "닫힌 상태",
          status: "DROP",
          sourceType: "article",
          ownerId: USER_ID,
          tenantId,
          createdByAgent: 0,
        },
      ])
      .run();

    const result = await service.getOnboardingState(tenantId);

    expect(result.step).toBe(4);
    expect(result.hasClosed).toBe(true);
    // firstDiscoveryId는 createdAt 오름차순 첫 번째 (disc-mixed-open)
    expect(result.firstDiscoveryId).toBe("disc-mixed-open");
  });

  it("step 1: AI Discovery + 인간 Discovery 혼합 시 인간 기준", async () => {
    const tenantId = "t-mixed-agent";
    db.insert(tenants)
      .values([{ id: tenantId, name: "MixedAgent", slug: "mixed-agent", ownerUserId: USER_ID }])
      .run();

    db.insert(discoveries)
      .values([
        {
          id: "disc-mixed-ai",
          title: "AI Discovery",
          seedSummary: "AI 생성",
          status: "EXPERIMENT",
          sourceType: "article",
          ownerId: USER_ID,
          tenantId,
          createdByAgent: 1,
        },
        {
          id: "disc-mixed-human",
          title: "인간 Discovery",
          seedSummary: "인간 생성",
          status: "DISCOVERY",
          sourceType: "article",
          ownerId: USER_ID,
          tenantId,
          createdByAgent: 0,
        },
      ])
      .run();

    const result = await service.getOnboardingState(tenantId);

    // AI Discovery는 무시, 인간 Discovery만 기준 → step 1
    expect(result.step).toBe(1);
    expect(result.firstDiscoveryId).toBe("disc-mixed-human");
    expect(result.hasExperiment).toBe(false);
  });
});
