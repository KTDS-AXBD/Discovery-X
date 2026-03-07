import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MetricsService } from "~/features/dashboard/service";
import { AppShell } from "~/components/layout/AppShell";
import { PageHeader } from "~/components/layout/PageHeader";
import { Card, CardContent } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { StatusDonut } from "~/components/charts/StatusDonut";
import { WeeklyBar } from "~/components/charts/WeeklyBar";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const metrics = await new MetricsService(db).getOperationalMetrics();
  return json({ user, metrics });
}

export default function Metrics() {
  const { user, metrics } = useLoaderData<typeof loader>();

  return (
    <AppShell user={user}>
      <PageHeader
        title="Metrics"
        description="Discovery-X 운영 지표 및 성공 기준 추적"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/api/export/discoveries">Discovery CSV</Link>
            </Button>
            <Button asChild>
              <Link to="/api/export/metrics">Metrics CSV</Link>
            </Button>
          </div>
        }
      />

      {/* P0 Success Criterion */}
      <AlertBanner variant="success" className="mt-8" title="P0 성공 기준: &quot;닫힌 Discovery 최소 1건 발생&quot;">
        <div className="mt-2 text-3xl font-bold">
          {metrics.decidedCount}건 닫힘
        </div>
        <div className="mt-2 text-sm">
          NEXT: {metrics.nextCount} | NOT_NOW: {metrics.notNowCount} | DEAD_END:{" "}
          {metrics.deadEndCount}
        </div>
        {metrics.decidedCount === 0 && (
          <AlertBanner variant="warning" className="mt-4">
            아직 닫힌 Discovery가 없습니다. 운영 실험을 시작하세요!
          </AlertBanner>
        )}
      </AlertBanner>

      {/* Key Metrics Grid */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-6">
            <div className="text-sm font-medium text-fg-tertiary">전체 Discovery</div>
            <div className="mt-2 text-3xl font-semibold text-fg">{metrics.totalCount}</div>
            <div className="mt-2 text-xs text-fg-tertiary">
              Inbox: {metrics.inboxCount} | Open: {metrics.openCount}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="text-sm font-medium text-fg-tertiary">Seed → Experiment 전환율</div>
            <div className="mt-2 text-3xl font-semibold text-fg">
              {metrics.seedToExperimentRate}%
            </div>
            <div className="mt-2 text-xs text-fg-tertiary">
              {metrics.totalCount - metrics.inboxCount} / {metrics.totalCount}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="text-sm font-medium text-fg-tertiary">28일 종료율</div>
            <div className="mt-2 text-3xl font-semibold text-fg">
              {metrics.twentyEightDayClosureRate}
              {metrics.twentyEightDayClosureRate !== "N/A" && "%"}
            </div>
            <div className="mt-2 text-xs text-fg-tertiary">목표: ≥90%</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="text-sm font-medium text-fg-tertiary">Recall 이벤트</div>
            <div className="mt-2 text-3xl font-semibold text-fg">
              {metrics.recallEvents}
            </div>
            <div className="mt-2 text-xs text-fg-tertiary">목표: ≥1/월</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <h3 className="mb-4 text-lg font-semibold text-fg">상태 분포</h3>
            <StatusDonut
              inbox={metrics.inboxCount}
              open={metrics.openCount}
              next={metrics.nextCount}
              notNow={metrics.notNowCount}
              deadEnd={metrics.deadEndCount}
            />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <h3 className="mb-4 text-lg font-semibold text-fg">주간 생성 추이</h3>
            <WeeklyBar data={metrics.weeklyData} />
          </CardContent>
        </Card>
      </div>

      {/* Experiment & Evidence Stats */}
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-fg">Experiment 통계</h3>
            <dl className="mt-4 space-y-2">
              <div className="flex justify-between">
                <dt className="text-sm text-fg-tertiary">전체 실험</dt>
                <dd className="text-sm font-semibold text-fg">{metrics.totalExperiments}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-fg-tertiary">완료된 실험</dt>
                <dd className="text-sm font-semibold text-fg">
                  {metrics.completedExperiments}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-fg-tertiary">완료율</dt>
                <dd className="text-sm font-semibold text-fg">
                  {metrics.experimentCompletionRate}%
                </dd>
              </div>
              <div className="mt-2 text-xs text-fg-tertiary">목표: ≥80%</div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-fg">Evidence 통계</h3>
            <dl className="mt-4 space-y-2">
              <div className="flex justify-between">
                <dt className="text-sm text-fg-tertiary">전체 근거</dt>
                <dd className="text-sm font-semibold text-fg">{metrics.totalEvidence}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-fg-tertiary">강한 근거 (A/B급)</dt>
                <dd className="text-sm font-semibold text-fg">{metrics.strongEvidence}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-fg-tertiary">비율</dt>
                <dd className="text-sm font-semibold text-fg">
                  {metrics.totalEvidence > 0
                    ? ((metrics.strongEvidence / metrics.totalEvidence) * 100).toFixed(1)
                    : 0}
                  %
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {/* Advanced Metrics */}
      <div className="mt-8">
        <h2 className="text-xl font-bold text-fg mb-6">고급 지표</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardContent className="p-6">
              <div className="text-sm font-medium text-fg-tertiary">실패 패턴 재사용률</div>
              <div className="mt-2 text-3xl font-semibold text-fg">
                {metrics.failurePatternReuseRate}
                {metrics.failurePatternReuseRate !== "N/A" && "%"}
              </div>
              <div className="mt-2 text-xs text-fg-tertiary">동일 패턴 2회+ 발생 비율</div>
              {metrics.topReusedPatterns.length > 0 && (
                <div className="mt-3 space-y-1">
                  {metrics.topReusedPatterns.map((p: { pattern: string; count: number }) => (
                    <div key={p.pattern} className="flex justify-between text-xs">
                      <span className="text-fg-secondary">{p.pattern}</span>
                      <span className="font-semibold text-fg-error">{p.count}회</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="text-sm font-medium text-fg-tertiary">Evidence 품질 점수</div>
              <div className="mt-2 text-3xl font-semibold text-fg">
                {metrics.avgEvidenceQuality}
                {metrics.avgEvidenceQuality !== "N/A" && "%"}
              </div>
              <div className="mt-2 text-xs text-fg-tertiary">
                Discovery당 A/B급 근거 비율 평균
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="text-sm font-medium text-fg-tertiary">결정 속도</div>
              <div className="mt-2 text-3xl font-semibold text-fg">
                {metrics.avgDecisionDays}
                {metrics.avgDecisionDays !== "N/A" && "일"}
              </div>
              <div className="mt-2 text-xs text-fg-tertiary">
                평균 (중앙값: {metrics.medianDecisionDays}
                {metrics.medianDecisionDays !== "N/A" && "일"})
              </div>
              <div className="mt-1 text-xs text-fg-tertiary">목표: ≤28일</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="text-sm font-medium text-fg-tertiary">연장 요청률</div>
              <div className="mt-2 text-3xl font-semibold text-fg">
                {metrics.extensionRequestRate}
                {metrics.extensionRequestRate !== "N/A" && "%"}
              </div>
              <div className="mt-2 text-xs text-fg-tertiary">
                총 {metrics.totalExtensionRequests}건 | 목표: &lt;20%
              </div>
            </CardContent>
          </Card>

          <Card className="sm:col-span-2">
            <CardContent className="p-6">
              <div className="text-sm font-medium text-fg-tertiary mb-3">Owner별 워크로드</div>
              {metrics.ownerWorkload.length === 0 ? (
                <p className="text-sm text-fg-tertiary">데이터 없음</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b border-line">
                        <th scope="col" className="pb-2 text-left font-medium text-fg-tertiary">Owner</th>
                        <th scope="col" className="pb-2 text-right font-medium text-fg-tertiary">전체</th>
                        <th scope="col" className="pb-2 text-right font-medium text-fg-tertiary">진행중</th>
                        <th scope="col" className="pb-2 text-right font-medium text-fg-tertiary">완료</th>
                        <th scope="col" className="pb-2 text-right font-medium text-fg-tertiary">완료율</th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.ownerWorkload.map((o: { name: string; total: number; active: number; decided: number; completionRate: string }) => (
                        <tr key={o.name} className="border-b border-line-secondary">
                          <td className="py-2 font-medium text-fg">{o.name}</td>
                          <td className="py-2 text-right text-fg-secondary">{o.total}</td>
                          <td className="py-2 text-right text-badge-warning-text">{o.active}</td>
                          <td className="py-2 text-right text-badge-success-text">{o.decided}</td>
                          <td className="py-2 text-right font-semibold text-fg">
                            {o.completionRate}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Success Criteria Reference */}
      <Card className="mt-8">
        <CardContent className="p-6">
          <h3 className="text-lg font-semibold text-fg">운영 실험 성공 기준 (PRD §10)</h3>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="text-sm font-medium text-fg-secondary">P0 (필수)</dt>
              <dd className="mt-1 text-sm text-fg-tertiary">
                닫힌 Discovery ≥1건 (현재: {metrics.decidedCount}건)
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-fg-secondary">P1 (목표)</dt>
              <dd className="mt-1 text-sm text-fg-tertiary">
                • 28일 종료율 ≥90% (현재: {metrics.twentyEightDayClosureRate}
                {metrics.twentyEightDayClosureRate !== "N/A" && "%"})
                <br />
                • Experiment 완료율 ≥80% (현재: {metrics.experimentCompletionRate}%)
                <br />• Recall 이벤트 ≥1/월 (현재: {metrics.recallEvents}건)
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Export Info */}
      <AlertBanner variant="info" className="mt-6" title="데이터 Export">
        <p className="mt-2 text-sm">
          상단의 "Discovery CSV" 버튼을 클릭하여 모든 Discovery 데이터를 다운로드하거나, "Metrics
          CSV" 버튼으로 집계된 지표를 다운로드할 수 있습니다. 운영 실험 종료 시 분석에 활용하세요.
        </p>
      </AlertBanner>
    </AppShell>
  );
}
