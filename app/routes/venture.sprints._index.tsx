/**
 * Venture Sprint 목록 페이지
 * /venture/sprints
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { Button } from "~/components/ui/Button";
import { Badge } from "~/components/ui/Badge";
import { listSprints } from "~/features/venture/repositories/sprint.repository";
import {
  VD_SPRINT_STATUS_CONFIG,
  VD_SPRINT_STATUSES,
  getSprintProgress,
} from "~/features/venture/constants/sprint-status";
import type { VdSprintStatusType } from "~/features/venture/types";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");

  const sprints = await listSprints(db, {
    status: statusFilter ? [statusFilter as VdSprintStatusType] : undefined,
  });

  return json({ user, sprints, statusFilter });
}

export default function VentureSprintsList() {
  const { user, sprints, statusFilter } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const handleStatusFilter = (status: string | null) => {
    if (status) {
      searchParams.set("status", status);
    } else {
      searchParams.delete("status");
    }
    setSearchParams(searchParams);
  };

  return (
    <div className="min-h-screen bg-[var(--axis-surface-secondary)]">
      <MainNav user={user} />
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        {/* 헤더 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <nav className="mb-2 text-sm text-[var(--axis-text-tertiary)]">
              <Link to="/venture" className="hover:underline">
                Venture
              </Link>
              {" / "}
              <span className="text-[var(--axis-text-primary)]">스프린트</span>
            </nav>
            <h1 className="text-2xl font-bold text-[var(--axis-text-primary)]">
              스프린트 목록
            </h1>
          </div>
          <Link to="/venture/sprints/new">
            <Button>새 스프린트</Button>
          </Link>
        </div>

        {/* 필터 */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => handleStatusFilter(null)}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              !statusFilter
                ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-on-brand)]"
                : "bg-[var(--axis-surface-tertiary)] text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-secondary)]"
            }`}
          >
            전체
          </button>
          {VD_SPRINT_STATUSES.map((status) => {
            const config = VD_SPRINT_STATUS_CONFIG[status];
            return (
              <button
                key={status}
                onClick={() => handleStatusFilter(status)}
                className={`rounded-full px-3 py-1 text-sm transition-colors ${
                  statusFilter === status
                    ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-on-brand)]"
                    : "bg-[var(--axis-surface-tertiary)] text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-secondary)]"
                }`}
              >
                {config.label}
              </button>
            );
          })}
        </div>

        {/* 스프린트 목록 */}
        {sprints.length === 0 ? (
          <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-12 text-center">
            <p className="mb-4 text-[var(--axis-text-tertiary)]">
              {statusFilter
                ? `"${VD_SPRINT_STATUS_CONFIG[statusFilter as VdSprintStatusType]?.label}" 상태의 스프린트가 없습니다.`
                : "아직 생성된 스프린트가 없습니다."}
            </p>
            {!statusFilter && (
              <Link to="/venture/sprints/new">
                <Button variant="secondary">첫 스프린트 시작하기</Button>
              </Link>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {sprints.map((sprint) => {
              const statusConfig =
                VD_SPRINT_STATUS_CONFIG[sprint.status as VdSprintStatusType];
              const progress = getSprintProgress(sprint.status as VdSprintStatusType);

              return (
                <Link
                  key={sprint.id}
                  to={`/venture/sprints/${sprint.id}`}
                  className="block rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6 transition-colors hover:border-[var(--axis-border-hover)]"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-[var(--axis-text-primary)]">
                          {sprint.name}
                        </h3>
                        <Badge variant={statusConfig?.variant || "secondary"}>
                          {statusConfig?.label || sprint.status}
                        </Badge>
                      </div>
                      {sprint.description && (
                        <p className="mt-2 text-sm text-[var(--axis-text-tertiary)]">
                          {sprint.description.length > 200
                            ? `${sprint.description.slice(0, 200)}...`
                            : sprint.description}
                        </p>
                      )}
                      <div className="mt-3 flex items-center gap-4 text-xs text-[var(--axis-text-tertiary)]">
                        <span>
                          생성:{" "}
                          {new Date(sprint.createdAt).toLocaleDateString("ko-KR")}
                        </span>
                        {sprint.startedAt && (
                          <span>
                            시작:{" "}
                            {new Date(sprint.startedAt).toLocaleDateString("ko-KR")}
                          </span>
                        )}
                        {sprint.completedAt && (
                          <span>
                            완료:{" "}
                            {new Date(sprint.completedAt).toLocaleDateString("ko-KR")}
                          </span>
                        )}
                        {sprint.currentDay !== null && sprint.currentDay > 0 && (
                          <span>Day {sprint.currentDay}</span>
                        )}
                      </div>
                    </div>

                    {/* 진행률 바 */}
                    <div className="ml-6 w-24">
                      <div className="text-right text-xs text-[var(--axis-text-tertiary)]">
                        {progress}%
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-[var(--axis-surface-tertiary)]">
                        <div
                          className="h-full rounded-full bg-[var(--axis-surface-brand)]"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
