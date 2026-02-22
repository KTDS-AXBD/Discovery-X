import { useState, useRef, useEffect, useCallback } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, useOutletContext, useNavigate, useRevalidator } from "@remix-run/react";
import { getDb } from "~/db";
import { IdeaService, RadarService } from "~/lib/services";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { usePanelLayout } from "~/lib/hooks/use-panel-layout";
import { ALL_METHODOLOGIES, METHODOLOGY_PROMPTS } from "~/lib/constants/methodology";
import { SourceInputPanel } from "~/components/ideas/SourceInputPanel";
import { IdeaChatWrapper } from "~/components/ideas/IdeaChatWrapper";
import { PanelResizeHandle } from "~/components/ideas/PanelResizeHandle";
import { ProposalCreationModal } from "~/components/ideas/ProposalCreationModal";
import { MethodologyCards } from "~/components/ideas/MethodologyCards";

// ── Types ─────────────────────────────────────────────────────────────

interface ChatMessageData {
  id: string;
  role: "user" | "assistant" | "tool_use" | "tool_result";
  content: string;
  toolName?: string | null;
  toolInput?: Record<string, unknown> | null;
  toolResult?: Record<string, unknown> | null;
  createdAt?: string | null;
}

interface OutletCtx {
  user: { id: string; name: string; email: string };
  ideaList: Array<{ id: string; title: string }>;
  allItems: Array<{
    id: string;
    title: string;
    titleKo: string | null;
    summaryKo: string | null;
    url: string;
    relevanceScore: number | null;
    status: string;
    collectedAt: number | string | null;
    memo: string | null;
  }>;
}

// ── Loader ────────────────────────────────────────────────────────────

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return redirect("/login");
    }

    const ideaId = params.id!;
    const ideaService = new IdeaService(db);

    const idea = await ideaService.getById(ideaId);

    if (idea) {
      const sources = await ideaService.getLinkedSourcesDetail(ideaId);
      return json({
        type: "idea" as const,
        idea,
        sources,
        item: null,
      });
    }

    // Fallback: radarItem (backward compatibility)
    const radarService = new RadarService(db);
    const item = await radarService.getItem(ideaId);

    if (!item) {
      throw new Response("Not Found", { status: 404 });
    }

    return json({
      type: "radarItem" as const,
      idea: null,
      sources: [],
      item,
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[ideas.$id.loader] Error:", error instanceof Error ? error.message : error);
    return redirect("/login");
  }
}

// ── EditableTitle ────────────────────────────────────────────────────

function EditableTitle({
  ideaId,
  initialTitle,
  onTitleUpdated,
}: {
  ideaId: string;
  initialTitle: string;
  onTitleUpdated: (newTitle: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(initialTitle);
  const [savedTitle, setSavedTitle] = useState(initialTitle);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(initialTitle);
    setSavedTitle(initialTitle);
  }, [initialTitle]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const saveTitle = useCallback(async () => {
    const trimmed = title.trim();
    if (!trimmed || trimmed === savedTitle) {
      setTitle(savedTitle);
      setEditing(false);
      return;
    }
    setSavedTitle(trimmed);
    setEditing(false);
    onTitleUpdated(trimmed);

    try {
      const res = await fetch("/api/ideas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: ideaId, title: trimmed }),
      });
      if (!res.ok) {
        setTitle(savedTitle);
        setSavedTitle(savedTitle);
      }
    } catch {
      setTitle(savedTitle);
      setSavedTitle(savedTitle);
    }
  }, [title, savedTitle, ideaId, onTitleUpdated]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      saveTitle();
    } else if (e.key === "Escape") {
      setTitle(savedTitle);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={saveTitle}
        onKeyDown={handleKeyDown}
        maxLength={200}
        className="w-full truncate rounded-md border border-line bg-surface px-2 py-1 text-lg font-semibold text-fg outline-none ring-1 ring-fg-brand/30 focus:ring-fg-brand"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex min-w-0 items-center gap-1.5 truncate rounded-md px-2 py-1 text-left text-lg font-semibold text-fg transition-colors hover:bg-surface-secondary"
      title="클릭하여 제목 편집"
    >
      <span className="truncate">{title || "아이디어"}</span>
      <svg className="h-3.5 w-3.5 shrink-0 text-fg-tertiary opacity-0 transition-opacity group-hover:opacity-100" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
      </svg>
    </button>
  );
}

