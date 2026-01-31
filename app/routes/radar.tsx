import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useLoaderData, useActionData, useNavigation } from "@remix-run/react";
import { eq, desc } from "drizzle-orm";
import { getDb } from "~/db";
import {
  radarSources,
  radarItems,
  radarRuns,
  RadarSourceType,
  RadarRunStatus,
} from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const sources = await db.select().from(radarSources);
  const runs = await db
    .select()
    .from(radarRuns)
    .orderBy(desc(radarRuns.startedAt))
    .limit(20);

  // Get recent items (last 50)
  const recentItems = await db
    .select()
    .from(radarItems)
    .orderBy(desc(radarItems.collectedAt))
    .limit(50);

  return json({ user, sources, runs, recentItems });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create-source") {
    const name = String(formData.get("name") || "").trim();
    const sourceType = String(formData.get("sourceType") || "").trim();
    const url = String(formData.get("url") || "").trim();

    if (!name || !sourceType || !url) {
      return json({ error: "이름, 소스 유형, URL은 필수입니다." });
    }

    if (!["rss", "web", "youtube"].includes(sourceType)) {
      return json({ error: "소스 유형은 rss, web, youtube 중 하나여야 합니다." });
    }

    const id = crypto.randomUUID();
    await db.insert(radarSources).values({ id, name, sourceType, url });
    return json({ success: true });
  }

  if (intent === "toggle-source") {
    const id = String(formData.get("id") || "");
    const currentEnabled = formData.get("enabled") === "1";
    await db
      .update(radarSources)
      .set({ enabled: currentEnabled ? 0 : 1, updatedAt: new Date() })
      .where(eq(radarSources.id, id));
    return json({ success: true });
  }

  if (intent === "delete-source") {
    const id = String(formData.get("id") || "");
    await db.delete(radarSources).where(eq(radarSources.id, id));
    return json({ success: true });
  }

  return json({ error: "Unknown intent" });
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  [RadarSourceType.RSS]: "RSS",
  [RadarSourceType.WEB]: "Web",
  [RadarSourceType.YOUTUBE]: "YouTube",
};

const RUN_STATUS_STYLES: Record<string, string> = {
  [RadarRunStatus.RUNNING]: "bg-yellow-100 text-yellow-800",
  [RadarRunStatus.COMPLETED]: "bg-green-100 text-green-800",
  [RadarRunStatus.FAILED]: "bg-red-100 text-red-800",
};

function formatDate(timestamp: string | number | Date | null) {
  if (!timestamp) return "-";
  const d = new Date(timestamp);
  return d.toLocaleDateString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function RadarPage() {
  const { user, sources, runs, recentItems } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [showAddForm, setShowAddForm] = useState(false);
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav user={user} />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Radar</h1>
          <p className="mt-1 text-sm text-gray-600">
            자동 토픽 수집 소스를 관리하고 실행 이력을 확인합니다.
          </p>
        </div>

        {actionData && "error" in actionData && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {actionData.error}
          </div>
        )}

        {/* Sources Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">수집 소스</h2>
            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              {showAddForm ? "취소" : "+ 소스 추가"}
            </button>
          </div>

          {showAddForm && (
            <Form method="post" className="mb-4 rounded-lg border border-gray-200 bg-white p-4">
              <input type="hidden" name="intent" value="create-source" />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                    이름
                  </label>
                  <input
                    type="text"
                    name="name"
                    id="name"
                    required
                    placeholder="GeekNews"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="sourceType" className="block text-sm font-medium text-gray-700">
                    유형
                  </label>
                  <select
                    name="sourceType"
                    id="sourceType"
                    required
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  >
                    <option value="rss">RSS</option>
                    <option value="web">Web</option>
                    <option value="youtube">YouTube</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="url" className="block text-sm font-medium text-gray-700">
                    URL
                  </label>
                  <input
                    type="url"
                    name="url"
                    id="url"
                    required
                    placeholder="https://news.hada.io/rss"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isSubmitting ? "추가 중..." : "추가"}
                </button>
              </div>
            </Form>
          )}

          {sources.length === 0 ? (
            <p className="text-sm text-gray-500">등록된 소스가 없습니다.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">이름</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">유형</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">URL</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">상태</th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {sources.map((source) => (
                    <tr key={source.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                        {source.name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                          {SOURCE_TYPE_LABELS[source.sourceType] || source.sourceType}
                        </span>
                      </td>
                      <td className="max-w-xs truncate px-4 py-3 text-sm text-gray-500" title={source.url}>
                        {source.url}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            source.enabled ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {source.enabled ? "활성" : "비활성"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm">
                        <div className="flex items-center justify-end gap-2">
                          <Form method="post">
                            <input type="hidden" name="intent" value="toggle-source" />
                            <input type="hidden" name="id" value={source.id} />
                            <input type="hidden" name="enabled" value={source.enabled ? "1" : "0"} />
                            <button
                              type="submit"
                              className="text-sm text-indigo-600 hover:text-indigo-800"
                            >
                              {source.enabled ? "비활성화" : "활성화"}
                            </button>
                          </Form>
                          <Form method="post">
                            <input type="hidden" name="intent" value="delete-source" />
                            <input type="hidden" name="id" value={source.id} />
                            <button
                              type="submit"
                              className="text-sm text-red-600 hover:text-red-800"
                              onClick={(e) => {
                                if (!confirm("이 소스를 삭제하시겠습니까?")) {
                                  e.preventDefault();
                                }
                              }}
                            >
                              삭제
                            </button>
                          </Form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Run History Section */}
        <div className="mb-8">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">실행 이력</h2>
          {runs.length === 0 ? (
            <p className="text-sm text-gray-500">실행 이력이 없습니다.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">시작</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">상태</th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">소스</th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">수집</th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">중복</th>
                    <th className="px-4 py-3 text-center text-xs font-medium uppercase text-gray-500">Seed 생성</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">완료</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {runs.map((run) => (
                    <tr key={run.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                        {formatDate(run.startedAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            RUN_STATUS_STYLES[run.status] || "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {run.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-gray-500">
                        {run.sourcesChecked}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-gray-500">
                        {run.itemsCollected}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-sm text-gray-500">
                        {run.itemsDeduplicated}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-center text-sm font-medium text-indigo-600">
                        {run.seedsCreated}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {formatDate(run.completedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Items Section */}
        <div>
          <h2 className="mb-4 text-lg font-semibold text-gray-900">최근 수집 아이템</h2>
          {recentItems.length === 0 ? (
            <p className="text-sm text-gray-500">수집된 아이템이 없습니다. Radar Worker가 실행되면 여기에 표시됩니다.</p>
          ) : (
            <div className="space-y-3">
              {recentItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-gray-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium text-gray-900">
                        {item.titleKo || item.title}
                      </h3>
                      {item.summaryKo && (
                        <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                          {item.summaryKo}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-indigo-600 truncate max-w-xs"
                        >
                          {item.url}
                        </a>
                        <span>{formatDate(item.collectedAt)}</span>
                      </div>
                    </div>
                    <div className="ml-4 flex flex-col items-end gap-1">
                      {item.relevanceScore !== null && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            item.relevanceScore >= 60
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {item.relevanceScore}점
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          item.status === "SEEDED"
                            ? "bg-indigo-100 text-indigo-800"
                            : item.status === "SCORED"
                              ? "bg-blue-100 text-blue-800"
                              : item.status === "SKIPPED"
                                ? "bg-gray-100 text-gray-600"
                                : "bg-yellow-100 text-yellow-800"
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
