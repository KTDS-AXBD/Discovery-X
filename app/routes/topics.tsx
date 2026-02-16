import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useNavigation } from "@remix-run/react";
import { eq, sql } from "drizzle-orm";

import { getDb } from "~/db";
import { topics, topicMembers } from "~/db/schema-v2";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { TopicCard } from "~/components/topic/TopicCard";

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

  // 현재 사용자가 멤버인 Topic 목록 + 멤버 수
  const topicList = await db
    .select({
      id: topics.id,
      name: topics.name,
      status: topics.status,
      memberCount: sql<number>`count(${topicMembers.userId})`.as("member_count"),
    })
    .from(topics)
    .innerJoin(topicMembers, eq(topicMembers.topicId, topics.id))
    .where(eq(topicMembers.userId, user.id))
    .groupBy(topics.id)
    .orderBy(topics.name);

  return json({ user, topics: topicList });
}

export default function TopicsLayout() {
  const { user, topics: topicList } = useLoaderData<typeof loader>();
  const navigation = useNavigation();

  const sidebar = (
    <aside className="hidden w-[280px] shrink-0 border-r border-[var(--axis-border-default)] bg-[var(--dx-surface-panel,var(--axis-surface-default))] sm:block">
      <div className="flex h-full flex-col">
        {/* 헤더 */}
        <div className="shrink-0 border-b border-[var(--axis-border-default)] px-4 py-3">
          <h3 className="text-sm font-semibold text-[var(--axis-text-primary)]">
            Topics
            <span className="ml-1.5 text-xs font-normal text-[var(--axis-text-tertiary)]">
              ({topicList.length})
            </span>
          </h3>
        </div>

        {/* Topic 목록 */}
        <div className="flex-1 overflow-y-auto">
          {topicList.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-[var(--axis-text-tertiary)]">
              참여 중인 Topic이 없습니다
            </p>
          ) : (
            topicList.map((t) => (
              <TopicCard
                key={t.id}
                id={t.id}
                name={t.name}
                memberCount={t.memberCount}
                status={t.status}
              />
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
            Topics
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
