import { Link } from "@remix-run/react";
import { PROPOSAL_STATUS_LABELS } from "~/features/proposals/constants";

interface PipelineItem {
  id: string;
  title: string;
}

interface PipelineStage {
  status: string;
  count: number;
  items?: PipelineItem[];
}

interface PipelineViewProps {
  stages: PipelineStage[];
}

const PIPELINE_ORDER = ["PROPOSAL", "FORMALIZATION", "VALIDATION", "COMPLETED", "CLOSED"];
const MAX_VISIBLE_ITEMS = 10;

const STAGE_ICONS: Record<string, string> = {
  PROPOSAL: "\u{1F4C4}",
  FORMALIZATION: "\u{1F3D7}\uFE0F",
  VALIDATION: "\u{1F50D}",
  COMPLETED: "\u2705",
  CLOSED: "\u{1F4E6}",
};

export function PipelineView({ stages }: PipelineViewProps) {
  const stageMap = new Map(stages.map((s) => [s.status, s]));
  const total = stages.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="rounded-xl border border-[var(--axis-border-default)] bg-[var(--dx-surface-card,var(--axis-surface-default))] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-[var(--axis-text-primary)]">파이프라인</h3>
        <span className="text-xs text-[var(--axis-text-tertiary)]">
          총 {total}건
        </span>
      </div>

      {/* Kanban columns */}
      <div className="flex gap-3 overflow-x-auto pb-2">
        {PIPELINE_ORDER.map((status) => {
          const stage = stageMap.get(status);
          const count = stage?.count || 0;
          const items = stage?.items || [];
          const tabPath = getTabPath(status);
          const visibleItems = items.slice(0, MAX_VISIBLE_ITEMS);
          const remaining = count - visibleItems.length;

          return (
            <div
              key={status}
              className="min-w-[180px] flex-1 shrink-0 rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-default)]"
            >
              {/* Column header */}
              <Link
                to={tabPath}
                className="flex items-center gap-1.5 border-b border-[var(--axis-border-default)] px-3 py-2 transition-colors hover:bg-[var(--axis-surface-secondary)]"
              >
                <span className="text-sm">{STAGE_ICONS[status]}</span>
                <span className="text-xs font-semibold text-[var(--axis-text-primary)]">
                  {PROPOSAL_STATUS_LABELS[status]}
                </span>
                <span className="ml-auto text-xs font-bold text-[var(--axis-text-tertiary)]">
                  {count}건
                </span>
                <svg className="h-3 w-3 text-[var(--axis-text-tertiary)]" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </Link>

              {/* Item list */}
              <div className="p-2 space-y-1">
                {visibleItems.length === 0 && (
                  <p className="px-1 py-2 text-center text-[10px] text-[var(--axis-text-tertiary)]">
                    항목 없음
                  </p>
                )}
                {visibleItems.map((item) => (
                  <Link
                    key={item.id}
                    to={`/proposals/${item.id}`}
                    className="block truncate rounded px-2 py-1 text-xs text-[var(--axis-text-secondary)] transition-colors hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-primary)]"
                  >
                    {item.title}
                  </Link>
                ))}
                {remaining > 0 && (
                  <Link
                    to={tabPath}
                    className="block px-2 py-1 text-[10px] text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-brand)]"
                  >
                    외 {remaining}건 &rarr;
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
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
