import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, experiments, evidence } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { DiscoveryStatus } from "~/db/schema";
import { StatusDonut } from "~/components/charts/StatusDonut";
import { WeeklyBar } from "~/components/charts/WeeklyBar";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  // Get all discoveries
  const allDiscoveries = await db.select().from(discoveries);

  // Calculate metrics
  const totalCount = allDiscoveries.length;
  const inboxCount = allDiscoveries.filter((d) => d.status === DiscoveryStatus.INBOX).length;
  const openCount = allDiscoveries.filter((d) => d.status === DiscoveryStatus.OPEN).length;
  const nextCount = allDiscoveries.filter((d) => d.status === DiscoveryStatus.NEXT).length;
  const notNowCount = allDiscoveries.filter((d) => d.status === DiscoveryStatus.NOT_NOW).length;
  const deadEndCount = allDiscoveries.filter((d) => d.status === DiscoveryStatus.DEAD_END).length;

  // Total decided (NEXT + NOT_NOW + DEAD_END)
  const decidedCount = nextCount + notNowCount + deadEndCount;

  // Conversion rate: (OPEN + Decided) / Total
  const nonInboxCount = totalCount - inboxCount;
  const seedToExperimentRate =
    totalCount > 0 ? ((nonInboxCount / totalCount) * 100).toFixed(1) : "0.0";

  // Completion rate: Decided / Total
  const completionRate = totalCount > 0 ? ((decidedCount / totalCount) * 100).toFixed(1) : "0.0";

  // 28-day closure rate (discoveries created more than 28 days ago)
  const twentyEightDaysAgo = new Date();
  twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

  const oldDiscoveries = allDiscoveries.filter(
    (d) => new Date(d.createdAt) <= twentyEightDaysAgo
  );
  const oldDecidedDiscoveries = oldDiscoveries.filter(
    (d) =>
      d.status === DiscoveryStatus.NEXT ||
      d.status === DiscoveryStatus.NOT_NOW ||
      d.status === DiscoveryStatus.DEAD_END
  );
  const twentyEightDayClosureRate =
    oldDiscoveries.length > 0
      ? ((oldDecidedDiscoveries.length / oldDiscoveries.length) * 100).toFixed(1)
      : "N/A";

  // Recall events (NOT_NOW with revisitDate in the past)
  const now = new Date();
  const recallEvents = allDiscoveries.filter(
    (d) =>
      d.status === DiscoveryStatus.NOT_NOW &&
      d.revisitDate &&
      new Date(d.revisitDate) <= now
  ).length;

  // Experiment stats
  const allExperiments = await db.select().from(experiments);
  const totalExperiments = allExperiments.length;
  const completedExperiments = allExperiments.filter((e) => e.completedAt !== null).length;
  const experimentCompletionRate =
    totalExperiments > 0 ? ((completedExperiments / totalExperiments) * 100).toFixed(1) : "0.0";

  // Evidence stats
  const allEvidence = await db.select().from(evidence);
  const totalEvidence = allEvidence.length;
  const strongEvidence = allEvidence.filter((e) => e.strength === "A" || e.strength === "B").length;

  // Weekly creation data (last 8 weeks)
  const weeklyData: { week: string; count: number }[] = [];
  for (let i = 7; i >= 0; i--) {
    const weekStart = new Date();
    weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() - i * 7);
    weekEnd.setHours(0, 0, 0, 0);

    const weekCount = allDiscoveries.filter((d) => {
      const created = new Date(d.createdAt);
      return created >= weekStart && created < weekEnd;
    }).length;

    const label = `${(weekStart.getMonth() + 1).toString().padStart(2, "0")}/${weekStart.getDate().toString().padStart(2, "0")}`;
    weeklyData.push({ week: label, count: weekCount });
  }

  return json({
    user,
    metrics: {
      totalCount,
      inboxCount,
      openCount,
      nextCount,
      notNowCount,
      deadEndCount,
      decidedCount,
      seedToExperimentRate,
      completionRate,
      twentyEightDayClosureRate,
      recallEvents,
      totalExperiments,
      completedExperiments,
      experimentCompletionRate,
      totalEvidence,
      strongEvidence,
      weeklyData,
    },
  });
}

