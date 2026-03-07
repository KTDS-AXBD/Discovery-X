import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb } from "tests/helpers/db";
import type { DB } from "~/db";
import {
  users,
  tenants,
  tenantMembers,
  discoveries,
  experiments,
  evidence,
  eventLogs,
  DiscoveryStatus,
} from "~/db";
import { MetricsService } from "~/features/dashboard/service/metrics.service";

let db: ReturnType<typeof createTestDb>;
let service: MetricsService;

const TENANT_ID = "t-metrics-test";
const USER_ID = "user-metrics-1";
const USER_ID_2 = "user-metrics-2";

beforeAll(() => {
  db = createTestDb();
  service = new MetricsService(db as unknown as DB);

  db.insert(users)
    .values([
      { id: USER_ID, email: "metrics1@test.com", name: "Metrics User 1", role: "admin" },
      { id: USER_ID_2, email: "metrics2@test.com", name: "Metrics User 2", role: "user" },
    ])
    .run();

  db.insert(tenants)
    .values([
      { id: TENANT_ID, name: "Metrics Tenant", slug: "metrics-test", ownerUserId: USER_ID },
    ])
    .run();

  db.insert(tenantMembers)
    .values([{ id: "tm-metrics-1", tenantId: TENANT_ID, userId: USER_ID }])
    .run();

  // -- Discoveries --
  db.insert(discoveries)
    .values([
      {
        id: "d-inbox-1",
        title: "Inbox 1",
        seedSummary: "Summary",
        sourceType: "article",
        status: DiscoveryStatus.DISCOVERY,
        ownerId: USER_ID,
        tenantId: TENANT_ID,
      },
      {
        id: "d-inbox-2",
        title: "Inbox 2",
        seedSummary: "Summary",
        sourceType: "article",
        status: DiscoveryStatus.DISCOVERY,
        ownerId: USER_ID,
        tenantId: TENANT_ID,
      },
      {
        id: "d-idea-1",
        title: "Idea 1",
        seedSummary: "Summary",
        sourceType: "issue",
        status: DiscoveryStatus.IDEA_CARD,
        ownerId: USER_ID,
        tenantId: TENANT_ID,
      },
      {
        id: "d-gate1-1",
        title: "Gate1 1",
        seedSummary: "Summary",
        sourceType: "article",
        status: DiscoveryStatus.GATE1,
        ownerId: USER_ID_2,
        createdAt: new Date("2025-11-01"),
        decidedAt: new Date("2025-12-01"),
        tenantId: TENANT_ID,
      },
      {
        id: "d-hold-1",
        title: "Hold 1",
        seedSummary: "Summary",
        sourceType: "article",
        status: DiscoveryStatus.HOLD,
        ownerId: USER_ID_2,
        createdAt: new Date("2025-11-01"),
        decidedAt: new Date("2025-12-05"),
        tenantId: TENANT_ID,
      },
      {
        id: "d-drop-1",
        title: "Drop 1",
        seedSummary: "Summary",
        sourceType: "article",
        status: DiscoveryStatus.DROP,
        ownerId: USER_ID,
        deadEndFailurePattern: ["pattern-A", "pattern-B"],
        createdAt: new Date("2025-11-01"),
        decidedAt: new Date("2025-12-10"),
        tenantId: TENANT_ID,
      },
      {
        id: "d-drop-2",
        title: "Drop 2",
        seedSummary: "Summary",
        sourceType: "article",
        status: DiscoveryStatus.DROP,
        ownerId: USER_ID,
        deadEndFailurePattern: ["pattern-A", "pattern-C"],
        createdAt: new Date("2025-11-01"),
        decidedAt: new Date("2025-12-15"),
        tenantId: TENANT_ID,
      },
    ])
    .run();

  // -- Experiments --
  const deadline = new Date("2026-06-01");
  db.insert(experiments)
    .values([
      {
        id: "exp-1",
        discoveryId: "d-idea-1",
        hypothesis: "H1",
        minimalAction: "A1",
        deadline,
        expectedEvidence: "E1",
        completedAt: new Date("2025-12-20"),
      },
      {
        id: "exp-2",
        discoveryId: "d-idea-1",
        hypothesis: "H2",
        minimalAction: "A2",
        deadline,
        expectedEvidence: "E2",
        completedAt: null,
      },
      {
        id: "exp-3",
        discoveryId: "d-gate1-1",
        hypothesis: "H3",
        minimalAction: "A3",
        deadline,
        expectedEvidence: "E3",
        completedAt: new Date("2025-12-25"),
      },
    ])
    .run();

  // -- Evidence --
  db.insert(evidence)
    .values([
      {
        id: "ev-1",
        discoveryId: "d-idea-1",
        type: "DATA",
        strength: "A",
        content: "Strong evidence",
        createdById: USER_ID,
      },
      {
        id: "ev-2",
        discoveryId: "d-idea-1",
        type: "USER",
        strength: "B",
        content: "Direct evidence",
        createdById: USER_ID,
      },
      {
        id: "ev-3",
        discoveryId: "d-gate1-1",
        type: "ARTIFACT",
        strength: "C",
        content: "Indirect evidence",
        createdById: USER_ID_2,
      },
      {
        id: "ev-4",
        discoveryId: "d-gate1-1",
        type: "REF",
        strength: "D",
        content: "Intuition evidence",
        createdById: USER_ID_2,
      },
    ])
    .run();

  // -- Event logs --
  db.insert(eventLogs)
    .values([
      {
        id: "el-1",
        actorId: USER_ID,
        discoveryId: "d-idea-1",
        eventType: "REQUEST_EXTENSION",
        metadata: {},
      },
      {
        id: "el-2",
        actorId: USER_ID,
        discoveryId: "d-gate1-1",
        eventType: "SUBMIT_FOR_APPROVAL",
        metadata: { pendingDecision: "IDEA_CARD" },
      },
    ])
    .run();
});

