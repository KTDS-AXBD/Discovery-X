/**
 * 요구사항 칸반 카드 — 좌측 우선순위 스트라이프 + 글래스 카드
 */

import { Badge } from "~/components/ui/Badge";
import type { RequestWithReview } from "../types";
import { CLASSIFICATION_LABELS, TYPE_LABELS, DOMAIN_LABELS } from "../constants";

const PRIORITY_LABELS: Record<string, string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
};

const PRIORITY_VARIANT: Record<string, "destructive" | "warning" | "subtle"> = {
  high: "destructive",
  medium: "warning",
  low: "subtle",
};

const CLASSIFICATION_VARIANT: Record<string, "success" | "secondary" | "default" | "destructive"> = {
  ALREADY_DONE: "secondary",
  IN_PLAN: "default",
  NEW_VALUABLE: "success",
  OUT_OF_SCOPE: "destructive",
};

/** 좌측 스트라이프 색상 (priorityLevel 또는 legacy priority) */
const PRIORITY_STRIPE: Record<string, string> = {
  P0: "border-l-red-500",
  P1: "border-l-amber-400",
  P2: "border-l-sky-400",
  P3: "border-l-slate-500",
  high: "border-l-red-500",
  medium: "border-l-amber-400",
  low: "border-l-slate-500",
};

function daysAgo(dateStr: string): string {
  const created = new Date(dateStr);
  const now = new Date();
  const days = Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "오늘";
  return `${days}일 전`;
}

interface RequestCardProps {
  request: RequestWithReview;
  onClick: (request: RequestWithReview) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent, request: RequestWithReview) => void;
}

export function RequestCard({ request, onClick, draggable, onDragStart }: RequestCardProps) {
  const r = request;
  const stripeKey = r.priorityLevel ?? r.priority;
  const stripeColor = PRIORITY_STRIPE[stripeKey] ?? "border-l-slate-600";

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={draggable ? (e) => onDragStart?.(e, r) : undefined}
      onClick={() => onClick(r)}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(r); }}
      className={`
        group relative rounded-lg border-l-[3px] ${stripeColor}
        bg-surface-card shadow-sm
        p-3.5 text-left
        transition-all duration-200
        hover:shadow-md hover:-translate-y-0.5
        ${draggable ? "cursor-grab active:cursor-grabbing active:shadow-lg" : "cursor-pointer"}
      `}
    >
      {/* REQ 코드 */}
      {r.reqCode && (
        <div className="mb-1.5">
          <span className="inline-block rounded bg-lab-accent/10 px-1.5 py-0.5 text-[11px] font-semibold text-lab-accent font-mono-dx">
            {r.reqCode}
          </span>
        </div>
      )}

      {/* 제목 + 우선순위 */}
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-sm font-medium text-fg leading-snug line-clamp-2">
          {r.title}
        </span>
        {r.priorityLevel ? (
          <span className="shrink-0 text-[11px] font-bold text-fg-secondary font-mono-dx">{r.priorityLevel}</span>
        ) : (
          <Badge variant={PRIORITY_VARIANT[r.priority] ?? "subtle"} className="shrink-0 text-[11px]">
            {PRIORITY_LABELS[r.priority] ?? r.priority}
          </Badge>
        )}
      </div>

      {/* 유형 x 도메인 태그 */}
      {(r.type || r.domain) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {r.type && (
            <span className="rounded bg-surface-secondary px-1.5 py-0.5 text-[11px] text-fg-secondary">
              {TYPE_LABELS[r.type] ?? r.type}
            </span>
          )}
          {r.domain && (
            <span className="rounded bg-surface-secondary px-1.5 py-0.5 text-[11px] text-fg-secondary">
              {DOMAIN_LABELS[r.domain] ?? r.domain}
            </span>
          )}
          {r.specItemId && (
            <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent font-mono-dx">
              {r.specItemId}
            </span>
          )}
        </div>
      )}

      {/* AI 분류 배지 */}
      {r.review && (
        <div className="mt-2 flex items-center gap-2">
          <Badge variant={CLASSIFICATION_VARIANT[r.review.classification] ?? "default"} className="text-[11px]">
            {CLASSIFICATION_LABELS[r.review.classification] ?? r.review.classification}
          </Badge>
          <span className="text-xs text-fg-secondary font-mono-dx">
            {r.review.impactScore}/{r.review.feasibilityScore}
          </span>
        </div>
      )}

      {/* 보류 사유 */}
      {r.status === "REJECTED" && r.reason && (
        <p className="mt-2 line-clamp-2 text-xs text-fg-secondary leading-relaxed">{r.reason}</p>
      )}

      {/* Discovery 연결 / 마일스톤 */}
      {r.linkedDiscoveryId && (
        <p className="mt-2 text-xs text-accent">Discovery 연결됨</p>
      )}
      {r.milestoneVersion && (
        <p className="mt-1 text-[11px] text-fg-tertiary font-mono-dx">v{r.milestoneVersion}</p>
      )}

      {/* 메타 */}
      <div className="mt-2.5 flex items-center gap-2 text-xs text-fg-tertiary">
        <span>{r.submitterName ?? "알 수 없음"}</span>
        <span className="text-fg-quaternary">·</span>
        <span>{daysAgo(r.createdAt)}</span>
      </div>
    </div>
  );
}
