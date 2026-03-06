/**
 * 카드 클릭 시 상세 + AI 리뷰 + HITL 판정 다이얼로그
 */

import { useState } from "react";
import { useFetcher } from "@remix-run/react";
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
import { MarkdownViewer } from "~/components/docs/MarkdownViewer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/Dialog";
import type { RequestWithReview } from "../types";
import { CLASSIFICATION_LABELS, STATUS_LABELS } from "../constants";

const CLASSIFICATION_VARIANT: Record<string, "success" | "secondary" | "default" | "destructive"> = {
  ALREADY_DONE: "secondary",
  IN_PLAN: "default",
  NEW_VALUABLE: "success",
  OUT_OF_SCOPE: "destructive",
};

interface ReviewPanelProps {
  request: RequestWithReview | null;
  open: boolean;
  onClose: () => void;
  isReviewer: boolean;
  canTriggerAiReview: boolean;
}

export function ReviewPanel({ request, open, onClose, isReviewer, canTriggerAiReview }: ReviewPanelProps) {
  const reviewFetcher = useFetcher();
  const verdictFetcher = useFetcher();
  const [comment, setComment] = useState("");

  if (!request) return null;

  const r = request;
  const review = r.review;
  const isReviewing = reviewFetcher.state !== "idle";
  const isSubmitting = verdictFetcher.state !== "idle";

  function triggerAiReview() {
    reviewFetcher.submit(null, {
      method: "POST",
      action: `/api/requests/${r.id}/review`,
    });
  }

  function submitVerdict(verdict: "APPROVED" | "REJECTED" | "NEEDS_REVISION") {
    verdictFetcher.submit(
      JSON.stringify({ humanVerdict: verdict, humanComment: comment.trim() || undefined }),
      { method: "PATCH", action: `/api/requests/${r.id}`, encType: "application/json" },
    );
    setComment("");
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-8">{r.title}</DialogTitle>
          <DialogDescription>
            {r.submitterName ?? "알 수 없음"} · {STATUS_LABELS[r.status] ?? r.status}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-4 overflow-y-auto">
          {/* 설명 */}
          <div className="text-sm text-fg-secondary">
            <MarkdownViewer content={r.description} className="prose-xs" />
          </div>

          {/* AI 리뷰 결과 */}
          {review ? (
            <div className="space-y-3 rounded-lg border border-line bg-surface-secondary p-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-fg-tertiary">AI 분석</span>
                <Badge variant={CLASSIFICATION_VARIANT[review.classification] ?? "default"}>
                  {CLASSIFICATION_LABELS[review.classification] ?? review.classification}
                </Badge>
              </div>

              {/* 점수 */}
              <div className="flex gap-4 text-xs">
                <div>
                  <span className="text-fg-tertiary">Impact: </span>
                  <span className="font-medium text-fg">{review.impactScore}/5</span>
                </div>
                <div>
                  <span className="text-fg-tertiary">Feasibility: </span>
                  <span className="font-medium text-fg">{review.feasibilityScore}/5</span>
                </div>
              </div>

              {/* 근거 */}
              <div className="text-xs text-fg-secondary">
                <MarkdownViewer content={review.rationale} className="prose-xs" />
              </div>

              {/* 작업계획 초안 (NEW_VALUABLE) */}
              {review.workPlanDraft && (
                <div className="space-y-1">
                  <span className="text-xs font-medium text-fg-tertiary">작업계획 초안</span>
                  <div className="rounded-md border border-line bg-surface p-2 text-xs text-fg-secondary">
                    <MarkdownViewer content={review.workPlanDraft} className="prose-xs" />
                  </div>
                </div>
              )}

              {/* HITL 판정 */}
              {review.humanVerdict && (
                <div className="rounded-md bg-surface p-2 text-xs">
                  <span className="font-medium text-fg">
                    판정: {review.humanVerdict === "APPROVED" ? "승인" : review.humanVerdict === "REJECTED" ? "보류" : "재검토"}
                  </span>
                </div>
              )}
            </div>
          ) : (
            /* AI 리뷰 트리거 버튼 */
            canTriggerAiReview && r.status === "OPEN" && isReviewer && (
              <Button
                size="sm"
                variant="outline"
                onClick={triggerAiReview}
                disabled={isReviewing}
              >
                {isReviewing ? "AI 분석 중..." : "AI 검토 시작"}
              </Button>
            )
          )}

          {/* 보류 사유 */}
          {r.reason && (
            <div className="rounded-md bg-surface-secondary p-3 text-sm">
              <span className="font-medium text-fg">보류 사유: </span>
              <span className="text-fg-secondary">{r.reason}</span>
            </div>
          )}

          {/* HITL 액션 (HUMAN_REVIEW 상태에서만) */}
          {isReviewer && (r.status === "HUMAN_REVIEW" || r.status === "CLASSIFIED") && (
            <div className="space-y-3 border-t border-line pt-3">
              <p className="text-xs font-medium text-fg-tertiary">검토 판정</p>
              <Input
                placeholder="코멘트 (선택)"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="success" onClick={() => submitVerdict("APPROVED")} disabled={isSubmitting}>
                  승인
                </Button>
                <Button size="sm" variant="destructive" onClick={() => submitVerdict("REJECTED")} disabled={isSubmitting}>
                  보류
                </Button>
                <Button size="sm" variant="outline" onClick={() => submitVerdict("NEEDS_REVISION")} disabled={isSubmitting}>
                  재검토 요청
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
