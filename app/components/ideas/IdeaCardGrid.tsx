import { Link, useFetcher } from "@remix-run/react";
import { cn } from "~/lib/utils/cn";

// 6개 방법론 카테고리 + 사업제안 = 7단계
const ANALYSIS_CATEGORIES = [
  "market_research",
  "customer_research",
  "critical_thinking",
  "bmc",
  "regulation",
  "feasibility",
] as const;

// 단계별 색상 매핑 (와이어프레임 기준)
const STAGE_COLORS: Record<number, { bg: string; text: string; dot: string; border: string }> = {
  0: { bg: "bg-surface-secondary", text: "text-fg-tertiary", dot: "bg-fg-tertiary", border: "border-line" },
  1: { bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500", border: "border-blue-200 dark:border-blue-800" },
  2: { bg: "bg-indigo-50 dark:bg-indigo-950/40", text: "text-indigo-700 dark:text-indigo-300", dot: "bg-indigo-500", border: "border-indigo-200 dark:border-indigo-800" },
  3: { bg: "bg-purple-50 dark:bg-purple-950/40", text: "text-purple-700 dark:text-purple-300", dot: "bg-purple-500", border: "border-purple-200 dark:border-purple-800" },
  4: { bg: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-300", dot: "bg-amber-500", border: "border-amber-200 dark:border-amber-800" },
  5: { bg: "bg-teal-50 dark:bg-teal-950/40", text: "text-teal-700 dark:text-teal-300", dot: "bg-teal-500", border: "border-teal-200 dark:border-teal-800" },
  6: { bg: "bg-green-50 dark:bg-green-950/40", text: "text-green-700 dark:text-green-300", dot: "bg-green-500", border: "border-green-200 dark:border-green-800" },
  7: { bg: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500", border: "border-emerald-200 dark:border-emerald-800" },
};

const STAGE_LABELS = [
  "소스 선택",
  "AI 분석",
  "아이디어 초안",
  "상세 작성",
  "검토",
  "협업",
  "완료",
] as const;

interface IdeaItem {
  id: string;
  title: string;
  status: string;
  ownerId: string;
  analysisData: Record<string, unknown> | null;
  createdAt: string | number | null;
  createdByAgent?: number;
}

interface IdeaCardGridProps {
  myIdeas: IdeaItem[];
  teamIdeas: IdeaItem[];
  userName?: string;
}

function getCompletedCount(analysisData: Record<string, unknown> | null): number {
  if (!analysisData) return 0;
  let count = 0;
  for (const key of ANALYSIS_CATEGORIES) {
    const entry = analysisData[key] as { content?: string } | undefined;
    if (entry?.content) count++;
  }
  // 7번째: 사업제안 생성 여부 (proposalId가 있으면 완료)
  if (analysisData.proposalCreated) count++;
  return count;
}

function getStageLabel(completed: number): string {
  if (completed >= 7) return STAGE_LABELS[6];
  if (completed >= 5) return STAGE_LABELS[4];
  if (completed >= 3) return STAGE_LABELS[3];
  if (completed >= 1) return STAGE_LABELS[2];
  return STAGE_LABELS[0];
}

function getTimeAgo(createdAt: string | number | null): string {
  if (!createdAt) return "";
  const now = Date.now();
  const ts = typeof createdAt === "number" ? createdAt * 1000 : new Date(createdAt).getTime();
  if (isNaN(ts)) return "";
  const diffMs = now - ts;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffMonths = Math.floor(diffMs / 2592000000);

  if (diffMins < 1) return "방금";
  if (diffMins < 60) return `${diffMins}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  if (diffDays < 30) return `${diffDays}일 전`;
  return `${diffMonths}개월 전`;
}

function ProgressDots({ completed }: { completed: number }) {
  const sc = STAGE_COLORS[Math.min(completed, 7)] || STAGE_COLORS[0];
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            i < completed ? sc.dot : "bg-line"
          )}
        />
      ))}
    </div>
  );
}

function IdeaRow({ idea }: { idea: IdeaItem }) {
  const completed = getCompletedCount(idea.analysisData);
  const stageLabel = getStageLabel(completed);
  const sc = STAGE_COLORS[Math.min(completed, 7)] || STAGE_COLORS[0];
  const timeAgo = getTimeAgo(idea.createdAt);

  return (
    <Link
      to={`/ideas/${idea.id}`}
      className="group flex h-[42px] items-center gap-3 rounded-lg border border-line bg-surface-card px-4 transition-colors hover:border-fg-tertiary hover:bg-surface-card-hover"
    >
      {/* 진행도 dots */}
      <ProgressDots completed={completed} />

      {/* 제목 */}
      <span className="flex-1 truncate text-sm text-fg">
        {idea.title}
      </span>

      {/* AI 배지 */}
      {idea.createdByAgent === 1 && (
        <span className="shrink-0 rounded border border-violet-300 px-1 py-0.5 text-[10px] font-medium text-violet-600 dark:border-violet-700 dark:text-violet-400">
          AI
        </span>
      )}

      {/* 단계 배지 */}
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded border px-2 py-0.5 text-[10px]",
          sc.bg, sc.text, sc.border
        )}
      >
        <span className={cn("h-1.5 w-1.5 rounded-full", sc.dot)} />
        {stageLabel}
        <span className="opacity-60">{completed}/7</span>
      </span>

      {/* 시간 */}
      {timeAgo && (
        <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-fg-tertiary">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          {timeAgo}
        </span>
      )}
    </Link>
  );
}

function NewIdeaButton() {
  const fetcher = useFetcher();
  const isCreating = fetcher.state !== "idle";

  return (
    <fetcher.Form method="POST" action="/api/ideas">
      <input type="hidden" name="title" value="새 아이디어" />
      <button
        type="submit"
        disabled={isCreating}
        className="flex items-center gap-1.5 rounded bg-fg px-3 py-1.5 text-xs font-medium text-surface-deep transition-opacity hover:opacity-80 disabled:opacity-50"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        {isCreating ? "생성 중..." : "새 아이디어"}
      </button>
    </fetcher.Form>
  );
}

export function IdeaCardGrid({ myIdeas, teamIdeas }: IdeaCardGridProps) {
  return (
    <div className="flex gap-8">
      {/* 내 아이디어 Column */}
      <section className="min-w-0 flex-1">
        <div className="mb-3 flex items-center justify-between border-b border-line-muted pb-3">
          <h2 className="text-base font-bold text-fg">내 아이디어</h2>
          <NewIdeaButton />
        </div>
        <div className="space-y-2">
          {myIdeas.map((idea) => (
            <IdeaRow key={idea.id} idea={idea} />
          ))}
          {myIdeas.length === 0 && (
            <p className="py-4 text-center text-xs text-fg-tertiary">
              아직 아이디어가 없습니다.
            </p>
          )}
        </div>
      </section>

      {/* 팀 아이디어 Column */}
      <section className="min-w-0 flex-1">
        <div className="mb-3 flex items-center justify-between border-b border-line-muted pb-3">
          <h2 className="text-base font-bold text-fg">팀 아이디어</h2>
          <span className="text-xs text-fg-tertiary">{teamIdeas.length}개</span>
        </div>
        <div className="space-y-2">
          {teamIdeas.map((idea) => (
            <IdeaRow key={idea.id} idea={idea} />
          ))}
          {teamIdeas.length === 0 && (
            <p className="py-4 text-center text-xs text-fg-tertiary">
              팀 아이디어가 없습니다.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
