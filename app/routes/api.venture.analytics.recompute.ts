/**
 * Venture Analytics - Recompute API
 * POST /api/venture/analytics/recompute
 *
 * 스프린트/전체 Analytics 스냅샷을 재계산하는 엔드포인트
 */

import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSprintById } from "~/features/venture/repositories/sprint.repository";
import {
  listOpportunitiesBySprint,
  getOpportunityFull,
  updateOpportunity,
} from "~/features/venture/repositories/opportunity.repository";
import {
  getSignalCount,
  getProblemCount,
  listThemesBySprint,
} from "~/features/venture/repositories/signal.repository";
import {
  createAnalyticsSnapshot,
  getWorkEventCountByActor,
} from "~/features/venture/repositories/analytics.repository";
import {
  calculateDepthScore,
  calculatePotentialScore,
  calculateConfidenceScore,
  calculateNextRoi,
  rankOpportunities,
} from "~/features/venture/domain/scoring-policy";
import { listScoresByOpportunity } from "~/features/venture/repositories/opportunity.repository";
import type { VdAnalyticsData } from "~/features/venture/types";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // 인증 (Worker 또는 Admin)
  const authHeader = request.headers.get("Authorization");
  const env = context.cloudflare.env as { DB: D1Database; CRON_SECRET?: string };
  const expectedToken = env.CRON_SECRET;

  if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json() as {
      sprintId?: string;
      snapshotType?: "DAILY" | "GATE" | "FINAL";
    };

    const { sprintId, snapshotType = "DAILY" } = body;

    const db = getDb(env.DB);

    // 스프린트별 또는 전체 재계산
    if (sprintId) {
      // 특정 스프린트 재계산
      const sprint = await getSprintById(db, sprintId);
      if (!sprint) {
        return json({ error: "Sprint not found" }, { status: 404 });
      }

      const analyticsData = await computeSprintAnalytics(db, sprintId);

      // 스냅샷 저장
      const snapshot = await createAnalyticsSnapshot(
        db,
        sprintId,
        snapshotType.toLowerCase() as "daily" | "gate" | "final",
        analyticsData
      );

      return json({
        success: true,
        sprintId,
        snapshot,
        analytics: analyticsData,
      });
    } else {
      // 전체 재계산 (글로벌 스냅샷)
      // 이 경우 sprintId 없이 전체 통계만 저장
      const globalSnapshot = await createAnalyticsSnapshot(
        db,
        null,
        "daily",
        {
          computedAt: new Date().toISOString(),
          type: "global",
        }
      );

      return json({
        success: true,
        global: true,
        snapshot: globalSnapshot,
      });
    }
  } catch (err) {
    console.error("Analytics recompute error:", err);
    return json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

/**
 * 스프린트 Analytics 계산
 */
async function computeSprintAnalytics(db: ReturnType<typeof getDb>, sprintId: string): Promise<VdAnalyticsData> {
  // 병렬로 데이터 조회
  const [
    opportunities,
    signalCount,
    problemCount,
    themes,
    effortByActor,
  ] = await Promise.all([
    listOpportunitiesBySprint(db, sprintId),
    getSignalCount(db, sprintId),
    getProblemCount(db, sprintId),
    listThemesBySprint(db, sprintId),
    getWorkEventCountByActor(db, sprintId),
  ]);

  // 각 기회의 Depth/Potential/Confidence Score 계산 및 업데이트
  const opportunityScores = await Promise.all(
    opportunities.map(async (opp) => {
      const full = await getOpportunityFull(db, opp.id);
      if (!full) return null;

      // Depth Score 계산
      const depthBreakdown = calculateDepthScore({
        evidences: full.evidences,
        assumptions: full.assumptions,
        premortems: full.premortems,
        artifacts: full.artifacts,
        opportunity: opp,
      });

      // vd_scores 테이블에서 Gate 점수 조회
      const scores = await listScoresByOpportunity(db, opp.id);

      // Potential Score 자동 계산 (Gate 점수 또는 Evidence 기반)
      const potentialScore = calculatePotentialScore(scores, full.evidences);

      // Confidence Score 자동 계산 (Depth 요소 기반)
      const confidenceScore = calculateConfidenceScore(depthBreakdown);

      // Next-ROI 추천 계산
      const nextRoi = calculateNextRoi({
        potentialScore,
        confidenceScore,
        depthScore: depthBreakdown.total,
        effortScore: opp.effortScore || 0,
        unknowns: full.assumptions.filter((a) => a.status === "OPEN").length,
      });

      // DB 업데이트 (Potential, Confidence, Depth 모두 업데이트)
      await updateOpportunity(db, opp.id, {
        potentialScore,
        confidenceScore,
        depthScore: depthBreakdown.total,
        effortScore: opp.effortScore || 0,
        recommendation: nextRoi.recommendation,
      });

      return {
        id: opp.id,
        title: opp.title,
        depthBreakdown,
        nextRoi,
      };
    })
  );

  // 순위 계산
  const rankedOpportunities = rankOpportunities({
    opportunities: opportunities.map((o) => ({
      id: o.id,
      potentialScore: o.potentialScore,
      confidenceScore: o.confidenceScore,
      depthScore: o.depthScore,
      effortScore: o.effortScore,
    })),
  });

  // Funnel 데이터
  const funnel = {
    signals: signalCount,
    problems: problemCount,
    opportunities: opportunities.length,
    shortlist: opportunities.filter((o) => o.isShortlisted).length,
    final: opportunities.filter((o) => o.isFinal).length,
  };

  // 테마별 분포
  const themeDistribution = themes.map((theme) => ({
    id: theme.id,
    name: theme.name,
    count: theme.opportunityCount || 0,
    depthScore: theme.depthScore || 0,
  }));

  return {
    computedAt: new Date().toISOString(),
    funnel,
    themeDistribution,
    effortByActor,
    opportunityScores: opportunityScores.filter((o): o is NonNullable<typeof o> => o !== null),
    rankedOpportunities,
  };
}