export default function Metrics() {
  const { user, metrics } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav user={user} />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="sm:flex sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Metrics</h1>
            <p className="mt-2 text-sm text-gray-700">
              Discovery-X 운영 지표 및 성공 기준 추적
            </p>
          </div>
          <div className="mt-4 sm:mt-0 flex gap-2">
            <Link
              to="/api/export/discoveries"
              className="inline-flex items-center rounded-md bg-white px-4 py-2 text-sm font-semibold text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              📥 Discovery CSV
            </Link>
            <Link
              to="/api/export/metrics"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              📊 Metrics CSV
            </Link>
          </div>
        </div>

        {/* P0 Success Criterion */}
        <div className="mt-8 rounded-lg border-2 border-green-200 bg-green-50 p-6">
          <h2 className="text-lg font-semibold text-green-900">
            ✅ P0 성공 기준: "닫힌 Discovery 최소 1건 발생"
          </h2>
          <div className="mt-4 text-3xl font-bold text-green-700">
            {metrics.decidedCount}건 닫힘
          </div>
          <div className="mt-2 text-sm text-green-800">
            NEXT: {metrics.nextCount} | NOT_NOW: {metrics.notNowCount} | DEAD_END:{" "}
            {metrics.deadEndCount}
          </div>
          {metrics.decidedCount === 0 && (
            <div className="mt-4 text-sm text-yellow-700">
              ⚠️ 아직 닫힌 Discovery가 없습니다. 운영 실험을 시작하세요!
            </div>
          )}
        </div>

        {/* Key Metrics Grid */}
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total Discoveries */}
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="text-sm font-medium text-gray-500">전체 Discovery</div>
            <div className="mt-2 text-3xl font-semibold text-gray-900">{metrics.totalCount}</div>
            <div className="mt-2 text-xs text-gray-500">
              Inbox: {metrics.inboxCount} | Open: {metrics.openCount}
            </div>
          </div>

          {/* Seed → Experiment Conversion */}
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="text-sm font-medium text-gray-500">Seed → Experiment 전환율</div>
            <div className="mt-2 text-3xl font-semibold text-gray-900">
              {metrics.seedToExperimentRate}%
            </div>
            <div className="mt-2 text-xs text-gray-500">
              {metrics.totalCount - metrics.inboxCount} / {metrics.totalCount}
            </div>
          </div>

          {/* 28-day Closure Rate */}
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="text-sm font-medium text-gray-500">28일 종료율</div>
            <div className="mt-2 text-3xl font-semibold text-gray-900">
              {metrics.twentyEightDayClosureRate}
              {metrics.twentyEightDayClosureRate !== "N/A" && "%"}
            </div>
            <div className="mt-2 text-xs text-gray-500">목표: ≥90%</div>
          </div>

          {/* Recall Events */}
          <div className="rounded-lg bg-white p-6 shadow">
            <div className="text-sm font-medium text-gray-500">Recall 이벤트</div>
            <div className="mt-2 text-3xl font-semibold text-gray-900">
              {metrics.recallEvents}
            </div>
            <div className="mt-2 text-xs text-gray-500">목표: ≥1/월</div>
          </div>
        </div>

        {/* Charts */}
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">상태 분포</h3>
            <StatusDonut
              inbox={metrics.inboxCount}
              open={metrics.openCount}
              next={metrics.nextCount}
              notNow={metrics.notNowCount}
              deadEnd={metrics.deadEndCount}
            />
          </div>
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">주간 생성 추이</h3>
            <WeeklyBar data={metrics.weeklyData} />
          </div>
        </div>

        {/* Experiment & Evidence Stats */}
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {/* Experiment Stats */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-semibold text-gray-900">Experiment 통계</h3>
            <dl className="mt-4 space-y-2">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">전체 실험</dt>
                <dd className="text-sm font-semibold text-gray-900">{metrics.totalExperiments}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">완료된 실험</dt>
                <dd className="text-sm font-semibold text-gray-900">
                  {metrics.completedExperiments}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">완료율</dt>
                <dd className="text-sm font-semibold text-gray-900">
                  {metrics.experimentCompletionRate}%
                </dd>
              </div>
              <div className="mt-2 text-xs text-gray-500">목표: ≥80%</div>
            </dl>
          </div>

          {/* Evidence Stats */}
          <div className="rounded-lg bg-white p-6 shadow">
            <h3 className="text-lg font-semibold text-gray-900">Evidence 통계</h3>
            <dl className="mt-4 space-y-2">
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">전체 근거</dt>
                <dd className="text-sm font-semibold text-gray-900">{metrics.totalEvidence}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">강한 근거 (A/B급)</dt>
                <dd className="text-sm font-semibold text-gray-900">{metrics.strongEvidence}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-gray-500">비율</dt>
                <dd className="text-sm font-semibold text-gray-900">
                  {metrics.totalEvidence > 0
                    ? ((metrics.strongEvidence / metrics.totalEvidence) * 100).toFixed(1)
                    : 0}
                  %
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Success Criteria Reference */}
        <div className="mt-8 rounded-lg border border-gray-200 bg-white p-6 shadow">
          <h3 className="text-lg font-semibold text-gray-900">운영 실험 성공 기준 (PRD §10)</h3>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-sm font-medium text-gray-700">P0 (필수)</dt>
              <dd className="mt-1 text-sm text-gray-600">
                닫힌 Discovery ≥1건 (현재: {metrics.decidedCount}건)
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-gray-700">P1 (목표)</dt>
              <dd className="mt-1 text-sm text-gray-600">
                • 28일 종료율 ≥90% (현재: {metrics.twentyEightDayClosureRate}
                {metrics.twentyEightDayClosureRate !== "N/A" && "%"})
                <br />
                • Experiment 완료율 ≥80% (현재: {metrics.experimentCompletionRate}%)
                <br />• Recall 이벤트 ≥1/월 (현재: {metrics.recallEvents}건)
              </dd>
            </div>
          </dl>
        </div>

        {/* Export Info */}
        <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 className="text-sm font-medium text-blue-900">📥 데이터 Export</h3>
          <p className="mt-2 text-sm text-blue-800">
            상단의 "Discovery CSV" 버튼을 클릭하여 모든 Discovery 데이터를 다운로드하거나, "Metrics
            CSV" 버튼으로 집계된 지표를 다운로드할 수 있습니다. 운영 실험 종료 시 분석에 활용하세요.
          </p>
        </div>
      </div>
    </div>
  );
}
