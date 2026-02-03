/**
 * Effort Distribution 컴포넌트
 *
 * Human vs Agent 노력 분포 시각화
 */

import type { VdEffortByActor } from "../types";

interface EffortDistributionProps {
  data: VdEffortByActor;
  className?: string;
}

export function EffortDistribution({ data, className = "" }: EffortDistributionProps) {
  const total = data.human + data.agent;
  const humanRatio = total > 0 ? (data.human / total) * 100 : 0;
  const agentRatio = total > 0 ? (data.agent / total) * 100 : 0;

  return (
    <div className={className}>
      {/* 프로그레스 바 */}
      <div className="mb-4 flex h-6 overflow-hidden rounded-full bg-[var(--axis-surface-tertiary)]">
        <div
          className="bg-[var(--axis-badge-success-bg)] transition-all duration-300"
          style={{ width: `${humanRatio}%` }}
          title={`Human: ${data.human}`}
        />
        <div
          className="bg-[var(--axis-badge-purple-bg)] transition-all duration-300"
          style={{ width: `${agentRatio}%` }}
          title={`Agent: ${data.agent}`}
        />
      </div>

      {/* 범례 */}
      <div className="flex justify-between text-sm">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-[var(--axis-badge-success-bg)]" />
          <span className="text-[var(--axis-text-secondary)]">
            Human: {data.human} ({humanRatio.toFixed(0)}%)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-[var(--axis-badge-purple-bg)]" />
          <span className="text-[var(--axis-text-secondary)]">
            Agent: {data.agent} ({agentRatio.toFixed(0)}%)
          </span>
        </div>
      </div>
    </div>
  );
}

interface EffortCompactProps {
  data: VdEffortByActor;
}

export function EffortCompact({ data }: EffortCompactProps) {
  const total = data.human + data.agent;
  const humanRatio = total > 0 ? (data.human / total) * 100 : 0;

  return (
    <div className="flex items-center gap-2">
      <div className="flex h-2 w-16 overflow-hidden rounded-full bg-[var(--axis-surface-tertiary)]">
        <div
          className="bg-[var(--axis-badge-success-bg)]"
          style={{ width: `${humanRatio}%` }}
        />
        <div
          className="bg-[var(--axis-badge-purple-bg)]"
          style={{ width: `${100 - humanRatio}%` }}
        />
      </div>
      <span className="text-xs text-[var(--axis-text-tertiary)]">
        {data.human}H / {data.agent}A
      </span>
    </div>
  );
}

interface EffortTimelineProps {
  events: Array<{
    createdAt: Date | string;
    actorType: "human" | "agent";
    eventType: string;
  }>;
  className?: string;
}

export function EffortTimeline({ events, className = "" }: EffortTimelineProps) {
  // 최근 20개만 표시
  const recentEvents = events.slice(0, 20);

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1">
        {recentEvents.map((event, index) => (
          <div
            key={index}
            className={`h-2 w-2 rounded-full ${
              event.actorType === "human"
                ? "bg-[var(--axis-badge-success-bg)]"
                : "bg-[var(--axis-badge-purple-bg)]"
            }`}
            title={`${event.actorType}: ${event.eventType}`}
          />
        ))}
      </div>
    </div>
  );
}
