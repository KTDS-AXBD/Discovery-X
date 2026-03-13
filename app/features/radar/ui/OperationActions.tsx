import { useState, useCallback, useMemo } from "react";
import { useFetcher } from "@remix-run/react";
import { Button } from "~/components/ui/Button";
import type { SourceHealthRow, DomainCoverage, UnclassifiedSource } from "~/features/radar/service/health-metrics";

// ============================================================================
// Types
// ============================================================================

interface OperationActionsProps {
  sources: SourceHealthRow[];
  domainCoverage?: DomainCoverage[];
  unclassified?: UnclassifiedSource[];
  isGatekeeper: boolean;
}

interface ClassifySuggestion {
  sourceId: string;
  suggestedDomainIds: string[];
  suggestedDomainNames: string[];
  suggestedFolderName: string | null;
  confidence: number;
  reasoning: string;
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
// Domain Coverage Panel (#20)
// ============================================================================

const DOMAIN_COVERAGE_THRESHOLD = 2;

function DomainCoveragePanel({ domains }: { domains: DomainCoverage[] }) {
  const lowCoverage = domains.filter(
    (d) => d.activeSourceCount < DOMAIN_COVERAGE_THRESHOLD,
  );

  if (lowCoverage.length === 0) return null;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-900/10">
      <div className="px-4 py-3 text-sm">
        <span>📡 커버리지 부족 도메인 ({lowCoverage.length}건)</span>
        <span className="ml-2 text-xs text-fg-tertiary">
          ACTIVE 소스 {DOMAIN_COVERAGE_THRESHOLD}개 미만
        </span>
      </div>
      <div className="border-t border-amber-200 px-4 py-3 dark:border-amber-800">
        <div className="space-y-1.5">
          {lowCoverage.map((d) => (
            <div
              key={d.domainId}
              className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm"
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: d.color ?? "#9ca3af" }}
              />
              <span className="flex-1 text-fg-secondary">{d.domainName}</span>
              <span className="text-xs text-fg-tertiary">
                소스 {d.activeSourceCount}개 — 추가 등록 권장
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Classification Panel (AI 분류 추천)
// ============================================================================

const CONFIDENCE_THRESHOLD = 0.5;

function ClassificationPanel({ count, sources }: { count: number; sources: UnclassifiedSource[] }) {
  const classifyFetcher = useFetcher();
  const applyFetcher = useFetcher();
  // overrides: sourceId → 사용자가 토글한 상태. 키가 없으면 confidence 기반 기본값 사용
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const sourceNameMap = useMemo(
    () => new Map(sources.map((s) => [s.sourceId, s.sourceName])),
    [sources],
  );
  const isClassifying = classifyFetcher.state !== "idle";
  const isApplying = applyFetcher.state !== "idle";
  const applyResult = applyFetcher.data as { ok?: boolean; applied?: number; foldersCreated?: number } | undefined;

  const classifyData = classifyFetcher.data as {
    ok?: boolean;
    suggestions?: ClassifySuggestion[];
    errors?: string[];
    budgetBlocked?: boolean;
  } | undefined;

  const suggestions = useMemo(() => classifyData?.suggestions ?? [], [classifyData]);
  const phase = classifyData?.ok ? "review" : isClassifying ? "loading" : "idle";

  // selectedIds: confidence 기본값 + 사용자 overrides 병합 (순수 파생)
  const selectedIds = useMemo(() => {
    const set = new Set<string>();
    for (const s of suggestions) {
      const override = overrides[s.sourceId];
      if (override !== undefined) {
        if (override) set.add(s.sourceId);
      } else if (s.confidence >= CONFIDENCE_THRESHOLD) {
        set.add(s.sourceId);
      }
    }
    return set;
  }, [suggestions, overrides]);

  const handleClassify = () => {
    setOverrides({});
    classifyFetcher.submit(
      { intent: "classify" },
      { method: "post", action: "/api/radar/health/classify" },
    );
  };

  const toggleAll = useCallback(() => {
    const allSelected = selectedIds.size === suggestions.length;
    const next: Record<string, boolean> = {};
    for (const s of suggestions) {
      next[s.sourceId] = !allSelected;
    }
    setOverrides(next);
  }, [selectedIds.size, suggestions]);

  const toggle = useCallback((id: string) => {
    setOverrides((prev) => ({
      ...prev,
      [id]: !selectedIds.has(id),
    }));
  }, [selectedIds]);

  const handleApply = () => {
    const assignments = suggestions
      .filter((s) => selectedIds.has(s.sourceId))
      .map((s) => ({
        sourceId: s.sourceId,
        domainIds: s.suggestedDomainIds,
        folderName: s.suggestedFolderName,
      }));

    applyFetcher.submit(
      {
        intent: "apply",
        assignments: JSON.stringify(assignments),
      },
      { method: "post", action: "/api/radar/health/classify" },
    );
  };

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-900/10">
      <div className="px-4 py-3 text-sm">
        <span>🤖 미분류 채널 AI 분류 ({count}건)</span>
        <span className="ml-2 text-xs text-fg-tertiary">
          도메인/폴더 미배정
        </span>
      </div>

      <div className="border-t border-indigo-200 px-4 py-3 dark:border-indigo-800">
        {/* Idle: 실행 버튼 */}
        {phase === "idle" && (
          <Button
            type="button"
            variant="default"
            size="sm"
            onClick={handleClassify}
          >
            AI 분류 실행
          </Button>
        )}

        {/* Loading */}
        {(phase === "loading" && isClassifying) && (
          <div className="animate-pulse text-sm text-fg-tertiary">
            AI 분석 중... (5건씩 배치 처리)
          </div>
        )}

        {/* 에러 표시 */}
        {classifyData?.errors && classifyData.errors.length > 0 && (
          <div className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {classifyData.errors.join(", ")}
          </div>
        )}

        {/* 적용 완료 피드백 */}
        {applyResult?.ok && (
          <div className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400">
            {applyResult.applied}건 적용 완료
            {applyResult.foldersCreated ? ` (신규 폴더 ${applyResult.foldersCreated}개 생성)` : ""}
          </div>
        )}

        {/* Review: 추천 결과 */}
        {phase === "review" && suggestions.length > 0 && !applyResult?.ok && (
          <div className="mt-2">
            {/* 전체 선택 + 적용 버튼 */}
            <div className="mb-3 flex items-center justify-between">
              <label className="flex items-center gap-2 text-xs text-fg-tertiary cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedIds.size === suggestions.length}
                  onChange={toggleAll}
                  className="rounded border-border"
                />
                전체 선택 ({selectedIds.size}/{suggestions.length})
              </label>
              <Button
                type="button"
                variant="default"
                size="sm"
                disabled={selectedIds.size === 0 || isApplying}
                onClick={handleApply}
              >
                {isApplying
                  ? "적용 중..."
                  : `선택 항목 적용 (${selectedIds.size}건)`}
              </Button>
            </div>

            {/* 추천 목록 */}
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {suggestions.map((s) => (
                <label
                  key={s.sourceId}
                  className="flex items-start gap-3 rounded-md px-2 py-2 text-sm cursor-pointer hover:bg-bg-tertiary/30 transition-colors select-none"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s.sourceId)}
                    onChange={() => toggle(s.sourceId)}
                    className="mt-0.5 rounded border-border"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-fg-secondary">
                        {sourceNameMap.get(s.sourceId) ?? s.sourceId}
                      </span>
                      <span className="text-xs text-fg-tertiary">
                        신뢰도 {(s.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-fg-tertiary">→</span>
                      {s.suggestedDomainNames.map((name) => (
                        <span
                          key={name}
                          className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
                        >
                          {name}
                        </span>
                      ))}
                      {s.suggestedFolderName && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                          📁 {s.suggestedFolderName}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-xs text-fg-tertiary">{s.reasoning}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function OperationActions({ sources, domainCoverage, unclassified, isGatekeeper }: OperationActionsProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const categories = buildCategories(sources);

  if (!isGatekeeper) return null;

  const hasDomainWarning = domainCoverage?.some(
    (d) => d.activeSourceCount < DOMAIN_COVERAGE_THRESHOLD,
  );
  const hasUnclassified = (unclassified?.length ?? 0) > 0;

  if (categories.length === 0 && !hasDomainWarning && !hasUnclassified) {
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

      {/* 도메인 커버리지 경고 */}
      {domainCoverage && <DomainCoveragePanel domains={domainCoverage} />}

      {/* AI 분류 추천 */}
      {hasUnclassified && <ClassificationPanel count={unclassified!.length} sources={unclassified!} />}
    </div>
  );
}
