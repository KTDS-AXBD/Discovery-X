/**
 * Health Metrics Service — 소스별 일일 메트릭 집계 + UPSERT
 *
 * Cron(api.cron.radar-health)에서 호출하여:
 * 1. 테넌트별 ACTIVE 소스 순회
 * 2. 아이템/engagement/conversion/AI 평균 집계
 * 3. Health Score 계산 → radar_source_metrics UPSERT
 * 4. REVIEW 자동 전환 판단
 *
 * @see DX-DSGN-013 §4
 */

import { eq, and, sql, gte, isNotNull } from "drizzle-orm";
import type { DB } from "~/db";
import {
  radarSources,
  radarItems,
  radarItemUserStatus,
  ideaSources,
} from "~/db";
import {
  radarSourceMetrics,
  radarItemMetrics,
  SourceStatus,
} from "~/features/radar/db/schema";
import {
  calculateHealthScore,
  calculateEngagement,
  MIN_ITEMS_FOR_HEALTH,
  REVIEW_HEALTH_THRESHOLD,
  ZERO_CONVERSION_DAYS,
} from "./health-score";

// ============================================================================
// Types
// ============================================================================

export interface SourceMetricsData {
  totalItems: number;
  newItemsToday: number;
  viewedCount: number;
  likeCount: number;
  dislikeCount: number;
  conversionCount7d: number;
  conversionCount30d: number;
  avgRelevance: number;
  avgNovelty: number;
  engagementRate: number;
  conversionRate7d: number;
  conversionRate30d: number;
  healthScore: number;
}

export interface HealthSummary {
  totalSources: number;
  healthySources: number;
  reviewSources: number;
  failedSources: number;
}

export interface SourceHealthRow {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  status: string;
  totalItems: number;
  healthScore: number | null;
  engagementRate: number;
  conversionRate30d: number;
  avgRelevance: number;
  avgNovelty: number;
  date: string;
}

export interface TrendData {
  date: string;
  avgHealth: number;
  sourceCount: number;
}

// ============================================================================
// Service
// ============================================================================

export class HealthMetricsService {
  constructor(private db: DB) {}

  /**
   * 소스별 일일 메트릭 집계 + Health Score 계산 + UPSERT
   */
  async refreshMetrics(
    tenantId: string,
    date: string,
  ): Promise<{ sourcesProcessed: number; reviewTransitions: number }> {
    // ACTIVE 소스 조회
    const sources = await this.db
      .select({ id: radarSources.id })
      .from(radarSources)
      .where(
        and(
          eq(radarSources.tenantId, tenantId),
          eq(radarSources.status, SourceStatus.ACTIVE),
        ),
      );

    let sourcesProcessed = 0;

    for (const source of sources) {
      const metrics = await this.calculateSourceMetrics(source.id, date);
      await this.upsertSourceMetrics(source.id, tenantId, date, metrics);
      sourcesProcessed++;
    }

    const reviewTransitions = await this.evaluateReviewTransitions(tenantId, date);

    return { sourcesProcessed, reviewTransitions };
  }

