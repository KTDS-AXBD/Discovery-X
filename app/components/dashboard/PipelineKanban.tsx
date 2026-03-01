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
  { key: "ideas", label: "아이디어" },
  { key: "proposal", label: "사업 제안" },
  { key: "formalization", label: "형상화" },
  { key: "validation", label: "검증" },
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

  const columns: { key: string; label: string; items: ColumnItem[] }[] = [
    { ...COLUMNS[0], items: mapDiscoveries(activeDiscoveries) },
    { ...COLUMNS[1], items: mapProposals(proposalItems) },
    { ...COLUMNS[2], items: mapProposals(formalizationItems) },
    { ...COLUMNS[3], items: mapProposals(validationItems) },
  ];

  return (
    <div className="dx-panel px-6 py-6">
      <h2 className="mb-4 text-base font-semibold text-fg">파이프라인</h2>

      <div className="grid grid-cols-4 gap-6">
        {columns.map((col) => (
          <div key={col.key}>
            {/* Column Header */}
            <h3 className="mb-3 text-sm font-semibold text-fg">
              {col.label}{" "}
              <span className="font-normal text-fg-tertiary">
                ({col.items.length})
              </span>
            </h3>

            {/* Column Items */}
            <div>
              {col.items.length === 0 ? (
                <div className="py-2 text-xs text-fg-tertiary">
                  진행 중인 항목 없음
                </div>
              ) : (
                col.items.map((item) => (
                  <Link
                    key={item.id}
                    to={item.link}
                    className={cn(
                      "block border-b border-line py-2 text-xs last:border-b-0",
                      "text-fg-secondary transition-colors hover:text-fg",
                      item.isDelayed && "text-badge-destructive-text",
                    )}
                  >
                    {item.title}
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
