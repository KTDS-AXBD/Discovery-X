/**
 * Venture Discovery Sprint 개요 페이지
 * /venture/overview
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { Button } from "~/components/ui/Button";
import { Badge } from "~/components/ui/Badge";
import { listSprints } from "~/features/venture/repositories/sprint.repository";
import { VD_SPRINT_STATUS_CONFIG } from "~/features/venture/constants/sprint-status";
import type { VdSprintStatusType } from "~/features/venture/types";

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

  return (
    <div className="min-h-screen bg-[var(--axis-surface-secondary)]">
      <MainNav user={user} />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* 헤더 */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--axis-text-primary)]">
              Venture Discovery Sprint
            </h1>
            <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
              AI Agent 주도 신사업 발굴 스프린트
            </p>
          </div>
          <Link to="/venture/sprints/new">
            <Button>새 스프린트</Button>
          </Link>
        </div>

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

          {recentSprints.length === 0 ? (
            <div className="py-12 text-center text-[var(--axis-text-tertiary)]">
              <p className="mb-4">아직 생성된 스프린트가 없습니다.</p>
              <Link to="/venture/sprints/new">
                <Button variant="secondary">첫 스프린트 시작하기</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentSprints.map((sprint) => {
                const statusConfig =
                  VD_SPRINT_STATUS_CONFIG[sprint.status as VdSprintStatusType];
                return (
                  <Link
                    key={sprint.id}
                    to={`/venture/sprints/${sprint.id}`}
                    className="flex items-center justify-between rounded-md border border-[var(--axis-border-default)] p-4 transition-colors hover:bg-[var(--axis-surface-secondary)]"
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
          )}
        </div>

        {/* 하단 링크 */}
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
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
        </div>
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
      <div className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
        {description}
      </div>
    </div>
  );
}
