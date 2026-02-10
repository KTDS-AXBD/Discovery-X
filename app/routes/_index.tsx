import { useState, useCallback, useEffect, useMemo } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData, useRouteError, isRouteErrorResponse, useRouteLoaderData, useSearchParams } from "@remix-run/react";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { ChatPanel } from "~/components/chat/ChatPanel";
import { ContextPanel, extractContextItems, type ContextItem } from "~/components/chat/ContextPanel";
import { SourcePanel } from "~/components/chat/SourcePanel";
import { SummaryPanel } from "~/components/chat/SummaryPanel";

export const meta: MetaFunction = () => {
  return [
    { title: "Discovery-X — Agent Chat" },
    { name: "description", content: "AI Agent 중심 대화형 시스템" },
  ];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return redirect("/login");
    }
    const user = ctx.user;

    return json({ user });
  } catch (error) {
    console.error("[_index.loader] Error:", error instanceof Error ? error.message : error);
    return redirect("/login");
  }
}

interface RootConversation {
  id: string;
  title: string;
  updatedAt: string | null;
}

interface RootLoaderData {
  conversations?: RootConversation[];
}

interface ChatMessageData {
  id: string;
  role: "user" | "assistant" | "tool_use" | "tool_result";
  content: string;
  toolName?: string | null;
  toolInput?: Record<string, unknown> | null;
  toolResult?: Record<string, unknown> | null;
  createdAt?: string | null;
}

interface RadarItem {
  id: string;
  title: string;
  titleKo?: string | null;
  summaryKo?: string | null;
  url: string;
  relevanceScore?: number | null;
  status?: string;
  keyPoints?: string[] | null;
}

interface SimilarSource {
  id: string;
  title: string;
  summaryKo?: string | null;
  score: number;
}

interface Discovery {
  id: string;
  title: string;
  seedSummary?: string | null;
  status: string;
  targetSegment?: string | null;
  valueProposition?: string | null;
}

