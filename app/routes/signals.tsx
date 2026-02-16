import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, Link, useSearchParams, useNavigation } from "@remix-run/react";
import { eq, sql, and } from "drizzle-orm";

import { getDb } from "~/db";
import { sharedSignals, topics, topicMembers } from "~/db/schema-v2";
import { tenantMembers } from "~/db/schema";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { cn } from "~/lib/utils/cn";

const STATUS_FILTERS = [
  { value: "", label: "전체" },
  { value: "pending", label: "대기" },
  { value: "reviewed", label: "검토" },
  { value: "actioned", label: "실행" },
  { value: "dismissed", label: "보류" },
] as const;

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const db = getDb(env.DB);
  const secret = getSessionSecret(env);

  let user;
  try {
    user = await requireUser(request, db, secret);
  } catch (e) {
    if (e instanceof Response) throw e;
    return redirect("/login");
  }

  // 사용자의 tenant(team) 조회
  const membership = await db.query.tenantMembers.findFirst({
    where: eq(tenantMembers.userId, user.id),
  });
  const teamId = membership?.tenantId ?? "";

  // 사용자가 멤버인 Topic 목록 + 해당 Topic의 시그널 카운트
  const topicList = teamId
    ? await db
        .select({
          id: topics.id,
          name: topics.name,
          signalCount: sql<number>`(
            SELECT count(*) FROM shared_signals
            WHERE shared_signals.topic_id = ${topics.id}
          )`.as("signal_count"),
        })
        .from(topics)
        .innerJoin(topicMembers, eq(topicMembers.topicId, topics.id))
        .where(
          and(
            eq(topicMembers.userId, user.id),
            eq(topics.teamId, teamId),
          )
        )
        .groupBy(topics.id)
        .orderBy(topics.name)
    : [];

  // 전체 시그널 수
  const totalResult = teamId
    ? await db
        .select({ count: sql<number>`count(*)`.as("count") })
        .from(sharedSignals)
        .where(eq(sharedSignals.teamId, teamId))
    : [{ count: 0 }];
  const totalSignals = totalResult[0]?.count ?? 0;

  return json({ user, topics: topicList, totalSignals, teamId });
}

export default function SignalsLayout() {
  const { user, topics: topicList, totalSignals } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();

  const activeTopicId = searchParams.get("topicId") ?? "";
  const activeStatus = searchParams.get("status") ?? "";

  function buildFilterUrl(topicId: string, status: string) {
    const params = new URLSearchParams();
    if (topicId) params.set("topicId", topicId);
    if (status) params.set("status", status);
    const qs = params.toString();
    return `/signals${qs ? `?${qs}` : ""}`;
  }

  const sidebar = (
    <aside className="hidden w-[280px] shrink-0 border-r border-[var(--axis-border-default)] bg-[var(--dx-surface-panel,var(--axis-surface-default))] sm:block">
      <div className="flex h-full flex-col">
        {/* 헤더 */}
        <div className="shrink-0 border-b border-[var(--axis-border-default)] px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--axis-text-primary)]">
            시그널
            <span className="ml-1.5 text-xs font-normal text-[var(--axis-text-tertiary)]">
              ({totalSignals})
            </span>
          </h3>
        </div>

        {/* 상태 필터 */}
        <div className="shrink-0 border-b border-[var(--axis-border-default)] px-3 py-2">
          <div className="flex flex-wrap gap-1">
            {STATUS_FILTERS.map((f) => (
              <Link
                key={f.value}
                to={buildFilterUrl(activeTopicId, f.value)}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                  activeStatus === f.value
                    ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-brand)]"
                    : "text-[var(--axis-text-tertiary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-primary)]",
                )}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Topic 필터 목록 */}
        <div className="flex-1 overflow-y-auto">
          {/* 전체 시그널 */}
          <Link
            to={buildFilterUrl("", activeStatus)}
            className={cn(
              "flex items-center justify-between px-4 py-2.5 text-sm transition-colors",
              !activeTopicId
                ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-brand)] font-medium"
                : "text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-secondary)]",
            )}
          >
            <span>전체 시그널</span>
            <span className="text-xs tabular-nums text-[var(--axis-text-tertiary)]">
              {totalSignals}
            </span>
          </Link>

          {topicList.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-[var(--axis-text-tertiary)]">
              참여 중인 Topic이 없습니다
            </p>
          ) : (
            topicList.map((t) => (
              <Link
                key={t.id}
                to={buildFilterUrl(t.id, activeStatus)}
                className={cn(
                  "flex items-center justify-between px-4 py-2.5 text-sm transition-colors",
                  activeTopicId === t.id
                    ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-brand)] font-medium"
                    : "text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-secondary)]",
                )}
              >
                <span className="truncate">#{t.name}</span>
                <span className="ml-2 shrink-0 text-xs tabular-nums text-[var(--axis-text-tertiary)]">
                  {t.signalCount}
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </aside>
  );

  return (
    <AppShell user={user} sidebarContent={sidebar}>
      <div className="flex h-full flex-col">
        {/* 모바일 헤더 */}
        <div className="flex items-center justify-between border-b border-[var(--axis-border-default)] px-4 py-2 sm:hidden">
          <span className="text-sm font-medium text-[var(--axis-text-primary)]">
            시그널
          </span>
        </div>

        <div className="flex-1 overflow-hidden">
          {navigation.state === "loading" ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--axis-border-default)] border-t-[var(--axis-text-brand)]" />
            </div>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </AppShell>
  );
}
