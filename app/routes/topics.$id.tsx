import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useFetcher, useLoaderData } from "@remix-run/react";
import { useState } from "react";

import { getDb } from "~/db";
import { requireScopeAccess } from "~/lib/acl/middleware";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { TopicService } from "~/lib/services";
import { Button } from "~/components/ui/Button";
import { TopicStatusBadge } from "~/components/topic/TopicStatusBadge";
import { TopicMemberList } from "~/components/topic/MemberList";
import { DecisionList } from "~/components/topic/DecisionList";
import { GlossaryList } from "~/components/topic/GlossaryList";
import { GraphEventLog } from "~/components/topic/GraphEventLog";
import { SuggestionList } from "~/components/topic/SuggestionList";

type TabKey = "overview" | "decisions" | "glossary" | "suggestions" | "events";

const tabLabels: Record<TabKey, string> = {
  overview: "개요",
  decisions: "결정",
  glossary: "용어",
  suggestions: "제안",
  events: "이력",
};

// ─── Loader ────────────────────────────────────────────────────────────────

export async function loader({ request, params, context }: LoaderFunctionArgs) {
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

  // ACL 스코프 검사 (FF_ACL_SCOPE 비활성 시 자동 패스)
  await requireScopeAccess({ request, params, context }, "read");

  const topicId = params.id!;
  const service = new TopicService(db);
  const detail = await service.getById(topicId);

  if (!detail) {
    throw json({ error: "Topic을 찾을 수 없습니다" }, { status: 404 });
  }

  return json({ user, topic: detail.topic, members: detail.members });
}

// ─── Action ────────────────────────────────────────────────────────────────

