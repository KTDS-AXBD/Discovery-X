/**
 * Blind Vote Input 컴포넌트
 *
 * 1-10 점수 투표 입력 UI
 */

import { useState } from "react";
import { Button } from "~/components/ui/Button";

interface BlindVoteInputProps {
  decisionId: string;
  existingVote?: number | null;
  existingComment?: string | null;
  onSubmit?: (vote: number, comment: string) => void;
  isSubmitting?: boolean;
}

export function BlindVoteInput({
  decisionId,
  existingVote,
  existingComment,
  onSubmit,
  isSubmitting = false,
}: BlindVoteInputProps) {
  const [selectedScore, setSelectedScore] = useState<number | null>(existingVote ?? null);
  const [comment, setComment] = useState(existingComment || "");

  const handleSubmit = () => {
    if (selectedScore !== null && onSubmit) {
      onSubmit(selectedScore, comment);
    }
  };

  return (
    <div className="space-y-4">
      {/* 점수 선택 */}
      <div>
        <label className="mb-2 block text-sm font-medium text-[var(--axis-text-primary)]">
          점수 (1-10) *
        </label>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => (
            <button
              key={score}
              type="button"
              onClick={() => setSelectedScore(score)}
              className={`flex h-10 w-10 items-center justify-center rounded-md border text-sm font-medium transition-colors ${
                selectedScore === score
                  ? "border-[var(--axis-text-brand)] bg-[var(--axis-surface-brand)] text-[var(--axis-text-on-brand)]"
                  : "border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] text-[var(--axis-text-primary)] hover:border-[var(--axis-border-hover)]"
              }`}
            >
              {score}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--axis-text-tertiary)]">
          1 = 강력 반대, 5 = 중립, 10 = 강력 찬성
        </p>
      </div>

      {/* 코멘트 */}
      <div>
        <label className="mb-2 block text-sm font-medium text-[var(--axis-text-primary)]">
          코멘트 (선택)
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          maxLength={1000}
          placeholder="의견을 남겨주세요..."
          className="block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm text-[var(--axis-text-primary)] placeholder:text-[var(--axis-text-tertiary)] focus:border-[var(--axis-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--axis-border-focus)]"
        />
        <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
          {comment.length}/1000
        </p>
      </div>

      {/* 제출 버튼 */}
      <div className="flex items-center gap-3">
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={selectedScore === null || isSubmitting}
        >
          {existingVote ? "투표 수정" : "투표하기"}
        </Button>
        {existingVote && (
          <span className="text-sm text-[var(--axis-text-tertiary)]">
            기존 투표: {existingVote}점
          </span>
        )}
      </div>
    </div>
  );
}

interface VoteScaleProps {
  score: number;
  size?: "sm" | "md" | "lg";
}

export function VoteScale({ score, size = "md" }: VoteScaleProps) {
  const sizeClasses = {
    sm: "h-1 w-20",
    md: "h-2 w-32",
    lg: "h-3 w-48",
  };

  const percentage = (score / 10) * 100;

  return (
    <div className="flex items-center gap-2">
      <div className={`rounded-full bg-[var(--axis-surface-tertiary)] ${sizeClasses[size]}`}>
        <div
          className={`h-full rounded-full ${getScoreColor(score)}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span
        className={`font-medium ${size === "sm" ? "text-xs" : size === "md" ? "text-sm" : "text-base"}`}
      >
        {score}
      </span>
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 8) return "bg-[var(--axis-badge-success-bg)]";
  if (score >= 5) return "bg-[var(--axis-badge-info-bg)]";
  if (score >= 3) return "bg-[var(--axis-badge-warning-bg)]";
  return "bg-[var(--axis-badge-destructive-bg)]";
}