// ── SuggestTitleButton ───────────────────────────────────────────────

function SuggestTitleButton({
  ideaId,
  onTitleSuggested,
}: {
  ideaId: string;
  onTitleSuggested: (newTitle: string) => void;
}) {
  const [loading, setLoading] = useState(false);

  const handleSuggest = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ideas/${ideaId}/suggest-title`, {
        method: "POST",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { title?: string };
      if (data.title) {
        onTitleSuggested(data.title);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSuggest}
      disabled={loading}
      className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-fg-brand transition-colors hover:bg-surface-brand/10 disabled:opacity-50"
      title="AI가 소스를 분석하여 제목을 추천합니다"
    >
      <svg className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
      </svg>
      {loading ? "추천 중..." : "AI 제목 추천"}
    </button>
  );
}

// ── IdeaDetail (3-Panel Workspace) ───────────────────────────────────

export default function IdeaDetail() {
  const data = useLoaderData<typeof loader>();
  const { allItems } = useOutletContext<OutletCtx>();
  const revalidator = useRevalidator();
  const navigate = useNavigate();

  const ideaId = data.type === "idea" && data.idea ? data.idea.id : null;
  const ideaTitle = data.type === "idea" && data.idea
    ? data.idea.title
    : (data.item?.titleKo ?? data.item?.title);

  // ─── Chat state ───
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessageData[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [proposalModalOpen, setProposalModalOpen] = useState(false);

  // ─── Panel layout ───
  const panel = usePanelLayout();

  // ─── Source selection (multi-select) ───
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [autoMessage, setAutoMessage] = useState<string | null>(null);
  const [loadingCategory, setLoadingCategory] = useState<string | null>(null);
  const [analysisRunning, setAnalysisRunning] = useState(false);
  const [categoryStates, setCategoryStates] = useState<Record<string, "pending" | "running" | "complete" | "failed">>({});

  // ─── Source items for this idea ───
  const [ideaSourceItems, setIdeaSourceItems] = useState(allItems);
  const isLoadingMessages = conversationId !== null && !messagesLoaded;

  // Auto-select all sources
  useEffect(() => {
    setSelectedSourceIds(ideaSourceItems.map((s) => s.id));
  }, [ideaSourceItems]);

  // Fetch sources for this idea
  useEffect(() => {
    if (!ideaId) {
      setIdeaSourceItems(allItems);
      return;
    }

    let cancelled = false;
    fetch(`/api/ideas/${ideaId}/sources`)
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
  }, [ideaId, allItems]);

  // Create conversation for this idea
  useEffect(() => {
    if (!ideaId) {
      setConversationId(null);
      setChatMessages([]);
      setMessagesLoaded(false);
      return;
    }

    let cancelled = false;
    fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: ideaTitle || "아이디어 분석" }),
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
  }, [ideaId, ideaTitle]);

  // Fetch messages
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

  // ─── Handlers ───

  const handleAddSources = useCallback(async (inputs: string[]): Promise<{ created: number; error?: string }> => {
    setIsAdding(true);
    try {
      const endpoint = ideaId
        ? `/api/ideas/${ideaId}/sources`
        : "/api/ideas/sources";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs }),
      });
      const result = await res.json() as { created?: number; error?: string };
      if (!res.ok) {
        return { created: 0, error: result.error || "추가 실패" };
      }
      revalidator.revalidate();
      return { created: result.created ?? 0 };
    } catch {
      return { created: 0, error: "네트워크 오류" };
    } finally {
      setIsAdding(false);
    }
  }, [revalidator, ideaId]);

  const handleDeleteSource = useCallback(async (radarItemId: string) => {
    if (!ideaId) return;
    try {
      await fetch(`/api/ideas/${ideaId}/sources`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ radarItemId }),
      });
      setSelectedSourceIds((prev) => prev.filter((id) => id !== radarItemId));
      revalidator.revalidate();
    } catch {
      // Silently fail
    }
  }, [ideaId, revalidator]);

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

  const [_detailSourceId, setDetailSourceId] = useState<string | null>(null);

  const handleStartAnalysis = useCallback(async () => {
    if (!ideaId) return;

    const selectedSources = ideaSourceItems.filter((s) => selectedSourceIds.includes(s.id));
    const sourceContext = selectedSources
      .map((s) => {
        const title = s.titleKo || s.title || "제목 없음";
        const summary = s.summaryKo || "";
        const url = s.url && !s.url.startsWith("text://") ? s.url : "";
        return `- **${title}**${summary ? `: ${summary}` : ""}${url ? ` (${url})` : ""}`;
      })
      .join("\n") || "소스 없음";

    const initialStates: Record<string, "pending"> = {};
    const cats = ["industry_example", "regulation", "market_research", "customer_research", "feasibility", "differentiation"];
    for (const c of cats) initialStates[c] = "pending";
    setCategoryStates(initialStates);
    setAnalysisRunning(true);

    try {
      const res = await fetch(`/api/ideas/${ideaId}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceContext, sourceIds: selectedSourceIds }),
      });

      if (!res.ok || !res.body) {
        setAnalysisRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === "category_start" && event.category) {
              setCategoryStates((prev) => ({ ...prev, [event.category]: "running" }));
            } else if (event.type === "category_complete" && event.category) {
              setCategoryStates((prev) => ({ ...prev, [event.category]: "complete" }));
              revalidator.revalidate();
            } else if (event.type === "category_error" && event.category) {
              setCategoryStates((prev) => ({ ...prev, [event.category]: "failed" }));
            }
          } catch {
            // Skip malformed JSON
          }
        }
      }
    } catch {
      // Network error
    }

    setAnalysisRunning(false);
    revalidator.revalidate();
  }, [ideaId, ideaSourceItems, selectedSourceIds, revalidator]);

  const handleRunMethodology = useCallback(async (category: string) => {
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

update_idea_analysis 도구를 사용하여 "${category}" 카테고리에 분석 결과를 저장해주세요. ideaId는 "${ideaId}"입니다. sourceIds는 ${JSON.stringify(selectedSourceIds)}입니다.`;

    setAutoMessage(msg);
  }, [ideaId, ideaSourceItems, selectedSourceIds]);

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

  // ─── Build methodology sections ───

  const sections: Record<string, { title: string; content: string; sources?: string[]; sourceIds?: string[] | null; analyzedAt?: string | null } | null> = {};
  for (const m of ALL_METHODOLOGIES) {
    sections[m.key] = null;
  }

  if (data.type === "idea" && data.idea) {
    const analysis = data.idea.analysisData as Record<string, { title?: string; content?: string; sources?: string[]; sourceIds?: string[]; analyzedAt?: string }> | null;
    if (analysis) {
      for (const key of Object.keys(analysis)) {
        if (analysis[key]?.content) {
          sections[key] = {
            title: analysis[key].title || key,
            content: analysis[key].content || "",
            sources: analysis[key].sources,
            sourceIds: analysis[key].sourceIds || null,
            analyzedAt: analysis[key].analyzedAt || null,
          };
        }
      }
    }

    if (!analysis && data.sources.length > 0) {
      const firstSource = data.sources[0];
      const keyPoints = Array.isArray(firstSource.keyPoints) ? (firstSource.keyPoints as string[]) : null;
      const summaryText = ((firstSource.summaryKo || "") as string);

      if (keyPoints?.length || summaryText) {
        sections.industry_example = {
          title: "산업별 사례",
          content: keyPoints?.length
            ? keyPoints.map((p: string, i: number) => `${i + 1}. ${p}`).join("\n\n")
            : summaryText,
          sources: firstSource.url ? [firstSource.url] : undefined,
        };
      }
    }
  } else if (data.type === "radarItem" && data.item) {
    const item = data.item;
    const keyPoints = Array.isArray(item.keyPoints) ? (item.keyPoints as string[]) : null;
    const summaryText = ((item.summaryKo || item.summary || "") as string);

    if (keyPoints?.length || summaryText) {
      sections.industry_example = {
        title: "산업별 사례",
        content: keyPoints?.length
          ? keyPoints.map((p: string, i: number) => `${i + 1}. ${p}`).join("\n\n")
          : summaryText,
        sources: item.url ? [item.url] : undefined,
      };
    }
  }

  // Detect stale sections
  const staleSections = new Set<string>();
  for (const [key, section] of Object.entries(sections)) {
    if (!section?.sourceIds) continue;
    const stored = new Set(section.sourceIds);
    const current = new Set(selectedSourceIds);
    if (stored.size !== current.size ||
        [...stored].some((id) => !current.has(id))) {
      staleSections.add(key);
    }
  }

  const isIdea = data.type === "idea" && data.idea;

  const handleTitleSaved = useCallback((newTitle: string) => {
    if (!ideaId) return;
    fetch("/api/ideas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ideaId, title: newTitle }),
    }).then(() => handleTitleUpdated());
  }, [ideaId, handleTitleUpdated]);

  // ─── Render: 3-Panel Workspace ───

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel toggle (collapsed) */}
      {!panel.leftOpen && (
        <button
          type="button"
          onClick={panel.toggleLeft}
          className="flex h-full w-6 shrink-0 items-center justify-center border-r border-line bg-surface-panel text-fg-tertiary transition-colors hover:bg-surface-secondary hover:text-fg-secondary"
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
            <button
              type="button"
              onClick={panel.toggleLeft}
              className="absolute right-1 top-2.5 z-20 flex h-5 w-5 items-center justify-center rounded text-fg-tertiary opacity-0 transition-opacity hover:bg-surface-secondary hover:text-fg-secondary group-hover/left:opacity-100"
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
              onDeleteSource={ideaId ? handleDeleteSource : undefined}
              onToggleItem={handleToggleSource}
              onToggleAll={handleToggleAll}
              onSelectItem={(id) => setDetailSourceId((prev) => (prev === id ? null : id))}
              isAdding={isAdding}
            />
          </div>
          <PanelResizeHandle side="left" onResize={panel.resizeLeft} />
        </>
      )}

      {/* Center: Detail / Methodology Cards */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          {isIdea && ideaId ? (
            <>
              <div className="min-w-0 flex-1">
                <EditableTitle
                  ideaId={ideaId}
                  initialTitle={ideaTitle || "아이디어"}
                  onTitleUpdated={handleTitleUpdated}
                />
              </div>
              <SuggestTitleButton
                ideaId={ideaId}
                onTitleSuggested={handleTitleSaved}
              />
            </>
          ) : (
            <h1 className="truncate text-lg font-semibold text-fg">
              {ideaTitle || "아이디어"}
            </h1>
          )}

          {/* Proposal button */}
          {isIdea && (
            <button
              type="button"
              onClick={() => setProposalModalOpen(true)}
              className="shrink-0 rounded-lg bg-surface-brand px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              사업 제안하기
            </button>
          )}
        </div>

        {/* Methodology Cards */}
        <MethodologyCards
          sections={sections}
          loadingCategory={loadingCategory}
          onRunMethodology={handleRunMethodology}
          staleSections={staleSections}
          onStartFullAnalysis={selectedSourceIds.length > 0 ? handleStartAnalysis : undefined}
          analysisRunning={analysisRunning}
        />
      </div>

      {/* Right: Chat Panel */}
      {panel.rightOpen && (
        <>
          <PanelResizeHandle side="right" onResize={panel.resizeRight} />
          <div style={{ width: panel.rightWidth }} className="group/right relative shrink-0 overflow-hidden">
            <button
              type="button"
              onClick={panel.toggleRight}
              className="absolute left-1 top-2.5 z-20 flex h-5 w-5 items-center justify-center rounded text-fg-tertiary opacity-0 transition-opacity hover:bg-surface-secondary hover:text-fg-secondary group-hover/right:opacity-100"
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
              analysisRunning={analysisRunning}
              categoryStates={categoryStates}
            />
          </div>
        </>
      )}

      {/* Right panel toggle (collapsed) */}
      {!panel.rightOpen && (
        <button
          type="button"
          onClick={panel.toggleRight}
          className="flex h-full w-6 shrink-0 items-center justify-center border-l border-line bg-surface-panel text-fg-tertiary transition-colors hover:bg-surface-secondary hover:text-fg-secondary"
          aria-label="채팅 패널 열기"
          title="채팅 패널 열기"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
        </button>
      )}

      {/* Proposal modal */}
      <ProposalCreationModal
        open={proposalModalOpen}
        onOpenChange={setProposalModalOpen}
        ideaTitle={ideaTitle}
        ideaId={ideaId ?? undefined}
        onProposalCreated={(proposalId) => {
          setProposalModalOpen(false);
          navigate(`/proposals/${proposalId}`);
        }}
      />
    </div>
  );
}
