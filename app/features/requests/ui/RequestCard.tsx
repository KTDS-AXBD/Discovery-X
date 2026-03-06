/**
 * 요구사항 칸반 카드 — 상태별 다른 정보 표시
 */

import { Badge } from "~/components/ui/Badge";
import type { RequestWithReview } from "../types";
import { CLASSIFICATION_LABELS } from "../constants";

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

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={draggable ? (e) => onDragStart?.(e, r) : undefined}
      onClick={() => onClick(r)}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(r); }}
      className={`rounded-lg border border-line bg-surface-card p-3 text-left transition-colors hover:bg-surface-card-hover ${
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
      }`}
    >
      {/* 제목 + 우선순위 */}
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-sm font-medium text-fg">{r.title}</span>
        <Badge variant={PRIORITY_VARIANT[r.priority] ?? "subtle"} className="shrink-0 text-[10px]">
          {PRIORITY_LABELS[r.priority] ?? r.priority}
        </Badge>
      </div>

      {/* AI 분류 배지 (리뷰 있을 때) */}
      {r.review && (
        <div className="mt-2 flex items-center gap-2">
          <Badge variant={CLASSIFICATION_VARIANT[r.review.classification] ?? "default"} className="text-[10px]">
            {CLASSIFICATION_LABELS[r.review.classification] ?? r.review.classification}
          </Badge>
          <span className="text-xs text-fg-tertiary">
            {r.review.impactScore}/{r.review.feasibilityScore}
          </span>
        </div>
      )}

      {/* 보류 사유 */}
      {r.status === "REJECTED" && r.reason && (
        <p className="mt-2 line-clamp-2 text-xs text-fg-tertiary">{r.reason}</p>
      )}

      {/* Discovery 연결 */}
      {r.status === "ACCEPTED" && r.linkedDiscoveryId && (
        <p className="mt-2 text-xs text-accent">
          Discovery 연결됨
        </p>
      )}

      {/* 메타 */}
      <div className="mt-2 flex items-center gap-2 text-[11px] text-fg-tertiary">
        <span>{r.submitterName ?? "알 수 없음"}</span>
        <span>{daysAgo(r.createdAt)}</span>
      </div>
    </div>
  );
}
