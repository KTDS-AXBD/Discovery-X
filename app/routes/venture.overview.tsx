/**
 * Venture Discovery Sprint 개요 페이지
 * /venture/overview
 */

import { useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { PageHeader } from "~/components/layout/PageHeader";
import { Button } from "~/components/ui/Button";
import { Badge } from "~/components/ui/Badge";
import { listSprints } from "~/features/venture/repositories/sprint.repository";
import { VD_SPRINT_STATUS_CONFIG } from "~/features/venture/constants/sprint-status";
import type { VdSprintStatusType } from "~/features/venture/types";
import { EmptyState, NextStepGuide, OnboardingGuide } from "~/components/venture";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  // 최근 스프린트 5개 조회
  const sprints = await listSprints(db);
  const recentSprints = sprints.slice(0, 5);

  // 상태별 카운트
  const statusCounts: Record<string, number> = {};
  for (const sprint of sprints) {
    statusCounts[sprint.status] = (statusCounts[sprint.status] || 0) + 1;
  }

  // 활성 스프린트 수 (DRAFT, RUNNING, GATE1_PENDING, DEEPDIVE, GATE2_PENDING, PACKAGING)
  const activeCount = sprints.filter(
    (s) =>
      s.status !== "COMPLETED" && s.status !== "ARCHIVED"
  ).length;

  return json({
    user,
    recentSprints,
    statusCounts,
    activeCount,
    totalCount: sprints.length,
  });
}

export default function VentureOverview() {
  const { user, recentSprints, statusCounts, activeCount, totalCount } =
    useLoaderData<typeof loader>();
  const [showGuide, setShowGuide] = useState(false);

  // 스프린트가 없는 경우 온보딩 UI 표시
  const isEmpty = totalCount === 0;

  return (
    <div className="min-h-screen bg-[var(--axis-surface-secondary)]">
      <MainNav user={user} />
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        <PageHeader
          title="Venture Discovery Sprint"
          description="AI Agent 주도 신사업 발굴 스프린트"
          breadcrumbs={[
            { label: "홈", to: "/" },
            { label: "사업 발굴", to: "/venture" },
            { label: "개요" },
          ]}
          actions={
            <Link to="/venture/sprints/new">
              <Button>새 스프린트</Button>
            </Link>
          }
        />

        {isEmpty ? (
          /* 빈 상태: 온보딩 UI */
          <div className="space-y-6">
            <EmptyState onShowGuide={() => setShowGuide(true)} />
            <OnboardingGuide visible={showGuide} onDismiss={() => setShowGuide(false)} />
          </div>
        ) : (
          /* 스프린트가 있는 경우: 기존 UI */
          <>
            {/* 다음 단계 가이드 */}
            <NextStepGuide context="overview" />

            {/* 요약 카드 */}
            <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryCard
                title="전체 스프린트"
                value={totalCount}
                description="생성된 스프린트 수"
              />
              <SummaryCard
                title="활성 스프린트"
                value={activeCount}
                description="진행 중인 스프린트"
                highlight
              />
              <SummaryCard
                title="완료"
                value={statusCounts["COMPLETED"] || 0}
                description="완료된 스프린트"
              />
              <SummaryCard
                title="아카이브"
                value={statusCounts["ARCHIVED"] || 0}
                description="아카이브된 스프린트"
              />
            </div>

            {/* 최근 스프린트 */}
            <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-[var(--axis-text-primary)]">
                  최근 스프린트
                </h2>
                <Link
                  to="/venture/sprints"
                  className="text-sm text-[var(--axis-text-brand)] hover:underline"
                >
                  전체 보기
                </Link>
              </div>

              <div className="space-y-3">
                {recentSprints.map((sprint) => {
                  const statusConfig =
                    VD_SPRINT_STATUS_CONFIG[sprint.status as VdSprintStatusType];
                  return (
                    <Link
                      key={sprint.id}
                      to={`/venture/sprints/${sprint.id}`}
                      className="flex items-center justify-between rounded-[var(--dx-card-radius)] border border-[var(--axis-border-default)] border-l-4 border-l-[var(--axis-text-brand)] p-4 shadow-[var(--dx-card-shadow)] transition-all hover:shadow-[var(--dx-card-shadow-hover)] hover:bg-[var(--axis-surface-secondary)]"
                    >
                      <div>
                        <div className="font-medium text-[var(--axis-text-primary)]">
                          {sprint.name}
                        </div>
                        {sprint.description && (
                          <div className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
                            {sprint.description.length > 100
                              ? `${sprint.description.slice(0, 100)}...`
                              : sprint.description}
                          </div>
                        )}
                      </div>
                      <Badge variant={statusConfig?.variant || "secondary"}>
                        {statusConfig?.label || sprint.status}
                      </Badge>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* 하단 링크 */}
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Link
                to="/venture/analytics"
                className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6 transition-colors hover:bg-[var(--axis-surface-secondary)]"
              >
                <h3 className="font-semibold text-[var(--axis-text-primary)]">
                  Analytics
                </h3>
                <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
                  도메인/토픽 분석, Depth/Effort 통계
                </p>
              </Link>
              <Link
                to="/venture/sprints"
                className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6 transition-colors hover:bg-[var(--axis-surface-secondary)]"
              >
                <h3 className="font-semibold text-[var(--axis-text-primary)]">
                  스프린트 목록
                </h3>
                <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
                  모든 스프린트 조회 및 관리
                </p>
              </Link>
              <button
                type="button"
                onClick={() => setShowGuide(!showGuide)}
                className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6 text-left transition-colors hover:bg-[var(--axis-surface-secondary)]"
              >
                <h3 className="flex items-center gap-2 font-semibold text-[var(--axis-text-primary)]">
                  <svg
                    className="h-5 w-5 text-[var(--axis-text-brand)]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
                    />
                  </svg>
                  전체 가이드
                </h3>
                <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
                  스프린트 진행 방법 상세 안내
                </p>
              </button>
            </div>

            {/* 온보딩 가이드 (토글) */}
            {showGuide && (
              <div className="mt-6">
                <OnboardingGuide alwaysShow onDismiss={() => setShowGuide(false)} />
              </div>
            )}
          </>
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
  value: number;
  description: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[var(--dx-card-radius)] border p-4 shadow-[var(--dx-card-shadow)] ${
        highlight
          ? "border-[var(--axis-text-brand)] bg-[var(--axis-surface-brand-subtle)]"
          : "border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)]"
      }`}
    >
      <div
        className={`absolute inset-x-0 top-0 h-1 ${
          highlight ? "bg-[var(--axis-text-brand)]" : "bg-[var(--axis-border-secondary)]"
        }`}
      />
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
      <div className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
        {description}
      </div>
    </div>
  );
}
