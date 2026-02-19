/**
 * /dashboard/ops-metrics — v1.4 §10 운영 지표 대시보드
 * 30~60일 운영 실험 성공 기준 추적
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, experiments, users } from "~/db/schema";
import { DiscoveryStatus } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { tenantWhere } from "~/lib/query/tenant-scope";
import { inArray } from "drizzle-orm";
import { FAILURE_PATTERNS } from "~/lib/constants/failure-patterns";
import { PageHeader } from "~/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { MetricCard } from "~/components/dashboard/MetricCard";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "~/components/ui/Table";

const CLOSED_STATUSES = [
  DiscoveryStatus.HANDOFF,
  DiscoveryStatus.HOLD,
  DiscoveryStatus.DROP,
] as const;

const BEYOND_SEED_STATUSES = [
  DiscoveryStatus.IDEA_CARD,
  DiscoveryStatus.HYPOTHESIS,
  DiscoveryStatus.EXPERIMENT,
  DiscoveryStatus.EVIDENCE_REVIEW,
  DiscoveryStatus.GATE1,
  DiscoveryStatus.SPRINT,
  DiscoveryStatus.GATE2,
  DiscoveryStatus.HANDOFF,
  DiscoveryStatus.HOLD,
  DiscoveryStatus.DROP,
] as const;

const patternLabelMap = Object.fromEntries(
  FAILURE_PATTERNS.map((p) => [p.id, p.label])
);

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return json({ metrics: null });

  const allDiscoveries = await db
    .select()
    .from(discoveries)
    .where(tenantWhere(discoveries, ctx.tenantId));
  const discoveryIds = allDiscoveries.map((d) => d.id);
  const allExperiments =
    discoveryIds.length > 0
      ? await db
          .select()
          .from(experiments)
          .where(inArray(experiments.discoveryId, discoveryIds))
      : [];
  const allUsers = await db.select().from(users);
  const userNameMap: Record<string, string> = {};
  for (const u of allUsers) {
    userNameMap[u.id] = u.name;
  }

  const now = Date.now();
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  const twentyEightDaysMs = 28 * 24 * 60 * 60 * 1000;

  // 1. 전체 + 상태별 분포
  const totalCount = allDiscoveries.length;
  const statusCounts: Record<string, number> = {};
  for (const d of allDiscoveries) {
    statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
  }

  // 2. 닫힌 Discovery (HANDOFF + HOLD + DROP)
  const closedDiscoveries = allDiscoveries.filter((d) =>
    (CLOSED_STATUSES as readonly string[]).includes(d.status)
  );
  const closedCount = closedDiscoveries.length;
  const handoffCount = statusCounts[DiscoveryStatus.HANDOFF] || 0;
  const holdCount = statusCounts[DiscoveryStatus.HOLD] || 0;
  const dropCount = statusCounts[DiscoveryStatus.DROP] || 0;

  // 3. Seed → Experiment 전환율
  const beyondSeedCount = allDiscoveries.filter((d) =>
    (BEYOND_SEED_STATUSES as readonly string[]).includes(d.status)
  ).length;
  const seedToExperimentRate =
    totalCount > 0
      ? ((beyondSeedCount / totalCount) * 100).toFixed(1)
      : "0.0";

  // 4. Experiment 완료율
  const totalExperiments = allExperiments.length;
  const completedExperiments = allExperiments.filter(
    (e) => e.completedAt
  ).length;
  const experimentCompletionRate =
    totalExperiments > 0
      ? ((completedExperiments / totalExperiments) * 100).toFixed(1)
      : "0.0";

  // 5. 14일 내 종료율
  const oldFourteenDays = allDiscoveries.filter((d) => {
    const created =
      d.createdAt instanceof Date ? d.createdAt.getTime() : Number(d.createdAt) * 1000;
    return now - created >= fourteenDaysMs;
  });
  const closedFourteenDays = oldFourteenDays.filter((d) => {
    if (!(CLOSED_STATUSES as readonly string[]).includes(d.status)) return false;
    if (!d.decidedAt) return false;
    const created =
      d.createdAt instanceof Date ? d.createdAt.getTime() : Number(d.createdAt) * 1000;
    const decided =
      d.decidedAt instanceof Date ? d.decidedAt.getTime() : Number(d.decidedAt) * 1000;
    return decided - created <= fourteenDaysMs;
  });
  const fourteenDayClosureRate =
    oldFourteenDays.length > 0
      ? ((closedFourteenDays.length / oldFourteenDays.length) * 100).toFixed(1)
      : "N/A";

  // 6. 28일 내 종료율
  const oldTwentyEightDays = allDiscoveries.filter((d) => {
    const created =
      d.createdAt instanceof Date ? d.createdAt.getTime() : Number(d.createdAt) * 1000;
    return now - created >= twentyEightDaysMs;
  });
  const closedTwentyEightDays = oldTwentyEightDays.filter((d) => {
    if (!(CLOSED_STATUSES as readonly string[]).includes(d.status)) return false;
    if (!d.decidedAt) return false;
    const created =
      d.createdAt instanceof Date ? d.createdAt.getTime() : Number(d.createdAt) * 1000;
    const decided =
      d.decidedAt instanceof Date ? d.decidedAt.getTime() : Number(d.decidedAt) * 1000;
    return decided - created <= twentyEightDaysMs;
  });
  const twentyEightDayClosureRate =
    oldTwentyEightDays.length > 0
      ? (
          (closedTwentyEightDays.length / oldTwentyEightDays.length) *
          100
        ).toFixed(1)
      : "N/A";

  // 7. Dead End 비율
  const deadEndRate =
    closedCount > 0
      ? ((dropCount / closedCount) * 100).toFixed(1)
      : "0.0";

  // 8. Recall 이벤트
  const recallEvents = allDiscoveries.filter(
    (d) =>
      d.status === DiscoveryStatus.HOLD &&
      d.revisitDate &&
      (d.revisitDate instanceof Date
        ? d.revisitDate.getTime()
        : Number(d.revisitDate) * 1000) <= now
  ).length;

  // 9. Failure Pattern 분포
  const patternCounts: Record<string, number> = {};
  for (const d of allDiscoveries) {
    if (d.status !== DiscoveryStatus.DROP) continue;
    const patterns = d.deadEndFailurePattern as string[] | null;
    if (!patterns) continue;
    for (const p of patterns) {
      patternCounts[p] = (patternCounts[p] || 0) + 1;
    }
  }
  const failurePatternTop5 = Object.entries(patternCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => ({
      id,
      label: patternLabelMap[id] || id,
      count,
    }));
  const failurePatternMax = failurePatternTop5.length > 0
    ? failurePatternTop5[0].count
    : 0;

  // 10. 평균 결정 소요일
  const decidedDiscoveries = closedDiscoveries.filter((d) => d.decidedAt);
  const decisionDays = decidedDiscoveries.map((d) => {
    const created =
      d.createdAt instanceof Date ? d.createdAt.getTime() : Number(d.createdAt) * 1000;
    const decided =
      d.decidedAt instanceof Date
        ? d.decidedAt.getTime()
        : Number(d.decidedAt!) * 1000;
    return (decided - created) / (1000 * 60 * 60 * 24);
  });
  const avgDecisionDays =
    decisionDays.length > 0
      ? (
          decisionDays.reduce((a, b) => a + b, 0) / decisionDays.length
        ).toFixed(1)
      : "N/A";
  const medianDecisionDays =
    decisionDays.length > 0
      ? (() => {
          const sorted = [...decisionDays].sort((a, b) => a - b);
          const mid = Math.floor(sorted.length / 2);
          return sorted.length % 2 !== 0
            ? sorted[mid].toFixed(1)
            : ((sorted[mid - 1] + sorted[mid]) / 2).toFixed(1);
        })()
      : "N/A";

  // 11. 주간 닫힘 추이 (8주)
  const weeklyClosedData: { week: string; count: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() - i * 7);
    weekEnd.setHours(0, 0, 0, 0);

    const count = closedDiscoveries.filter((d) => {
      if (!d.decidedAt) return false;
      const decided =
        d.decidedAt instanceof Date
          ? d.decidedAt
          : new Date(Number(d.decidedAt) * 1000);
      return decided >= weekStart && decided < weekEnd;
    }).length;

    const label = `${(weekStart.getMonth() + 1).toString().padStart(2, "0")}/${weekStart.getDate().toString().padStart(2, "0")}`;
    weeklyClosedData.push({ week: label, count });
  }
  const weeklyClosedMax = Math.max(...weeklyClosedData.map((w) => w.count), 1);

  // Owner별 성과
  const ownerStats: Record<
    string,
    { total: number; active: number; closed: number }
  > = {};
  for (const d of allDiscoveries) {
    if (!d.ownerId) continue;
    if (!ownerStats[d.ownerId]) {
      ownerStats[d.ownerId] = { total: 0, active: 0, closed: 0 };
    }
    ownerStats[d.ownerId].total++;
    if ((CLOSED_STATUSES as readonly string[]).includes(d.status)) {
      ownerStats[d.ownerId].closed++;
    } else if (d.status !== DiscoveryStatus.DISCOVERY) {
      ownerStats[d.ownerId].active++;
    }
  }
  const ownerPerformance = Object.entries(ownerStats)
    .map(([id, stats]) => ({
      name: userNameMap[id] || id.slice(0, 8),
      total: stats.total,
      active: stats.active,
      closed: stats.closed,
      completionRate:
        stats.total > 0
          ? ((stats.closed / stats.total) * 100).toFixed(1)
          : "0.0",
    }))
    .sort((a, b) => b.total - a.total);

  return json({
    metrics: {
      totalCount,
      statusCounts,
      closedCount,
      handoffCount,
      holdCount,
      dropCount,
      seedToExperimentRate,
      totalExperiments,
      completedExperiments,
      experimentCompletionRate,
      fourteenDayClosureRate,
      twentyEightDayClosureRate,
      deadEndRate,
      recallEvents,
      failurePatternTop5,
      failurePatternMax,
      failurePatternUniqueCount: Object.keys(patternCounts).length,
      avgDecisionDays,
      medianDecisionDays,
      weeklyClosedData,
      weeklyClosedMax,
      ownerPerformance,
    },
  });
}

interface FailurePatternItem {
  id: string;
  label: string;
  count: number;
}

interface OwnerPerformanceItem {
  name: string;
  total: number;
  active: number;
  closed: number;
  completionRate: string;
}

interface WeeklyItem {
  week: string;
  count: number;
}

export default function DashboardOpsMetrics() {
  const { metrics } = useLoaderData<typeof loader>();

  if (!metrics) return null;

  const p0Met = metrics.closedCount >= 1;
  const twentyEightMet =
    metrics.twentyEightDayClosureRate !== "N/A" &&
    Number(metrics.twentyEightDayClosureRate) >= 90;
  const expMet = Number(metrics.experimentCompletionRate) >= 80;
  const recallMet = metrics.recallEvents >= 1;
  const avgDaysMet =
    metrics.avgDecisionDays !== "N/A" &&
    Number(metrics.avgDecisionDays) <= 28;

  return (
    <div>
      <PageHeader
        title="운영 지표"
        description="v1.4 성공 기준 추적 (30~60일 운영 실험)"
        breadcrumbs={[
          { label: "대시보드", to: "/dashboard" },
          { label: "운영 지표" },
        ]}
      />

      {/* P0 성공 기준 배너 */}
      <AlertBanner
        variant={p0Met ? "success" : "destructive"}
        title="P0 성공 기준: 닫힌 Discovery ≥ 1건"
      >
        <div className="mt-2 flex items-baseline gap-3">
          <span className="text-3xl font-bold">{metrics.closedCount}건</span>
          <span className="text-sm">
            HANDOFF {metrics.handoffCount} · HOLD {metrics.holdCount} · DROP{" "}
            {metrics.dropCount}
          </span>
        </div>
        {!p0Met && (
          <p className="mt-2 text-sm opacity-80">
            아직 닫힌 Discovery가 없습니다. 운영 실험을 시작하세요.
          </p>
        )}
      </AlertBanner>

      {/* 핵심 지표 4개 카드 */}
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <MetricCard
          label="28일 종료율"
          value={
            metrics.twentyEightDayClosureRate === "N/A"
              ? "N/A"
              : `${metrics.twentyEightDayClosureRate}%`
          }
          subtext="목표: ≥90%"
          accentColor={
            twentyEightMet
              ? "var(--axis-badge-success-text)"
              : "var(--axis-badge-warning-text)"
          }
          delay={0}
        />
        <MetricCard
          label="Experiment 완료율"
          value={`${metrics.experimentCompletionRate}%`}
          subtext={`${metrics.completedExperiments}/${metrics.totalExperiments} · 목표: ≥80%`}
          accentColor={
            expMet
              ? "var(--axis-badge-success-text)"
              : "var(--axis-badge-warning-text)"
          }
          delay={80}
        />
        <MetricCard
          label="Recall 이벤트"
          value={`${metrics.recallEvents}건`}
          subtext="목표: ≥1/월"
          accentColor={
            recallMet
              ? "var(--axis-badge-success-text)"
              : "var(--axis-badge-warning-text)"
          }
          delay={160}
        />
        <MetricCard
          label="평균 결정 소요일"
          value={
            metrics.avgDecisionDays === "N/A"
              ? "N/A"
              : `${metrics.avgDecisionDays}일`
          }
          subtext={`중앙값: ${metrics.medianDecisionDays === "N/A" ? "N/A" : `${metrics.medianDecisionDays}일`} · 목표: ≤28일`}
          accentColor={
            avgDaysMet
              ? "var(--axis-badge-success-text)"
              : "var(--axis-badge-warning-text)"
          }
          delay={240}
        />
      </div>

      {/* 세부 지표 */}
      <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-[var(--axis-text-tertiary)]">
              Seed → Experiment 전환율
            </p>
            <p className="mt-1 text-2xl font-bold text-[var(--axis-text-primary)]">
              {metrics.seedToExperimentRate}%
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--axis-text-tertiary)]">
              {metrics.totalCount - (metrics.statusCounts[DiscoveryStatus.DISCOVERY] || 0)}/
              {metrics.totalCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-[var(--axis-text-tertiary)]">
              Dead End 비율
            </p>
            <p className="mt-1 text-2xl font-bold text-[var(--axis-text-primary)]">
              {metrics.deadEndRate}%
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--axis-text-tertiary)]">
              DROP {metrics.dropCount} / 닫힘 {metrics.closedCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-[var(--axis-text-tertiary)]">
              14일 종료율
            </p>
            <p className="mt-1 text-2xl font-bold text-[var(--axis-text-primary)]">
              {metrics.fourteenDayClosureRate === "N/A"
                ? "N/A"
                : `${metrics.fourteenDayClosureRate}%`}
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--axis-text-tertiary)]">
              생성 14일+ 경과 Discovery 기준
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-[var(--axis-text-tertiary)]">
              Failure Pattern 종류
            </p>
            <p className="mt-1 text-2xl font-bold text-[var(--axis-text-primary)]">
              {metrics.failurePatternUniqueCount}종
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--axis-text-tertiary)]">
              DROP Discovery에서 태깅됨
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Failure Pattern Top 5 + 주간 닫힘 추이 */}
      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Failure Pattern Top 5 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Failure Pattern Top 5</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.failurePatternTop5.length === 0 ? (
              <p className="text-sm text-[var(--axis-text-tertiary)]">
                아직 DROP된 Discovery가 없습니다.
              </p>
            ) : (
              <div className="space-y-3">
                {(metrics.failurePatternTop5 as FailurePatternItem[]).map(
                  (fp) => (
                    <div key={fp.id}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-[var(--axis-text-secondary)]">
                          {fp.label}
                        </span>
                        <Badge variant="secondary">{fp.count}건</Badge>
                      </div>
                      <div className="h-2 rounded-full bg-[var(--axis-surface-tertiary)]">
                        <div
                          className="h-2 rounded-full transition-all"
                          style={{
                            width: `${metrics.failurePatternMax > 0 ? (fp.count / metrics.failurePatternMax) * 100 : 0}%`,
                            backgroundColor: "var(--axis-text-error)",
                          }}
                        />
                      </div>
                    </div>
                  )
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* 주간 닫힘 추이 (8주) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">주간 닫힘 추이 (8주)</CardTitle>
          </CardHeader>
          <CardContent>
            {metrics.weeklyClosedData.every(
              (w: WeeklyItem) => w.count === 0
            ) ? (
              <p className="text-sm text-[var(--axis-text-tertiary)]">
                아직 닫힌 Discovery가 없습니다.
              </p>
            ) : (
              <div className="flex items-end gap-1" style={{ height: 120 }}>
                {(metrics.weeklyClosedData as WeeklyItem[]).map((w) => (
                  <div
                    key={w.week}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <span className="text-[10px] font-medium text-[var(--axis-text-primary)]">
                      {w.count > 0 ? w.count : ""}
                    </span>
                    <div
                      className="w-full rounded-t"
                      style={{
                        height: `${(w.count / metrics.weeklyClosedMax) * 80}px`,
                        minHeight: w.count > 0 ? 4 : 0,
                        backgroundColor:
                          w.count > 0
                            ? "var(--axis-badge-success-text)"
                            : "var(--axis-surface-tertiary)",
                      }}
                    />
                    <span className="text-[9px] text-[var(--axis-text-tertiary)]">
                      {w.week}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Owner별 성과 */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Owner별 성과</CardTitle>
        </CardHeader>
        <CardContent>
          {metrics.ownerPerformance.length === 0 ? (
            <p className="text-sm text-[var(--axis-text-tertiary)]">
              Owner가 지정된 Discovery가 없습니다.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">전체</TableHead>
                  <TableHead className="text-right">활성</TableHead>
                  <TableHead className="text-right">닫힘</TableHead>
                  <TableHead className="text-right">완료율</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(metrics.ownerPerformance as OwnerPerformanceItem[]).map(
                  (o) => (
                    <TableRow key={o.name}>
                      <TableCell className="font-medium text-[var(--axis-text-primary)]">
                        {o.name}
                      </TableCell>
                      <TableCell className="text-right">{o.total}</TableCell>
                      <TableCell className="text-right text-[var(--axis-badge-warning-text)]">
                        {o.active}
                      </TableCell>
                      <TableCell className="text-right text-[var(--axis-badge-success-text)]">
                        {o.closed}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-[var(--axis-text-primary)]">
                        {o.completionRate}%
                      </TableCell>
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 성공 기준 요약 */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">
            v1.4 §10 성공 기준 체크리스트
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <CheckItem
              met={p0Met}
              label="P0: 닫힌 Discovery ≥ 1건"
              current={`${metrics.closedCount}건`}
            />
            <CheckItem
              met={twentyEightMet}
              label="28일 내 Decision 종료율 ≥ 90%"
              current={
                metrics.twentyEightDayClosureRate === "N/A"
                  ? "데이터 부족"
                  : `${metrics.twentyEightDayClosureRate}%`
              }
            />
            <CheckItem
              met={expMet}
              label="Experiment 완료율 ≥ 80%"
              current={`${metrics.experimentCompletionRate}%`}
            />
            <CheckItem
              met={recallMet}
              label="재호출 이벤트 ≥ 1/월"
              current={`${metrics.recallEvents}건`}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CheckItem({
  met,
  label,
  current,
}: {
  met: boolean;
  label: string;
  current: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-xs font-bold text-white"
        style={{
          backgroundColor: met
            ? "var(--axis-badge-success-text)"
            : "var(--axis-text-tertiary)",
        }}
      >
        {met ? "\u2713" : "\u2013"}
      </span>
      <span className="text-[var(--axis-text-secondary)]">{label}</span>
      <span className="ml-auto font-medium text-[var(--axis-text-primary)]">
        {current}
      </span>
    </div>
  );
}
