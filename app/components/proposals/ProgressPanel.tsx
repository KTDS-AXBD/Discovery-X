import { useFetcher } from "@remix-run/react";
import { cn } from "~/lib/utils/cn";

interface Milestone {
  id: string;
  title: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
}

interface ActionItem {
  id: string;
  title: string;
  assigneeId: string | null;
  completed: number;
  dueDate: string | null;
}

interface ProgressPanelProps {
  proposalId: string;
  milestones: Milestone[];
  actions: ActionItem[];
  totalProgress: number;
  daysRemaining: number | null;
}

export function ProgressPanel({
  proposalId,
  milestones,
  actions,
  totalProgress,
  daysRemaining,
}: ProgressPanelProps) {
  const fetcher = useFetcher();
  const completedActions = actions.filter((a) => a.completed).length;

  return (
    <div className="p-4">
      <h3 className="mb-4 text-sm font-semibold text-[var(--axis-text-primary)]">진행 상황</h3>

      {/* Stats */}
      <div className="mb-4 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-[var(--axis-text-secondary)]">전체 진행률</span>
          <span className="font-medium text-[var(--axis-text-primary)]">{totalProgress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--axis-surface-secondary)]">
          <div
            className="h-full rounded-full bg-[var(--axis-text-brand)] transition-all"
            style={{ width: `${totalProgress}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-[var(--axis-text-tertiary)]">
          <span>완료된 작업 {completedActions}/{actions.length}</span>
          {daysRemaining !== null && <span>남은 기간 {daysRemaining}일</span>}
        </div>
      </div>

      {/* Milestones */}
      <h4 className="mb-2 text-xs font-semibold text-[var(--axis-text-tertiary)]">마일스톤</h4>
      <div className="mb-4 space-y-2">
        {milestones.map((ms) => (
          <div key={ms.id} className="flex items-start gap-2">
            <div className="mt-0.5">
              {ms.status === "COMPLETED" ? (
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--axis-text-success,#22C55E)] text-white">
                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
              ) : ms.status === "ACTIVE" ? (
                <div className="h-4 w-4 rounded-full border-2 border-[var(--axis-text-brand)] bg-[var(--axis-surface-brand)]" />
              ) : (
                <div className="h-4 w-4 rounded-full border-2 border-[var(--axis-border-default)]" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className={cn(
                "text-xs",
                ms.status === "COMPLETED"
                  ? "text-[var(--axis-text-tertiary)] line-through"
                  : "text-[var(--axis-text-primary)]"
              )}>
                {ms.title}
              </p>
            </div>
          </div>
        ))}
        {milestones.length === 0 && (
          <p className="text-xs text-[var(--axis-text-tertiary)]">마일스톤이 없습니다.</p>
        )}
      </div>

      {/* Action Items */}
      <h4 className="mb-2 text-xs font-semibold text-[var(--axis-text-tertiary)]">액션 아이템</h4>
      <div className="space-y-1.5">
        {actions.map((action) => (
          <label key={action.id} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!action.completed}
              onChange={() => {
                fetcher.submit(
                  JSON.stringify({ actionId: action.id, completed: !action.completed }),
                  {
                    method: "POST",
                    action: `/api/proposals/${proposalId}/actions`,
                    encType: "application/json",
                  }
                );
              }}
              className="h-3.5 w-3.5 rounded border-[var(--axis-border-default)] text-[var(--axis-text-brand)]"
            />
            <span className={cn(
              "flex-1 text-xs",
              action.completed
                ? "text-[var(--axis-text-tertiary)] line-through"
                : "text-[var(--axis-text-primary)]"
            )}>
              {action.title}
            </span>
          </label>
        ))}
        {actions.length === 0 && (
          <p className="text-xs text-[var(--axis-text-tertiary)]">액션 아이템이 없습니다.</p>
        )}
      </div>
    </div>
  );
}
