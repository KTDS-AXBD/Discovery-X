import { useState, useCallback, useEffect } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useNavigate, useParams, useRevalidator } from "@remix-run/react";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { radarItems } from "~/db/schema";
import { ideas } from "~/features/ideas/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { SidebarProvider } from "~/lib/context/sidebar-context";
import { usePanelLayout } from "~/lib/hooks/use-panel-layout";
import { ALL_METHODOLOGIES, METHODOLOGY_PROMPTS } from "~/lib/constants/methodology";
import { IdeaPageHeader } from "~/components/ideas/IdeaPageHeader";
import { IdeaListDrawer } from "~/components/ideas/IdeaListDrawer";
import { SourceInputPanel } from "~/components/ideas/SourceInputPanel";
import { IdeaChatWrapper } from "~/components/ideas/IdeaChatWrapper";
import { PanelResizeHandle } from "~/components/ideas/PanelResizeHandle";
import { ProposalCreationModal } from "~/components/ideas/ProposalCreationModal";

interface ChatMessageData {
  id: string;
  role: "user" | "assistant" | "tool_use" | "tool_result";
  content: string;
  toolName?: string | null;
  toolInput?: Record<string, unknown> | null;
  toolResult?: Record<string, unknown> | null;
  createdAt?: string | null;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return redirect("/login");
    }

    // Fetch ideas list for drawer
    let ideaList: Array<{
      id: string;
      title: string;
      status: string;
      createdAt: Date | string | null;
    }> = [];

    try {
      ideaList = await db
        .select({
          id: ideas.id,
          title: ideas.title,
          status: ideas.status,
          createdAt: ideas.createdAt,
        })
        .from(ideas)
        .where(eq(ideas.tenantId, ctx.tenantId))
        .orderBy(desc(ideas.createdAt))
        .limit(50);
    } catch {
      // ideas table might not exist yet
    }

    // Fetch all radar items for source panel (legacy sources not yet linked to ideas)
    const tenantRunIds = sql`(SELECT id FROM radar_runs WHERE tenant_id = ${ctx.tenantId})`;

    let allItems: Array<{
      id: string;
      title: string;
      titleKo: string | null;
      summaryKo: string | null;
      url: string;
      relevanceScore: number | null;
      status: string;
      collectedAt: Date | string | null;
      memo: string | null;
    }> = [];

    try {
      allItems = await db
        .select({
          id: radarItems.id,
          title: radarItems.title,
          titleKo: radarItems.titleKo,
          summaryKo: radarItems.summaryKo,
          url: radarItems.url,
          relevanceScore: radarItems.relevanceScore,
          status: radarItems.status,
          collectedAt: radarItems.collectedAt,
          memo: radarItems.memo,
        })
        .from(radarItems)
        .where(sql`${radarItems.runId} IN ${tenantRunIds}`)
        .orderBy(desc(radarItems.collectedAt))
        .limit(100);
    } catch {
      // Radar tables might not exist
    }

    return json({ user: ctx.user, ideaList, allItems });
  } catch (error) {
    console.error("[ideas.loader] Error:", error instanceof Error ? error.message : error);
    return redirect("/login");
  }
}

