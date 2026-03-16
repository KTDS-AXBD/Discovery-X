import { useCallback } from "react";
import { useNavigate } from "@remix-run/react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, useActionData, useNavigation, useSearchParams } from "@remix-run/react";
import { getDb } from "~/db";
import {
  RadarRunStatus,
} from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { RadarService } from "~/lib/services";
import { AppShell } from "~/components/layout/AppShell";
import { PageHeader } from "~/components/layout/PageHeader";
import { Card, CardContent } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { Badge } from "~/components/ui/Badge";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "~/components/ui/Table";
import { formatDateLocalTime, formatDateShort } from "~/lib/format-date";
import { ManualCollectTab } from "~/features/radar/ui/ManualCollectTab";
import { SendToIdeaButton } from "~/features/radar/ui/SendToIdeaButton";
import { displayTitle, getUrlLabel } from "~/lib/utils/display-title";
import { ChannelManagementTab } from "~/features/radar/ui/ChannelManagementTab";
import { SourceHealthTab } from "~/features/radar/ui/SourceHealthTab";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  const service = new RadarService(db);
  const { sources, sourcesWithDomains, domains, folders, runs, recentItems } = await service.getRadarData({
    tenantId: ctx.tenantId,
  });

  const isGatekeeper = ["admin", "gatekeeper", "owner"].includes(ctx.tenantRole);

  return json({ user: ctx.user, tenantId: ctx.tenantId, sources, sourcesWithDomains, domains, folders, runs, recentItems, isGatekeeper });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  const formData = await request.formData();
  const intent = formData.get("intent");
  const service = new RadarService(db);

  if (intent === "create-source") {
    const name = String(formData.get("name") || "").trim();
    const sourceType = String(formData.get("sourceType") || "").trim();
    const url = String(formData.get("url") || "").trim();
    const keywordsRaw = String(formData.get("keywords") || "").trim();
    const radarTagsRaw = String(formData.get("radarTags") || "").trim();

    if (!name || !sourceType || !url) {
      return json({ error: "이름, 소스 유형, URL은 필수입니다." });
    }

    if (!["rss", "site", "web", "youtube", "sns"].includes(sourceType)) {
      return json({ error: "소스 유형은 rss, site, web, youtube, sns 중 하나여야 합니다." });
    }

    // BD팀 PoC: 키워드와 태그 파싱
    const keywords = keywordsRaw ? keywordsRaw.split(",").map(k => k.trim()).filter(Boolean) : [];
    const radarTags = radarTagsRaw ? radarTagsRaw.split(",").map(t => t.trim()).filter(Boolean) : [];

    await service.createSource({
      name,
      sourceType,
      url,
      tenantId: ctx.tenantId,
      userId: ctx.user.id,
      keywords,
      radarTags,
    });
    return json({ success: true });
  }

  if (intent === "toggle-source") {
    const id = String(formData.get("id") || "");
    const currentEnabled = formData.get("enabled") === "1";
    await service.toggleSource(id, currentEnabled);
    return json({ success: true });
  }

  if (intent === "delete-source") {
    const id = String(formData.get("id") || "");
    await service.deleteSource(id);
    return json({ success: true });
  }

  return json({ error: "Unknown intent" });
}

const RUN_STATUS_VARIANT: Record<string, "warning" | "success" | "destructive"> = {
  [RadarRunStatus.RUNNING]: "warning",
  [RadarRunStatus.COMPLETED]: "success",
  [RadarRunStatus.FAILED]: "destructive",
};

const RUN_STATUS_LABEL: Record<string, string> = {
  [RadarRunStatus.RUNNING]: "실행 중",
  [RadarRunStatus.COMPLETED]: "완료",
  [RadarRunStatus.FAILED]: "실패",
};

const ITEM_STATUS_LABEL: Record<string, string> = {
  COLLECTED: "수집됨",
  SCORED: "평가됨",
  SEEDED: "시드됨",
  SKIPPED: "건너뜀",
};

const ITEM_STATUS_VARIANT: Record<string, "warning" | "info" | "secondary"> = {
  COLLECTED: "warning",
  SCORED: "info",
  SEEDED: "info",
  SKIPPED: "secondary",
};

function formatDateLocal(timestamp: string | Date | null) {
  if (!timestamp) return "-";
  return formatDateLocalTime(timestamp);
}

type RadarTab = "feed" | "manual" | "health" | "channels";