  /**
   * 단일 소스 메트릭 집계
   */
  async calculateSourceMetrics(
    sourceId: string,
    date: string,
  ): Promise<SourceMetricsData> {
    // 1. 총 아이템 수
    const [totalResult] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(radarItems)
      .where(eq(radarItems.sourceId, sourceId));
    const totalItems = totalResult?.count ?? 0;

    // 2. 오늘 수집된 아이템 수
    const [todayResult] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(radarItems)
      .where(
        and(
          eq(radarItems.sourceId, sourceId),
          sql`DATE(${radarItems.collectedAt}, 'unixepoch') = ${date}`,
        ),
      );
    const newItemsToday = todayResult?.count ?? 0;

    // 3. Engagement 집계
    const [engagementResult] = await this.db
      .select({
        viewedCount: sql<number>`COUNT(DISTINCT CASE WHEN ${radarItemUserStatus.status} = 'viewed' THEN ${radarItems.id} END)`,
        likeCount: sql<number>`COUNT(DISTINCT CASE WHEN ${radarItemUserStatus.reaction} = 'like' THEN ${radarItems.id} END)`,
        dislikeCount: sql<number>`COUNT(DISTINCT CASE WHEN ${radarItemUserStatus.reaction} = 'dislike' THEN ${radarItems.id} END)`,
      })
      .from(radarItems)
      .leftJoin(
        radarItemUserStatus,
        eq(radarItems.id, radarItemUserStatus.itemId),
      )
      .where(eq(radarItems.sourceId, sourceId));

    const viewedCount = engagementResult?.viewedCount ?? 0;
    const likeCount = engagementResult?.likeCount ?? 0;
    const dislikeCount = engagementResult?.dislikeCount ?? 0;

    // 4. Conversion (7d / 30d)
    const now = Math.floor(Date.now() / 1000);
    const [convResult] = await this.db
      .select({
        conv7d: sql<number>`COUNT(DISTINCT CASE WHEN ${ideaSources.addedAt} >= ${now - 7 * 86400} AND ${ideaSources.linkType} IN ('primary','secondary') THEN ${ideaSources.ideaId} END)`,
        conv30d: sql<number>`COUNT(DISTINCT CASE WHEN ${ideaSources.addedAt} >= ${now - 30 * 86400} AND ${ideaSources.linkType} IN ('primary','secondary') THEN ${ideaSources.ideaId} END)`,
      })
      .from(radarItems)
      .leftJoin(ideaSources, eq(radarItems.id, ideaSources.radarItemId))
      .where(eq(radarItems.sourceId, sourceId));

    const conversionCount7d = convResult?.conv7d ?? 0;
    const conversionCount30d = convResult?.conv30d ?? 0;

    // 5. AI 품질 평균
    const [aiResult] = await this.db
      .select({
        avgRelevance: sql<number>`COALESCE(AVG(${radarItemMetrics.topicRelevance}), 0)`,
        avgNovelty: sql<number>`COALESCE(AVG(${radarItemMetrics.novelty}), 0)`,
      })
      .from(radarItems)
      .innerJoin(radarItemMetrics, eq(radarItems.id, radarItemMetrics.itemId))
      .where(
        and(
          eq(radarItems.sourceId, sourceId),
          isNotNull(radarItemMetrics.evaluatedAt),
        ),
      );

    const avgRelevance = aiResult?.avgRelevance ?? 0;
    const avgNovelty = aiResult?.avgNovelty ?? 0;

    // 계산
    const engagementRate = calculateEngagement({
      totalItems,
      viewedCount,
      likeCount,
      dislikeCount,
    });

    const conversionRate7d = totalItems > 0
      ? Math.round((conversionCount7d / totalItems) * 1000) / 1000
      : 0;
    const conversionRate30d = totalItems > 0
      ? Math.round((conversionCount30d / totalItems) * 1000) / 1000
      : 0;

    const healthScore = totalItems >= MIN_ITEMS_FOR_HEALTH
      ? calculateHealthScore({
          avgRelevance,
          avgNovelty,
          engagementRate,
          conversionRate30d,
        })
      : 0;

    return {
      totalItems,
      newItemsToday,
      viewedCount,
      likeCount,
      dislikeCount,
      conversionCount7d,
      conversionCount30d,
      avgRelevance: Math.round(avgRelevance * 1000) / 1000,
      avgNovelty: Math.round(avgNovelty * 1000) / 1000,
      engagementRate,
      conversionRate7d,
      conversionRate30d,
      healthScore,
    };
  }

  /**
   * REVIEW 자동 전환 판단 + 실행
   */
  async evaluateReviewTransitions(
    tenantId: string,
    date: string,
  ): Promise<number> {
    // 오늘자 메트릭에서 REVIEW 전환 대상 조회
    const candidates = await this.db
      .select({
        sourceId: radarSourceMetrics.sourceId,
        healthScore: radarSourceMetrics.healthScore,
        totalItems: radarSourceMetrics.totalItems,
        conversionCount30d: radarSourceMetrics.conversionCount30d,
      })
      .from(radarSourceMetrics)
      .innerJoin(radarSources, eq(radarSourceMetrics.sourceId, radarSources.id))
      .where(
        and(
          eq(radarSourceMetrics.tenantId, tenantId),
          eq(radarSourceMetrics.date, date),
          eq(radarSources.status, SourceStatus.ACTIVE),
          gte(radarSourceMetrics.totalItems, MIN_ITEMS_FOR_HEALTH),
        ),
      );

    let transitions = 0;

    for (const c of candidates) {
      const shouldReview =
        (c.healthScore !== null && c.healthScore < REVIEW_HEALTH_THRESHOLD) ||
        (c.conversionCount30d === 0);

      if (shouldReview) {
        await this.db
          .update(radarSources)
          .set({ status: SourceStatus.REVIEW })
          .where(eq(radarSources.id, c.sourceId));
        transitions++;
      }
    }

    return transitions;
  }

