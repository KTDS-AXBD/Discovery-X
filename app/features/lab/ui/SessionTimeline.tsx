import { useState } from "react";
import { useFetcher, Link } from "@remix-run/react";
import type { ChangelogSession, ChangelogItem } from "~/features/lab/service/changelog-parser";
import { CHANGELOG_EMOJIS } from "~/features/lab/constants";

// --- Types ---

interface EmojiCount {
  emoji: string;
  count: number;
  myReaction: boolean;
}

interface SessionFeedback {
  emojis: EmojiCount[];
  commentCount: number;
}

interface SessionTimelineProps {
  sessions: ChangelogSession[];
  total: number;
  page: number;
  pageSize: number;
  feedbackMap: Record<string, SessionFeedback>;
}

const ITEM_STATUS_ICON: Record<string, { icon: string; color: string }> = {
  done: { icon: "✓", color: "text-emerald-400" },
  warning: { icon: "!", color: "text-amber-400" },
  info: { icon: "i", color: "text-sky-400" },
  skipped: { icon: "→", color: "text-fg-tertiary" },
};

// --- Components ---

function StatusBadge({ status }: { status: string }) {
  const s = ITEM_STATUS_ICON[status] ?? ITEM_STATUS_ICON.info;
  return (
    <span
      className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold ${s.color} bg-surface-secondary/80`}
    >
      {s.icon}
    </span>
  );
}

function FItemTag({ fNum }: { fNum: number }) {
  return (
    <Link
      to="/lab/work-status"
      onClick={(e) => e.stopPropagation()}
      className="rounded border border-lab-accent/30 bg-lab-accent/10 px-1.5 py-0.5 text-[11px] font-semibold text-lab-accent font-mono-dx hover:underline"
    >
      F{fNum}
    </Link>
  );
}

function ReqTag({ code }: { code: string }) {
  return (
    <Link
      to="/lab"
      onClick={(e) => e.stopPropagation()}
      className="rounded border border-sky-400/30 bg-sky-400/10 px-1.5 py-0.5 text-[11px] text-sky-400 font-mono-dx hover:underline"
    >
      {code}
    </Link>
  );
}

function ItemLine({ item }: { item: ChangelogItem }) {
  return (
    <div className="flex items-start gap-2 py-1">
      <StatusBadge status={item.status} />
      <span
        className={`text-xs leading-relaxed ${
          item.status === "done"
            ? "text-fg-secondary"
            : item.status === "warning"
              ? "text-amber-300/90"
              : "text-fg-tertiary"
        }`}
      >
        {item.text}
      </span>
    </div>
  );
}

function EmojiBar({
  sessionId,
  feedback,
}: {
  sessionId: string;
  feedback?: SessionFeedback;
}) {
  const fetcher = useFetcher();

  function handleReaction(emoji: string) {
    fetcher.submit(
      { sessionId, type: "emoji", emoji },
      { method: "POST", action: "/api/lab/changelog/feedback", encType: "application/json" }
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {CHANGELOG_EMOJIS.map(({ emoji, label }) => {
        const ec = feedback?.emojis.find((e) => e.emoji === emoji);
        const count = ec?.count ?? 0;
        const mine = ec?.myReaction ?? false;

        return (
          <button
            key={emoji}
            type="button"
            onClick={() => handleReaction(emoji)}
            title={label}
            className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
              mine
                ? "border-lab-accent/50 bg-lab-accent/15 text-lab-accent"
                : "border-line-subtle/60 bg-surface-secondary/40 text-fg-tertiary hover:border-lab-accent/30 hover:text-fg-secondary"
            }`}
          >
            <span className="text-sm">{emoji}</span>
            {count > 0 && (
              <span className="font-mono-dx tabular-nums text-[11px]">{count}</span>
            )}
          </button>
        );
      })}
      {(feedback?.commentCount ?? 0) > 0 && (
        <span className="ml-1 flex items-center gap-1 text-[11px] text-fg-tertiary">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
          </svg>
          <span className="font-mono-dx tabular-nums">{feedback?.commentCount}</span>
        </span>
      )}
    </div>
  );
}

