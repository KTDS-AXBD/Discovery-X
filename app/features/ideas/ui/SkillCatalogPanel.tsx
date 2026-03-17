/**
 * SkillCatalogPanel — 범용 스킬 카탈로그 + 실행 UI
 *
 * 카테고리별 스킬 목록 표시 + 클릭 시 SSE 실행 + 진행 상태 + 결과 표시
 */

import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ────────────────────────────────────────────────────────────

interface Skill {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  chainNext: string[] | null;
}

interface ExecutionResult {
  executionId: string;
  skillSlug: string;
  resultMarkdown: string;
}

interface Props {
  ideaId: string;
  onExecutionComplete?: (result: ExecutionResult) => void;
}

interface StepEvent {
  type: "step";
  step: string;
  message: string;
  detail?: string;
  progress?: number;
}

interface CompleteEvent {
  type: "complete";
  executionId: string;
  skillSlug: string;
  resultMarkdown: string;
}

interface ErrorEvent {
  type: "error";
  message: string;
}

type SkillEvent = StepEvent | CompleteEvent | ErrorEvent;

const CATEGORY_LABELS: Record<string, string> = {
  discovery: "디스커버리",
  strategy: "전략 분석",
  "go-to-market": "GTM",
  "market-research": "시장 조사",
  execution: "실행",
  "data-analytics": "데이터 분석",
};

const CATEGORY_ORDER = ["discovery", "strategy", "go-to-market", "market-research", "execution", "data-analytics"];

// ── Component ────────────────────────────────────────────────────────

export function SkillCatalogPanel({ ideaId, onExecutionComplete }: Props) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ message: string; detail?: string; percent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ExecutionResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 카탈로그 로드
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ideas/skills")
      .then((r) => r.json() as Promise<{ skills: Skill[] }>)
      .then((data) => {
        if (!cancelled) {
          setSkills(data.skills || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // 스킬 실행 (SSE)
  const executeSkill = useCallback(async (skill: Skill) => {
    if (executing) return;
    setExecuting(skill.slug);
    setProgress({ message: "준비 중...", percent: 0 });
    setError(null);
    setLastResult(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const resp = await fetch("/api/ideas/skills/execute/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId, skillSlug: skill.slug }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = (await resp.json()) as { error?: string };
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      const reader = resp.body?.getReader();
      if (!reader) throw new Error("Stream unavailable");

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
            const event = JSON.parse(line.slice(6)) as SkillEvent;
            if (event.type === "step") {
              setProgress({ message: event.message, detail: event.detail, percent: event.progress || 0 });
            } else if (event.type === "complete") {
              setLastResult(event);
              onExecutionComplete?.(event);
            } else if (event.type === "error") {
              setError(event.message);
            }
          } catch { /* skip parse errors */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setError((err as Error).message);
      }
    } finally {
      setExecuting(null);
      setProgress(null);
      abortRef.current = null;
    }
  }, [ideaId, executing, onExecutionComplete]);

  // 카테고리별 그룹핑
  const grouped = CATEGORY_ORDER
    .map((cat) => ({
      category: cat,
      label: CATEGORY_LABELS[cat] || cat,
      items: skills.filter((s) => s.category === cat),
    }))
    .filter((g) => g.items.length > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-fg-tertiary">
        스킬 카탈로그 로딩 중...
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <p className="text-sm text-fg-tertiary">스킬이 등록되지 않았어요.</p>
        <button
          type="button"
          onClick={async () => {
            await fetch("/api/ideas/skills", { method: "POST" });
            window.location.reload();
          }}
          className="mt-3 rounded-lg bg-surface-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          기본 스킬 등록
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-4">
      {/* 실행 중 프로그레스 */}
      {progress && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800/40 dark:bg-blue-950/30">
          <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
            <span className="font-medium">{progress.message}</span>
            {progress.detail && <span className="opacity-60">{progress.detail}</span>}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-blue-100 dark:bg-blue-900/50">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-500"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      {/* 에러 */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600 dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {/* 마지막 결과 미리보기 */}
      {lastResult && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800/40 dark:bg-green-950/30">
          <div className="flex items-center gap-2 text-xs font-medium text-green-700 dark:text-green-300">
            <span>✓</span>
            <span>{lastResult.skillSlug} 완료</span>
          </div>
          <pre className="mt-2 max-h-40 overflow-y-auto text-[10px] leading-relaxed text-fg-secondary whitespace-pre-wrap">
            {lastResult.resultMarkdown.slice(0, 500)}
            {lastResult.resultMarkdown.length > 500 && "..."}
          </pre>
        </div>
      )}

      {/* 카테고리별 스킬 카드 */}
      {grouped.map((group) => (
        <div key={group.category}>
          <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
            {group.label}
          </h3>
          <div className="flex flex-col gap-1.5">
            {group.items.map((skill) => (
              <button
                key={skill.id}
                type="button"
                onClick={() => executeSkill(skill)}
                disabled={!!executing}
                className={`group flex items-start gap-2 rounded-lg border px-3 py-2 text-left transition-all ${
                  executing === skill.slug
                    ? "border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/30"
                    : executing
                      ? "cursor-not-allowed border-line bg-surface opacity-50"
                      : "border-line bg-surface hover:border-fg-tertiary hover:bg-surface-secondary"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-fg">{skill.name}</div>
                  <div className="mt-0.5 text-[10px] leading-snug text-fg-tertiary">
                    {skill.description}
                  </div>
                </div>
                <svg
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-tertiary opacity-0 transition-opacity group-hover:opacity-100"
                  fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                </svg>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
