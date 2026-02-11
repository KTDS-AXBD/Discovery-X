import { Link } from "@remix-run/react";
import { PROPOSAL_STATUS_LABELS, PROPOSAL_STATUS_COLORS } from "~/features/proposals/constants";
import { cn } from "~/lib/utils/cn";

interface PipelineStage {
  status: string;
  count: number;
}

interface PipelineViewProps {
  stages: PipelineStage[];
}

const PIPELINE_ORDER = ["PROPOSAL", "FORMALIZATION", "VALIDATION", "COMPLETED", "CLOSED"];

export function PipelineView({ stages }: PipelineViewProps) {
  const stageMap = new Map(stages.map((s) => [s.status, s.count]));
  const total = stages.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="rounded-xl border border-[var(--axis-border-default)] bg-[var(--dx-surface-card,var(--axis-surface-default))] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--axis-text-primary)]">파이프라인</h3>
        <span className="text-xs text-[var(--axis-text-tertiary)]">
          총 {total}건
        </span>
      </div>

      {/* Pipeline bar */}
      {total > 0 && (
        <div className="mb-3 flex h-2 overflow-hidden rounded-full">
          {PIPELINE_ORDER.map((status) => {
            const count = stageMap.get(status) || 0;
            if (count === 0) return null;
            const pct = (count / total) * 100;
            return (
              <div
                key={status}
                className={cn("h-full first:rounded-l-full last:rounded-r-full", getPipelineColor(status))}
                style={{ width: `${pct}%` }}
                title={`${PROPOSAL_STATUS_LABELS[status]}: ${count}건`}
              />
            );
          })}
        </div>
      )}

      {/* Stage cards */}
      <div className="grid grid-cols-5 gap-2">
        {PIPELINE_ORDER.map((status) => {
          const count = stageMap.get(status) || 0;
          const tabPath = getTabPath(status);
          return (
            <Link
              key={status}
              to={tabPath}
              className="rounded-lg border border-[var(--axis-border-default)] p-2 text-center transition-colors hover:bg-[var(--axis-surface-secondary)]"
            >
              <p className="text-lg font-bold text-[var(--axis-text-primary)]">{count}</p>
              <p className={cn(
                "text-[10px] font-medium",
                PROPOSAL_STATUS_COLORS[status]?.includes("text-") ? "" : "text-[var(--axis-text-tertiary)]",
              )}>
                <span className={cn("inline-block rounded px-1 py-0.5", PROPOSAL_STATUS_COLORS[status])}>
                  {PROPOSAL_STATUS_LABELS[status]}
                </span>
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function getPipelineColor(status: string): string {
  switch (status) {
    case "PROPOSAL": return "bg-gray-300";
    case "FORMALIZATION": return "bg-amber-400";
    case "VALIDATION": return "bg-blue-400";
    case "COMPLETED": return "bg-green-400";
    case "CLOSED": return "bg-red-300";
    default: return "bg-gray-200";
  }
}

function getTabPath(status: string): string {
  switch (status) {
    case "PROPOSAL": return "/proposals/new";
    case "FORMALIZATION": return "/proposals/formalization";
    case "VALIDATION": return "/proposals/validation";
    case "COMPLETED":
    case "CLOSED": return "/proposals/completed";
    default: return "/proposals";
  }
}
