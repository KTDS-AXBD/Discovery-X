/**
 * 5칸반 레이아웃 + DnD 로직
 * 접수(OPEN) | AI검토(AI_REVIEWING+CLASSIFIED) | 사람검토(HUMAN_REVIEW) | 반영(ACCEPTED) | 보류(REJECTED)
 */

import { useFetcher } from "@remix-run/react";
import type { RequestWithReview } from "../types";
import { KanbanColumn } from "./KanbanColumn";
import { ReviewPanel } from "./ReviewPanel";
import { useState } from "react";

interface KanbanBoardProps {
  requests: RequestWithReview[];
  isReviewer: boolean;
  canTriggerAiReview: boolean;
}

type ColumnKey = "open" | "aiReview" | "humanReview" | "accepted" | "rejected";

const COLUMNS: { key: ColumnKey; title: string; statuses: string[] }[] = [
  { key: "open", title: "접수", statuses: ["OPEN"] },
  { key: "aiReview", title: "AI 검토", statuses: ["AI_REVIEWING", "CLASSIFIED"] },
  { key: "humanReview", title: "사람 검토", statuses: ["HUMAN_REVIEW"] },
  { key: "accepted", title: "반영", statuses: ["ACCEPTED"] },
  { key: "rejected", title: "보류", statuses: ["REJECTED"] },
];

export function KanbanBoard({ requests, isReviewer, canTriggerAiReview }: KanbanBoardProps) {
  const [selectedRequest, setSelectedRequest] = useState<RequestWithReview | null>(null);
  const reviewFetcher = useFetcher();
  const statusFetcher = useFetcher();

  // 칸반별 요구사항 분류
  const grouped: Record<ColumnKey, RequestWithReview[]> = {
    open: [],
    aiReview: [],
    humanReview: [],
    accepted: [],
    rejected: [],
  };

  for (const r of requests) {
    const col = COLUMNS.find((c) => c.statuses.includes(r.status));
    if (col) grouped[col.key].push(r);
    else grouped.open.push(r); // fallback (IN_REVIEW 등 레거시)
  }

  // DnD: OPEN → AI검토 (AI 리뷰 트리거)
  function handleDropToAiReview(requestId: string) {
    if (!isReviewer || !canTriggerAiReview) return;
    reviewFetcher.submit(null, {
      method: "POST",
      action: `/api/requests/${requestId}/review`,
    });
  }

  // DnD: 사람검토 → 반영
  function handleDropToAccepted(requestId: string) {
    if (!isReviewer) return;
    statusFetcher.submit(
      JSON.stringify({ humanVerdict: "APPROVED" }),
      { method: "PATCH", action: `/api/requests/${requestId}`, encType: "application/json" },
    );
  }

  // DnD: 사람검토 → 보류
  function handleDropToRejected(requestId: string) {
    if (!isReviewer) return;
    statusFetcher.submit(
      JSON.stringify({ humanVerdict: "REJECTED" }),
      { method: "PATCH", action: `/api/requests/${requestId}`, encType: "application/json" },
    );
  }

  function handleDragStart(e: React.DragEvent, request: RequestWithReview) {
    e.dataTransfer.setData("text/plain", request.id);
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {/* 접수: 드래그 가능 (→ AI검토) */}
        <KanbanColumn
          title="접수"
          count={grouped.open.length}
          requests={grouped.open}
          draggableCards={isReviewer && canTriggerAiReview}
          onDragStart={handleDragStart}
          onCardClick={setSelectedRequest}
        />

        {/* AI 검토: 드롭 가능 (← 접수) */}
        <KanbanColumn
          title="AI 검토"
          count={grouped.aiReview.length}
          requests={grouped.aiReview}
          droppable={isReviewer && canTriggerAiReview}
          onDrop={handleDropToAiReview}
          onCardClick={setSelectedRequest}
        />

        {/* 사람 검토: 드래그 가능 (→ 반영/보류) */}
        <KanbanColumn
          title="사람 검토"
          count={grouped.humanReview.length}
          requests={grouped.humanReview}
          draggableCards={isReviewer}
          onDragStart={handleDragStart}
          onCardClick={setSelectedRequest}
        />

        {/* 반영: 드롭 가능 (← 사람검토) */}
        <KanbanColumn
          title="반영"
          count={grouped.accepted.length}
          requests={grouped.accepted}
          droppable={isReviewer}
          onDrop={handleDropToAccepted}
          onCardClick={setSelectedRequest}
        />

        {/* 보류: 드롭 가능 (← 사람검토) */}
        <KanbanColumn
          title="보류"
          count={grouped.rejected.length}
          requests={grouped.rejected}
          droppable={isReviewer}
          onDrop={handleDropToRejected}
          onCardClick={setSelectedRequest}
        />
      </div>

      {/* 상세 패널 */}
      <ReviewPanel
        request={selectedRequest}
        open={!!selectedRequest}
        onClose={() => setSelectedRequest(null)}
        isReviewer={isReviewer}
        canTriggerAiReview={canTriggerAiReview}
      />
    </>
  );
}