function CommentSection({
  sessionId,
  open,
}: {
  sessionId: string;
  open: boolean;
}) {
  const [text, setText] = useState("");
  const fetcher = useFetcher();

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    fetcher.submit(
      { sessionId, type: "comment", comment: text.trim() },
      { method: "POST", action: "/api/lab/changelog/feedback", encType: "application/json" }
    );
    setText("");
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 pt-2 border-t border-line-subtle/30">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="코멘트 입력..."
        className="flex-1 rounded border border-line-subtle/60 bg-surface-secondary/30 px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-quaternary focus:border-lab-accent/50 focus:outline-none"
      />
      <button
        type="submit"
        disabled={!text.trim()}
        className="rounded bg-lab-accent/20 px-3 py-1.5 text-xs font-semibold text-lab-accent hover:bg-lab-accent/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        전송
      </button>
    </form>
  );
}

function SessionCard({
  session,
  feedback,
}: {
  session: ChangelogSession;
  feedback?: SessionFeedback;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showComments, setShowComments] = useState(false);

  const hasVerification = session.verification.length > 0;
  const previewItems = session.items.slice(0, 3);
  const hasMore = session.items.length > 3;

  return (
    <div className="group rounded-lg border border-line-subtle/50 bg-surface-card/40 hover:border-line-subtle/80 transition-colors overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-start gap-3 px-4 py-3 text-left"
      >
        {/* 세션 번호 */}
        <div className="flex flex-col items-center shrink-0 pt-0.5">
          <span className="text-lg font-bold text-lab-accent font-mono-dx tabular-nums leading-none">
            {session.id}
          </span>
          <span className="text-[10px] text-fg-quaternary font-mono-dx mt-0.5">
            {session.date.slice(5)}
          </span>
        </div>

        {/* 내용 */}
        <div className="min-w-0 flex-1">
          {/* 제목 */}
          <h3 className="text-sm font-semibold text-fg leading-snug mb-1.5">
            {session.title || "(제목 없음)"}
          </h3>

          {/* 태그 */}
          {(session.fItems.length > 0 || session.reqCodes.length > 0) && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {session.fItems.map((f) => (
                <FItemTag key={f} fNum={f} />
              ))}
              {session.reqCodes.map((c) => (
                <ReqTag key={c} code={c} />
              ))}
            </div>
          )}

          {/* 미리보기 항목 (접힌 상태) */}
          {!expanded && (
            <div className="space-y-0.5">
              {previewItems.map((item, i) => (
                <ItemLine key={i} item={item} />
              ))}
              {hasMore && (
                <span className="text-[11px] text-fg-quaternary font-mono-dx">
                  +{session.items.length - 3}개 더
                </span>
              )}
            </div>
          )}
        </div>

        {/* 확장 아이콘 */}
        <svg
          className={`h-4 w-4 shrink-0 text-fg-tertiary mt-1 transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* 확장된 상세 */}
      {expanded && (
        <div className="px-4 pb-3 space-y-3">
          {/* 전체 항목 */}
          <div className="ml-9 space-y-0.5">
            {session.items.map((item, i) => (
              <ItemLine key={i} item={item} />
            ))}
          </div>

          {/* 검증 결과 */}
          {hasVerification && (
            <div className="ml-9 rounded border border-line-subtle/30 bg-surface-secondary/20 px-3 py-2">
              <span className="text-[11px] font-semibold text-fg-tertiary uppercase tracking-wider">
                검증 결과
              </span>
              <div className="mt-1 space-y-0.5">
                {session.verification.map((v, i) => (
                  <ItemLine key={i} item={v} />
                ))}
              </div>
            </div>
          )}

          {/* 이모지 반응 + 코멘트 */}
          <div className="ml-9 space-y-2">
            <div className="flex items-center gap-3">
              <EmojiBar sessionId={session.id} feedback={feedback} />
              <button
                type="button"
                onClick={() => setShowComments(!showComments)}
                className="text-[11px] text-fg-tertiary hover:text-fg-secondary transition-colors"
              >
                {showComments ? "닫기" : "코멘트"}
              </button>
            </div>
            <CommentSection sessionId={session.id} open={showComments} />
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

export function SessionTimeline({
  sessions,
  total,
  page,
  pageSize,
  feedbackMap,
}: SessionTimelineProps) {
  const [filter, setFilter] = useState("");
  const [fItemFilter, setFItemFilter] = useState("");
  const fetcher = useFetcher();

  const totalPages = Math.ceil(total / pageSize);

  function loadPage(newPage: number) {
    const params = new URLSearchParams();
    params.set("page", String(newPage));
    params.set("pageSize", String(pageSize));
    if (filter) params.set("search", filter);
    if (fItemFilter) params.set("fItem", fItemFilter);
    fetcher.load(`/api/lab/changelog?${params}`);
  }

  // Use fetcher data if available, otherwise props
  const fetcherData = fetcher.data as { sessions: ChangelogSession[]; total: number; page: number; feedbackMap?: Record<string, SessionFeedback> } | undefined;
  const displaySessions = fetcherData?.sessions ?? sessions;
  const displayTotal = fetcherData?.total ?? total;
  const displayPage = fetcherData?.page ?? page;
  const displayFeedbackMap = fetcherData?.feedbackMap ?? feedbackMap;
  const displayTotalPages = Math.ceil(displayTotal / pageSize);

  return (
    <div className="space-y-4">
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <svg
            className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-tertiary"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") loadPage(0);
            }}
            placeholder="세션 검색..."
            className="w-full rounded border border-line-subtle/60 bg-surface-secondary/30 pl-8 pr-3 py-1.5 text-xs text-fg placeholder:text-fg-quaternary focus:border-lab-accent/50 focus:outline-none"
          />
        </div>
        <input
          type="text"
          value={fItemFilter}
          onChange={(e) => setFItemFilter(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") loadPage(0);
          }}
          placeholder="F#"
          className="w-16 rounded border border-line-subtle/60 bg-surface-secondary/30 px-2.5 py-1.5 text-xs text-fg text-center placeholder:text-fg-quaternary focus:border-lab-accent/50 focus:outline-none font-mono-dx"
        />
        <button
          type="button"
          onClick={() => loadPage(0)}
          className="rounded bg-lab-accent/15 px-3 py-1.5 text-xs font-semibold text-lab-accent hover:bg-lab-accent/25 transition-colors"
        >
          검색
        </button>
      </div>

      {/* 세션 카드 리스트 */}
      {displaySessions.length === 0 ? (
        <div className="py-8 text-center text-xs text-fg-tertiary font-mono-dx">
          세션 기록이 없어요.
        </div>
      ) : (
        <div className="space-y-2">
          {displaySessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              feedback={displayFeedbackMap[session.id]}
            />
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {displayTotalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px] text-fg-tertiary font-mono-dx tabular-nums">
            {displayTotal}개 중 {displayPage * pageSize + 1}–
            {Math.min((displayPage + 1) * pageSize, displayTotal)}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => loadPage(displayPage - 1)}
              disabled={displayPage === 0}
              className="rounded border border-line-subtle/60 px-2.5 py-1 text-xs text-fg-secondary hover:bg-surface-card-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              ◂ 이전
            </button>
            <span className="text-xs text-fg-tertiary font-mono-dx tabular-nums px-2">
              {displayPage + 1} / {displayTotalPages}
            </span>
            <button
              type="button"
              onClick={() => loadPage(displayPage + 1)}
              disabled={displayPage >= displayTotalPages - 1}
              className="rounded border border-line-subtle/60 px-2.5 py-1 text-xs text-fg-secondary hover:bg-surface-card-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              다음 ▸
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
