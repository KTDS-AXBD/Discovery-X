import { useState, useEffect } from "react";
import { HealthSummaryCards } from "./HealthSummaryCards";
import { OperationActions } from "./OperationActions";
import { HealthScoreBadge } from "./HealthScoreBadge";
import type { HealthSummary, SourceHealthRow, TrendData } from "~/features/radar/service/health-metrics";

// ============================================================================
// Types
// ============================================================================

interface SourceHealthTabProps {
  tenantId: string;
  isGatekeeper: boolean;
}

interface DashboardData {
  summary: HealthSummary;
  sources: SourceHealthRow[];
  trend: TrendData[];
}

type SortKey = "health-desc" | "health-asc" | "items-desc" | "name-asc";

// ============================================================================
// Sort helper
// ============================================================================

function sortSources(sources: SourceHealthRow[], sortKey: SortKey): SourceHealthRow[] {
  return [...sources].sort((a, b) => {
    switch (sortKey) {
      case "health-desc":
        return (b.healthScore ?? -1) - (a.healthScore ?? -1);
      case "health-asc":
        return (a.healthScore ?? -1) - (b.healthScore ?? -1);
      case "items-desc":
        return b.totalItems - a.totalItems;
      case "name-asc":
        return a.sourceName.localeCompare(b.sourceName, "ko");
      default:
        return 0;
    }
  });
}

// ============================================================================
// Source Type Labels
// ============================================================================

const SOURCE_TYPE_LABELS: Record<string, string> = {
  rss: "RSS",
  site: "사이트",
  web: "Web",
  youtube: "YouTube",
  sns: "SNS",
};

// ============================================================================
// Main Component
// ============================================================================

export function SourceHealthTab({ tenantId, isGatekeeper }: SourceHealthTabProps) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("health-desc");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch("/api/radar/health");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as DashboardData;
        if (!cancelled) {
          setData(d);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unknown error");
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [tenantId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-fg-tertiary">
        <div className="animate-pulse">건강도 데이터 로딩 중...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-700 dark:bg-red-900/20 dark:text-red-400">
        데이터 로드 실패: {error}
      </div>
    );
  }

  if (!data) return null;

  const sorted = sortSources(data.sources, sortKey);

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <HealthSummaryCards summary={data.summary} />

      {/* 운영 액션 — gatekeeper 이상에게만 표시 */}
      {isGatekeeper && (
        <div>
          <h3 className="mb-3 text-sm font-semibold text-fg-secondary">운영 액션</h3>
          <OperationActions sources={data.sources} isGatekeeper={isGatekeeper} />
        </div>
      )}

      {/* 채널 건강도 목록 */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-fg-secondary">
            채널 건강도 ({data.sources.length})
          </h3>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="rounded-md border border-border bg-bg-secondary px-2 py-1 text-xs text-fg-secondary"
          >
            <option value="health-desc">건강도 높은 순</option>
            <option value="health-asc">건강도 낮은 순</option>
            <option value="items-desc">아이템 많은 순</option>
            <option value="name-asc">이름 순</option>
          </select>
        </div>

        <div className="space-y-2">
          {sorted.length === 0 ? (
            <div className="rounded-lg border border-border bg-bg-secondary p-8 text-center text-sm text-fg-tertiary">
              등록된 소스가 없어요. 채널 관리 탭에서 소스를 추가해주세요.
            </div>
          ) : (
            sorted.map((source) => (
              <div
                key={source.sourceId}
                className="flex items-center gap-4 rounded-lg border border-border bg-bg-secondary px-4 py-3 transition-colors hover:bg-bg-tertiary/30"
              >
                {/* 소스 이름 + 유형 */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-fg">
                      {source.sourceName}
                    </span>
                    <span className="shrink-0 text-[10px] text-fg-tertiary">
                      ({SOURCE_TYPE_LABELS[source.sourceType] ?? source.sourceType})
                    </span>
                    {source.status !== "ACTIVE" && (
                      <span className="shrink-0 rounded-full bg-fg-tertiary/10 px-2 py-0.5 text-[10px] text-fg-tertiary">
                        {source.status}
                      </span>
                    )}
                  </div>
                  {/* 메트릭 */}
                  <div className="mt-1 flex items-center gap-3 text-xs text-fg-tertiary">
                    <span>아이템 {source.totalItems}</span>
                    <span>참여 {(source.engagementRate * 100).toFixed(0)}%</span>
                    <span>전환 {(source.conversionRate30d * 100).toFixed(0)}%</span>
                    {source.avgRelevance > 0 && (
                      <span>관련도 {source.avgRelevance.toFixed(2)}</span>
                    )}
                  </div>
                </div>

                {/* Health Score Badge */}
                <div className="shrink-0">
                  <HealthScoreBadge
                    score={source.totalItems >= 20 ? source.healthScore : null}
                    totalItems={source.totalItems < 20 ? source.totalItems : undefined}
                  />
                </div>

                {/* Health Bar */}
                <div className="hidden w-24 sm:block">
                  <div className="h-2 rounded-full bg-fg-tertiary/10">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        source.healthScore === null
                          ? "bg-fg-tertiary/20"
                          : source.healthScore >= 0.5
                            ? "bg-emerald-500"
                            : source.healthScore >= 0.3
                              ? "bg-amber-500"
                              : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min((source.healthScore ?? 0) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
