/**
 * 8칸반 레이아웃 + DnD 로직 (표준 개발 라이프사이클 통합)
 * 빈 열 자동 축소 + 활성 열 flex-grow + 요약 바
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

const COLUMNS: { key: ColumnKey; title: string; statuses: string[]; phase: "review" | "dev"; accentColor?: string }[] = [
  { key: "open", title: "접수", statuses: ["OPEN"], phase: "review" },
  { key: "aiReview", title: "AI 검토", statuses: ["AI_REVIEWING", "CLASSIFIED"], phase: "review" },
  { key: "humanReview", title: "담당자 검토", statuses: ["HUMAN_REVIEW"], phase: "review" },
  { key: "accepted", title: "반영", statuses: ["ACCEPTED"], phase: "review" },
  { key: "planned", title: "계획", statuses: ["PLANNED"], phase: "dev", accentColor: "bg-blue-500" },
  { key: "inProgress", title: "진행 중", statuses: ["IN_PROGRESS"], phase: "dev", accentColor: "bg-amber-500" },
  { key: "done", title: "완료", statuses: ["DONE"], phase: "dev", accentColor: "bg-emerald-500" },
  { key: "rejected", title: "보류", statuses: ["REJECTED"], phase: "review" },
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
    else grouped.open.push(r);
  }

  // 위상별 카운트
  const reviewCount = grouped.open.length + grouped.aiReview.length + grouped.humanReview.length + grouped.accepted.length;
  const devCount = grouped.planned.length + grouped.inProgress.length + grouped.done.length;

  // DnD handlers
  function handleDropToAiReview(requestId: string) {
    if (!isReviewer || !canTriggerAiReview) return;
    reviewFetcher.submit(null, {
      method: "POST",
      action: `/api/requests/${requestId}/review`,
    });
  }

  function handleDropToAccepted(requestId: string) {
    if (!isReviewer) return;
    statusFetcher.submit(
      JSON.stringify({ humanVerdict: "APPROVED" }),
      { method: "PATCH", action: `/api/requests/${requestId}`, encType: "application/json" },
    );
  }

  function handleDropToRejected(requestId: string) {
    if (!isReviewer) return;
    statusFetcher.submit(
      JSON.stringify({ humanVerdict: "REJECTED" }),
      { method: "PATCH", action: `/api/requests/${requestId}`, encType: "application/json" },
    );
  }

  function handleDropToOpen(requestId: string) {
    if (!isReviewer) return;
    statusFetcher.submit(
      JSON.stringify({ status: "OPEN" }),
      { method: "PATCH", action: `/api/requests/${requestId}`, encType: "application/json" },
    );
  }

  function handleDropToPlanned(requestId: string) {
    if (!isReviewer) return;
    const target = requests.find((r) => r.id === requestId);
    if (target) setPlanTarget(target);
  }

  function handleDropToInProgress(requestId: string) {
    if (!isReviewer) return;
    statusFetcher.submit(
      JSON.stringify({ lifecycleAction: "start_progress" }),
      { method: "PATCH", action: `/api/requests/${requestId}`, encType: "application/json" },
    );
  }

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
      {/* 필터 + 요약 바 */}
      <div className="mb-4 flex flex-wrap items-center gap-4">
        {/* 우선순위 필터 */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-fg-tertiary mr-1">우선순위:</span>
          {PRIORITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPriorityFilter(opt.value)}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors ${
                priorityFilter === opt.value
                  ? "bg-accent text-white"
                  : "bg-surface-secondary text-fg-secondary hover:bg-surface-tertiary"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {/* 위상 요약 카운터 */}
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5 text-fg-secondary">
            <span className="h-1.5 w-1.5 rounded-full bg-fg-tertiary" />
            검토 <span className="font-semibold text-fg font-mono-dx tabular-nums">{reviewCount}</span>
          </span>
          <span className="text-fg-quaternary">|</span>
          <span className="flex items-center gap-1.5 text-lab-accent">
            <span className="h-1.5 w-1.5 rounded-full bg-lab-accent" />
            개발 <span className="font-semibold font-mono-dx tabular-nums">{devCount}</span>
          </span>
          {grouped.rejected.length > 0 && (
            <>
              <span className="text-fg-quaternary">|</span>
              <span className="flex items-center gap-1.5 text-fg-tertiary">
                보류 <span className="font-semibold text-fg font-mono-dx tabular-nums">{grouped.rejected.length}</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* 위상 라벨 */}
      <div className="mb-2 flex items-center gap-3">
        <span className="text-[11px] font-medium uppercase tracking-widest text-fg-secondary font-mono-dx">
          Review Pipeline
        </span>
        <div className="flex-1 border-b border-line-subtle" />
        <span className="text-[11px] font-medium uppercase tracking-widest text-lab-accent font-mono-dx">
          Dev Lifecycle
        </span>
        <div className="flex-1 border-b border-line-subtle" />
      </div>

      {/* 칸반 보드 */}
      <div className="flex gap-2 pb-4" style={{ minHeight: "400px" }}>
        {/* ── 검토 파이프라인 ── */}
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
        <KanbanColumn
          title="AI 검토"
          count={grouped.aiReview.length}
          requests={grouped.aiReview}
          droppable={isReviewer && canTriggerAiReview}
          onDrop={handleDropToAiReview}
          onCardClick={setSelectedRequest}
        />
        <KanbanColumn
          title="담당자 검토"
          count={grouped.humanReview.length}
          requests={grouped.humanReview}
          draggableCards={isReviewer}
          onDragStart={handleDragStart}
          onCardClick={setSelectedRequest}
        />
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

        {/* ── 위상 구분선 ── */}
        <div className="flex shrink-0 flex-col items-center justify-center px-0.5">
          <div className="h-full w-px bg-gradient-to-b from-transparent via-lab-accent/40 to-transparent" />
        </div>

        {/* ── 개발 라이프사이클 ── */}
        <KanbanColumn
          title="계획"
          count={grouped.planned.length}
          requests={grouped.planned}
          droppable={isReviewer}
          onDrop={handleDropToPlanned}
          draggableCards={isReviewer}
          onDragStart={handleDragStart}
          onCardClick={setSelectedRequest}
          accentColor="bg-blue-500"
        />
        <KanbanColumn
          title="진행 중"
          count={grouped.inProgress.length}
          requests={grouped.inProgress}
          droppable={isReviewer}
          onDrop={handleDropToInProgress}
          draggableCards={isReviewer}
          onDragStart={handleDragStart}
          onCardClick={setSelectedRequest}
          accentColor="bg-amber-500"
        />
        <KanbanColumn
          title="완료"
          count={grouped.done.length}
          requests={grouped.done}
          droppable={isReviewer}
          onDrop={handleDropToDone}
          onCardClick={setSelectedRequest}
          accentColor="bg-emerald-500"
        />

        {/* ── 보류 ── */}
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

      {/* 계획 다이얼로그 */}
      <PlanDialog
        request={planTarget}
        open={!!planTarget}
        onClose={() => setPlanTarget(null)}
      />
    </>
  );
}
