/**
 * Venture Sprint Analytics 탭
 * /venture/sprints/:sprintId/analytics
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { Badge } from "~/components/ui/Badge";
import { getSprintById } from "~/features/venture/repositories/sprint.repository";
import {
  listOpportunitiesBySprint,
  getOpportunityFull,
} from "~/features/venture/repositories/opportunity.repository";
import {
  getSignalCount,
  getProblemCount,
  listThemesBySprint,
} from "~/features/venture/repositories/signal.repository";
import {
  getWorkEventCountByActor,
  getLatestSnapshot,
} from "~/features/venture/repositories/analytics.repository";
import { calculateDepthScore, calculateNextRoi, rankOpportunities } from "~/features/venture/domain/scoring-policy";
import type { VdRecommendationType } from "~/features/venture/types";

const RECOMMENDATION_CONFIG: Record<VdRecommendationType, { label: string; color: string }> = {
  INVEST: { label: "투자", color: "var(--axis-badge-success-bg)" },
  EXPLORE: { label: "탐색", color: "var(--axis-badge-info-bg)" },
  HOLD: { label: "보류", color: "var(--axis-badge-warning-bg)" },
  DROP: { label: "중단", color: "var(--axis-badge-destructive-bg)" },
};

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return redirect("/login");

  const { sprintId } = params;
  if (!sprintId) {
    return redirect("/venture/sprints");
  }

  const sprint = await getSprintById(db, sprintId);
  if (!sprint) {
    throw new Response("Sprint not found", { status: 404 });
  }

  const [
    opportunities,
    signalCount,
    problemCount,
    themes,
    effortByActor,
    latestSnapshot,
  ] = await Promise.all([
    listOpportunitiesBySprint(db, sprintId),
    getSignalCount(db, sprintId),
    getProblemCount(db, sprintId),
    listThemesBySprint(db, sprintId),
    getWorkEventCountByActor(db, sprintId),
    getLatestSnapshot(db, sprintId),
  ]);

  // Depth Score 및 추천 계산
  const opportunitiesWithScores = await Promise.all(
    opportunities.map(async (opp) => {
      const full = await getOpportunityFull(db, opp.id);
      if (!full) return { ...opp, depthBreakdown: null, nextRoi: null };

      const depthBreakdown = calculateDepthScore({
        evidences: full.evidences,
        assumptions: full.assumptions,
        premortems: full.premortems,
        artifacts: full.artifacts,
        opportunity: opp,
      });

      const nextRoi = calculateNextRoi({
        potentialScore: opp.potentialScore || 50,
        confidenceScore: opp.confidenceScore || 50,
        depthScore: depthBreakdown.total,
        effortScore: opp.effortScore || 0,
        unknowns: full.assumptions.filter((a) => a.status === "OPEN").length,
      });

      return { ...opp, depthBreakdown, nextRoi };
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

  return json({
    sprint,
    funnel,
    themeDistribution,
    effortByActor,
    opportunitiesWithScores,
    rankedOpportunities,
    latestSnapshot,
  });
}

export default function VentureSprintAnalytics() {
  const {
    funnel,
    themeDistribution,
    effortByActor,
    opportunitiesWithScores,
    rankedOpportunities,
    latestSnapshot,
  } = useLoaderData<typeof loader>();

  const totalEffort = effortByActor.human + effortByActor.agent;
  const humanRatio = totalEffort > 0 ? (effortByActor.human / totalEffort) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Funnel */}
      <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
        <h2 className="mb-4 font-semibold text-[var(--axis-text-primary)]">퍼널</h2>
        <div className="flex items-end justify-between gap-4">
          {[
            { label: "신호", value: funnel.signals },
            { label: "문제", value: funnel.problems },
            { label: "기회", value: funnel.opportunities },
            { label: "선별 목록", value: funnel.shortlist },
            { label: "최종 선정", value: funnel.final },
          ].map((item) => {
            const maxValue = Math.max(funnel.signals, 1);
            const height = Math.max((item.value / maxValue) * 120, 20);
            return (
              <div key={item.label} className="flex flex-col items-center">
                <div
                  className="w-16 rounded-t-md bg-[var(--axis-surface-brand)]"
                  style={{ height: `${height}px` }}
                />
                <div className="mt-2 text-center">
                  <div className="text-lg font-bold text-[var(--axis-text-primary)]">
                    {item.value}
                  </div>
                  <div className="text-xs text-[var(--axis-text-tertiary)]">{item.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Effort 분포 */}
        <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
          <h2 className="mb-4 font-semibold text-[var(--axis-text-primary)]">작업 분포</h2>
          <div className="mb-4 flex h-6 overflow-hidden rounded-full bg-[var(--axis-surface-tertiary)]">
            <div
              className="bg-[var(--axis-badge-success-bg)]"
              style={{ width: `${humanRatio}%` }}
              title={`Human: ${effortByActor.human}`}
            />
            <div
              className="bg-[var(--axis-badge-purple-bg)]"
              style={{ width: `${100 - humanRatio}%` }}
              title={`Agent: ${effortByActor.agent}`}
            />
          </div>
          <div className="flex justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-[var(--axis-badge-success-bg)]" />
              <span className="text-[var(--axis-text-secondary)]">
                사람: {effortByActor.human} ({humanRatio.toFixed(0)}%)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-[var(--axis-badge-purple-bg)]" />
              <span className="text-[var(--axis-text-secondary)]">
                에이전트: {effortByActor.agent} ({(100 - humanRatio).toFixed(0)}%)
              </span>
            </div>
          </div>
        </div>

        {/* 테마별 분포 */}
        <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
          <h2 className="mb-4 font-semibold text-[var(--axis-text-primary)]">테마별 분포</h2>
          {themeDistribution.length === 0 ? (
            <p className="text-sm text-[var(--axis-text-tertiary)]">테마가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {themeDistribution.map((theme) => (
                <div key={theme.id} className="flex items-center justify-between">
                  <span className="text-sm text-[var(--axis-text-primary)]">{theme.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--axis-text-tertiary)]">
                      {theme.count}개
                    </span>
                    {theme.depthScore > 0 && (
                      <Badge variant="secondary">깊이 {theme.depthScore}</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 기회별 추천 */}
      <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
        <h2 className="mb-4 font-semibold text-[var(--axis-text-primary)]">기회별 분석</h2>
        {opportunitiesWithScores.length === 0 ? (
          <p className="text-sm text-[var(--axis-text-tertiary)]">기회가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--axis-border-default)]">
                  <th className="py-2 text-left font-medium text-[var(--axis-text-tertiary)]">
                    순위
                  </th>
                  <th className="py-2 text-left font-medium text-[var(--axis-text-tertiary)]">
                    기회
                  </th>
                  <th className="py-2 text-center font-medium text-[var(--axis-text-tertiary)]">
                    잠재력
                  </th>
                  <th className="py-2 text-center font-medium text-[var(--axis-text-tertiary)]">
                    신뢰도
                  </th>
                  <th className="py-2 text-center font-medium text-[var(--axis-text-tertiary)]">
                    깊이
                  </th>
                  <th className="py-2 text-center font-medium text-[var(--axis-text-tertiary)]">
                    추천
                  </th>
                </tr>
              </thead>
              <tbody>
                {opportunitiesWithScores.map((opp) => {
                  const ranked = rankedOpportunities.find((r) => r.id === opp.id);
                  const recommendation = opp.nextRoi?.recommendation;
                  const recConfig = recommendation
                    ? RECOMMENDATION_CONFIG[recommendation]
                    : null;

                  return (
                    <tr key={opp.id} className="border-b border-[var(--axis-border-default)]">
                      <td className="py-3">
                        <span className="font-medium text-[var(--axis-text-primary)]">
                          #{ranked?.rank || "-"}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[var(--axis-text-primary)]">{opp.title}</span>
                          {opp.isShortlisted === 1 && (
                            <Badge variant="success" className="text-xs">
                              선별
                            </Badge>
                          )}
                          {opp.isFinal === 1 && (
                            <Badge variant="info" className="text-xs">
                              최종
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-3 text-center">
                        <span className="text-[var(--axis-text-secondary)]">
                          {opp.potentialScore ?? "-"}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <span className="text-[var(--axis-text-secondary)]">
                          {opp.confidenceScore ?? "-"}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <span className="text-[var(--axis-text-secondary)]">
                          {opp.depthBreakdown?.total ?? "-"}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        {recConfig ? (
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{ backgroundColor: recConfig.color }}
                          >
                            {recConfig.label}
                          </span>
                        ) : (
                          <span className="text-[var(--axis-text-tertiary)]">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 스냅샷 정보 */}
      {latestSnapshot && (
        <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] p-4 text-sm text-[var(--axis-text-tertiary)]">
          마지막 스냅샷: {new Date(latestSnapshot.createdAt).toLocaleString("ko-KR")} (
          {latestSnapshot.snapshotType})
        </div>
      )}
    </div>
  );
}
