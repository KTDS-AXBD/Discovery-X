import { useState } from "react";
import { useFetcher } from "@remix-run/react";
import { cn } from "~/lib/utils/cn";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/Select";

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
  assigneeName?: string | null;
  completed: number;
  dueDate: string | null;
}

interface Member {
  userId: string;
  userName: string | null;
}

interface TenantUser {
  id: string;
  name: string;
}

interface ProgressPanelProps {
  proposalId: string;
  milestones: Milestone[];
  actions: ActionItem[];
  totalProgress: number;
  daysRemaining: number | null;
  isOwner?: boolean;
  members?: Member[];
  tenantUsers?: TenantUser[];
}

const MILESTONE_CYCLE: Record<string, string> = {
  PENDING: "ACTIVE",
  ACTIVE: "COMPLETED",
  COMPLETED: "PENDING",
};

const MILESTONE_STATUS_LABEL: Record<string, string> = {
  PENDING: "대기",
  ACTIVE: "진행 중",
  COMPLETED: "완료",
};

export function ProgressPanel({
  proposalId,
  milestones,
  actions,
  totalProgress,
  daysRemaining,
  isOwner,
  members = [],
  tenantUsers = [],
}: ProgressPanelProps) {
  const fetcher = useFetcher();
  const milestoneFetcher = useFetcher();
  const actionFetcher = useFetcher();
  const memberFetcher = useFetcher();
  const completedActions = actions.filter((a) => a.completed).length;

  const [showAddMilestone, setShowAddMilestone] = useState(false);
  const [newMilestoneTitle, setNewMilestoneTitle] = useState("");
  const [showAddAction, setShowAddAction] = useState(false);
  const [newActionTitle, setNewActionTitle] = useState("");
  const [showAddMember, setShowAddMember] = useState(false);

  const memberUserIds = new Set(members.map((m) => m.userId));
  const availableUsers = tenantUsers.filter((u) => !memberUserIds.has(u.id));

  return (
    <div className="p-4">
      <h3 className="mb-4 text-sm font-semibold text-fg">진행 상황</h3>

      {/* Milestones */}
      <div className="mb-1 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-fg-tertiary">마일스톤</h4>
        {isOwner && (
          <button
            type="button"
            onClick={() => setShowAddMilestone(!showAddMilestone)}
            className="text-[10px] text-fg-brand hover:underline"
          >
            {showAddMilestone ? "취소" : "+ 추가"}
          </button>
        )}
      </div>

      {/* Add milestone form */}
      {showAddMilestone && (
        <div className="mb-2 flex gap-1">
          <input
            type="text"
            value={newMilestoneTitle}
            onChange={(e) => setNewMilestoneTitle(e.target.value)}
            placeholder="마일스톤 이름"
            className="flex-1 rounded border border-line bg-surface px-2 py-1 text-xs text-fg placeholder:text-fg-tertiary"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newMilestoneTitle.trim()) {
                milestoneFetcher.submit(
                  JSON.stringify({ title: newMilestoneTitle.trim() }),
                  { method: "POST", action: `/api/proposals/${proposalId}/milestones`, encType: "application/json" },
                );
                setNewMilestoneTitle("");
                setShowAddMilestone(false);
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (newMilestoneTitle.trim()) {
                milestoneFetcher.submit(
                  JSON.stringify({ title: newMilestoneTitle.trim() }),
                  { method: "POST", action: `/api/proposals/${proposalId}/milestones`, encType: "application/json" },
                );
                setNewMilestoneTitle("");
                setShowAddMilestone(false);
              }
            }}
            className="rounded bg-surface-brand px-2 py-1 text-[10px] text-white"
          >
            추가
          </button>
        </div>
      )}

      <div className="mb-4 relative">
        {/* Vertical connecting line */}
        {milestones.length > 1 && (
          <div
            className="absolute left-[7px] top-2 bottom-2 w-px bg-line"
          />
        )}
        <div className="space-y-3">
          {milestones.map((ms) => (
            <div key={ms.id} className="group flex items-start gap-2 relative">
              <button
                type="button"
                className="mt-0.5 shrink-0"
                title={`${MILESTONE_STATUS_LABEL[ms.status] || ms.status} → ${MILESTONE_STATUS_LABEL[MILESTONE_CYCLE[ms.status] || "PENDING"]}`}
                onClick={() => {
                  const nextStatus = MILESTONE_CYCLE[ms.status] || "PENDING";
                  milestoneFetcher.submit(
                    JSON.stringify({ milestoneId: ms.id, status: nextStatus }),
                    { method: "PUT", action: `/api/proposals/${proposalId}/milestones`, encType: "application/json" },
                  );
                }}
              >
                {ms.status === "COMPLETED" ? (
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-fg-success text-white">
                    <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                ) : ms.status === "ACTIVE" ? (
                  <div className="h-4 w-4 rounded-full border-2 border-fg-brand bg-surface-brand" />
                ) : (
                  <div className="h-4 w-4 rounded-full border-2 border-line" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className={cn(
                  "text-xs",
                  ms.status === "COMPLETED"
                    ? "text-fg-tertiary line-through"
                    : "text-fg"
                )}>
                  {ms.title}
                </p>
                {ms.startDate && ms.endDate && (() => {
                  const s = new Date(ms.startDate);
                  const e = new Date(ms.endDate);
                  const range = `${s.getFullYear()}.${String(s.getMonth() + 1).padStart(2, "0")}~${String(e.getMonth() + 1).padStart(2, "0")}`;
                  return (
                    <p className="text-[10px] text-fg-tertiary">{range}</p>
                  );
                })()}
              </div>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => {
                    milestoneFetcher.submit(
                      JSON.stringify({ milestoneId: ms.id }),
                      { method: "DELETE", action: `/api/proposals/${proposalId}/milestones`, encType: "application/json" },
                    );
                  }}
                  className="hidden shrink-0 text-[10px] text-fg-tertiary hover:text-fg-error group-hover:block"
                >
                  삭제
                </button>
              )}
            </div>
          ))}
          {milestones.length === 0 && (
            <p className="text-xs text-fg-tertiary">마일스톤이 없습니다.</p>
          )}
        </div>
      </div>

      {/* Action Items */}
      <div className="mb-1 flex items-center justify-between">
        <h4 className="text-xs font-semibold text-fg-tertiary">액션 아이템</h4>
        {isOwner && (
          <button
            type="button"
            onClick={() => setShowAddAction(!showAddAction)}
            className="text-[10px] text-fg-brand hover:underline"
          >
            {showAddAction ? "취소" : "+ 추가"}
          </button>
        )}
      </div>

      {/* Add action form */}
      {showAddAction && (
        <div className="mb-2 flex gap-1">
          <input
            type="text"
            value={newActionTitle}
            onChange={(e) => setNewActionTitle(e.target.value)}
            placeholder="액션 아이템 이름"
            className="flex-1 rounded border border-line bg-surface px-2 py-1 text-xs text-fg placeholder:text-fg-tertiary"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newActionTitle.trim()) {
                actionFetcher.submit(
                  JSON.stringify({ title: newActionTitle.trim() }),
                  { method: "POST", action: `/api/proposals/${proposalId}/actions`, encType: "application/json" },
                );
                setNewActionTitle("");
                setShowAddAction(false);
              }
            }}
          />
          <button
            type="button"
            onClick={() => {
              if (newActionTitle.trim()) {
                actionFetcher.submit(
                  JSON.stringify({ title: newActionTitle.trim() }),
                  { method: "POST", action: `/api/proposals/${proposalId}/actions`, encType: "application/json" },
                );
                setNewActionTitle("");
                setShowAddAction(false);
              }
            }}
            className="rounded bg-surface-brand px-2 py-1 text-[10px] text-white"
          >
            추가
          </button>
        </div>
      )}

      <div className="mb-4 space-y-1.5">
        {actions.map((action) => (
          <div key={action.id} className="group">
            <div className="flex items-center gap-2">
              <div className="flex flex-1 items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    fetcher.submit(
                      JSON.stringify({ actionId: action.id, completed: !action.completed }),
                      {
                        method: "POST",
                        action: `/api/proposals/${proposalId}/actions`,
                        encType: "application/json",
                      }
                    );
                  }}
                  className="h-4 w-4 shrink-0 appearance-none rounded border-2 border-line bg-surface relative cursor-pointer flex items-center justify-center"
                  style={action.completed ? { borderColor: "var(--axis-text-brand)", backgroundColor: "var(--axis-text-brand)" } : undefined}
                  aria-label={action.completed ? "완료 해제" : "완료 처리"}
                >
                  {action.completed ? (
                    <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth="3" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : null}
                </button>
                <span className={cn(
                  "flex-1 text-xs",
                  action.completed
                    ? "text-fg-tertiary line-through"
                    : "text-fg"
                )}>
                  {action.title}
                </span>
              </div>
              {isOwner && (
                <button
                  type="button"
                  onClick={() => {
                    actionFetcher.submit(
                      JSON.stringify({ actionId: action.id }),
                      { method: "DELETE", action: `/api/proposals/${proposalId}/actions`, encType: "application/json" },
                    );
                  }}
                  className="hidden shrink-0 text-[10px] text-fg-tertiary hover:text-fg-error group-hover:block"
                >
                  삭제
                </button>
              )}
            </div>
            <p className="ml-6 text-[10px] text-fg-tertiary">담당: {action.assigneeName || "미지정"}</p>
          </div>
        ))}
        {actions.length === 0 && (
          <p className="text-xs text-fg-tertiary">액션 아이템이 없습니다.</p>
        )}
      </div>

      {/* Members */}
      {members.length > 0 && (
        <>
          <div className="mb-1 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-fg-tertiary">팀 멤버</h4>
            {isOwner && availableUsers.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAddMember(!showAddMember)}
                className="text-[10px] text-fg-brand hover:underline"
              >
                {showAddMember ? "취소" : "+ 추가"}
              </button>
            )}
          </div>

          {showAddMember && (
            <div className="mb-2">
              <Select
                onValueChange={(value) => {
                  memberFetcher.submit(
                    JSON.stringify({ userId: value }),
                    { method: "POST", action: `/api/proposals/${proposalId}/members`, encType: "application/json" },
                  );
                  setShowAddMember(false);
                }}
              >
                <SelectTrigger className="w-full rounded border border-line bg-surface px-2 py-1 text-xs text-fg h-auto">
                  <SelectValue placeholder="멤버 선택..." />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="mb-4 space-y-1">
            {members.map((m) => (
              <div key={m.userId} className="group flex items-center justify-between">
                <span className="text-xs text-fg-secondary">{m.userName || "Unknown"}</span>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => {
                      memberFetcher.submit(
                        JSON.stringify({ userId: m.userId }),
                        { method: "DELETE", action: `/api/proposals/${proposalId}/members`, encType: "application/json" },
                      );
                    }}
                    className="hidden text-[10px] text-fg-tertiary hover:text-fg-error group-hover:block"
                  >
                    제거
                  </button>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Show add member button when no members yet */}
      {members.length === 0 && isOwner && availableUsers.length > 0 && (
        <>
          <div className="mb-1 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-fg-tertiary">팀 멤버</h4>
            <button
              type="button"
              onClick={() => setShowAddMember(!showAddMember)}
              className="text-[10px] text-fg-brand hover:underline"
            >
              {showAddMember ? "취소" : "+ 추가"}
            </button>
          </div>
          {showAddMember && (
            <div className="mb-4">
              <Select
                onValueChange={(value) => {
                  memberFetcher.submit(
                    JSON.stringify({ userId: value }),
                    { method: "POST", action: `/api/proposals/${proposalId}/members`, encType: "application/json" },
                  );
                  setShowAddMember(false);
                }}
              >
                <SelectTrigger className="w-full rounded border border-line bg-surface px-2 py-1 text-xs text-fg h-auto">
                  <SelectValue placeholder="멤버 선택..." />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {!showAddMember && (
            <p className="mb-4 text-xs text-fg-tertiary">멤버가 없습니다.</p>
          )}
        </>
      )}

      {/* Stats */}
      <div className="space-y-2">
        <h4 className="text-xs font-semibold text-fg-tertiary">통계</h4>
        <div className="flex items-center justify-between text-xs">
          <span className="text-fg-secondary">전체 진행률</span>
          <span className="font-medium text-fg">{totalProgress}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-secondary">
          <div
            className="h-full rounded-full bg-fg-brand transition-all"
            style={{ width: `${totalProgress}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-fg-tertiary">
          <span>완료된 작업 {completedActions}/{actions.length}</span>
          {daysRemaining !== null && <span>남은 기간 {daysRemaining}일</span>}
        </div>
      </div>
    </div>
  );
}