  /**
   * Dashboard 데이터 조회
   */
  async getDashboardData(tenantId: string): Promise<{
    summary: HealthSummary;
    sources: SourceHealthRow[];
    trend: TrendData[];
  }> {
    // 1. 요약: 상태별 소스 수
    const statusCounts = await this.db
      .select({
        status: radarSources.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(radarSources)
      .where(eq(radarSources.tenantId, tenantId))
      .groupBy(radarSources.status);

    const countMap: Record<string, number> = {};
    for (const row of statusCounts) {
      if (row.status) countMap[row.status] = row.count;
    }

    const summary: HealthSummary = {
      totalSources: Object.values(countMap).reduce((a, b) => a + b, 0),
      healthySources: (countMap[SourceStatus.ACTIVE] ?? 0),
      reviewSources: (countMap[SourceStatus.REVIEW] ?? 0),
      failedSources: (countMap[SourceStatus.FAILED] ?? 0),
    };

    // 2. 소스별 최신 메트릭 (서브쿼리로 최신 날짜 조인)
    const sources = await this.db
      .select({
        sourceId: radarSources.id,
        sourceName: radarSources.name,
        sourceType: radarSources.sourceType,
        status: radarSources.status,
        totalItems: sql<number>`COALESCE(${radarSourceMetrics.totalItems}, 0)`,
        healthScore: radarSourceMetrics.healthScore,
        engagementRate: sql<number>`COALESCE(${radarSourceMetrics.engagementRate}, 0)`,
        conversionRate30d: sql<number>`COALESCE(${radarSourceMetrics.conversionRate30d}, 0)`,
        avgRelevance: sql<number>`COALESCE(${radarSourceMetrics.avgRelevance}, 0)`,
        avgNovelty: sql<number>`COALESCE(${radarSourceMetrics.avgNovelty}, 0)`,
        date: sql<string>`COALESCE(${radarSourceMetrics.date}, '')`,
      })
      .from(radarSources)
      .leftJoin(
        radarSourceMetrics,
        and(
          eq(radarSources.id, radarSourceMetrics.sourceId),
          eq(
            radarSourceMetrics.date,
            sql`(SELECT MAX(date) FROM radar_source_metrics WHERE source_id = ${radarSources.id})`,
          ),
        ),
      )
      .where(eq(radarSources.tenantId, tenantId));

    // 3. 7일 트렌드
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const trendStartDate = sevenDaysAgo.toISOString().split("T")[0];

    const trend = await this.db
      .select({
        date: radarSourceMetrics.date,
        avgHealth: sql<number>`AVG(${radarSourceMetrics.healthScore})`,
        sourceCount: sql<number>`COUNT(*)`,
      })
      .from(radarSourceMetrics)
      .where(
        and(
          eq(radarSourceMetrics.tenantId, tenantId),
          gte(radarSourceMetrics.date, trendStartDate),
        ),
      )
      .groupBy(radarSourceMetrics.date)
      .orderBy(radarSourceMetrics.date);

    return {
      summary,
      sources: sources as SourceHealthRow[],
      trend: trend as TrendData[],
    };
  }

  // ===========================================================================
  // Private helpers
  // ===========================================================================

  private async upsertSourceMetrics(
    sourceId: string,
    tenantId: string,
    date: string,
    metrics: SourceMetricsData,
  ): Promise<void> {
    const id = `rsm-${sourceId}-${date}`;

    await this.db
      .insert(radarSourceMetrics)
      .values({
        id,
        sourceId,
        tenantId,
        date,
        ...metrics,
      })
      .onConflictDoUpdate({
        target: [radarSourceMetrics.sourceId, radarSourceMetrics.date],
        set: {
          totalItems: metrics.totalItems,
          newItemsToday: metrics.newItemsToday,
          viewedCount: metrics.viewedCount,
          likeCount: metrics.likeCount,
          dislikeCount: metrics.dislikeCount,
          conversionCount7d: metrics.conversionCount7d,
          conversionCount30d: metrics.conversionCount30d,
          avgRelevance: metrics.avgRelevance,
          avgNovelty: metrics.avgNovelty,
          engagementRate: metrics.engagementRate,
          conversionRate7d: metrics.conversionRate7d,
          conversionRate30d: metrics.conversionRate30d,
          healthScore: metrics.healthScore,
        },
      });
  }
}
