import { Link, useLocation } from "@remix-run/react";
import { cn } from "~/lib/utils/cn";

interface AgentSession {
  id: string;
  startedAt: string;
  tokenCount: number;
  summary: string | null;
  isActive: boolean;
}

interface SessionListProps {
  sessions: AgentSession[];
  onNewSession: () => void;
  isCreating?: boolean;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diffMs = now - date;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "방금 전";
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 7) return `${diffDays}일 전`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}주 전`;
  return `${Math.floor(diffDays / 30)}개월 전`;
}

function formatTokenCount(count: number): string {
  if (count < 1000) return `${count}`;
  if (count < 10_000) return `${(count / 1000).toFixed(1)}k`;
  return `${Math.floor(count / 1000)}k`;
}

export function SessionList({ sessions, onNewSession, isCreating }: SessionListProps) {
  const location = useLocation();

  return (
    <div className="flex h-full flex-col">
      {/* 새 대화 버튼 */}
      <div className="border-b border-[var(--axis-border-default)] p-3">
        <button
          type="button"
          onClick={onNewSession}
          disabled={isCreating}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-default)] px-3 py-2 text-sm font-medium text-[var(--axis-text-primary)] transition-colors hover:bg-[var(--axis-surface-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {isCreating ? "생성 중..." : "새 대화"}
        </button>
      </div>

      {/* 세션 목록 */}
      <div className="flex-1 overflow-y-auto">
        {sessions.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs text-[var(--axis-text-tertiary)]">
            세션이 없습니다
          </div>
        ) : (
          <ul className="py-1">
            {sessions.map((session) => {
              const isSelected = location.pathname === `/agent/${session.id}`;
              return (
                <li key={session.id}>
                  <Link
                    to={`/agent/${session.id}`}
                    className={cn(
                      "flex items-start gap-2 px-3 py-2.5 text-sm transition-colors",
                      isSelected
                        ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-brand)]"
                        : "text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-secondary)]",
                    )}
                  >
                    {/* 활성 상태 dot */}
                    <span className="mt-1.5 shrink-0">
                      {session.isActive ? (
                        <span className="block h-2 w-2 rounded-full bg-emerald-500" />
                      ) : (
                        <span className="block h-2 w-2 rounded-full bg-[var(--axis-border-default)]" />
                      )}
                    </span>

                    <div className="min-w-0 flex-1">
                      {/* 요약 텍스트 */}
                      <p className={cn(
                        "truncate text-xs font-medium",
                        isSelected ? "text-[var(--axis-text-brand)]" : "text-[var(--axis-text-primary)]",
                      )}>
                        {session.summary || "새 대화"}
                      </p>

                      {/* 시간 + 토큰 */}
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--axis-text-tertiary)]">
                        <span>{formatRelativeTime(session.startedAt)}</span>
                        {session.tokenCount > 0 && (
                          <>
                            <span>&middot;</span>
                            <span className="font-mono">{formatTokenCount(session.tokenCount)} tok</span>
                          </>
                        )}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
