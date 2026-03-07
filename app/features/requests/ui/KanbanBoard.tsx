/**
 * 8칸반 레이아웃 + DnD 로직 (표준 개발 라이프사이클 통합)
 * 접수 | AI검토 | 담당자검토 | 반영 | 계획 | 진행중 | 완료 | 보류
 */

import { useFetcher } from "@remix-run/react";
import type { RequestWithReview } from "../types";
import { KanbanColumn } from "./KanbanColumn";
import { ReviewPanel } from "./ReviewPanel";
import { PlanDialog } from "./PlanDialog";
import { useState, useMemo } from "react";

interface KanbanBoardProps {
  requests: RequestWithReview[];
  isReviewer: boolean;
  canTriggerAiReview: boolean;
}

type ColumnKey = "open" | "aiReview" | "humanReview" | "accepted" | "planned" | "inProgress" | "done" | "rejected";

const COLUMNS: { key: ColumnKey; title: string; statuses: string[]; color?: string }[] = [
  { key: "open", title: "접수", statuses: ["OPEN"] },
  { key: "aiReview", title: "AI 검토", statuses: ["AI_REVIEWING", "CLASSIFIED"] },
  { key: "humanReview", title: "담당자 검토", statuses: ["HUMAN_REVIEW"] },
  { key: "accepted", title: "반영", statuses: ["ACCEPTED"] },
  { key: "planned", title: "계획", statuses: ["PLANNED"], color: "border-t-2 border-t-blue-500" },
  { key: "inProgress", title: "진행 중", statuses: ["IN_PROGRESS"], color: "border-t-2 border-t-amber-500" },
  { key: "done", title: "완료", statuses: ["DONE"], color: "border-t-2 border-t-green-500" },
  { key: "rejected", title: "보류", statuses: ["REJECTED"] },
];

const PRIORITY_OPTIONS = [
  { value: "", label: "전체" },
  { value: "high", label: "높음" },
  { value: "medium", label: "보통" },
  { value: "low", label: "낮음" },
];

