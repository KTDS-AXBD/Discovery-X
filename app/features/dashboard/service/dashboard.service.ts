// DashboardService — /dashboard 오버뷰 통합 데이터
import { eq, sql, desc, and, inArray, asc } from "drizzle-orm";
import type { DB } from "~/db";
import {
  discoveries,
  experiments,
  evidence,
  radarItems,
  radarItemUserStatus,
  radarSources,
  industryAdapters,
  DiscoveryStatus,
} from "~/db";
import { proposals } from "~/features/proposals/db/schema";
import { tenantWhere } from "~/lib/query/tenant-scope";

// ============================================================================
// Types
// ============================================================================

export interface DashboardCollectionItem {
  id: string;
  title: string;
  summary: string | null;
  titleKo: string | null;
  summaryKo: string | null;
  keyPoints: string[] | null;
  url: string;
}

export interface DashboardDiscoveryItem {
  id: string;
  title: string;
  status: string;
  createdAt: Date | null;
  stageUpdatedAt: Date | null;
  industryAdapterId: string | null;
}

export interface DashboardProposalItem {
  id: string;
  title: string;
  status: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface DashboardSourceStat {
  sourceType: string;
  count: number;
}

export interface DashboardAdapterItem {
  id: string;
  nameKo: string;
  color: string;
}

export interface DashboardOverviewData {
  recentCollections: { total: number; items: DashboardCollectionItem[] };
  totalDiscoveries: { total: number; items: DashboardDiscoveryItem[] };
  strategyProposals: { total: number; items: DashboardProposalItem[] };
  reactions: Record<string, string | null>;
  viewedItemIds: string[];
  industryAdapterList: DashboardAdapterItem[];
  sourceStats: DashboardSourceStat[];
  serverNow: number;
}

export interface OnboardingState {
  step: 0 | 1 | 2 | 3 | 4;
  firstDiscoveryId: string | null;
  firstDiscoveryStatus: string | null;
  hasExperiment: boolean;
  hasEvidence: boolean;
  hasClosed: boolean;
}

const CLOSED_STATUSES = [DiscoveryStatus.HOLD, DiscoveryStatus.DROP, DiscoveryStatus.HANDOFF];

const META_RE = /^(댓글\s*\d+개|댓글\s*없음|\d+\s*(comments?|points?|개))$/i;

// ============================================================================
// Service
// ============================================================================

export class DashboardService {
  constructor(private db: DB) {}

  async getOnboardingState(tenantId: string): Promise<OnboardingState> {
    // 인간 생성 Discovery만 (createdByAgent = 0)
    const humanDiscoveries = await this.db
      .select({
        id: discoveries.id,
        status: discoveries.status,
      })
      .from(discoveries)
      .where(
        and(
          eq(discoveries.tenantId, tenantId),
          eq(discoveries.createdByAgent, 0),
        ),
      )
      .orderBy(asc(discoveries.createdAt))
      .limit(10);

    if (humanDiscoveries.length === 0) {
      return { step: 0, firstDiscoveryId: null, firstDiscoveryStatus: null, hasExperiment: false, hasEvidence: false, hasClosed: false };
    }

    const first = humanDiscoveries[0];
    const hasClosed = humanDiscoveries.some((d) => (CLOSED_STATUSES as string[]).includes(d.status));

    if (hasClosed) {
      return { step: 4, firstDiscoveryId: first.id, firstDiscoveryStatus: first.status, hasExperiment: true, hasEvidence: true, hasClosed: true };
    }

    // 첫 인간 Discovery의 실험/근거 확인
    const [expResult, evResult] = await Promise.all([
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(experiments)
        .where(eq(experiments.discoveryId, first.id)),
      this.db
        .select({ count: sql<number>`count(*)` })
        .from(evidence)
        .where(eq(evidence.discoveryId, first.id)),
    ]);

    const hasExperiment = (expResult[0]?.count ?? 0) > 0;
    const hasEvidence = (evResult[0]?.count ?? 0) > 0;

    let step: 0 | 1 | 2 | 3 | 4 = 1;
    if (hasEvidence) step = 3;
    else if (hasExperiment) step = 2;

    return { step, firstDiscoveryId: first.id, firstDiscoveryStatus: first.status, hasExperiment, hasEvidence, hasClosed: false };
  }

