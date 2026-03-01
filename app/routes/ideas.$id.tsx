import { useState, useEffect, useCallback } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, useOutletContext, useNavigate, useRevalidator } from "@remix-run/react";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from "~/components/ui/Dialog";
import { getDb } from "~/db";
import { IdeaService, RadarService } from "~/lib/services";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { usePanelLayout } from "~/lib/hooks/use-panel-layout";
import { METHODOLOGY_PROMPTS, ALL_METHODOLOGIES } from "~/lib/constants/methodology";
import { buildSourceContext, buildMethodologySections, detectStaleSections } from "~/lib/ideas/section-builder";
import { EditableTitle } from "~/components/ideas/EditableTitle";
import { SuggestTitleButton } from "~/components/ideas/SuggestTitleButton";
import { SourceInputPanel } from "~/components/ideas/SourceInputPanel";
import { SimilarSources } from "~/components/ideas/SimilarSources";
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
  const [discoveryModalOpen, setDiscoveryModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

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
    const sourceContext = buildSourceContext(selectedSources);

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
    const sourceSummaries = buildSourceContext(selectedSources);

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
  const sections = buildMethodologySections(
    data.type === "idea"
      ? { type: "idea", idea: data.idea!, sources: data.sources }
      : { type: "radarItem", item: data.item! },
  );
  const staleSections = detectStaleSections(sections, selectedSourceIds);

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
          <div style={{ width: panel.leftWidth }} className="group/left relative flex shrink-0 flex-col overflow-hidden">
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
            <div className="min-h-0 flex-1">
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
            <SimilarSources
              sourceIds={selectedSourceIds}
              onAddSource={async (url) => { await handleAddSources([url]); }}
            />
          </div>
          <PanelResizeHandle side="left" onResize={panel.resizeLeft} />
        </>
      )}

      {/* Center: Detail / Methodology Cards */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Title bar */}
        <div className="relative z-20 flex items-center gap-2 border-b border-line px-4 py-3">
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

          {/* Delete + Proposal buttons */}
          {isIdea && ideaId && (
            <button
              type="button"
              onClick={() => setDeleteDialogOpen(true)}
              className="shrink-0 rounded-md p-1.5 text-fg-tertiary transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30"
              aria-label="아이디어 삭제"
              title="아이디어 삭제"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          )}
          {isIdea && ideaId && (
            <button
              type="button"
              onClick={() => setDiscoveryModalOpen(true)}
              className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-fg transition-colors hover:bg-surface-secondary"
            >
              Discovery 전환
            </button>
          )}
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

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>아이디어 삭제</DialogTitle>
          <DialogDescription>
            &ldquo;{ideaTitle}&rdquo;을(를) 삭제하시겠습니까? 연결된 분석 데이터도 함께 삭제됩니다.
          </DialogDescription>
          <div className="mt-6 flex justify-end gap-3">
            <DialogClose asChild>
              <button
                type="button"
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-secondary"
              >
                취소
              </button>
            </DialogClose>
            <button
              type="button"
              disabled={isDeleting}
              onClick={async () => {
                if (!ideaId) return;
                setIsDeleting(true);
                try {
                  const res = await fetch("/api/ideas", {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: ideaId }),
                  });
                  if (res.ok) {
                    setDeleteDialogOpen(false);
                    navigate("/ideas");
                  } else {
                    console.error("아이디어 삭제 실패:", await res.text());
                  }
                } catch (err) {
                  console.error("아이디어 삭제 오류:", err);
                } finally {
                  setIsDeleting(false);
                }
              }}
              className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              {isDeleting ? "삭제 중..." : "삭제"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

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

      {/* Discovery creation modal */}
      <CreateDiscoveryModal
        open={discoveryModalOpen}
        onOpenChange={setDiscoveryModalOpen}
        ideaId={ideaId}
        ideaTitle={ideaTitle || "아이디어"}
        onCreated={(discoveryId) => {
          setDiscoveryModalOpen(false);
          navigate(`/discoveries/${discoveryId}`);
        }}
      />
    </div>
  );
}

// ── CreateDiscoveryModal ─────────────────────────────────────────────

function CreateDiscoveryModal({
  open,
  onOpenChange,
  ideaId,
  ideaTitle,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ideaId: string | null;
  ideaTitle: string;
  onCreated: (discoveryId: string) => void;
}) {
  const [hypothesis, setHypothesis] = useState("");
  const [minimalAction, setMinimalAction] = useState("");
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [expectedEvidence, setExpectedEvidence] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!ideaId || !hypothesis || !minimalAction || !deadline || !expectedEvidence) {
      setError("모든 필드를 입력해주세요");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/ideas/${ideaId}/create-discovery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hypothesis, minimalAction, deadline, expectedEvidence }),
      });
      const data = await res.json() as { discoveryId?: string; error?: string };
      if (!res.ok) {
        setError(data.error || "생성 실패");
        return;
      }
      if (data.discoveryId) {
        onCreated(data.discoveryId);
      }
    } catch {
      setError("네트워크 오류");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>Discovery로 전환</DialogTitle>
        <DialogDescription>
          &ldquo;{ideaTitle}&rdquo;을(를) Discovery로 전환합니다. 첫 번째 실험 정보를 입력하세요.
        </DialogDescription>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-fg-secondary">가설</label>
            <textarea
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-tertiary focus:border-blue-500 focus:outline-none"
              placeholder="이 가설이 맞다면..."
              rows={2}
              maxLength={200}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-fg-secondary">최소 행동</label>
            <textarea
              value={minimalAction}
              onChange={(e) => setMinimalAction(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-tertiary focus:border-blue-500 focus:outline-none"
              placeholder="2주 내 할 수 있는 최소 실험..."
              rows={2}
              maxLength={200}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-fg-secondary">기한</label>
            <input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-fg-secondary">기대 근거</label>
            <textarea
              value={expectedEvidence}
              onChange={(e) => setExpectedEvidence(e.target.value)}
              className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-tertiary focus:border-blue-500 focus:outline-none"
              placeholder="성공 시 어떤 근거가 나오는지..."
              rows={2}
              maxLength={200}
            />
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <DialogClose asChild>
            <button
              type="button"
              className="rounded-lg border border-line px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-secondary"
            >
              취소
            </button>
          </DialogClose>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleSubmit}
            className="rounded-lg bg-surface-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? "생성 중..." : "Discovery 생성"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
