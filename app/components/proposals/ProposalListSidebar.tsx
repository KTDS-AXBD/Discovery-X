import { Link, useLocation } from "@remix-run/react";
import { useSidebar } from "~/lib/context/sidebar-context";
import { cn } from "~/lib/utils/cn";

interface ProposalSummary {
  id: string;
  title: string;
  status: string;
  teamSize: number | null;
  updatedAt: string | number | null;
}

interface ProposalListSidebarProps {
  proposals: ProposalSummary[];
  activeId?: string;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-[var(--axis-badge-secondary-bg,#E5E7EB)] text-[var(--axis-badge-secondary-text,#374151)]",
  REVIEWING: "bg-[var(--axis-badge-warning-bg)] text-[var(--axis-badge-warning-text)]",
  APPROVED: "bg-[var(--axis-badge-success-bg,#D1FAE5)] text-[var(--axis-badge-success-text,#065F46)]",
  REJECTED: "bg-[var(--axis-badge-destructive-bg,#FEE2E2)] text-[var(--axis-badge-destructive-text,#991B1B)]",
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "작성 중",
  REVIEWING: "검토 중",
  APPROVED: "승인됨",
  REJECTED: "반려됨",
};

export function ProposalListSidebar({ proposals, activeId }: ProposalListSidebarProps) {
  const location = useLocation();
  const { open, close } = useSidebar();

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 sm:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          "flex h-full flex-col border-r border-[var(--dx-border-subtle,var(--axis-border-default))] bg-[var(--dx-surface-panel,var(--axis-surface-default))] transition-transform duration-200",
          "fixed inset-y-0 left-0 z-50 sm:static sm:z-auto",
          open ? "translate-x-0" : "-translate-x-full sm:translate-x-0 sm:hidden",
        )}
        style={{ width: "var(--dx-sidebar-width)", top: "var(--dx-nav-height)" }}
      >
        {/* New proposal button */}
        <div className="px-3 pt-3">
          <Link
            to="/proposals/new"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--axis-button-bg-default)] px-4 py-2 text-sm font-medium text-[var(--axis-button-text-default)] transition-colors hover:bg-[var(--axis-button-bg-hover)]"
            onClick={() => { if (window.innerWidth < 640) close(); }}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            새 사업제안서
          </Link>
        </div>

        {/* Proposal list */}
        <div className="mt-3 flex-1 overflow-y-auto px-2 pb-3">
          <div className="space-y-1">
            {proposals.map((p) => {
              const isActive = activeId === p.id || location.pathname === `/proposals/${p.id}`;
              return (
                <Link
                  key={p.id}
                  to={`/proposals/${p.id}`}
                  onClick={() => { if (window.innerWidth < 640) close(); }}
                  className={cn(
                    "block rounded-lg px-3 py-2.5 transition-colors",
                    isActive
                      ? "bg-[var(--dx-surface-card,var(--axis-surface-brand))]"
                      : "hover:bg-[var(--dx-surface-card-hover,var(--axis-surface-secondary))]"
                  )}
                >
                  <p className="text-sm font-medium text-[var(--axis-text-primary)] line-clamp-1">
                    {p.title}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className={cn(
                      "inline-block rounded px-1.5 py-0.5 text-[10px] font-medium",
                      STATUS_COLORS[p.status] || STATUS_COLORS.DRAFT
                    )}>
                      {STATUS_LABELS[p.status] || p.status}
                    </span>
                    {p.teamSize && (
                      <span className="text-[10px] text-[var(--axis-text-tertiary)]">
                        {p.teamSize}명
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
            {proposals.length === 0 && (
              <p className="px-3 py-8 text-center text-sm text-[var(--axis-text-tertiary)]">
                사업제안이 없습니다.
              </p>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