export async function action({ request, params, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  const db = getDb(env.DB);
  const secret = getSessionSecret(env);

  try {
    await requireUser(request, db, secret);
  } catch (e) {
    if (e instanceof Response) throw e;
    return redirect("/login");
  }

  // ACL 스코프 검사 (FF_ACL_SCOPE 비활성 시 자동 패스)
  await requireScopeAccess({ request, params, context }, "write");

  const topicId = params.id!;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const service = new TopicService(db);

  if (intent === "update-topic") {
    const name = formData.get("name") as string;
    const description = formData.get("description") as string;

    if (!name?.trim()) {
      return json({ error: "이름은 필수입니다" }, { status: 400 });
    }

    await service.update(topicId, {
      name: name.trim(),
      description: description?.trim() || null,
    });

    return json({ ok: true });
  }

  if (intent === "add-member") {
    const userId = formData.get("userId") as string;
    const role = (formData.get("role") as string) || "editor";

    if (!userId) {
      return json({ error: "사용자를 선택해주세요" }, { status: 400 });
    }

    const existing = await service.getMember(topicId, userId);
    if (existing) {
      return json({ error: "이미 멤버입니다" }, { status: 400 });
    }

    await service.addMember(topicId, userId, role as "owner" | "editor" | "viewer");

    return json({ ok: true });
  }

  if (intent === "remove-member") {
    const userId = formData.get("userId") as string;

    const member = await service.getMember(topicId, userId);
    if (member?.role === "owner") {
      return json({ error: "owner는 제거할 수 없습니다" }, { status: 400 });
    }

    await service.removeMember(topicId, userId);

    return json({ ok: true });
  }

  if (intent === "update-role") {
    const userId = formData.get("userId") as string;
    const role = formData.get("role") as string;

    await service.updateMemberRole(topicId, userId, role as "owner" | "editor" | "viewer");

    return json({ ok: true });
  }

  if (intent === "archive") {
    await service.archive(topicId);

    return json({ ok: true });
  }

  if (intent === "search-users") {
    const query = formData.get("query") as string;
    if (!query || query.length < 2) {
      return json({ users: [] });
    }

    const results = await service.searchUsers(query);

    return json({ users: results });
  }

  return json({ error: "알 수 없는 요청입니다" }, { status: 400 });
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function TopicDetail() {
  const { user, topic, members } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(topic.name);
  const [editDesc, setEditDesc] = useState(topic.description || "");

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [showAddMember, setShowAddMember] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchFetcher = useFetcher<{ users?: { id: string; name: string; email: string }[] }>();

  const handleSave = () => {
    fetcher.submit(
      { intent: "update-topic", name: editName, description: editDesc },
      { method: "post" },
    );
    setIsEditing(false);
  };

  const handleRemoveMember = (userId: string) => {
    fetcher.submit(
      { intent: "remove-member", userId },
      { method: "post" },
    );
  };

  const handleAddMember = (userId: string) => {
    fetcher.submit(
      { intent: "add-member", userId, role: "editor" },
      { method: "post" },
    );
    setShowAddMember(false);
    setSearchQuery("");
  };

  const handleSearchUsers = (query: string) => {
    setSearchQuery(query);
    if (query.length >= 2) {
      searchFetcher.submit(
        { intent: "search-users", query },
        { method: "post" },
      );
    }
  };

  const handleArchive = () => {
    fetcher.submit({ intent: "archive" }, { method: "post" });
  };

  const searchResults = searchFetcher.data?.users ?? [];
  const existingMemberIds = new Set(members.map((m) => m.userId));

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-6 py-8">
        {/* Topic 헤더 */}
        <div className="mb-8">
          {isEditing ? (
            <div className="space-y-3">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-lg font-semibold text-fg outline-none focus:border-fg-brand"
                placeholder="Topic 이름"
              />
              <textarea
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg-secondary outline-none focus:border-fg-brand"
                placeholder="설명 (선택)"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave}>
                  저장
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false);
                    setEditName(topic.name);
                    setEditDesc(topic.description || "");
                  }}
                >
                  취소
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-fg">
                  {topic.name}
                </h1>
                <TopicStatusBadge status={topic.status} />
              </div>
              {topic.description && (
                <p className="mt-2 text-sm text-fg-secondary">
                  {topic.description}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  편집
                </Button>
                {topic.status !== "archived" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleArchive}
                    className="text-fg-tertiary"
                  >
                    아카이브
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 탭 네비게이션 */}
        <div className="mb-6 flex gap-1 border-b border-line">
          {(["overview", "decisions", "glossary", "suggestions", "events"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-fg-brand text-fg-brand"
                  : "text-fg-tertiary hover:text-fg-secondary"
              }`}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>

        {/* 탭 컨텐츠 */}
        {activeTab === "overview" && (
          <section>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-fg">
                멤버
                <span className="ml-1.5 text-xs font-normal text-fg-tertiary">
                  ({members.length})
                </span>
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddMember(!showAddMember)}
              >
                {showAddMember ? "닫기" : "+ 멤버 추가"}
              </Button>
            </div>

            {/* 멤버 추가 검색 */}
            {showAddMember && (
              <div className="mb-4 rounded-lg border border-line bg-surface p-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearchUsers(e.target.value)}
                  className="w-full rounded-lg border border-line bg-surface-secondary px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-tertiary focus:border-fg-brand"
                  placeholder="이메일로 검색 (2글자 이상)"
                />
                {searchResults.length > 0 && (
                  <ul className="mt-2 divide-y divide-surface-tertiary">
                    {searchResults
                      .filter((u) => !existingMemberIds.has(u.id))
                      .map((u) => (
                        <li
                          key={u.id}
                          className="flex items-center justify-between py-2"
                        >
                          <div>
                            <span className="text-sm font-medium text-fg">
                              {u.name}
                            </span>
                            <span className="ml-2 text-xs text-fg-tertiary">
                              {u.email}
                            </span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleAddMember(u.id)}
                          >
                            추가
                          </Button>
                        </li>
                      ))}
                  </ul>
                )}
                {searchQuery.length >= 2 &&
                  searchResults.filter((u) => !existingMemberIds.has(u.id))
                    .length === 0 && (
                    <p className="mt-2 text-xs text-fg-tertiary">
                      검색 결과가 없습니다
                    </p>
                  )}
              </div>
            )}

            <TopicMemberList
              members={members}
              currentUserId={user.id}
              onRemove={handleRemoveMember}
            />
          </section>
        )}

        {activeTab === "decisions" && (
          <DecisionList topicId={topic.id} />
        )}

        {activeTab === "glossary" && (
          <GlossaryList topicId={topic.id} />
        )}

        {activeTab === "suggestions" && (
          <SuggestionList topicId={topic.id} />
        )}

        {activeTab === "events" && (
          <GraphEventLog topicId={topic.id} />
        )}
      </div>
    </div>
  );
}
