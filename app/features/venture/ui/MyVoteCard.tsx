/**
 * MyVoteCard - 내 투표 상태 카드
 *
 * 투표 완료 후 표시되며, "투표 수정" 버튼으로 편집 모드 진입 가능
 */

import { VoteScale } from "./BlindVoteInput";
import { Button } from "~/components/ui/Button";

interface MyVoteCardProps {
  vote: number;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
  onEdit: () => void;
  disabled?: boolean;
}

export function MyVoteCard({
  vote,
  comment,
  createdAt,
  updatedAt,
  onEdit,
  disabled = false,
}: MyVoteCardProps) {
  const isEdited = createdAt !== updatedAt;
  const displayDate = new Date(updatedAt).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] p-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="text-sm font-medium text-[var(--axis-text-primary)]">
            내 투표
          </div>
          <div className="flex items-center gap-3">
            <VoteScale score={vote} size="md" />
            <span className="text-xs text-[var(--axis-text-tertiary)]">
              {getVoteLabel(vote)}
            </span>
          </div>
          {comment && (
            <p className="text-sm text-[var(--axis-text-secondary)]">
              &ldquo;{comment}&rdquo;
            </p>
          )}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={onEdit}
          disabled={disabled}
        >
          투표 수정
        </Button>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs text-[var(--axis-text-tertiary)]">
        <span>{displayDate}</span>
        {isEdited && (
          <span className="rounded bg-[var(--axis-surface-tertiary)] px-1.5 py-0.5">
            수정됨
          </span>
        )}
      </div>
    </div>
  );
}

function getVoteLabel(score: number): string {
  if (score >= 9) return "강력 찬성";
  if (score >= 7) return "찬성";
  if (score >= 5) return "중립";
  if (score >= 3) return "반대";
  return "강력 반대";
}
