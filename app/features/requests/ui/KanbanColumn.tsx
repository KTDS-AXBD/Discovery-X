/**
 * 칸반 단일 열 — 빈 열은 세로 스트립으로 축소, 드래그 오버 시 확장
 */

import { useState } from "react";
import type { RequestWithReview } from "../types";
import { RequestCard } from "./RequestCard";

interface KanbanColumnProps {
  title: string;
  count: number;
  requests: RequestWithReview[];
  droppable?: boolean;
  onDrop?: (requestId: string) => void;
  onCardClick: (request: RequestWithReview) => void;
  draggableCards?: boolean;
  onDragStart?: (e: React.DragEvent, request: RequestWithReview) => void;
  className?: string;
  accentColor?: string;
}

export function KanbanColumn({
  title,
  count,
  requests,
  droppable,
  onDrop,
  onCardClick,
  draggableCards,
  onDragStart,
  className,
  accentColor,
}: KanbanColumnProps) {
  const [dragOver, setDragOver] = useState(false);
  const isEmpty = requests.length === 0;

  function handleDragOver(e: React.DragEvent) {
    if (!droppable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDragOver(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    if (!droppable || !onDrop) return;
    e.preventDefault();
    setDragOver(false);
    const requestId = e.dataTransfer.getData("text/plain");
    if (requestId) onDrop(requestId);
  }

  /* ── 빈 열: 축소 스트립 (드래그 오버 시 확장) ── */
  if (isEmpty) {
    return (
      <div
        className={`
          flex shrink-0 flex-col items-center justify-center rounded-lg
          transition-all duration-300 ease-out
          ${dragOver
            ? "w-48 bg-accent/10 ring-2 ring-accent ring-inset shadow-inner"
            : "w-10 bg-surface-secondary/30 hover:bg-surface-secondary/50"
          }
          ${className ?? ""}
        `}
        style={{ minHeight: dragOver ? 200 : 120 }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {dragOver ? (
          <div className="flex flex-col items-center gap-2 text-accent">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m0 0l6.75-6.75M12 19.5l-6.75-6.75" />
            </svg>
            <span className="text-xs font-medium">{title}</span>
          </div>
        ) : (
          <span
            className="text-[11px] text-fg-quaternary tracking-wider select-none"
            style={{ writingMode: "vertical-rl" }}
          >
            {title}
          </span>
        )}
      </div>
    );
  }

  /* ── 활성 열: 확장, flex-1로 공간 채움 ── */
  return (
    <div
      className={`
        flex min-w-[240px] flex-1 flex-col rounded-lg
        transition-all duration-300
        ${dragOver
          ? "bg-accent/10 ring-2 ring-accent ring-inset"
          : "bg-surface-secondary/60"
        }
        ${className ?? ""}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column header */}
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        {accentColor && (
          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${accentColor}`} />
        )}
        <span className="text-sm font-semibold text-fg">{title}</span>
        <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium tabular-nums text-fg-secondary">
          {count}
        </span>
      </div>

      {/* Cards */}
      <div
        className="flex flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-2.5"
        style={{ maxHeight: "calc(100vh - 220px)" }}
      >
        {requests.map((r) => (
          <RequestCard
            key={r.id}
            request={r}
            onClick={onCardClick}
            draggable={draggableCards}
            onDragStart={onDragStart}
          />
        ))}
      </div>
    </div>
  );
}
