/**
 * Sprint Progress 컴포넌트
 *
 * 스프린트 진행 상태를 표시하는 프로그레스 바
 */

import { Badge } from "~/components/ui/Badge";
import { VD_SPRINT_STATUS_CONFIG, getSprintProgress, getSprintDay } from "../constants/sprint-status";
import type { VdSprintStatusType } from "../types";

interface SprintProgressProps {
  status: VdSprintStatusType;
  showDay?: boolean;
  className?: string;
}

export function SprintProgress({
  status,
  showDay = true,
  className = "",
}: SprintProgressProps) {
  const config = VD_SPRINT_STATUS_CONFIG[status];
  const progress = getSprintProgress(status);
  const day = getSprintDay(status);

  return (
    <div className={className}>
      {/* 상태 배지와 일차 */}
      <div className="mb-2 flex items-center justify-between">
        <Badge variant={config.variant}>{config.label}</Badge>
        {showDay && day !== null && (
          <span className="text-sm text-[var(--axis-text-tertiary)]">Day {day}</span>
        )}
      </div>

      {/* 프로그레스 바 */}
      <div className="h-2 w-full rounded-full bg-[var(--axis-surface-tertiary)]">
        <div
          className="h-full rounded-full bg-[var(--axis-surface-brand)] transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* 단계 표시 */}
      <div className="mt-2 flex justify-between text-xs text-[var(--axis-text-tertiary)]">
        <span>시작</span>
        <span>Gate 1</span>
        <span>Gate 2</span>
        <span>완료</span>
      </div>
    </div>
  );
}

interface SprintStatusBadgeProps {
  status: VdSprintStatusType;
  size?: "sm" | "md";
}

export function SprintStatusBadge({ status, size = "md" }: SprintStatusBadgeProps) {
  const config = VD_SPRINT_STATUS_CONFIG[status];

  return (
    <Badge variant={config.variant} className={size === "sm" ? "text-xs" : ""}>
      {config.label}
    </Badge>
  );
}

interface SprintTimelineProps {
  status: VdSprintStatusType;
  className?: string;
}

export function SprintTimeline({ status, className = "" }: SprintTimelineProps) {
  const stages: VdSprintStatusType[] = [
    "DRAFT",
    "RUNNING",
    "GATE1_PENDING",
    "DEEPDIVE",
    "GATE2_PENDING",
    "PACKAGING",
    "COMPLETED",
  ];

  const currentIndex = stages.indexOf(status);

  return (
    <div className={`flex items-center ${className}`}>
      {stages.map((stage, index) => {
        const config = VD_SPRINT_STATUS_CONFIG[stage];
        const isCompleted = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <div key={stage} className="flex items-center">
            {/* 단계 노드 */}
            <div
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium ${
                isCompleted
                  ? "bg-[var(--axis-badge-success-bg)] text-[var(--axis-badge-success-text)]"
                  : isCurrent
                    ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-on-brand)]"
                    : "bg-[var(--axis-surface-tertiary)] text-[var(--axis-text-tertiary)]"
              }`}
              title={config.label}
            >
              {isCompleted ? "✓" : index + 1}
            </div>

            {/* 연결선 */}
            {index < stages.length - 1 && (
              <div
                className={`mx-1 h-0.5 w-4 ${
                  isCompleted
                    ? "bg-[var(--axis-badge-success-bg)]"
                    : "bg-[var(--axis-surface-tertiary)]"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
