import { useState } from "react";
import { useFetcher } from "@remix-run/react";

interface Comment {
  id: string;
  authorId: string;
  authorName?: string;
  content: string;
  createdAt: string | number | null;
}

interface TeamDiscussionProps {
  proposalId: string;
  comments: Comment[];
  currentUserId: string;
}

export function TeamDiscussion({ proposalId, comments, currentUserId: _currentUserId }: TeamDiscussionProps) {
  const [content, setContent] = useState("");
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state === "submitting";

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    fetcher.submit(
      { content: content.trim() },
      { method: "POST", action: `/api/proposals/${proposalId}/comments` }
    );
    setContent("");
  };

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-[var(--axis-text-primary)]">팀 토론</h3>

      {/* Comment list */}
      <div className="mb-4 space-y-3">
        {comments.map((comment) => (
          <div key={comment.id} className="flex gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--axis-surface-brand)] text-[10px] font-bold text-[var(--axis-text-brand)]">
              {(comment.authorName || "U").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-[var(--axis-text-primary)]">
                  {comment.authorName || "사용자"}
                </span>
                {comment.createdAt && (
                  <span className="text-[10px] text-[var(--axis-text-tertiary)]">
                    {typeof comment.createdAt === "number"
                      ? new Date(comment.createdAt * 1000).toLocaleDateString("ko-KR")
                      : comment.createdAt}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-sm text-[var(--axis-text-secondary)]">{comment.content}</p>
            </div>
          </div>
        ))}
        {comments.length === 0 && (
          <p className="text-sm text-[var(--axis-text-tertiary)]">아직 댓글이 없습니다.</p>
        )}
      </div>

      {/* Comment input */}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="의견을 입력하세요..."
          className="flex-1 rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] px-3 py-2 text-sm text-[var(--axis-text-primary)] placeholder:text-[var(--axis-text-tertiary)] focus:border-[var(--axis-border-brand)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={isSubmitting || !content.trim()}
          className="shrink-0 rounded-lg bg-[var(--axis-button-bg-default)] px-4 py-2 text-sm font-medium text-[var(--axis-button-text-default)] transition-colors hover:bg-[var(--axis-button-bg-hover)] disabled:opacity-50"
        >
          댓글 작성
        </button>
      </form>
    </div>
  );
}