describe("MetricsService.getOperationalMetrics — 빈 DB", () => {
  it("데이터 없을 때 기본값", async () => {
    // 별도 DB로 빈 상태 테스트
    const emptyDb = createTestDb();
    const emptyService = new MetricsService(emptyDb as unknown as DB);

    const m = await emptyService.getOperationalMetrics();
    expect(m.totalCount).toBe(0);
    expect(m.inboxCount).toBe(0);
    expect(m.decidedCount).toBe(0);
    expect(m.totalExperiments).toBe(0);
    expect(m.totalEvidence).toBe(0);
    expect(m.seedToExperimentRate).toBe("0.0");
    expect(m.completionRate).toBe("0.0");
    expect(m.experimentCompletionRate).toBe("0.0");
    expect(m.weeklyData).toHaveLength(8);
  });
});

describe("MetricsService.getOperationalMetrics — Core counts", () => {
  it("totalCount 정확성", async () => {
    const m = await service.getOperationalMetrics();
    expect(m.totalCount).toBe(7);
  });

  it("inboxCount = DISCOVERY 상태 수", async () => {
    const m = await service.getOperationalMetrics();
    expect(m.inboxCount).toBe(2);
  });

  it("decidedCount = GATE1 + HOLD + DROP", async () => {
    const m = await service.getOperationalMetrics();
    expect(m.decidedCount).toBe(4); // 1 GATE1 + 1 HOLD + 2 DROP
  });

  it("openCount = IDEA_CARD 상태 수", async () => {
    const m = await service.getOperationalMetrics();
    expect(m.openCount).toBe(1);
  });
});

describe("MetricsService.getOperationalMetrics — Experiments", () => {
  it("experimentCompletionRate 계산", async () => {
    const m = await service.getOperationalMetrics();
    expect(m.totalExperiments).toBe(3);
    expect(m.completedExperiments).toBe(2);
    // 2/3 = 66.7%
    expect(m.experimentCompletionRate).toBe("66.7");
  });
});

describe("MetricsService.getOperationalMetrics — Evidence", () => {
  it("강도별 카운트 (A/B = strong)", async () => {
    const m = await service.getOperationalMetrics();
    expect(m.totalEvidence).toBe(4);
    expect(m.strongEvidence).toBe(2); // ev-1(A) + ev-2(B)
  });
});

describe("MetricsService.getOperationalMetrics — Weekly data", () => {
  it("weeklyData 배열 길이 8", async () => {
    const m = await service.getOperationalMetrics();
    expect(m.weeklyData).toHaveLength(8);
    for (const w of m.weeklyData) {
      expect(w).toHaveProperty("week");
      expect(w).toHaveProperty("count");
    }
  });
});

describe("MetricsService.getOperationalMetrics — Owner workload", () => {
  it("ownerWorkload 매핑 정확성", async () => {
    const m = await service.getOperationalMetrics();
    expect(m.ownerWorkload.length).toBeGreaterThanOrEqual(2);

    const user1 = m.ownerWorkload.find((o) => o.name === "Metrics User 1");
    expect(user1).toBeDefined();
    // USER_ID: d-inbox-1, d-inbox-2, d-idea-1, d-drop-1, d-drop-2 = total 5, decided 2 (DROP), active 1 (IDEA_CARD)
    expect(user1!.total).toBe(5);
    expect(user1!.decided).toBe(2);
    expect(user1!.active).toBe(1);

    const user2 = m.ownerWorkload.find((o) => o.name === "Metrics User 2");
    expect(user2).toBeDefined();
    // USER_ID_2: d-gate1-1, d-hold-1 = total 2, decided 2 (GATE1+HOLD), active 0
    expect(user2!.total).toBe(2);
    expect(user2!.decided).toBe(2);
  });
});

describe("MetricsService.getOperationalMetrics — Failure pattern reuse", () => {
  it("failurePatternReuseRate 계산", async () => {
    const m = await service.getOperationalMetrics();
    // patterns: pattern-A(2회, 재사용), pattern-B(1회), pattern-C(1회) → 3개 중 1개 재사용 = 33.3%
    expect(m.failurePatternReuseRate).toBe("33.3");
    expect(m.topReusedPatterns.length).toBeGreaterThanOrEqual(1);
    expect(m.topReusedPatterns[0].pattern).toBe("pattern-A");
    expect(m.topReusedPatterns[0].count).toBe(2);
  });
});

describe("MetricsService.getOperationalMetrics — Extension requests", () => {
  it("totalExtensionRequests 합산", async () => {
    const m = await service.getOperationalMetrics();
    // el-1: REQUEST_EXTENSION(1) + el-2: SUBMIT_FOR_APPROVAL with pendingDecision=IDEA_CARD(1) = 2
    expect(m.totalExtensionRequests).toBe(2);
  });
});

describe("MetricsService.getOperationalMetrics — Decision speed", () => {
  it("avgDecisionDays / medianDecisionDays 반환 형식", async () => {
    const m = await service.getOperationalMetrics();
    // decidedAt이 있는 discoveries가 존재하므로 숫자형 문자열
    expect(m.avgDecisionDays).not.toBe("N/A");
    expect(m.medianDecisionDays).not.toBe("N/A");
    // 소수점 1자리
    expect(m.avgDecisionDays).toMatch(/^\d+\.\d$/);
    expect(m.medianDecisionDays).toMatch(/^\d+\.\d$/);
  });
});