export default function IdeasLayout() {
  const { user, ideaList, allItems } = useLoaderData<typeof loader>();
  const params = useParams();
  const selectedIdeaId = params.id;
  const revalidator = useRevalidator();
  const navigate = useNavigate();

  // Chat state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessageData[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [proposalModalOpen, setProposalModalOpen] = useState(false);

  // Panel layout
  const panel = usePanelLayout();

  // Source selection state (multi-select)
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);

  // Auto-analysis message (sent automatically to ChatPanel)
  const [autoMessage, setAutoMessage] = useState<string | null>(null);

  // Per-methodology loading state
  const [loadingCategory, setLoadingCategory] = useState<string | null>(null);

  // Source items for the selected idea (or all items if no idea selected)
  const [ideaSourceItems, setIdeaSourceItems] = useState(allItems);

  const isLoadingMessages = conversationId !== null && !messagesLoaded;

  const currentIdea = ideaList.find((i) => i.id === selectedIdeaId);

  // Auto-select all sources when ideaSourceItems changes
  useEffect(() => {
    setSelectedSourceIds(ideaSourceItems.map((s) => s.id));
  }, [ideaSourceItems]);

  // Fetch sources for selected idea
  useEffect(() => {
    if (!selectedIdeaId) {
      setIdeaSourceItems(allItems);
      return;
    }

    let cancelled = false;
    fetch(`/api/ideas/${selectedIdeaId}/sources`)
      .then((r) => r.json() as Promise<{ sources: typeof allItems }>)
      .then((data) => {
        if (!cancelled && data.sources) {
          setIdeaSourceItems(
            data.sources.map((s: Record<string, unknown>) => ({
              id: (s.radarItemId as string) || (s.id as string),
              title: (s.title as string) || "",
              titleKo: (s.titleKo as string) || null,
              summaryKo: (s.summaryKo as string) || null,
              url: (s.url as string) || "",
              relevanceScore: null,
              status: (s.status as string) || "COLLECTED",
              collectedAt: s.addedAt as string | null,
              memo: (s.memo as string) || null,
            }))
          );
        }
      })
      .catch(() => {
        if (!cancelled) setIdeaSourceItems([]);
      });

    return () => { cancelled = true; };
  }, [selectedIdeaId, allItems]);

  // Create conversation for the selected idea
  useEffect(() => {
    if (!selectedIdeaId) {
      setConversationId(null);
      setChatMessages([]);
      setMessagesLoaded(false);
      return;
    }

    let cancelled = false;
    fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: currentIdea?.title || "아이디어 분석",
        // Note: sourceItemId requires a radarItem ID (FK constraint).
        // Pass undefined here; source context is provided via auto-message.
      }),
    })
      .then((r) => r.json() as Promise<{ id: string }>)
      .then((data) => {
        if (!cancelled) {
          setConversationId(data.id);
          setMessagesLoaded(false);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [selectedIdeaId, currentIdea?.title]);

  // Fetch messages when conversation changes
  useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;
    fetch(`/api/conversations/${conversationId}/messages`)
      .then((res) => res.json() as Promise<{ messages: ChatMessageData[] }>)
      .then((data) => {
        if (!cancelled) {
          setChatMessages(data.messages || []);
          setMessagesLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChatMessages([]);
          setMessagesLoaded(true);
        }
      });

    return () => { cancelled = true; };
  }, [conversationId]);

  const handleAddSources = useCallback(async (inputs: string[]): Promise<{ created: number; error?: string }> => {
    setIsAdding(true);
    try {
      const endpoint = selectedIdeaId
        ? `/api/ideas/${selectedIdeaId}/sources`
        : "/api/ideas/sources";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs }),
      });
      const data = await res.json() as { created?: number; error?: string };
      if (!res.ok) {
        return { created: 0, error: data.error || "추가 실패" };
      }
      revalidator.revalidate();
      return { created: data.created ?? 0 };
    } catch {
      return { created: 0, error: "네트워크 오류" };
    } finally {
      setIsAdding(false);
    }
  }, [revalidator, selectedIdeaId]);

  const handleDeleteSource = useCallback(async (radarItemId: string) => {
    if (!selectedIdeaId) return;
    try {
      await fetch(`/api/ideas/${selectedIdeaId}/sources`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ radarItemId }),
      });
      // Remove from selection if deleted item was selected
      setSelectedSourceIds((prev) => prev.filter((id) => id !== radarItemId));
      revalidator.revalidate();
    } catch {
      // Silently fail — user can retry
    }
  }, [selectedIdeaId, revalidator]);

  const handleToggleSource = useCallback((id: string) => {
    setSelectedSourceIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelectedSourceIds((prev) =>
      prev.length === ideaSourceItems.length ? [] : ideaSourceItems.map((s) => s.id)
    );
  }, [ideaSourceItems]);

  // For source detail view (clicking item title)
  const [detailSourceId, setDetailSourceId] = useState<string | null>(null);

  const handleStartAnalysis = useCallback(async () => {
    let ideaId = selectedIdeaId;

    // Create idea if none selected
    if (!ideaId) {
      try {
        const res = await fetch("/api/ideas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "새 아이디어" }),
        });
        // The POST redirects, but we need the ID from the redirect URL
        if (res.redirected) {
          const redirectUrl = new URL(res.url);
          ideaId = redirectUrl.pathname.split("/").pop();
        }
      } catch {
        return;
      }
    }

    if (!ideaId) return;

    // Build source context for the agent (only selected sources)
    const selectedSources = ideaSourceItems.filter((s) => selectedSourceIds.includes(s.id));
    const sourceSummaries = selectedSources
      .map((s) => {
        const title = s.titleKo || s.title || "제목 없음";
        const summary = s.summaryKo || "";
        const url = s.url && !s.url.startsWith("text://") ? s.url : "";
        return `- **${title}**${summary ? `: ${summary}` : ""}${url ? ` (${url})` : ""}`;
      })
      .join("\n");

    const analysisMsg = `추가된 소스를 분석하여 다음 6가지 카테고리로 사업 아이디어를 정리해주세요.

아이디어 ID: ${ideaId}

## 분석할 소스
${sourceSummaries || "소스 없음"}

## 카테고리
1. industry_example (산업별 사업 예시)
2. regulation (규제/법)
3. market_research (시장 조사)
4. customer_research (고객 조사)
5. feasibility (사업성 검증)
6. differentiation (차별화)

각 카테고리별로 update_idea_analysis 도구를 사용하여 분석 결과를 저장해주세요. ideaId는 "${ideaId}"입니다.`;

    // Navigate to the idea detail page if needed
    if (!selectedIdeaId) {
      navigate(`/ideas/${ideaId}`);
    }
    setAutoMessage(analysisMsg);
  }, [selectedIdeaId, ideaSourceItems, selectedSourceIds, navigate]);

  const handleRunMethodology = useCallback(async (category: string) => {
    let ideaId = selectedIdeaId;

    // Create idea if none selected
    if (!ideaId) {
      try {
        const res = await fetch("/api/ideas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "새 아이디어" }),
        });
        if (res.redirected) {
          const redirectUrl = new URL(res.url);
          ideaId = redirectUrl.pathname.split("/").pop();
        }
      } catch {
        return;
      }
    }

    if (!ideaId) return;

    setLoadingCategory(category);

    const selectedSources = ideaSourceItems.filter((s) => selectedSourceIds.includes(s.id));
    const sourceSummaries = selectedSources
      .map((s) => {
        const title = s.titleKo || s.title || "제목 없음";
        const summary = s.summaryKo || "";
        const url = s.url && !s.url.startsWith("text://") ? s.url : "";
        return `- **${title}**${summary ? `: ${summary}` : ""}${url ? ` (${url})` : ""}`;
      })
      .join("\n");

    const methodologyLabel = ALL_METHODOLOGIES.find((m) => m.key === category)?.label || category;
    const methodologyPrompt = METHODOLOGY_PROMPTS[category] || "";

    const msg = `아이디어 ID: ${ideaId}

## 분석할 소스
${sourceSummaries || "소스 없음"}

## 실행할 방법론: ${methodologyLabel}
${methodologyPrompt}

update_idea_analysis 도구를 사용하여 "${category}" 카테고리에 분석 결과를 저장해주세요. ideaId는 "${ideaId}"입니다.`;

    if (!selectedIdeaId) {
      navigate(`/ideas/${ideaId}`);
    }
    setAutoMessage(msg);
  }, [selectedIdeaId, ideaSourceItems, selectedSourceIds, navigate]);

  const handleToolResult = useCallback(
    (toolName: string, _result: Record<string, unknown>) => {
      if (toolName === "update_idea_analysis") {
        revalidator.revalidate();
        setLoadingCategory(null);
      }
    },
    [revalidator]
  );

  const handleTitleUpdated = useCallback(() => {
    revalidator.revalidate();
  }, [revalidator]);

  return (
    <SidebarProvider>
      <div className="flex h-screen flex-col bg-[var(--dx-surface-deep,var(--axis-surface-secondary))]">
        <IdeaPageHeader
          title={currentIdea?.title}
          user={user}
          onOpenProposalModal={() => setProposalModalOpen(true)}
        />
        <IdeaListDrawer ideas={ideaList} selectedIdeaId={selectedIdeaId} />
        <div className="flex flex-1 overflow-hidden">
          {/* Left panel toggle (collapsed state) */}
          {!panel.leftOpen && (
            <button
              type="button"
              onClick={panel.toggleLeft}
              className="flex h-full w-6 shrink-0 items-center justify-center border-r border-[var(--axis-border-default)] bg-[var(--dx-surface-panel,var(--axis-surface-default))] text-[var(--axis-text-tertiary)] transition-colors hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-secondary)]"
              aria-label="소스 패널 열기"
              title="소스 패널 열기"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          )}

          {/* Left: Source Input Panel */}
          {panel.leftOpen && (
            <>
              <div style={{ width: panel.leftWidth }} className="group/left relative shrink-0 overflow-hidden">
                {/* Collapse button */}
                <button
                  type="button"
                  onClick={panel.toggleLeft}
                  className="absolute right-1 top-2.5 z-20 flex h-5 w-5 items-center justify-center rounded text-[var(--axis-text-tertiary)] opacity-0 transition-opacity hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-secondary)] group-hover/left:opacity-100"
                  aria-label="소스 패널 숨기기"
                  title="소스 패널 숨기기"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                  </svg>
                </button>
                <SourceInputPanel
                  items={ideaSourceItems}
                  collectedItems={allItems}
                  selectedItemIds={selectedSourceIds}
                  onAddSources={handleAddSources}
                  onDeleteSource={selectedIdeaId ? handleDeleteSource : undefined}
                  onToggleItem={handleToggleSource}
                  onToggleAll={handleToggleAll}
                  onSelectItem={(id) => setDetailSourceId((prev) => (prev === id ? null : id))}
                  isAdding={isAdding}
                />
              </div>
              <PanelResizeHandle
                side="left"
                onResize={panel.resizeLeft}
              />
            </>
          )}

          {/* Center: Detail / Gadget Tabs */}
          <div className="flex-1 overflow-y-auto">
            <Outlet context={{ detailSourceId, ideaSourceItems, selectedSourceIds, onClearSource: () => setDetailSourceId(null), onStartAnalysis: handleStartAnalysis, onRunMethodology: handleRunMethodology, loadingCategory, onTitleUpdated: handleTitleUpdated }} />
          </div>

          {/* Right: Chat Panel */}
          {panel.rightOpen && (
            <>
              <PanelResizeHandle
                side="right"
                onResize={panel.resizeRight}
              />
              <div style={{ width: panel.rightWidth }} className="group/right relative shrink-0 overflow-hidden">
                {/* Collapse button */}
                <button
                  type="button"
                  onClick={panel.toggleRight}
                  className="absolute left-1 top-2.5 z-20 flex h-5 w-5 items-center justify-center rounded text-[var(--axis-text-tertiary)] opacity-0 transition-opacity hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-secondary)] group-hover/right:opacity-100"
                  aria-label="채팅 패널 숨기기"
                  title="채팅 패널 숨기기"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                </button>
                <IdeaChatWrapper
                  conversationId={conversationId}
                  messages={chatMessages}
                  isLoadingMessages={isLoadingMessages}
                  onToolResult={handleToolResult}
                  autoMessage={autoMessage}
                  selectedSourceCount={selectedSourceIds.length}
                  totalSourceCount={ideaSourceItems.length}
                />
              </div>
            </>
          )}

          {/* Right panel toggle (collapsed state) */}
          {!panel.rightOpen && (
            <button
              type="button"
              onClick={panel.toggleRight}
              className="flex h-full w-6 shrink-0 items-center justify-center border-l border-[var(--axis-border-default)] bg-[var(--dx-surface-panel,var(--axis-surface-default))] text-[var(--axis-text-tertiary)] transition-colors hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-secondary)]"
              aria-label="채팅 패널 열기"
              title="채팅 패널 열기"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
              </svg>
            </button>
          )}
        </div>

        {/* Proposal modal */}
        <ProposalCreationModal
          open={proposalModalOpen}
          onOpenChange={setProposalModalOpen}
          ideaTitle={currentIdea?.title}
        />
      </div>
    </SidebarProvider>
  );
}
