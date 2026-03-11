import { useState } from "react";
import { useFetcher } from "@remix-run/react";
import { Button } from "~/components/ui/Button";
import type { SourceHealthRow } from "~/features/radar/service/health-metrics";

interface OperationActionsProps {
  sources: SourceHealthRow[];
  isGatekeeper: boolean;
}

interface ActionItem {
  key: string;
  icon: string;
  label: string;
  count: number;
  variant: "destructive" | "default";
  description: string;
}

function buildActions(sources: SourceHealthRow[]): ActionItem[] {
  const deactivateCandidates = sources.filter(
    (s) => s.healthScore !== null && s.healthScore < 0.3 && s.totalItems >= 20
  );
  const zeroConversion = sources.filter(
    (s) => s.conversionRate30d === 0 && s.totalItems >= 10 && s.status === "ACTIVE"
  );
  const highPerformers = sources.filter(
    (s) => s.conversionRate30d > 0.1 && s.status === "ACTIVE"
  );

  return [
    {
      key: "deactivate",
      icon: "⚠️",
      label: "비활성화 추천",
      count: deactivateCandidates.length,
      variant: "destructive" as const,
      description: "건강도 0.3 미만 소스",
    },
    {
      key: "zero-conversion",
      icon: "⚠️",
      label: "전환 0건 소스",
      count: zeroConversion.length,
      variant: "default" as const,
      description: "30일간 아이디어 전환 없음",
    },
    {
      key: "high-performer",
      icon: "⭐",
      label: "고성과 소스",
      count: highPerformers.length,
      variant: "default" as const,
      description: "전환율 10% 이상",
    },
  ].filter((a) => a.count > 0);
}

export function OperationActions({ sources, isGatekeeper }: OperationActionsProps) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const fetcher = useFetcher();
  const actions = buildActions(sources);

  if (!isGatekeeper) {
    return null;
  }

  if (actions.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-4 text-sm text-fg-tertiary">
        운영 액션 없음 — 모든 소스가 정상이에요.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {actions.map((action) => (
        <div
          key={action.key}
          className="rounded-lg border border-border bg-bg-secondary"
        >
          <button
            type="button"
            onClick={() => setExpanded(expanded === action.key ? null : action.key)}
            className="flex w-full items-center justify-between px-4 py-3 text-sm hover:bg-bg-tertiary/50 transition-colors"
          >
            <span>
              {action.icon} {action.label} ({action.count}건)
              <span className="ml-2 text-xs text-fg-tertiary">{action.description}</span>
            </span>
            <span className="text-xs text-fg-tertiary">{expanded === action.key ? "▲" : "▼"}</span>
          </button>
          {expanded === action.key && (
            <div className="border-t border-border px-4 py-3">
              <div className="space-y-2">
                {sources
                  .filter((s) => {
                    if (action.key === "deactivate") return s.healthScore !== null && s.healthScore < 0.3 && s.totalItems >= 20;
                    if (action.key === "zero-conversion") return s.conversionRate30d === 0 && s.totalItems >= 10 && s.status === "ACTIVE";
                    if (action.key === "high-performer") return s.conversionRate30d > 0.1 && s.status === "ACTIVE";
                    return false;
                  })
                  .map((s) => (
                    <div key={s.sourceId} className="flex items-center justify-between text-sm">
                      <span className="text-fg-secondary">{s.sourceName}</span>
                      {action.key === "deactivate" && (
                        <fetcher.Form method="post" action="/api/radar/health/actions">
                          <input type="hidden" name="intent" value="pause" />
                          <input type="hidden" name="sourceId" value={s.sourceId} />
                          <Button
                            type="submit"
                            variant="destructive"
                            size="sm"
                            disabled={fetcher.state !== "idle"}
                          >
                            일시정지
                          </Button>
                        </fetcher.Form>
                      )}
                      {action.key === "high-performer" && (
                        <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                          전환 {(s.conversionRate30d * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
