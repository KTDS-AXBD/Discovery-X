/**
 * Dashboard: Shadow Mode 탭 — AI vs Human 일치율 현황 (Strategic Evolution F2)
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { sql, desc, gte, and } from "drizzle-orm";
import { getDb } from "~/db";
import { shadowRuns, shadowConfigs, discoveries } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import ShadowRunCard from "~/components/shadow/ShadowRunCard";
import ShadowStatsBar from "~/components/shadow/ShadowStatsBar";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return redirect("/login");

  // 전체 통계 (tenant-scoped)
  const [totalStats] = await db
    .select({ count: sql<number>`count(*)` })
    .from(shadowRuns)
    .where(sql`${shadowRuns.discoveryId} IN (SELECT id FROM discoveries WHERE tenant_id = ${ctx.tenantId})`);

  // 30일 이내
  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 86400;
  const recentRuns = await db
    .select()
    .from(shadowRuns)
    .where(and(
      gte(shadowRuns.createdAt, new Date(thirtyDaysAgo * 1000)),
      sql`${shadowRuns.discoveryId} IN (SELECT id FROM discoveries WHERE tenant_id = ${ctx.tenantId})`
    ))
    .orderBy(desc(shadowRuns.createdAt));

  // 결과별 집계
  const byResult = { match: 0, partial: 0, mismatch: 0, pending: 0 };
  for (const r of recentRuns) {
    const result = r.matchResult as keyof typeof byResult;
    if (result in byResult) byResult[result]++;
  }

  const scoredRuns = recentRuns.filter((r) => r.matchScore !== null);
  const matchRate =
    scoredRuns.length > 0
      ? Math.round(
          (scoredRuns.reduce((sum, r) => sum + (r.matchScore || 0), 0) / scoredRuns.length) * 10
        ) / 10
      : 0;

  // 이탈 유형 분포
  const deviationCounts: Record<string, number> = {};
  for (const r of recentRuns) {
    if (r.deviationCategory) {
      deviationCounts[r.deviationCategory] = (deviationCounts[r.deviationCategory] || 0) + 1;
    }
  }

  // 최근 10건
  const latestRuns = recentRuns.slice(0, 10);

  // Discovery 이름 매핑
  const discoveryIds = [...new Set(latestRuns.map((r) => r.discoveryId))];
  const discoveryNames: Record<string, string> = {};
  if (discoveryIds.length > 0) {
    const discs = await db
      .select({ id: discoveries.id, title: discoveries.title })
      .from(discoveries);
    for (const d of discs) {
      discoveryNames[d.id] = d.title;
    }
  }

  // Shadow configs
  const configs = await db.select().from(shadowConfigs).limit(5);

  return json({
    totalCount: totalStats.count,
    recentCount: recentRuns.length,
    matchRate,
    byResult,
    deviationCounts,
    latestRuns: latestRuns.map((r) => ({
      ...r,
      discoveryTitle: discoveryNames[r.discoveryId] || r.discoveryId,
      createdAt: String(r.createdAt),
      analyzedAt: r.analyzedAt ? String(r.analyzedAt) : null,
      reviewedAt: r.reviewedAt ? String(r.reviewedAt) : null,
    })),
    configCount: configs.length,
  });
}

const DEVIATION_LABELS: Record<string, string> = {
  risk_tolerance: "리스크 허용도",
  information_gap: "정보 부족",
  methodology: "방법론",
  timing: "타이밍",
  domain_expertise: "도메인 전문성",
};

export default function DashboardShadow() {
  const data = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-[var(--axis-text-primary)]">
          Shadow Mode 운영 현황
        </h2>
        <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
          AI vs Human 의사결정 비교 분석 (최근 30일)
        </p>
      </div>

      {/* 통계 요약 */}
      <ShadowStatsBar
        totalRuns={data.recentCount}
        matchRate={data.matchRate}
        mismatchCount={data.byResult.mismatch}
        deviationTypes={Object.keys(data.deviationCounts).length}
      />

      {/* 결과 분포 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>결과 분포</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(["match", "partial", "mismatch", "pending"] as const).map((result) => {
                const count = data.byResult[result];
                const total = data.recentCount || 1;
                const pct = Math.round((count / total) * 100);
                const colors: Record<string, string> = {
                  match: "bg-green-500",
                  partial: "bg-yellow-500",
                  mismatch: "bg-red-500",
                  pending: "bg-gray-400",
                };
                const labels: Record<string, string> = {
                  match: "일치",
                  partial: "부분 일치",
                  mismatch: "불일치",
                  pending: "대기",
                };
                return (
                  <div key={result} className="flex items-center gap-3">
                    <span className="w-20 text-sm text-[var(--axis-text-secondary)]">
                      {labels[result]}
                    </span>
                    <div className="flex-1 h-5 rounded-full bg-[var(--axis-surface-secondary)] overflow-hidden">
                      <div
                        className={`h-full rounded-full ${colors[result]} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-12 text-right text-sm font-medium text-[var(--axis-text-primary)]">
                      {count}건
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>이탈 유형</CardTitle>
          </CardHeader>
          <CardContent>
            {Object.keys(data.deviationCounts).length === 0 ? (
              <p className="text-sm text-[var(--axis-text-tertiary)]">이탈 데이터 없음</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(data.deviationCounts)
                  .sort(([, a], [, b]) => b - a)
                  .map(([category, count]) => (
                    <div key={category} className="flex items-center justify-between">
                      <span className="text-sm text-[var(--axis-text-secondary)]">
                        {DEVIATION_LABELS[category] || category}
                      </span>
                      <span className="rounded-full bg-[var(--axis-surface-secondary)] px-2 py-0.5 text-xs font-medium text-[var(--axis-text-primary)]">
                        {count}건
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 최근 Shadow Runs */}
      <Card>
        <CardHeader>
          <CardTitle>최근 Shadow Runs ({data.recentCount}건)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.latestRuns.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--axis-text-tertiary)]">
              아직 Shadow Run 데이터가 없습니다. 채팅에서 &quot;run_shadow_comparison&quot; 도구를 사용해보세요.
            </p>
          ) : (
            <div className="space-y-3">
              {data.latestRuns.map((run) => (
                <ShadowRunCard key={run.id} run={run} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
