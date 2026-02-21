import { useState, useRef, useEffect, useCallback } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, useOutletContext } from "@remix-run/react";
import { getDb } from "~/db";
import { IdeaService, RadarService } from "~/lib/services";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { MethodologyCards } from "~/components/ideas/MethodologyCards";
import { ALL_METHODOLOGIES } from "~/lib/constants/methodology";

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

    // Try loading as idea first
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

    // Fallback: try loading as radarItem (backward compatibility)
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

  // Sync with loader data
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
    // Optimistic update
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
        // Rollback
        setTitle(savedTitle);
        setSavedTitle(savedTitle);
      }
    } catch {
      // Rollback
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
        className="w-full truncate rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-default)] px-2 py-1 text-lg font-semibold text-[var(--axis-text-primary)] outline-none ring-1 ring-[var(--axis-text-brand)]/30 focus:ring-[var(--axis-text-brand)]"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group flex min-w-0 items-center gap-1.5 truncate rounded-md px-2 py-1 text-left text-lg font-semibold text-[var(--axis-text-primary)] transition-colors hover:bg-[var(--axis-surface-secondary)]"
      title="클릭하여 제목 편집"
    >
      <span className="truncate">{title || "아이디어"}</span>
      <svg className="h-3.5 w-3.5 shrink-0 text-[var(--axis-text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
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
      className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--axis-text-brand)] transition-colors hover:bg-[var(--axis-surface-brand)]/10 disabled:opacity-50"
      title="AI가 소스를 분석하여 제목을 추천합니다"
    >
      <svg className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
      </svg>
      {loading ? "추천 중..." : "AI 제목 추천"}
    </button>
  );
}

// ── OutletCtx ────────────────────────────────────────────────────────

interface OutletCtx {
  onRunMethodology: (category: string) => void;
  loadingCategory: string | null;
  onTitleUpdated: () => void;
  selectedSourceIds: string[];
}

export default function IdeaDetail() {
  const data = useLoaderData<typeof loader>();
  const { onRunMethodology, loadingCategory, onTitleUpdated, selectedSourceIds } = useOutletContext<OutletCtx>();

  // Build sections from idea analysis data — all methodology keys
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

    // If no analysis yet but has sources, show first source's summary
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

  // Detect stale sections: sourceIds changed since last analysis
  const staleSections = new Set<string>();
  for (const [key, section] of Object.entries(sections)) {
    if (!section?.sourceIds) continue; // No tracking data (legacy) → not stale
    const stored = new Set(section.sourceIds);
    const current = new Set(selectedSourceIds);
    if (stored.size !== current.size ||
        [...stored].some((id) => !current.has(id))) {
      staleSections.add(key);
    }
  }

  const isIdea = data.type === "idea" && data.idea;
  const ideaId = isIdea ? data.idea!.id : null;
  const title = isIdea
    ? data.idea!.title
    : (data.item?.titleKo ?? data.item?.title);

  const handleTitleSaved = useCallback((newTitle: string) => {
    // PATCH to save + trigger parent revalidation
    if (!ideaId) return;
    fetch("/api/ideas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: ideaId, title: newTitle }),
    }).then(() => onTitleUpdated());
  }, [ideaId, onTitleUpdated]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-[var(--axis-border-default)] px-4 py-3">
        {isIdea && ideaId ? (
          <>
            <div className="min-w-0 flex-1">
              <EditableTitle
                ideaId={ideaId}
                initialTitle={title || "아이디어"}
                onTitleUpdated={onTitleUpdated}
              />
            </div>
            <SuggestTitleButton
              ideaId={ideaId}
              onTitleSuggested={handleTitleSaved}
            />
          </>
        ) : (
          <h1 className="truncate text-lg font-semibold text-[var(--axis-text-primary)]">
            {title || "아이디어"}
          </h1>
        )}
      </div>

      {/* Methodology Cards */}
      <MethodologyCards
        sections={sections}
        loadingCategory={loadingCategory}
        onRunMethodology={onRunMethodology}
        staleSections={staleSections}
      />
    </div>
  );
}
