/**
 * Venture 전체 Analytics 페이지
 * /venture/analytics
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { Badge } from "~/components/ui/Badge";
import { listSprints } from "~/features/venture/repositories/sprint.repository";
import { getGlobalSnapshots } from "~/features/venture/repositories/analytics.repository";
import { VD_SPRINT_STATUS_CONFIG } from "~/features/venture/constants/sprint-status";
import type { VdSprintStatusType, VdAnalyticsData } from "~/features/venture/types";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const [sprints, globalSnapshots] = await Promise.all([
    listSprints(db),
    getGlobalSnapshots(db, undefined, 10),
  ]);

  // 스프린트별 요약 통계
  const sprintStats = sprints.map((sprint) => {
    const statusConfig = VD_SPRINT_STATUS_CONFIG[sprint.status as VdSprintStatusType];
    return {
      id: sprint.id,
      name: sprint.name,
      status: sprint.status,
      statusLabel: statusConfig?.label || sprint.status,
      statusVariant: statusConfig?.variant || "secondary",
      createdAt: sprint.createdAt,
      completedAt: sprint.completedAt,
    };
  });

  // 상태별 집계
  const statusCounts: Record<string, number> = {};
  for (const sprint of sprints) {
    statusCounts[sprint.status] = (statusCounts[sprint.status] || 0) + 1;
  }

  // 완료율
  const completedCount = sprints.filter((s) => s.status === "COMPLETED").length;
  const completionRate = sprints.length > 0 ? (completedCount / sprints.length) * 100 : 0;

  return json({
    user,
    sprintStats,
    statusCounts,
    completionRate,
    totalSprints: sprints.length,
    globalSnapshots,
  });
}

export default function VentureAnalytics() {
  const { user, sprintStats, statusCounts, completionRate, totalSprints, globalSnapshots } =
    useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-[var(--axis-surface-secondary)]">
      <MainNav user={user} />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* 헤더 */}
        <div className="mb-8">
          <nav className="mb-2 text-sm text-[var(--axis-text-tertiary)]">
            <Link to="/venture" className="hover:underline">
              Venture
            </Link>
            {" / "}
            <span className="text-[var(--axis-text-primary)]">Analytics</span>
          </nav>
          <h1 className="text-2xl font-bold text-[var(--axis-text-primary)]">
            전체 Analytics
          </h1>
          <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
            모든 스프린트의 통계 및 트렌드
          </p>
        </div>

        {/* 요약 카드 */}
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard
            title="전체 스프린트"
            value={totalSprints}
            description="생성된 스프린트 수"
          />
          <SummaryCard
            title="완료율"
            value={`${completionRate.toFixed(0)}%`}
            description="완료된 스프린트 비율"
            highlight={completionRate >= 50}
          />
          <SummaryCard
            title="진행중"
            value={
              (statusCounts["RUNNING"] || 0) +
              (statusCounts["GATE1_PENDING"] || 0) +
              (statusCounts["DEEPDIVE"] || 0) +
              (statusCounts["GATE2_PENDING"] || 0) +
              (statusCounts["PACKAGING"] || 0)
            }
            description="현재 진행 중인 스프린트"
          />
          <SummaryCard
            title="초안"
            value={statusCounts["DRAFT"] || 0}
            description="시작 대기 중"
          />
        </div>

        {/* 상태별 분포 */}
        <div className="mb-8 rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
          <h2 className="mb-4 font-semibold text-[var(--axis-text-primary)]">상태별 분포</h2>
          <div className="flex flex-wrap gap-3">
            {Object.entries(VD_SPRINT_STATUS_CONFIG).map(([status, config]) => {
              const count = statusCounts[status] || 0;
              return (
                <div
                  key={status}
                  className="flex items-center gap-2 rounded-md bg-[var(--axis-surface-secondary)] px-3 py-2"
                >
                  <Badge variant={config.variant}>{config.label}</Badge>
                  <span className="font-medium text-[var(--axis-text-primary)]">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 스프린트 목록 */}
        <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
          <h2 className="mb-4 font-semibold text-[var(--axis-text-primary)]">스프린트 현황</h2>
          {sprintStats.length === 0 ? (
            <p className="text-sm text-[var(--axis-text-tertiary)]">
              아직 생성된 스프린트가 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--axis-border-default)]">
                    <th className="py-2 text-left font-medium text-[var(--axis-text-tertiary)]">
                      이름
                    </th>
                    <th className="py-2 text-center font-medium text-[var(--axis-text-tertiary)]">
                      상태
                    </th>
                    <th className="py-2 text-center font-medium text-[var(--axis-text-tertiary)]">
                      생성일
                    </th>
                    <th className="py-2 text-center font-medium text-[var(--axis-text-tertiary)]">
                      완료일
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sprintStats.map((sprint) => (
                    <tr
                      key={sprint.id}
                      className="border-b border-[var(--axis-border-default)] last:border-0"
                    >
                      <td className="py-3">
                        <Link
                          to={`/venture/sprints/${sprint.id}/analytics`}
                          className="text-[var(--axis-text-brand)] hover:underline"
                        >
                          {sprint.name}
                        </Link>
                      </td>
                      <td className="py-3 text-center">
                        <Badge variant={sprint.statusVariant as "secondary"}>
                          {sprint.statusLabel}
                        </Badge>
                      </td>
                      <td className="py-3 text-center text-[var(--axis-text-tertiary)]">
                        {new Date(sprint.createdAt).toLocaleDateString("ko-KR")}
                      </td>
                      <td className="py-3 text-center text-[var(--axis-text-tertiary)]">
                        {sprint.completedAt
                          ? new Date(sprint.completedAt).toLocaleDateString("ko-KR")
                          : "-"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 최근 스냅샷 */}
        {globalSnapshots.length > 0 && (
          <div className="mt-8 rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
            <h2 className="mb-4 font-semibold text-[var(--axis-text-primary)]">최근 스냅샷</h2>
            <div className="space-y-2">
              {globalSnapshots.map((snapshot) => (
                <div
                  key={snapshot.id}
                  className="flex items-center justify-between rounded-md bg-[var(--axis-surface-secondary)] px-4 py-2"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{snapshot.snapshotType}</Badge>
                    <span className="text-sm text-[var(--axis-text-secondary)]">
                      {snapshot.sprintId ? `Sprint: ${snapshot.sprintId.slice(0, 8)}...` : "전체"}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--axis-text-tertiary)]">
                    {new Date(snapshot.createdAt).toLocaleString("ko-KR")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  description,
  highlight,
}: {
  title: string;
  value: number | string;
  description: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        highlight
          ? "border-[var(--axis-text-brand)] bg-[var(--axis-surface-brand-subtle)]"
          : "border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)]"
      }`}
    >
      <div className="text-sm text-[var(--axis-text-tertiary)]">{title}</div>
      <div
        className={`mt-1 text-3xl font-bold ${
          highlight
            ? "text-[var(--axis-text-brand)]"
            : "text-[var(--axis-text-primary)]"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-xs text-[var(--axis-text-tertiary)]">{description}</div>
    </div>
  );
}