  async getOverviewData(params: {
    tenantId: string;
    userId?: string;
  }): Promise<DashboardOverviewData> {
    const { tenantId, userId } = params;

    const [
      recentCollections,
      totalDiscoveries,
      strategyProposals,
      industryAdapterList,
      sourceStats,
    ] = await Promise.all([
      this.getRecentCollections(tenantId),
      this.getAllDiscoveries(tenantId),
      this.getStrategyProposals(tenantId),
      this.getIndustryAdapters(tenantId),
      this.getSourceStats(tenantId),
    ]);

    const { reactions, viewedItemIds } = userId
      ? await this.getUserReactions(userId, recentCollections.items.map((i) => i.id))
      : { reactions: {} as Record<string, string | null>, viewedItemIds: [] as string[] };

    return {
      recentCollections,
      totalDiscoveries,
      strategyProposals,
      reactions,
      viewedItemIds,
      industryAdapterList,
      sourceStats,
      serverNow: Date.now(),
    };
  }

  private async getRecentCollections(tenantId: string) {
    try {
      const tenantRunIds = sql`(SELECT id FROM radar_runs WHERE tenant_id = ${tenantId})`;

      const [countResult, latestItemsRaw] = await Promise.all([
        this.db
          .select({ count: sql<number>`count(*)` })
          .from(radarItems)
          .where(sql`${radarItems.runId} IN ${tenantRunIds}`),
        this.db
          .select({
            id: radarItems.id,
            title: radarItems.title,
            summary: radarItems.summary,
            titleKo: radarItems.titleKo,
            summaryKo: radarItems.summaryKo,
            keyPoints: radarItems.keyPoints,
            url: radarItems.url,
          })
          .from(radarItems)
          .where(sql`${radarItems.runId} IN ${tenantRunIds}`)
          .orderBy(desc(sql`rowid`))
          .limit(30),
      ]);

      const items = latestItemsRaw
        .filter((item) => {
          const t = item.title?.trim() ?? "";
          const tKo = item.titleKo?.trim() ?? "";
          const best = tKo.length >= 5 && !META_RE.test(tKo) ? tKo : t;
          return best.length >= 5 && !META_RE.test(best) && /\s/.test(best);
        })
        .slice(0, 10);

      return { total: countResult[0]?.count ?? 0, items };
    } catch {
      return { total: 0, items: [] as DashboardCollectionItem[] };
    }
  }

  private async getAllDiscoveries(tenantId: string) {
    const items = await this.db
      .select({
        id: discoveries.id,
        title: discoveries.title,
        status: discoveries.status,
        createdAt: discoveries.createdAt,
        stageUpdatedAt: discoveries.stageUpdatedAt,
        industryAdapterId: discoveries.industryAdapterId,
      })
      .from(discoveries)
      .where(tenantWhere(discoveries, tenantId));
    return { total: items.length, items };
  }

  private async getStrategyProposals(tenantId: string) {
    try {
      const items = await this.db
        .select({
          id: proposals.id,
          title: proposals.title,
          status: proposals.status,
          createdAt: proposals.createdAt,
          updatedAt: proposals.updatedAt,
        })
        .from(proposals)
        .where(eq(proposals.tenantId, tenantId));
      return { total: items.length, items };
    } catch {
      return { total: 0, items: [] as DashboardProposalItem[] };
    }
  }

  private async getIndustryAdapters(tenantId: string) {
    try {
      return this.db
        .select({
          id: industryAdapters.id,
          nameKo: industryAdapters.nameKo,
          color: industryAdapters.color,
        })
        .from(industryAdapters)
        .where(tenantWhere(industryAdapters, tenantId));
    } catch {
      return [] as DashboardAdapterItem[];
    }
  }

  private async getSourceStats(tenantId: string) {
    try {
      return this.db
        .select({ sourceType: radarSources.sourceType, count: sql<number>`count(*)` })
        .from(radarSources)
        .where(tenantWhere(radarSources, tenantId))
        .groupBy(radarSources.sourceType);
    } catch {
      return [] as DashboardSourceStat[];
    }
  }

  private async getUserReactions(userId: string, itemIds: string[]) {
    const reactions: Record<string, string | null> = {};
    const viewedItemIds: string[] = [];

    if (itemIds.length === 0) return { reactions, viewedItemIds };

    try {
      const statuses = await this.db
        .select({
          itemId: radarItemUserStatus.itemId,
          status: radarItemUserStatus.status,
          reaction: radarItemUserStatus.reaction,
        })
        .from(radarItemUserStatus)
        .where(
          and(
            eq(radarItemUserStatus.userId, userId),
            inArray(radarItemUserStatus.itemId, itemIds),
          ),
        );

      for (const s of statuses) {
        reactions[s.itemId] = s.reaction ?? null;
        if (s.status === "viewed" || s.status === "archived") {
          viewedItemIds.push(s.itemId);
        }
      }
    } catch {
      // radarItemUserStatus might not have reaction column
    }

    return { reactions, viewedItemIds };
  }
}