export default function Index() {
  const { user } = useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData("root") as RootLoaderData | undefined;
  const rootConversations = useMemo(() => rootData?.conversations ?? [], [rootData?.conversations]);
  const [searchParams] = useSearchParams();

  const [convList, setConvList] = useState<RootConversation[]>(rootConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    searchParams.get("conversationId") || rootConversations[0]?.id || null
  );
  const [chatMessages, setChatMessages] = useState<ChatMessageData[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);

  // 3-Pane state
  const [sourcePanelOpen, setSourcePanelOpen] = useState(false);
  const [sourceTab, setSourceTab] = useState<"sources" | "history">("sources");
  const [radarItems, setRadarItems] = useState<RadarItem[]>([]);
  const [statusFilter, setStatusFilter] = useState<"all" | "new" | "viewed" | "archived">("all");
  const [activeSource, setActiveSource] = useState<RadarItem | null>(null);
  const [similarSources, setSimilarSources] = useState<SimilarSource[]>([]);
  const [candidates, _setCandidates] = useState<Discovery[]>([]);
  const [selectedIdea, setSelectedIdea] = useState<Discovery | null>(null);

  // Sync when root conversations change
  useEffect(() => {
    setConvList(rootConversations);
  }, [rootConversations]);

  // Handle URL conversationId parameter
  useEffect(() => {
    const urlConvId = searchParams.get("conversationId");
    if (urlConvId && urlConvId !== activeConversationId) {
      setActiveConversationId(urlConvId);
      setMessagesLoaded(false);
    }
  }, [searchParams, activeConversationId]);

  const isLoadingMessages = activeConversationId !== null && !messagesLoaded;

  // Fetch messages when conversation changes
  useEffect(() => {
    if (!activeConversationId) return;

    let cancelled = false;
    fetch(`/api/conversations/${activeConversationId}/messages`)
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
  }, [activeConversationId]);

  // Fetch radar items for source panel
  useEffect(() => {
    if (!sourcePanelOpen) return;
    let cancelled = false;
    fetch("/api/radar/sources?userOnly=true")
      .then((r) => r.json() as Promise<{ sources: RadarItem[] }>)
      .then((data) => {
        if (!cancelled) setRadarItems(data.sources || []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [sourcePanelOpen]);

  // Fetch similar sources when activeSource changes
  useEffect(() => {
    if (!activeSource) { setSimilarSources([]); return; }
    let cancelled = false;
    fetch(`/api/similar-sources?itemId=${activeSource.id}&limit=3`)
      .then((r) => r.json() as Promise<{ results: SimilarSource[] }>)
      .then((data) => {
        if (!cancelled) setSimilarSources(data.results || []);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeSource]);

  const handleNewConversation = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json()) as { id: string; title: string };
      const newConv: RootConversation = {
        id: data.id,
        title: data.title,
        updatedAt: new Date().toISOString(),
      };
      setConvList((prev) => [newConv, ...prev]);
      setActiveConversationId(data.id);
      setChatMessages([]);
      setMessagesLoaded(true);
    } catch {
      // Silently fail
    }
  }, []);

  const handleToolResult = useCallback(
    (toolName: string, result: Record<string, unknown>) => {
      const newItems = extractContextItems(toolName, result);
      if (newItems.length > 0) {
        setContextItems((prev) => {
          const existing = new Set(prev.map((i) => `${i.type}-${i.id}`));
          const unique = newItems.filter((i) => !existing.has(`${i.type}-${i.id}`));
          const merged = [...prev, ...unique];
          return merged.length > 50 ? merged.slice(-50) : merged;
        });
        setContextPanelOpen(true);
      }

      // Extract idea candidates from tool results
      if (toolName === "generate_idea_candidates" || toolName === "select_idea_candidate") {
        // Refresh candidates would happen via a separate fetch in production
      }
    },
    []
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await fetch("/api/conversations", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: id }),
        });
        setConvList((prev) => prev.filter((c) => c.id !== id));
        if (activeConversationId === id) {
          setActiveConversationId(null);
          setChatMessages([]);
        }
      } catch {
        // Silently fail
      }
    },
    [activeConversationId]
  );

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    setMessagesLoaded(false);
    setContextItems([]);
  }, []);

  const handleSourceItemClick = useCallback((item: RadarItem) => {
    setActiveSource(item);
    // Auto-summarize if keyPoints missing
    if (!item.keyPoints || item.keyPoints.length === 0) {
      fetch("/api/radar/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id }),
      })
        .then((r) => r.json() as Promise<{ keyPoints?: string[] }>)
        .then((data) => {
          if (data.keyPoints) {
            setActiveSource((prev) => prev ? { ...prev, keyPoints: data.keyPoints } : prev);
          }
        })
        .catch(() => {});
    }
  }, []);

  const handleStartChat = useCallback(async (item: RadarItem) => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: item.titleKo || item.title,
          sourceItemId: item.id,
        }),
      });
      const data = (await res.json()) as { id: string; title: string };
      const newConv: RootConversation = {
        id: data.id,
        title: data.title,
        updatedAt: new Date().toISOString(),
      };
      setConvList((prev) => [newConv, ...prev]);
      setActiveConversationId(data.id);
      setChatMessages([]);
      setMessagesLoaded(true);
      setActiveSource(item);
    } catch {
      // Silently fail
    }
  }, []);

  const handleSelectCandidate = useCallback((id: string) => {
    setSelectedIdea(candidates.find((c) => c.id === id) || null);
  }, [candidates]);

  const filteredRadarItems = useMemo(() => {
    if (statusFilter === "all") return radarItems;
    return radarItems.filter((item) => {
      if (statusFilter === "new") return !item.status || item.status === "new";
      return item.status === statusFilter;
    });
  }, [radarItems, statusFilter]);

  return (
    <AppShell
      user={user}
      conversations={convList}
      activeConversationId={activeConversationId}
      onSelectConversation={handleSelectConversation}
      onNewConversation={handleNewConversation}
      onDeleteConversation={handleDeleteConversation}
    >
      <div className="flex h-full overflow-hidden">
        {/* Source Panel — lg only (3-Pane) */}
        {sourcePanelOpen && (
          <div className="hidden w-60 shrink-0 lg:block">
            <SourcePanel
              activeTab={sourceTab}
              onTabChange={setSourceTab}
              radarItems={filteredRadarItems}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              onItemClick={handleSourceItemClick}
              onStartChat={handleStartChat}
              conversations={convList}
              activeConversationId={activeConversationId}
              onSelectConversation={handleSelectConversation}
              similarSources={similarSources}
            />
          </div>
        )}

        {/* Chat Panel — main area */}
        <div className="flex-1 bg-[var(--dx-surface-panel,var(--axis-surface-default))]">
          {activeConversationId ? (
            <div className="flex h-full flex-col">
              {/* Source panel toggle */}
              <div className="flex items-center gap-2 border-b border-[var(--axis-border-default)] px-3 py-1.5">
                <button
                  onClick={() => setSourcePanelOpen((p) => !p)}
                  className={`text-xs px-2 py-1 rounded ${
                    sourcePanelOpen
                      ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-on-brand)]"
                      : "text-[var(--axis-text-tertiary)] hover:bg-[var(--axis-surface-hover)]"
                  }`}
                >
                  소스
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ChatPanel
                  conversationId={activeConversationId}
                  initialMessages={chatMessages}
                  isLoadingMessages={isLoadingMessages}
                  onToolResult={handleToolResult}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="mx-auto max-w-2xl px-4">
                <h2 className="mb-6 text-center text-xl font-semibold text-[var(--axis-text-primary)]">
                  무엇을 하고 싶으신가요?
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Link to="/venture" className="dx-panel-flush dx-panel-hover group p-8 transition-all hover:border-[var(--axis-text-brand)]">
                    <h3 className="text-lg font-semibold text-[var(--axis-text-primary)]">사업 탐색</h3>
                    <p className="mt-2 text-sm text-[var(--axis-text-tertiary)]">AI가 산업을 분석하고 사업 기회를 발굴합니다</p>
                    <span className="mt-3 inline-block text-sm font-medium text-[var(--axis-text-brand)]">사업 탐색 시작 →</span>
                  </Link>
                  <Link to="/discoveries" className="dx-panel-flush dx-panel-hover group p-8 transition-all hover:border-[var(--axis-text-brand)]">
                    <h3 className="text-lg font-semibold text-[var(--axis-text-primary)]">아이디어 검증</h3>
                    <p className="mt-2 text-sm text-[var(--axis-text-tertiary)]">내가 가진 아이디어를 실험하고 검증합니다</p>
                    <span className="mt-3 inline-block text-sm font-medium text-[var(--axis-text-brand)]">Discovery 시작 →</span>
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Summary Panel — lg only (3-Pane right), or Context Panel fallback */}
        {sourcePanelOpen && activeConversationId ? (
          <div className="hidden w-80 shrink-0 lg:block">
            <SummaryPanel
              activeSource={activeSource}
              candidates={candidates}
              onSelectCandidate={handleSelectCandidate}
              selectedIdea={selectedIdea}
              onClose={() => setSourcePanelOpen(false)}
            />
          </div>
        ) : contextPanelOpen && contextItems.length > 0 ? (
          <div className="hidden w-72 shrink-0 lg:block">
            <ContextPanel
              items={contextItems}
              onClose={() => setContextPanelOpen(false)}
            />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  let title = "오류가 발생했습니다";
  let message = "알 수 없는 오류가 발생했습니다.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message = error.data?.message || "페이지를 불러올 수 없습니다.";
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--dx-surface-deep,var(--axis-surface-secondary))]">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-[var(--axis-text-primary)]">{title}</h1>
        <p className="mt-2 text-sm text-[var(--axis-text-secondary)]">{message}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-md bg-[var(--axis-button-bg-default)] px-4 py-2 text-sm text-[var(--axis-button-text-default)] hover:bg-[var(--axis-button-bg-hover)]"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