export function KanbanBoard({ requests, isReviewer, canTriggerAiReview }: KanbanBoardProps) {
  const [selectedRequest, setSelectedRequest] = useState<RequestWithReview | null>(null);
  const [planTarget, setPlanTarget] = useState<RequestWithReview | null>(null);
  const [priorityFilter, setPriorityFilter] = useState("");
  const reviewFetcher = useFetcher();
  const statusFetcher = useFetcher();

  const filtered = useMemo(
    () => priorityFilter ? requests.filter((r) => r.priority === priorityFilter) : requests,
    [requests, priorityFilter],
  );

  // 칸반별 요구사항 분류
  const grouped: Record<ColumnKey, RequestWithReview[]> = {
    open: [],
    aiReview: [],
    humanReview: [],
    accepted: [],
    planned: [],
    inProgress: [],
    done: [],
    rejected: [],
  };

  for (const r of filtered) {
    const col = COLUMNS.find((c) => c.statuses.includes(r.status));
    if (col) grouped[col.key].push(r);
    else grouped.open.push(r); // fallback (IN_REVIEW 등 레거시)
  }

  // DnD: 접수 → AI검토 (AI 리뷰 트리거)
  function handleDropToAiReview(requestId: string) {
    if (!isReviewer || !canTriggerAiReview) return;
    reviewFetcher.submit(null, {
      method: "POST",
      action: `/api/requests/${requestId}/review`,
    });
  }

  // DnD: 담당자검토 → 반영
  function handleDropToAccepted(requestId: string) {
    if (!isReviewer) return;
    statusFetcher.submit(
      JSON.stringify({ humanVerdict: "APPROVED" }),
      { method: "PATCH", action: `/api/requests/${requestId}`, encType: "application/json" },
    );
  }

  // DnD: 담당자검토 → 보류
  function handleDropToRejected(requestId: string) {
    if (!isReviewer) return;
    statusFetcher.submit(
      JSON.stringify({ humanVerdict: "REJECTED" }),
      { method: "PATCH", action: `/api/requests/${requestId}`, encType: "application/json" },
    );
  }

  // DnD: 보류 → 접수 (재오픈)
  function handleDropToOpen(requestId: string) {
    if (!isReviewer) return;
    statusFetcher.submit(
      JSON.stringify({ status: "OPEN" }),
      { method: "PATCH", action: `/api/requests/${requestId}`, encType: "application/json" },
    );
  }

  // DnD: 반영 → 계획 (PlanDialog 오픈)
  function handleDropToPlanned(requestId: string) {
    if (!isReviewer) return;
    const target = requests.find((r) => r.id === requestId);
    if (target) setPlanTarget(target);
  }

  // DnD: 계획 → 진행중
  function handleDropToInProgress(requestId: string) {
    if (!isReviewer) return;
    statusFetcher.submit(
      JSON.stringify({ lifecycleAction: "start_progress" }),
      { method: "PATCH", action: `/api/requests/${requestId}`, encType: "application/json" },
    );
  }

  // DnD: 진행중 → 완료
  function handleDropToDone(requestId: string) {
    if (!isReviewer) return;
    statusFetcher.submit(
      JSON.stringify({ lifecycleAction: "mark_done" }),
      { method: "PATCH", action: `/api/requests/${requestId}`, encType: "application/json" },
    );
  }

  function handleDragStart(e: React.DragEvent, request: RequestWithReview) {
    e.dataTransfer.setData("text/plain", request.id);
    e.dataTransfer.effectAllowed = "move";
  }

  return (
    <>
      {/* 우선순위 필터 */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs text-fg-tertiary">우선순위:</span>
        {PRIORITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setPriorityFilter(opt.value)}
            className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
              priorityFilter === opt.value
                ? "bg-accent text-white"
                : "bg-surface-secondary text-fg-secondary hover:bg-surface-tertiary"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* 구분선 라벨 */}
      <div className="mb-3 flex items-center gap-4">
        <span className="text-[11px] font-medium uppercase tracking-widest text-fg-secondary font-mono-dx">검토 파이프라인</span>
        <div className="flex-1 border-b border-line-subtle" />
        <span className="text-[11px] font-medium uppercase tracking-widest text-lab-accent font-mono-dx">개발 라이프사이클</span>
        <div className="flex-1 border-b border-line-subtle" />
      </div>

      <div className="flex gap-3 overflow-x-auto pb-4">
        {/* 접수: 드래그 가능 (→ AI검토) + 드롭 가능 (← 보류) */}
        <KanbanColumn
          title="접수"
          count={grouped.open.length}
          requests={grouped.open}
          draggableCards={isReviewer && canTriggerAiReview}
          droppable={isReviewer}
          onDrop={handleDropToOpen}
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

        {/* 담당자 검토: 드래그 가능 (→ 반영/보류) */}
        <KanbanColumn
          title="담당자 검토"
          count={grouped.humanReview.length}
          requests={grouped.humanReview}
          draggableCards={isReviewer}
          onDragStart={handleDragStart}
          onCardClick={setSelectedRequest}
        />

        {/* 반영: 드롭 가능 (← 담당자검토) + 드래그 가능 (→ 계획) */}
        <KanbanColumn
          title="반영"
          count={grouped.accepted.length}
          requests={grouped.accepted}
          droppable={isReviewer}
          onDrop={handleDropToAccepted}
          draggableCards={isReviewer}
          onDragStart={handleDragStart}
          onCardClick={setSelectedRequest}
        />

        {/* 구분 바 */}
        <div className="flex w-px shrink-0 items-stretch bg-line-subtle" />

        {/* 계획: 드롭 가능 (← 반영) + 드래그 가능 (→ 진행중) */}
        <KanbanColumn
          title="계획"
          count={grouped.planned.length}
          requests={grouped.planned}
          droppable={isReviewer}
          onDrop={handleDropToPlanned}
          draggableCards={isReviewer}
          onDragStart={handleDragStart}
          onCardClick={setSelectedRequest}
          className="border-t-2 border-t-blue-500"
        />

        {/* 진행중: 드롭 가능 (← 계획) + 드래그 가능 (→ 완료) */}
        <KanbanColumn
          title="진행 중"
          count={grouped.inProgress.length}
          requests={grouped.inProgress}
          droppable={isReviewer}
          onDrop={handleDropToInProgress}
          draggableCards={isReviewer}
          onDragStart={handleDragStart}
          onCardClick={setSelectedRequest}
          className="border-t-2 border-t-amber-500"
        />

        {/* 완료: 드롭 가능 (← 진행중) */}
        <KanbanColumn
          title="완료"
          count={grouped.done.length}
          requests={grouped.done}
          droppable={isReviewer}
          onDrop={handleDropToDone}
          onCardClick={setSelectedRequest}
          className="border-t-2 border-t-green-500"
        />

        {/* 보류: 드롭 가능 (← 담당자검토/계획) + 드래그 가능 (→ 접수) */}
        <KanbanColumn
          title="보류"
          count={grouped.rejected.length}
          requests={grouped.rejected}
          droppable={isReviewer}
          onDrop={handleDropToRejected}
          draggableCards={isReviewer}
          onDragStart={handleDragStart}
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

      {/* 계획 다이얼로그 (반영→계획 전환 시) */}
      <PlanDialog
        request={planTarget}
        open={!!planTarget}
        onClose={() => setPlanTarget(null)}
      />
    </>
  );
}
