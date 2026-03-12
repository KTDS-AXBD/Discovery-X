import { useState, useCallback } from "react";
import { useFetcher } from "@remix-run/react";
import { Button } from "~/components/ui/Button";
import type { SourceHealthRow } from "~/features/radar/service/health-metrics";

// ============================================================================
// Types
// ============================================================================

interface OperationActionsProps {
  sources: SourceHealthRow[];
  isGatekeeper: boolean;
}

interface ActionCategory {
  key: string;
  icon: string;
  label: string;
  description: string;
  variant: "destructive" | "default";
  actionLabel: string | null; // null = 정보 표시만 (액션 버튼 없음)
  actionIntent: string | null;
  items: SourceHealthRow[];
}

// ============================================================================
// Helpers
// ============================================================================

function buildCategories(sources: SourceHealthRow[]): ActionCategory[] {
  const deactivateCandidates = sources.filter(
    (s) => s.healthScore !== null && s.healthScore < 0.3 && s.totalItems >= 20
  );
  const zeroConversion = sources.filter(
    (s) => s.conversionRate30d === 0 && s.totalItems >= 10 && s.status === "ACTIVE"
  );
  const highPerformers = sources.filter(
    (s) => s.conversionRate30d > 0.1 && s.status === "ACTIVE"
  );

  const all: ActionCategory[] = [
    {
      key: "deactivate",
      icon: "⚠️",
      label: "비활성화 추천",
      description: "건강도 0.3 미만 소스",
      variant: "destructive",
      actionLabel: "일시정지",
      actionIntent: "pause",
      items: deactivateCandidates,
    },
    {
      key: "zero-conversion",
      icon: "⚠️",
      label: "전환 0건 소스",
      description: "30일간 아이디어 전환 없음",
      variant: "default",
      actionLabel: "일시정지",
      actionIntent: "pause",
      items: zeroConversion,
    },
    {
      key: "high-performer",
      icon: "⭐",
      label: "고성과 소스",
      description: "전환율 10% 이상",
      variant: "default",
      actionLabel: null,
      actionIntent: null,
      items: highPerformers,
    },
  ];
  return all.filter((c) => c.items.length > 0);
}

// ============================================================================
// Category Panel (체크박스 선택 + 일괄 적용)
// ============================================================================

function CategoryPanel({
  category,
}: {
  category: ActionCategory;
}) {
  const fetcher = useFetcher();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(category.items.map((s) => s.sourceId))
  );

  const allSelected = selectedIds.size === category.items.length;
  const noneSelected = selectedIds.size === 0;
  const isBusy = fetcher.state !== "idle";
  const result = fetcher.data as { ok?: boolean; updatedCount?: number } | undefined;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(category.items.map((s) => s.sourceId)));
    }
  }, [allSelected, category.items]);

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBatchApply = () => {
    if (!category.actionIntent || noneSelected) return;
    fetcher.submit(
      {
        intent: category.actionIntent,
        sourceIds: JSON.stringify(Array.from(selectedIds)),
      },
      { method: "post", action: "/api/radar/health/actions" },
    );
  };

  return (
    <div className="border-t border-border px-4 py-3">
      {/* 전체 선택 + 일괄 적용 툴바 */}
      {category.actionLabel && (
        <div className="mb-3 flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs text-fg-tertiary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="rounded border-border"
            />
            전체 선택 ({selectedIds.size}/{category.items.length})
          </label>
          <Button
            type="button"
            variant={category.variant}
            size="sm"
            disabled={noneSelected || isBusy}
            onClick={handleBatchApply}
          >
            {isBusy
              ? "처리 중..."
              : `선택 항목 일괄 ${category.actionLabel} (${selectedIds.size}건)`}
          </Button>
        </div>
      )}

      {/* 결과 피드백 */}
      {result?.ok && (
        <div className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
          {result.updatedCount}건 처리 완료
        </div>
      )}

      {/* 소스 목록 (체크박스) */}
      <div className="space-y-1.5">
        {category.items.map((s) => (
          <label
            key={s.sourceId}
            className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-bg-tertiary/30 transition-colors select-none"
          >
            {category.actionLabel && (
              <input
                type="checkbox"
                checked={selectedIds.has(s.sourceId)}
                onChange={() => toggle(s.sourceId)}
                className="rounded border-border"
              />
            )}
            <span className="flex-1 truncate text-fg-secondary">{s.sourceName}</span>
            <span className="shrink-0 text-xs text-fg-tertiary">
              {category.key === "high-performer"
                ? `전환 ${(s.conversionRate30d * 100).toFixed(0)}%`
                : category.key === "deactivate"
                  ? `health ${(s.healthScore ?? 0).toFixed(2)}`
                  : `아이템 ${s.totalItems}건`}
            </span>
          </label>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function OperationActions({ sources, isGatekeeper }: OperationActionsProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const categories = buildCategories(sources);

  if (!isGatekeeper) return null;

  if (categories.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-4 text-sm text-fg-tertiary">
        운영 액션 없음 — 모든 소스가 정상이에요.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {categories.map((cat) => (
        <div
          key={cat.key}
          className="rounded-lg border border-border bg-bg-secondary"
        >
          <button
            type="button"
            onClick={() => setExpanded(expanded === cat.key ? null : cat.key)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-bg-tertiary/50 transition-colors"
          >
            <span>
              {cat.icon} {cat.label} ({cat.items.length}건)
              <span className="ml-2 text-xs text-fg-tertiary">{cat.description}</span>
            </span>
            <span className="text-xs text-fg-tertiary">
              {expanded === cat.key ? "▲" : "▼"}
            </span>
          </button>
          {expanded === cat.key && <CategoryPanel category={cat} />}
        </div>
      ))}
    </div>
  );
}
