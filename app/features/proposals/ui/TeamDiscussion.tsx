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
  compact?: boolean;
}

function formatRelativeTime(ts: string | number | null): string {
  if (!ts) return "";
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return "방금 전";
  if (diffHour < 1) return `${diffMin}분 전`;
  if (diffDay < 1) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

function CommentItem({
  comment,
  proposalId,
  currentUserId,
  compact,
}: {
  comment: Comment;
  proposalId: string;
  currentUserId: string;
  compact?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const editFetcher = useFetcher();
  const deleteFetcher = useFetcher();
  const isMine = comment.authorId === currentUserId;
  const isDeleting = deleteFetcher.state === "submitting";

  const handleEdit = () => {
    if (!editContent.trim()) return;
    editFetcher.submit(
      JSON.stringify({ commentId: comment.id, content: editContent.trim() }),
      {
        method: "PATCH",
        action: `/api/proposals/${proposalId}/comments`,
        encType: "application/json",
      },
    );
    setIsEditing(false);
  };

  const handleDelete = () => {
    deleteFetcher.submit(
      JSON.stringify({ commentId: comment.id }),
      {
        method: "DELETE",
        action: `/api/proposals/${proposalId}/comments`,
        encType: "application/json",
      },
    );
  };

  if (isDeleting) return null;

  if (compact) {
    return (
      <div className="group">
        <div className="flex items-center gap-1.5">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-[8px] font-bold text-fg-secondary">
            {(comment.authorName || "U").charAt(0).toUpperCase()}
          </div>
          <span className="text-[10px] font-medium text-fg">
            {comment.authorName || "사용자"}
          </span>
          {comment.createdAt && (
            <span className="text-[8px] text-fg-tertiary">
              {formatRelativeTime(comment.createdAt)}
            </span>
          )}
          {isMine && !isEditing && (
            <span className="ml-auto hidden gap-1 group-hover:flex">
              <button
                type="button"
                onClick={() => { setEditContent(comment.content); setIsEditing(true); }}
                className="text-[8px] text-fg-tertiary hover:text-fg-brand"
              >
                수정
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="text-[8px] text-fg-tertiary hover:text-fg-error"
              >
                삭제
              </button>
            </span>
          )}
        </div>
        {isEditing ? (
          <div className="ml-6 mt-1 space-y-1">
            <textarea
              rows={2}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full resize-none rounded border border-line bg-surface-secondary px-2 py-1 text-xs text-fg focus:border-line-brand focus:outline-none"
            />
            <div className="flex gap-1">
              <button
                type="button"
                onClick={handleEdit}
                disabled={!editContent.trim()}
                className="rounded bg-btn-bg px-2 py-0.5 text-[10px] text-btn-text hover:bg-btn-bg-hover disabled:opacity-50"
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded px-2 py-0.5 text-[10px] text-fg-tertiary hover:text-fg"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <p className="ml-6 mt-0.5 text-xs text-fg-secondary">{comment.content}</p>
        )}
      </div>
    );
  }

  return (
    <div className="group flex gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-secondary text-xs font-bold text-fg-secondary">
        {(comment.authorName || "U").charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-fg">
            {comment.authorName || "사용자"}
          </span>
          {comment.createdAt && (
            <span className="text-[10px] text-fg-tertiary">
              {formatRelativeTime(comment.createdAt)}
            </span>
          )}
          {isMine && !isEditing && (
            <span className="ml-auto hidden gap-1.5 group-hover:flex">
              <button
                type="button"
                onClick={() => { setEditContent(comment.content); setIsEditing(true); }}
                className="text-[10px] text-fg-tertiary hover:text-fg-brand"
              >
                수정
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="text-[10px] text-fg-tertiary hover:text-fg-error"
              >
                삭제
              </button>
            </span>
          )}
        </div>
        {isEditing ? (
          <div className="mt-1 space-y-1.5">
            <textarea
              rows={3}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full resize-none rounded-lg border border-line bg-surface-secondary px-3 py-2 text-sm text-fg focus:border-line-brand focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleEdit}
                disabled={!editContent.trim()}
                className="rounded-lg bg-btn-bg px-3 py-1.5 text-xs font-medium text-btn-text hover:bg-btn-bg-hover disabled:opacity-50"
              >
                저장
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="rounded-lg px-3 py-1.5 text-xs text-fg-tertiary hover:text-fg"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-0.5 text-sm text-fg-secondary">{comment.content}</p>
        )}
      </div>
    </div>
  );
}

export function TeamDiscussion({ proposalId, comments, currentUserId, compact }: TeamDiscussionProps) {
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

  if (compact) {
    return (
      <div>
        {/* Comment list */}
        <div className="mb-3 space-y-3">
          {comments.map((comment) => (
            <CommentItem
              key={comment.id}
              comment={comment}
              proposalId={proposalId}
              currentUserId={currentUserId}
              compact
            />
          ))}
          {comments.length === 0 && (
            <p className="text-xs text-fg-tertiary">아직 검토 의견이 없습니다.</p>
          )}
        </div>

        {/* Compact comment input */}
        <form onSubmit={handleSubmit}>
          <textarea
            rows={2}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="의견을 남겨주세요..."
            className="w-full resize-none rounded-lg border border-line bg-surface-secondary px-2 py-1.5 text-xs text-fg placeholder:text-fg-tertiary focus:border-line-brand focus:outline-none"
          />
          <div className="mt-1 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || !content.trim()}
              className="rounded bg-btn-bg px-2.5 py-1 text-[10px] font-medium text-btn-text hover:bg-btn-bg-hover disabled:opacity-50"
            >
              작성
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-line p-5">
      <h3 className="mb-4 text-sm font-semibold text-fg">팀 토론</h3>

      {/* Comment list */}
      <div className="mb-4 space-y-4">
        {comments.map((comment) => (
          <CommentItem
            key={comment.id}
            comment={comment}
            proposalId={proposalId}
            currentUserId={currentUserId}
          />
        ))}
        {comments.length === 0 && (
          <p className="text-sm text-fg-tertiary">아직 댓글이 없습니다.</p>
        )}
      </div>

      {/* Comment input */}
      <form onSubmit={handleSubmit} className="space-y-2">
        <textarea
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="의견을 남겨주세요..."
          className="w-full resize-none rounded-lg border border-line bg-surface-secondary px-3 py-2 text-sm text-fg placeholder:text-fg-tertiary focus:border-line-brand focus:outline-none"
        />
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting || !content.trim()}
            className="shrink-0 rounded-lg bg-btn-bg px-4 py-2 text-sm font-medium text-btn-text transition-colors hover:bg-btn-bg-hover disabled:opacity-50"
          >
            댓글 작성
          </button>
        </div>
      </form>
    </div>
  );
}
