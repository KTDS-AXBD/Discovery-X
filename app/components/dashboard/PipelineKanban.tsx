import { Link } from "@remix-run/react";
import { cn } from "~/lib/utils/cn";
import { ACTIVE_STATUSES } from "~/lib/constants/status";
import { DELAY_THRESHOLDS } from "~/features/proposals/constants";

interface DiscoveryItem {
  id: string;
  title: string;
  status: string;
  createdAt: string | null;
  stageUpdatedAt: string | null;
}

interface ProposalItem {
  id: string;
  title: string;
  status: string;
  updatedAt: string | null;
}

interface PipelineKanbanProps {
  discoveries: DiscoveryItem[];
  proposals: ProposalItem[];
}

const IDEA_TIMEBOX_DAYS = 28;

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const ts = typeof dateStr === "string" ? new Date(dateStr).getTime() : Number(dateStr) * 1000;
  if (Number.isNaN(ts)) return null;
  return Math.floor((Date.now() - ts) / (1000 * 60 * 60 * 24));
}

const COLUMNS = [
  { key: "ideas", label: "아이디어", color: "var(--axis-chart-bar)" },
  { key: "proposal", label: "사업 제안", color: "var(--axis-badge-secondary-text, #374151)" },
  { key: "formalization", label: "형상화", color: "var(--axis-badge-warning-text, #92400E)" },
  { key: "validation", label: "검증", color: "var(--axis-badge-purple-text, #6B21A8)" },
] as const;

type ColumnItem = {
  id: string;
  title: string;
  link: string;
  isDelayed: boolean;
  delayDays: number | null;
};

export function PipelineKanban({ discoveries, proposals }: PipelineKanbanProps) {
  const activeDiscoveries = discoveries.filter((d) =>
    (ACTIVE_STATUSES as readonly string[]).includes(d.status),
  );

  const proposalItems = proposals.filter((p) => p.status === "PROPOSAL");
  const formalizationItems = proposals.filter((p) => p.status === "FORMALIZATION");
  const validationItems = proposals.filter((p) => p.status === "VALIDATION");

  function mapDiscoveries(items: DiscoveryItem[]): ColumnItem[] {
    return items.map((d) => {
      const days = daysSince(d.stageUpdatedAt) ?? daysSince(d.createdAt);
      return {
        id: d.id,
        title: d.title,
        link: `/ideas/${d.id}`,
        isDelayed: days !== null && days > IDEA_TIMEBOX_DAYS,
        delayDays: days,
      };
    });
  }

  function mapProposals(items: ProposalItem[]): ColumnItem[] {
    return items.map((p) => {
      const days = daysSince(p.updatedAt);
      const threshold = DELAY_THRESHOLDS[p.status] ?? 14;
      return {
        id: p.id,
        title: p.title,
        link: `/proposals/${p.id}`,
        isDelayed: days !== null && days > threshold,
        delayDays: days,
      };
    });
  }

  const columns: { key: string; label: string; color: string; items: ColumnItem[] }[] = [
    { ...COLUMNS[0], items: mapDiscoveries(activeDiscoveries) },
    { ...COLUMNS[1], items: mapProposals(proposalItems) },
    { ...COLUMNS[2], items: mapProposals(formalizationItems) },
    { ...COLUMNS[3], items: mapProposals(validationItems) },
  ];

  return (
    <div className="dx-panel p-5">
      <h3 className="mb-4 text-base font-bold text-[var(--axis-text-primary)]">
        파이프라인
      </h3>

      <div className="grid grid-cols-4 gap-4">
        {columns.map((col) => (
          <div key={col.key} className="flex flex-col">
            {/* Header */}
            <div className="mb-3 flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: col.color }}
              />
              <span className="text-sm font-semibold text-[var(--axis-text-primary)]">
                {col.label}
              </span>
              <span className="rounded-full bg-[var(--axis-surface-secondary)] px-2 py-0.5 text-xs font-medium text-[var(--axis-text-secondary)]">
                {col.items.length}
              </span>
            </div>

            {/* Items */}
            <div className="space-y-1">
              {col.items.length === 0 ? (
                <p className="py-3 text-center text-xs text-[var(--axis-text-tertiary)]">
                  항목 없음
                </p>
              ) : (
                col.items.map((item) => (
                  <Link
                    key={item.id}
                    to={item.link}
                    className={cn(
                      "flex items-center gap-2 rounded px-2.5 py-2 text-sm transition-colors",
                      "text-[var(--axis-text-primary)] hover:bg-[var(--axis-surface-secondary)]/50",
                      "border border-transparent",
                      item.isDelayed && "border-[var(--axis-badge-destructive-bg)]",
                    )}
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: col.color }}
                    />
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    {item.isDelayed && item.delayDays !== null && (
                      <span className="shrink-0 rounded bg-[var(--axis-badge-destructive-bg)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--axis-badge-destructive-text)]">
                        {item.delayDays}d
                      </span>
                    )}
                  </Link>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
