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
import { AppShell } from "~/components/layout/AppShell";
import { PageHeader } from "~/components/layout/PageHeader";
import { Card, CardContent } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
import { Select } from "~/components/ui/Select";
import { FormField } from "~/components/ui/FormField";
import { Badge } from "~/components/ui/Badge";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "~/components/ui/Table";
import { formatDateLocalTime } from "~/lib/format-date";

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

const RUN_STATUS_VARIANT: Record<string, "warning" | "success" | "destructive"> = {
  [RadarRunStatus.RUNNING]: "warning",
  [RadarRunStatus.COMPLETED]: "success",
  [RadarRunStatus.FAILED]: "destructive",
};

function formatDateLocal(timestamp: string | Date | null) {
  if (!timestamp) return "-";
  return formatDateLocalTime(timestamp);
}

export default function RadarPage() {
  const { user, sources, runs, recentItems } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [showAddForm, setShowAddForm] = useState(false);
  const isSubmitting = navigation.state === "submitting";

  return (
    <AppShell user={user}>
      <PageHeader
        title="Radar"
        description="자동 토픽 수집 소스를 관리하고 실행 이력을 확인합니다."
      />

      {actionData && "error" in actionData && (
        <AlertBanner variant="destructive" className="mb-4">
          {actionData.error}
        </AlertBanner>
      )}

      {/* Sources Section */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-[var(--axis-text-primary)]">수집 소스</h2>
          <Button
            variant={showAddForm ? "outline" : "default"}
            size="sm"
            onClick={() => setShowAddForm(!showAddForm)}
          >
            {showAddForm ? "취소" : "+ 소스 추가"}
          </Button>
        </div>

        {showAddForm && (
          <Card className="mb-4">
            <CardContent className="p-4">
              <Form method="post">
                <input type="hidden" name="intent" value="create-source" />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <FormField label="이름" htmlFor="name" required>
                    <Input
                      type="text"
                      name="name"
                      id="name"
                      required
                      placeholder="GeekNews"
                    />
                  </FormField>
                  <FormField label="유형" htmlFor="sourceType" required>
                    <Select name="sourceType" id="sourceType" required>
                      <option value="rss">RSS</option>
                      <option value="web">Web</option>
                      <option value="youtube">YouTube</option>
                    </Select>
                  </FormField>
                  <FormField label="URL" htmlFor="url" required>
                    <Input
                      type="url"
                      name="url"
                      id="url"
                      required
                      placeholder="https://news.hada.io/rss"
                    />
                  </FormField>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "추가 중..." : "추가"}
                  </Button>
                </div>
              </Form>
            </CardContent>
          </Card>
        )}

        {sources.length === 0 ? (
          <p className="text-sm text-[var(--axis-text-tertiary)]">등록된 소스가 없습니다.</p>
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHead className="pl-4">이름</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-right pr-4">작업</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell className="pl-4 font-medium text-[var(--axis-text-primary)]">
                    {source.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {SOURCE_TYPE_LABELS[source.sourceType] || source.sourceType}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-[var(--axis-text-tertiary)]" title={source.url}>
                    {source.url}
                  </TableCell>
                  <TableCell>
                    <Badge variant={source.enabled ? "success" : "secondary"}>
                      {source.enabled ? "활성" : "비활성"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right pr-4">
                    <div className="flex items-center justify-end gap-2">
                      <Form method="post">
                        <input type="hidden" name="intent" value="toggle-source" />
                        <input type="hidden" name="id" value={source.id} />
                        <input type="hidden" name="enabled" value={source.enabled ? "1" : "0"} />
                        <Button variant="ghost" size="sm" type="submit">
                          {source.enabled ? "비활성화" : "활성화"}
                        </Button>
                      </Form>
                      <Form method="post">
                        <input type="hidden" name="intent" value="delete-source" />
                        <input type="hidden" name="id" value={source.id} />
                        <Button
                          variant="ghost"
                          size="sm"
                          type="submit"
                          className="text-[var(--axis-text-error)]"
                          onClick={(e) => {
                            if (!confirm("이 소스를 삭제하시겠습니까?")) {
                              e.preventDefault();
                            }
                          }}
                        >
                          삭제
                        </Button>
                      </Form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Run History Section */}
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-[var(--axis-text-primary)]">실행 이력</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-[var(--axis-text-tertiary)]">실행 이력이 없습니다.</p>
        ) : (
          <Table>
            <TableHeader>
              <tr>
                <TableHead className="pl-4">시작</TableHead>
                <TableHead>상태</TableHead>
                <TableHead className="text-center">소스</TableHead>
                <TableHead className="text-center">수집</TableHead>
                <TableHead className="text-center">중복</TableHead>
                <TableHead className="text-center">Seed 생성</TableHead>
                <TableHead>완료</TableHead>
              </tr>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell className="pl-4 text-[var(--axis-text-primary)]">
                    {formatDateLocal(run.startedAt)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={RUN_STATUS_VARIANT[run.status] || "secondary"}>
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center text-[var(--axis-text-tertiary)]">
                    {run.sourcesChecked}
                  </TableCell>
                  <TableCell className="text-center text-[var(--axis-text-tertiary)]">
                    {run.itemsCollected}
                  </TableCell>
                  <TableCell className="text-center text-[var(--axis-text-tertiary)]">
                    {run.itemsDeduplicated}
                  </TableCell>
                  <TableCell className="text-center font-medium text-[var(--axis-text-brand)]">
                    {run.seedsCreated}
                  </TableCell>
                  <TableCell className="text-[var(--axis-text-tertiary)]">
                    {formatDateLocal(run.completedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Recent Items Section */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-[var(--axis-text-primary)]">최근 수집 아이템</h2>
        {recentItems.length === 0 ? (
          <p className="text-sm text-[var(--axis-text-tertiary)]">수집된 아이템이 없습니다. Radar Worker가 실행되면 여기에 표시됩니다.</p>
        ) : (
          <div className="space-y-3">
            {recentItems.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium text-[var(--axis-text-primary)]">
                        {item.titleKo || item.title}
                      </h3>
                      {item.summaryKo && (
                        <p className="mt-1 text-sm text-[var(--axis-text-secondary)] line-clamp-2">
                          {item.summaryKo}
                        </p>
                      )}
                      <div className="mt-2 flex items-center gap-3 text-xs text-[var(--axis-text-tertiary)]">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-[var(--axis-text-brand)] truncate max-w-xs"
                        >
                          {item.url}
                        </a>
                        <span>{formatDateLocal(item.collectedAt)}</span>
                      </div>
                    </div>
                    <div className="ml-4 flex flex-col items-end gap-1">
                      {item.relevanceScore !== null && (
                        <Badge variant={item.relevanceScore >= 60 ? "success" : "secondary"}>
                          {item.relevanceScore}점
                        </Badge>
                      )}
                      <Badge
                        variant={
                          item.status === "SEEDED"
                            ? "info"
                            : item.status === "SCORED"
                              ? "info"
                              : item.status === "SKIPPED"
                                ? "secondary"
                                : "warning"
                        }
                      >
                        {item.status}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
