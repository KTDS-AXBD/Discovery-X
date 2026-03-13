/**
 * HealthMetricsService 단위 테스트 (실 DB 기반)
 *
 * 대상: app/features/radar/service/health-metrics.ts
 * - calculateSourceMetrics
 * - refreshMetrics
 * - evaluateReviewTransitions
 * - getDashboardData
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb, type TestDB } from "tests/helpers/db";
import type { DB } from "~/db";
import { HealthMetricsService } from "~/features/radar/service/health-metrics";
import {
  users,
  tenants,
  tenantMembers,
  radarSources,
  radarItems,
  radarItemUserStatus,
  ideaSources,
  ideas,
} from "~/db";
import {
  radarSourceMetrics,
  radarItemMetrics,
  radarDomains,
  radarSourceDomains,
} from "~/features/radar/db/schema";
import { MIN_ITEMS_FOR_HEALTH } from "~/features/radar/service/health-score";

// ─── 상수 ───────────────────────────────────────────────────────────────

const TENANT_ID = "t-health-test";
const USER_ID = "user-health-1";
const SOURCE_ID = "src-health-1";
const SOURCE_ID_2 = "src-health-2";
const TODAY = "2026-03-11";

// ─── Setup ──────────────────────────────────────────────────────────────

let db: TestDB;
let service: HealthMetricsService;

function asDB(d: TestDB) {
  return d as unknown as DB;
}

function seedBase() {
  db.insert(users)
    .values({ id: USER_ID, email: "health@test.com", name: "Health User", role: "admin" })
    .run();

  db.insert(tenants)
    .values({ id: TENANT_ID, name: "Health Tenant", slug: "health-test", ownerUserId: USER_ID })
    .run();

  db.insert(tenantMembers)
    .values({ id: "tm-h1", tenantId: TENANT_ID, userId: USER_ID })
    .run();
}

function seedSource(id: string, status = "ACTIVE") {
  db.insert(radarSources)
    .values({
      id,
      name: `Source ${id}`,
      sourceType: "rss",
      url: `https://${id}.com`,
      tenantId: TENANT_ID,
      userId: USER_ID,
      status,
      collectionType: "auto",
    })
    .run();
}

function seedItems(sourceId: string, count: number, prefix = "item") {
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < count; i++) {
    db.insert(radarItems)
      .values({
        id: `${prefix}-${sourceId}-${i}`,
        sourceId,
        urlHash: `hash-${prefix}-${sourceId}-${i}`,
        url: `https://example.com/${prefix}-${i}`,
        title: `Item ${i}`,
        collectedAt: new Date(now * 1000),
      })
      .run();
  }
}

function seedViewed(itemId: string) {
  db.insert(radarItemUserStatus)
    .values({
      id: `rius-${itemId}`,
      userId: USER_ID,
      itemId,
      status: "viewed",
      tenantId: TENANT_ID,
    })
    .run();
}

function seedReaction(itemId: string, reaction: "like" | "dislike") {
  // status가 이미 있으면 업데이트 — 테스트에서는 별도 행으로 처리
  db.insert(radarItemUserStatus)
    .values({
      id: `rius-react-${itemId}`,
      userId: USER_ID,
      itemId,
      status: "viewed",
      reaction,
      tenantId: TENANT_ID,
    })
    .run();
}

function seedIdea(ideaId: string, radarItemId: string, linkType = "primary") {
  db.insert(ideas)
    .values({
      id: ideaId,
      title: `Idea ${ideaId}`,
      ownerId: USER_ID,
      tenantId: TENANT_ID,
    })
    .run();

  const now = Math.floor(Date.now() / 1000);
  db.insert(ideaSources)
    .values({
      id: `isrc-${ideaId}-${radarItemId}`,
      ideaId,
      radarItemId,
      linkType,
      addedAt: new Date(now * 1000),
    })
    .run();
}

function seedItemMetrics(itemId: string, relevance: number, novelty: number, quality: number) {
  db.insert(radarItemMetrics)
    .values({
      id: `rim-${itemId}`,
      itemId,
      tenantId: TENANT_ID,
      topicRelevance: relevance,
      novelty,
      quality,
      compositeScore: relevance * 0.4 + novelty * 0.3 + quality * 0.3,
      evaluatedAt: new Date(),
    })
    .run();
}

beforeEach(() => {
  db = createTestDb();
  service = new HealthMetricsService(asDB(db));
  seedBase();
});

// ─── Tests ──────────────────────────────────────────────────────────────

describe("HealthMetricsService", () => {
  // ══════════════════════════════════════════════
  // calculateSourceMetrics
  // ══════════════════════════════════════════════
  describe("calculateSourceMetrics", () => {
    it("빈 소스 — 모든 메트릭 0", async () => {
      seedSource(SOURCE_ID);
      const metrics = await service.calculateSourceMetrics(SOURCE_ID, TODAY);

      expect(metrics.totalItems).toBe(0);
      expect(metrics.newItemsToday).toBe(0);
      expect(metrics.viewedCount).toBe(0);
      expect(metrics.engagementRate).toBe(0);
      expect(metrics.healthScore).toBe(0);
    });

    it("아이템 수 정확히 집계", async () => {
      seedSource(SOURCE_ID);
      seedItems(SOURCE_ID, 5);

      const metrics = await service.calculateSourceMetrics(SOURCE_ID, TODAY);
      expect(metrics.totalItems).toBe(5);
    });

    it("viewed 카운트 집계", async () => {
      seedSource(SOURCE_ID);
      seedItems(SOURCE_ID, 3);
      seedViewed(`item-${SOURCE_ID}-0`);
      seedViewed(`item-${SOURCE_ID}-1`);

      const metrics = await service.calculateSourceMetrics(SOURCE_ID, TODAY);
      expect(metrics.viewedCount).toBe(2);
    });

    it("like/dislike 집계", async () => {
      seedSource(SOURCE_ID);
      seedItems(SOURCE_ID, 3);
      seedReaction(`item-${SOURCE_ID}-0`, "like");
      seedReaction(`item-${SOURCE_ID}-1`, "dislike");

      const metrics = await service.calculateSourceMetrics(SOURCE_ID, TODAY);
      expect(metrics.likeCount).toBe(1);
      expect(metrics.dislikeCount).toBe(1);
    });

    it("conversion 집계 — primary/secondary만 인정", async () => {
      seedSource(SOURCE_ID);
      seedItems(SOURCE_ID, 5);
      seedIdea("idea-1", `item-${SOURCE_ID}-0`, "primary");
      seedIdea("idea-2", `item-${SOURCE_ID}-1`, "secondary");
      seedIdea("idea-3", `item-${SOURCE_ID}-2`, "reference"); // 제외

      const metrics = await service.calculateSourceMetrics(SOURCE_ID, TODAY);
      expect(metrics.conversionCount30d).toBe(2);
    });

    it("AI 품질 평균 집계", async () => {
      seedSource(SOURCE_ID);
      seedItems(SOURCE_ID, 3);
      seedItemMetrics(`item-${SOURCE_ID}-0`, 0.8, 0.6, 0.7);
      seedItemMetrics(`item-${SOURCE_ID}-1`, 0.6, 0.4, 0.5);
      // item-2는 미평가

      const metrics = await service.calculateSourceMetrics(SOURCE_ID, TODAY);
      expect(metrics.avgRelevance).toBe(0.7); // (0.8+0.6)/2
      expect(metrics.avgNovelty).toBe(0.5);   // (0.6+0.4)/2
    });

    it("아이템 < 20건이면 healthScore = 0", async () => {
      seedSource(SOURCE_ID);
      seedItems(SOURCE_ID, 19);
      seedViewed(`item-${SOURCE_ID}-0`);

      const metrics = await service.calculateSourceMetrics(SOURCE_ID, TODAY);
      expect(metrics.totalItems).toBe(19);
      expect(metrics.healthScore).toBe(0);
    });

    it("아이템 >= 20건이면 healthScore 계산", async () => {
      seedSource(SOURCE_ID);
      seedItems(SOURCE_ID, 25);

      // 일부 viewed/liked
      for (let i = 0; i < 10; i++) {
        seedViewed(`item-${SOURCE_ID}-${i}`);
      }
      seedReaction(`item-${SOURCE_ID}-20`, "like");

      const metrics = await service.calculateSourceMetrics(SOURCE_ID, TODAY);
      expect(metrics.totalItems).toBe(25);
      expect(metrics.healthScore).toBeGreaterThan(0);
    });
  });

  // ══════════════════════════════════════════════
  // refreshMetrics
  // ══════════════════════════════════════════════
  describe("refreshMetrics", () => {
    it("활성 소스 전체 메트릭 갱신", async () => {
      seedSource(SOURCE_ID);
      seedSource(SOURCE_ID_2);
      seedItems(SOURCE_ID, 5);
      seedItems(SOURCE_ID_2, 3, "item2");

      const result = await service.refreshMetrics(TENANT_ID, TODAY);
      expect(result.sourcesProcessed).toBe(2);

      // radar_source_metrics에 2행 삽입 확인
      const rows = db
        .select()
        .from(radarSourceMetrics)
        .all();
      expect(rows).toHaveLength(2);
    });

    it("PAUSED 소스는 처리하지 않음", async () => {
      seedSource(SOURCE_ID);
      seedSource("src-paused", "PAUSED");

      const result = await service.refreshMetrics(TENANT_ID, TODAY);
      expect(result.sourcesProcessed).toBe(1);
    });

    it("같은 날 재실행 시 UPSERT (중복 삽입 없음)", async () => {
      seedSource(SOURCE_ID);
      seedItems(SOURCE_ID, 5);

      await service.refreshMetrics(TENANT_ID, TODAY);
      await service.refreshMetrics(TENANT_ID, TODAY);

      const rows = db
        .select()
        .from(radarSourceMetrics)
        .all();
      expect(rows).toHaveLength(1);
    });
  });

  // ══════════════════════════════════════════════
  // evaluateReviewTransitions
  // ══════════════════════════════════════════════
  describe("evaluateReviewTransitions", () => {
    it("healthScore < 0.2 → ACTIVE → REVIEW 전환", async () => {
      seedSource(SOURCE_ID);
      seedItems(SOURCE_ID, MIN_ITEMS_FOR_HEALTH);

      // 직접 메트릭 삽입 (healthScore = 0.1)
      db.insert(radarSourceMetrics)
        .values({
          id: `rsm-${SOURCE_ID}-${TODAY}`,
          sourceId: SOURCE_ID,
          tenantId: TENANT_ID,
          date: TODAY,
          totalItems: MIN_ITEMS_FOR_HEALTH,
          healthScore: 0.1,
          conversionCount30d: 1,
        })
        .run();

      const transitions = await service.evaluateReviewTransitions(TENANT_ID, TODAY);
      expect(transitions).toBe(1);

      // 소스 상태 확인
      const [source] = db
        .select({ status: radarSources.status })
        .from(radarSources)
        .all();
      expect(source.status).toBe("REVIEW");
    });

    it("conversionCount30d = 0 → REVIEW 전환", async () => {
      seedSource(SOURCE_ID);
      seedItems(SOURCE_ID, MIN_ITEMS_FOR_HEALTH);

      db.insert(radarSourceMetrics)
        .values({
          id: `rsm-${SOURCE_ID}-${TODAY}`,
          sourceId: SOURCE_ID,
          tenantId: TENANT_ID,
          date: TODAY,
          totalItems: MIN_ITEMS_FOR_HEALTH,
          healthScore: 0.5, // 건강하지만 전환 0건
          conversionCount30d: 0,
        })
        .run();

      const transitions = await service.evaluateReviewTransitions(TENANT_ID, TODAY);
      expect(transitions).toBe(1);
    });

    it("정상 소스는 전환하지 않음", async () => {
      seedSource(SOURCE_ID);

      db.insert(radarSourceMetrics)
        .values({
          id: `rsm-${SOURCE_ID}-${TODAY}`,
          sourceId: SOURCE_ID,
          tenantId: TENANT_ID,
          date: TODAY,
          totalItems: MIN_ITEMS_FOR_HEALTH,
          healthScore: 0.6,
          conversionCount30d: 3,
        })
        .run();

      const transitions = await service.evaluateReviewTransitions(TENANT_ID, TODAY);
      expect(transitions).toBe(0);
    });

    it("아이템 < 20건 소스는 전환 대상 아님", async () => {
      seedSource(SOURCE_ID);

      db.insert(radarSourceMetrics)
        .values({
          id: `rsm-${SOURCE_ID}-${TODAY}`,
          sourceId: SOURCE_ID,
          tenantId: TENANT_ID,
          date: TODAY,
          totalItems: 10, // < 20
          healthScore: 0.05,
          conversionCount30d: 0,
        })
        .run();

      const transitions = await service.evaluateReviewTransitions(TENANT_ID, TODAY);
      expect(transitions).toBe(0);
    });
  });

  // ══════════════════════════════════════════════
  // getDashboardData
  // ══════════════════════════════════════════════
  describe("getDashboardData", () => {
    it("summary — 상태별 소스 수 집계", async () => {
      seedSource(SOURCE_ID);
      seedSource(SOURCE_ID_2, "REVIEW");
      seedSource("src-failed", "FAILED");

      const data = await service.getDashboardData(TENANT_ID);
      expect(data.summary.totalSources).toBe(3);
      expect(data.summary.healthySources).toBe(1);
      expect(data.summary.reviewSources).toBe(1);
      expect(data.summary.failedSources).toBe(1);
    });

    it("sources — 소스별 최신 메트릭 포함", async () => {
      seedSource(SOURCE_ID);
      seedItems(SOURCE_ID, 5);

      db.insert(radarSourceMetrics)
        .values({
          id: `rsm-${SOURCE_ID}-${TODAY}`,
          sourceId: SOURCE_ID,
          tenantId: TENANT_ID,
          date: TODAY,
          totalItems: 5,
          healthScore: 0.6,
          engagementRate: 0.3,
        })
        .run();

      const data = await service.getDashboardData(TENANT_ID);
      expect(data.sources).toHaveLength(1);
      expect(data.sources[0].healthScore).toBe(0.6);
    });

    it("메트릭 없는 소스도 목록에 포함 (healthScore null)", async () => {
      seedSource(SOURCE_ID);

      const data = await service.getDashboardData(TENANT_ID);
      expect(data.sources).toHaveLength(1);
      expect(data.sources[0].healthScore).toBeNull();
    });

    it("domainCoverage 포함", async () => {
      seedSource(SOURCE_ID);

      // 도메인 생성
      db.insert(radarDomains)
        .values({ id: "dom-1", name: "AI/ML", color: "#3b82f6", tenantId: TENANT_ID })
        .run();

      db.insert(radarSourceDomains)
        .values({ id: "rsd-1", sourceId: SOURCE_ID, domainId: "dom-1" })
        .run();

      const data = await service.getDashboardData(TENANT_ID);
      expect(data.domainCoverage).toHaveLength(1);
      expect(data.domainCoverage[0].domainName).toBe("AI/ML");
      expect(data.domainCoverage[0].activeSourceCount).toBe(1);
    });
  });

  // ══════════════════════════════════════════════
  // getDomainCoverage
  // ══════════════════════════════════════════════
  describe("getDomainCoverage", () => {
    it("ACTIVE 소스 0개 도메인", async () => {
      db.insert(radarDomains)
        .values({ id: "dom-empty", name: "Empty Domain", tenantId: TENANT_ID })
        .run();

      const result = await service.getDomainCoverage(TENANT_ID);
      expect(result).toHaveLength(1);
      expect(result[0].activeSourceCount).toBe(0);
    });

    it("ACTIVE 소스 1개 도메인", async () => {
      seedSource(SOURCE_ID);
      db.insert(radarDomains)
        .values({ id: "dom-1", name: "Tech", color: "#10b981", tenantId: TENANT_ID })
        .run();
      db.insert(radarSourceDomains)
        .values({ id: "rsd-1", sourceId: SOURCE_ID, domainId: "dom-1" })
        .run();

      const result = await service.getDomainCoverage(TENANT_ID);
      expect(result).toHaveLength(1);
      expect(result[0].activeSourceCount).toBe(1);
      expect(result[0].color).toBe("#10b981");
    });

    it("ACTIVE 소스 2+ 도메인", async () => {
      seedSource(SOURCE_ID);
      seedSource(SOURCE_ID_2);
      db.insert(radarDomains)
        .values({ id: "dom-multi", name: "Multi", tenantId: TENANT_ID })
        .run();
      db.insert(radarSourceDomains)
        .values({ id: "rsd-1", sourceId: SOURCE_ID, domainId: "dom-multi" })
        .run();
      db.insert(radarSourceDomains)
        .values({ id: "rsd-2", sourceId: SOURCE_ID_2, domainId: "dom-multi" })
        .run();

      const result = await service.getDomainCoverage(TENANT_ID);
      expect(result[0].activeSourceCount).toBe(2);
    });

    it("PAUSED 소스만 있는 도메인 → 0", async () => {
      seedSource("src-paused", "PAUSED");
      db.insert(radarDomains)
        .values({ id: "dom-paused", name: "Paused Domain", tenantId: TENANT_ID })
        .run();
      db.insert(radarSourceDomains)
        .values({ id: "rsd-p", sourceId: "src-paused", domainId: "dom-paused" })
        .run();

      const result = await service.getDomainCoverage(TENANT_ID);
      expect(result[0].activeSourceCount).toBe(0);
    });

    it("테넌트 격리", async () => {
      const OTHER = "t-other";
      db.insert(tenants)
        .values({ id: OTHER, name: "Other", slug: "other", ownerUserId: USER_ID })
        .run();

      db.insert(radarDomains)
        .values({ id: "dom-mine", name: "Mine", tenantId: TENANT_ID })
        .run();
      db.insert(radarDomains)
        .values({ id: "dom-other", name: "Other", tenantId: OTHER })
        .run();

      const result = await service.getDomainCoverage(TENANT_ID);
      expect(result).toHaveLength(1);
      expect(result[0].domainName).toBe("Mine");
    });
  });
});
