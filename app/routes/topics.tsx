import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useNavigation } from "@remix-run/react";
import { useState, useMemo } from "react";

import { getDb } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { TopicService } from "~/features/topic/service";
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

  const service = new TopicService(db);
  const topicList = await service.listForUser(user.id);

  return json({ user, topics: topicList });
}

const STATUS_OPTIONS = [
  { value: "all", label: "전체" },
  { value: "active", label: "활성" },
  { value: "completed", label: "완료" },
  { value: "archived", label: "보관" },
] as const;

export default function TopicsLayout() {
  const { user, topics: topicList } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredTopics = useMemo(() => {
    return topicList.filter((t) => {
      const matchesSearch = search === "" || t.name.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || t.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [topicList, search, statusFilter]);

  const sidebar = (
    <aside className="hidden w-[280px] shrink-0 border-r border-line bg-surface-panel sm:block">
      <div className="flex h-full flex-col">
        {/* 헤더 */}
        <div className="shrink-0 border-b border-line px-4 py-3">
          <h3 className="text-sm font-semibold text-fg">
            Topics
            <span className="ml-1.5 text-xs font-normal text-fg-tertiary">
              ({filteredTopics.length}{filteredTopics.length !== topicList.length ? `/${topicList.length}` : ""})
            </span>
          </h3>
        </div>

        {/* 검색 + 필터 */}
        <div className="shrink-0 space-y-2 border-b border-line px-3 py-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Topic 검색..."
            className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-tertiary focus:border-line-brand focus:outline-none focus:ring-1 focus:ring-line-brand"
          />
          <div className="flex gap-1">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setStatusFilter(opt.value)}
                className={`rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                  statusFilter === opt.value
                    ? "bg-surface-brand text-fg-brand"
                    : "text-fg-tertiary hover:bg-surface-hover"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Topic 목록 */}
        <div className="flex-1 overflow-y-auto">
          {filteredTopics.length === 0 ? (
            <p className="px-4 py-8 text-center text-xs text-fg-tertiary">
              {topicList.length === 0
                ? "참여 중인 Topic이 없습니다"
                : "검색 결과가 없습니다"}
            </p>
          ) : (
            filteredTopics.map((t) => (
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
        <div className="flex items-center justify-between border-b border-line px-4 py-2 sm:hidden">
          <span className="text-sm font-medium text-fg">
            Topics
          </span>
        </div>

        <div className="flex-1 overflow-hidden">
          {navigation.state === "loading" ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-fg-brand" />
            </div>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </AppShell>
  );
}
