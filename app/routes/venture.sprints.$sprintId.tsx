/**
 * Venture Sprint 상세 레이아웃
 * /venture/sprints/:sprintId
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, Outlet, useLoaderData, useLocation, useParams } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { Badge } from "~/components/ui/Badge";
import { cn } from "~/lib/utils/cn";
import { getSprintById, getSprintScopes } from "~/features/venture/repositories/sprint.repository";
import {
  getOpportunityCount,
  getShortlistCount,
  getFinalCount,
} from "~/features/venture/repositories/opportunity.repository";
import { getPendingDecisionCount } from "~/features/venture/repositories/decision.repository";
import {
  VD_SPRINT_STATUS_CONFIG,
  getSprintProgress,
} from "~/features/venture/constants/sprint-status";
import type { VdSprintStatusType } from "~/features/venture/types";
import { NextStepGuide } from "~/components/venture/NextStepGuide";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const { sprintId } = params;
  if (!sprintId) {
    return redirect("/venture/sprints");
  }

  const sprint = await getSprintById(db, sprintId);
  if (!sprint) {
    throw new Response("Sprint not found", { status: 404 });
  }

  const [scopes, opportunityCount, shortlistCount, finalCount, pendingDecisionCount] =
    await Promise.all([
      getSprintScopes(db, sprintId),
      getOpportunityCount(db, sprintId),
      getShortlistCount(db, sprintId),
      getFinalCount(db, sprintId),
      getPendingDecisionCount(db, sprintId),
    ]);

  return json({
    user,
    sprint,
    scopes,
    stats: {
      opportunityCount,
      shortlistCount,
      finalCount,
      pendingDecisionCount,
    },
  });
}

const tabs = [
  { to: "", label: "개요", end: true },
  { to: "inbox", label: "신호함" },
  { to: "longlist", label: "후보 목록" },
  { to: "gate", label: "검토 단계", badge: true },
  { to: "deepdive", label: "심층 분석" },
  { to: "packaging", label: "산출물 정리" },
  { to: "analytics", label: "분석" },
];

export default function VentureSprintLayout() {
  const { user, sprint, scopes, stats } = useLoaderData<typeof loader>();
  const location = useLocation();
  const params = useParams();

  const statusConfig = VD_SPRINT_STATUS_CONFIG[sprint.status as VdSprintStatusType];
  const progress = getSprintProgress(sprint.status as VdSprintStatusType);

  const basePath = `/venture/sprints/${params.sprintId}`;

  // 현재 탭 결정 (URL 기반)
  const VALID_TABS = ["inbox", "longlist", "gate", "deepdive", "packaging", "analytics"];
  const currentTab = (() => {
    const path = location.pathname;
    if (path === basePath) return "default";
    const tabMatch = path.replace(`${basePath}/`, "").split("/")[0];
    return VALID_TABS.includes(tabMatch) ? tabMatch : "default";
  })();

  return (
    <div className="min-h-screen bg-[var(--axis-surface-secondary)]">
      <MainNav user={user} />
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        {/* 브레드크럼 + 헤더 */}
        <div className="mb-6">
          <nav className="mb-2 text-sm text-[var(--axis-text-tertiary)]">
            <Link to="/venture" className="hover:underline">
              사업 탐색
            </Link>
            {" / "}
            <Link to="/venture/sprints" className="hover:underline">
              스프린트
            </Link>
            {" / "}
            <span className="text-[var(--axis-text-primary)]">{sprint.name}</span>
          </nav>

          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-[var(--axis-text-primary)]">
                  {sprint.name}
                </h1>
                <Badge variant={statusConfig?.variant || "secondary"}>
                  {statusConfig?.label || sprint.status}
                </Badge>
              </div>
              {sprint.description && (
                <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
                  {sprint.description}
                </p>
              )}
            </div>

            {/* 진행률 */}
            <div className="text-right">
              <div className="text-sm text-[var(--axis-text-tertiary)]">진행률</div>
              <div className="mt-1 flex items-center gap-2">
                <div className="w-24 h-2 rounded-full bg-[var(--axis-surface-tertiary)]">
                  <div
                    className="h-full rounded-full bg-[var(--axis-surface-brand)]"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-[var(--axis-text-primary)]">
                  {progress}%
                </span>
              </div>
              {sprint.currentDay !== null && sprint.currentDay > 0 && (
                <div className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                  Day {sprint.currentDay}
                </div>
              )}
            </div>
          </div>

          {/* 요약 통계 */}
          <div className="mt-4 flex gap-6 text-sm">
            <div>
              <span className="text-[var(--axis-text-tertiary)]">범위: </span>
              <span className="text-[var(--axis-text-primary)]">
                {scopes.filter((s) => s.selected).map((s) => s.industry).join(", ") ||
                  `${scopes.length}개 후보`}
              </span>
            </div>
            <div>
              <span className="text-[var(--axis-text-tertiary)]">기회: </span>
              <span className="text-[var(--axis-text-primary)]">
                {stats.opportunityCount}개
              </span>
            </div>
            <div>
              <span className="text-[var(--axis-text-tertiary)]">선별 목록: </span>
              <span className="text-[var(--axis-text-primary)]">
                {stats.shortlistCount}개
              </span>
            </div>
            <div>
              <span className="text-[var(--axis-text-tertiary)]">최종 선정: </span>
              <span className="text-[var(--axis-text-primary)]">
                {stats.finalCount}개
              </span>
            </div>
          </div>
        </div>

        {/* 탭 네비게이션 — pill/segment style */}
        <div className="mb-6 flex gap-1 overflow-x-auto rounded-xl bg-[var(--axis-surface-secondary)] p-1" role="tablist">
          {tabs.map((tab) => {
            const tabPath = tab.to ? `${basePath}/${tab.to}` : basePath;
            const isActive = tab.end
              ? location.pathname === basePath
              : location.pathname === tabPath || location.pathname.startsWith(`${tabPath}/`);

            return (
              <Link
                key={tab.to}
                to={tabPath}
                role="tab"
                aria-selected={isActive}
                className={cn(
                  "whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all duration-[var(--dx-transition-normal)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--axis-button-border-focus)] focus-visible:ring-offset-1",
                  isActive
                    ? "bg-[var(--axis-surface-default)] text-[var(--axis-text-primary)] shadow-sm"
                    : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]"
                )}
              >
                {tab.label}
                {tab.badge && stats.pendingDecisionCount > 0 && (
                  <span className="ml-1.5 inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[var(--axis-badge-warning-bg)] px-1.5 text-xs font-medium text-[var(--axis-badge-warning-text)]">
                    {stats.pendingDecisionCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* 다음 단계 가이드 */}
        <NextStepGuide
          sprint={{
            status: sprint.status as VdSprintStatusType,
            currentDay: sprint.currentDay,
          }}
          context="sprint-detail"
          currentTab={currentTab}
          basePath={basePath}
        />

        {/* 탭 콘텐츠 */}
        <Outlet context={{ sprint, scopes, stats, user }} />
      </div>
    </div>
  );
}
