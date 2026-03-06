/**
 * 칸반 단일 열 + 드롭존
 */

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
}: KanbanColumnProps) {
  function handleDragOver(e: React.DragEvent) {
    if (!droppable) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function handleDrop(e: React.DragEvent) {
    if (!droppable || !onDrop) return;
    e.preventDefault();
    const requestId = e.dataTransfer.getData("text/plain");
    if (requestId) onDrop(requestId);
  }

  return (
    <div
      className={`flex w-56 shrink-0 flex-col rounded-lg bg-surface-secondary ${
        droppable ? "ring-accent/30 ring-2 ring-inset" : ""
      }`}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Column header */}
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-sm font-medium text-fg">{title}</span>
        <span className="rounded-full bg-surface px-2 py-0.5 text-xs text-fg-tertiary">{count}</span>
      </div>

      {/* Cards */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2" style={{ maxHeight: "calc(100vh - 220px)" }}>
        {requests.length === 0 ? (
          <div className="py-8 text-center text-xs text-fg-tertiary">없음</div>
        ) : (
          requests.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              onClick={onCardClick}
              draggable={draggableCards}
              onDragStart={onDragStart}
            />
          ))
        )}
      </div>
    </div>
  );
}