export default function RadarPage() {
  const { user, tenantId, sources, sourcesWithDomains, domains, folders, runs, recentItems, isGatekeeper } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = (["feed", "manual", "health", "channels"].includes(searchParams.get("tab") ?? "")
    ? searchParams.get("tab")
    : "feed") as RadarTab;
  const setActiveTab = useCallback((tab: RadarTab) => {
    setSearchParams((prev) => { prev.set("tab", tab); return prev; }, { replace: true });
  }, [setSearchParams]);
  const isSubmitting = navigation.state === "submitting";
  // sources는 현재 피드 탭 등에서 사용되지 않으나 하위 호환 보존
  void sources; void isSubmitting;

  // 소스 아이템에서 아이디어 생성 + 상세 페이지로 이동 (채팅 패널 포함)
  const handleStartChat = useCallback(async (itemId: string) => {
    try {
      const res = await fetch(`/api/radar/items/${itemId}/send-to-idea`, {
        method: "POST",
      });
      const data = (await res.json()) as { success?: boolean; ideaId?: string };
      if (data.ideaId) {
        navigate(`/ideas/${data.ideaId}`);
      } else {
        navigate("/ideas");
      }
    } catch {
      navigate("/ideas");
    }
  }, [navigate]);

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

      {/* Tab Navigation */}
      <div className="mb-6 flex gap-1 border-b border-border">
        {([
          { key: "feed", label: "피드" },
          { key: "manual", label: "수동 등록" },
          { key: "health", label: "Source Health" },
          { key: "channels", label: "채널 관리" },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === key
                ? "border-fg-brand text-fg-brand"
                : "border-transparent text-fg-tertiary hover:text-fg-secondary"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Manual Collect Tab */}
      {activeTab === "manual" && (
        <div className="mb-8">
          <ManualCollectTab />
        </div>
      )}

      {/* Feed Tab — Recent Items */}
      {activeTab === "feed" && (
        <>
          {/* Run History Section */}
          <div className="mb-8">
            <h2 className="mb-4 text-lg font-semibold text-fg">실행 이력</h2>
            {runs.length === 0 ? (
              <p className="text-sm text-fg-tertiary">실행 이력이 없습니다.</p>
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
                  {runs.map((run) => {
                    const noSources = run.sourcesChecked === 0;
                    return (
                      <TableRow key={run.id} className="h-12">
                        <TableCell className="pl-4 text-fg tabular-nums">
                          {formatDateLocal(run.startedAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={RUN_STATUS_VARIANT[run.status] || "secondary"}>
                            {RUN_STATUS_LABEL[run.status] || run.status}
                          </Badge>
                        </TableCell>
                        <TableCell className={`text-center tabular-nums ${noSources ? "text-fg-tertiary/50" : "text-fg-tertiary"}`}>
                          {noSources ? <span title="수집 대상 없음">0</span> : run.sourcesChecked}
                        </TableCell>
                        <TableCell className="text-center tabular-nums text-fg-tertiary">
                          {run.itemsCollected}
                        </TableCell>
                        <TableCell className="text-center tabular-nums text-fg-tertiary">
                          {run.itemsDeduplicated}
                        </TableCell>
                        <TableCell className="text-center tabular-nums font-medium text-fg-brand">
                          {run.seedsCreated}
                        </TableCell>
                        <TableCell className="text-fg-tertiary tabular-nums">
                          {formatDateLocal(run.completedAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Recent Items Section */}
          <div>
            <h2 className="mb-4 text-lg font-semibold text-fg">
              최근 수집 아이템
              {recentItems.length > 0 && (
                <span className="ml-2 text-sm font-normal text-fg-tertiary">{recentItems.length}건</span>
              )}
            </h2>
            {recentItems.length === 0 ? (
              <p className="text-sm text-fg-tertiary">수집된 아이템이 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {recentItems.map((item) => {
                  const urlLabel = getUrlLabel(item.url);
                  const title = displayTitle(item.titleKo, item.title, item.url);
                  return (
                    <Card key={item.id}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-medium text-fg leading-snug">
                              {title}
                            </h3>
                            {item.summaryKo ? (
                              <p className="mt-1 text-sm text-fg-secondary line-clamp-2 leading-relaxed">
                                {item.summaryKo}
                              </p>
                            ) : (
                              <p className="mt-1 text-sm text-fg-tertiary/60 italic">
                                요약 준비 중...
                              </p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-tertiary">
                              {"sourceName" in item && item.sourceName && item.sourceName !== "__manual__" && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                  {item.sourceName}
                                </Badge>
                              )}
                              {urlLabel && (
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-fg-brand truncate max-w-[200px]"
                                >
                                  {urlLabel}
                                </a>
                              )}
                              <span className="tabular-nums">{formatDateShort(item.collectedAt)}</span>
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1.5">
                            {item.relevanceScore !== null && (
                              <Badge variant={item.relevanceScore >= 60 ? "success" : "secondary"}>
                                {item.relevanceScore}점
                              </Badge>
                            )}
                            <Badge variant={ITEM_STATUS_VARIANT[item.status] || "secondary"}>
                              {ITEM_STATUS_LABEL[item.status] || item.status}
                            </Badge>
                            <div className="mt-1 flex items-center gap-1">
                              <SendToIdeaButton itemId={item.id} />
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleStartChat(item.id)}
                              >
                                아이디어로 탐색
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}

      {/* Source Health Tab (Phase 3B) */}
      {activeTab === "health" && (
        <div className="mb-8">
          <SourceHealthTab tenantId={tenantId} isGatekeeper={isGatekeeper} />
        </div>
      )}

      {/* Channels Tab (Phase 2A) */}
      {activeTab === "channels" && (
        <div className="mb-8">
          <ChannelManagementTab
            sourcesWithDomains={sourcesWithDomains}
            domains={domains}
            folders={folders}
            tenantId={tenantId}
            isGatekeeper={isGatekeeper}
          />
        </div>
      )}

    </AppShell>
  );
}
