import { Link, useFetcher } from "@remix-run/react";
import { cn } from "~/lib/utils/cn";

export interface ProposalCardData {
  id: string;
  title: string;
  description: string | null;
  status: string;
  category: string | null;
  ownerName: string | null;
  likeCount: number;
  commentCount: number;
  liked: boolean;
  createdAt: string | number | null;
  updatedAt: string | number | null;
}

function formatRelativeTime(ts: string | number | null): string {
  if (!ts) return "";
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDay < 1) return "오늘";
  if (diffDay === 1) return "어제";
  if (diffDay < 7) return `${diffDay}일 전`;
  if (diffDay < 30) return `${Math.floor(diffDay / 7)}주 전`;
  return `${Math.floor(diffDay / 30)}개월 전`;
}

export function ProposalCard({ proposal }: { proposal: ProposalCardData }) {
  const fetcher = useFetcher();
  const isLiking = fetcher.state !== "idle";
  const optimisticLiked = fetcher.formData ? !proposal.liked : proposal.liked;
  const optimisticCount = fetcher.formData
    ? proposal.likeCount + (proposal.liked ? -1 : 1)
    : proposal.likeCount;

  return (
    <div className="group rounded-xl border border-line bg-surface-card p-4 transition-shadow hover:shadow-md">
      <Link to={`/proposals/${proposal.id}`} className="block">
        {/* Title (2 lines) */}
        <h3 className="mb-1 text-sm font-semibold text-fg line-clamp-2">
          {proposal.title}
        </h3>

        {/* Description (3 lines) */}
        {proposal.description && (
          <p className="mb-3 text-xs leading-relaxed text-fg-secondary line-clamp-3">
            {proposal.description}
          </p>
        )}

        {/* Time badge */}
        {proposal.updatedAt && (
          <div className="mb-3">
            <span className="inline-block rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] text-fg-tertiary">
              {formatRelativeTime(proposal.updatedAt)}
            </span>
          </div>
        )}
      </Link>

      {/* Footer: author + likes + comments */}
      <div className="flex items-center justify-between border-t border-line pt-2">
        <span className="text-[10px] text-fg-tertiary">
          {proposal.ownerName || "Unknown"}
        </span>
        <div className="flex items-center gap-3">
          {/* Like button */}
          <button
            type="button"
            disabled={isLiking}
            onClick={(e) => {
              e.stopPropagation();
              fetcher.submit(
                null,
                { method: "POST", action: `/api/proposals/${proposal.id}/likes` },
              );
            }}
            className="flex items-center gap-0.5 text-[10px] text-fg-tertiary hover:text-fg-brand transition-colors"
          >
            <svg
              className={cn("h-3.5 w-3.5", optimisticLiked && "fill-current text-red-500")}
              fill={optimisticLiked ? "currentColor" : "none"}
              viewBox="0 0 24 24"
              strokeWidth="1.5"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
            {optimisticCount > 0 && <span>{optimisticCount}</span>}
          </button>
          {/* Comment count */}
          <span className="flex items-center gap-0.5 text-[10px] text-fg-tertiary">
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 01-.923 1.785A5.969 5.969 0 006 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337z" />
            </svg>
            {proposal.commentCount > 0 && <span>{proposal.commentCount}</span>}
          </span>
        </div>
      </div>
    </div>
  );
}
