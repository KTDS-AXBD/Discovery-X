/**
 * SkillHistoryPanel — 스킬 실행 이력 목록 (Left Pane 탭)
 *
 * skill_executions 기반 실행 로그를 최신순으로 표시.
 * 클릭 시 onSelect 콜백으로 결과 마크다운 전달.
 */

import { useState, useEffect } from "react";

// ── Types ────────────────────────────────────────────────────────────

interface ExecutionItem {
  id: string;
  skillName: string | null;
  skillSlug: string | null;
  skillCategory: string | null;
  status: string;
  resultMarkdown: string | null;
  errorMessage: string | null;
  modelVersion: string | null;
  latencyMs: number | null;
  requestedAt: string | number | null;
  completedAt: string | number | null;
}

interface Props {
  ideaId: string;
  selectedId?: string | null;
  onSelect?: (execution: ExecutionItem) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  discovery: "디스커버리",
  strategy: "전략",
  "go-to-market": "GTM",
  "market-research": "시장조사",
  execution: "실행",
  "data-analytics": "데이터",
};

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  COMPLETED: { label: "완료", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  FAILED: { label: "실패", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  PROCESSING: { label: "실행 중", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  PENDING: { label: "대기", className: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400" },
};

function formatTime(ts: string | number | null): string {
  if (!ts) return "";
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}시간 전`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}일 전`;
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${m}/${day}`;
}

// ── Component ────────────────────────────────────────────────────────

export function SkillHistoryPanel({ ideaId, selectedId, onSelect }: Props) {
  const [items, setItems] = useState<ExecutionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/ideas/skills/executions?ideaId=${encodeURIComponent(ideaId)}`)
      .then((r) => r.json() as Promise<{ executions: ExecutionItem[] }>)
      .then((data) => {
        if (!cancelled) {
          setItems(data.executions || []);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [ideaId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-fg-tertiary">
        이력 로딩 중...
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="px-4 py-8 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-secondary">
          <svg className="h-5 w-5 text-fg-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </div>
        <p className="text-sm text-fg-tertiary">실행 이력이 없어요.</p>
        <p className="mt-1 text-[10px] text-fg-tertiary opacity-60">
          PM 스킬 탭에서 분석을 실행하면 여기에 기록돼요.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 overflow-y-auto p-3">
      <div className="mb-1 flex items-center justify-between px-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-fg-tertiary">
          실행 이력 ({items.length})
        </span>
      </div>
      {items.map((item) => {
        const badge = STATUS_BADGE[item.status] || STATUS_BADGE.PENDING;
        const isSelected = selectedId === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect?.(item)}
            className={`group flex flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-all ${
              isSelected
                ? "border-fg-tertiary bg-surface-secondary"
                : "border-line bg-surface hover:border-fg-tertiary hover:bg-surface-secondary"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-fg">
                {item.skillName || item.skillSlug || "알 수 없는 스킬"}
              </span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${badge.className}`}>
                {badge.label}
              </span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-fg-tertiary">
              {item.skillCategory && (
                <span className="rounded bg-surface-secondary px-1 py-0.5">
                  {CATEGORY_LABELS[item.skillCategory] || item.skillCategory}
                </span>
              )}
              {item.latencyMs && (
                <span>{(item.latencyMs / 1000).toFixed(1)}s</span>
              )}
              <span className="ml-auto">{formatTime(item.requestedAt)}</span>
            </div>
            {item.status === "FAILED" && item.errorMessage && (
              <p className="mt-0.5 truncate text-[10px] text-red-500">
                {item.errorMessage}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
