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

const DOT_COLORS = [
  "bg-violet-500",
  "bg-orange-500",
  "bg-blue-500",
  "bg-emerald-500",
  "bg-rose-500",
  "bg-amber-500",
  "bg-cyan-500",
  "bg-pink-500",
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

function getStatusBadge(completed: number): { label: string; variant: "success" | "warning" | "info" } {
  if (completed >= 7) return { label: `완료 ${completed}/7`, variant: "success" };
  if (completed >= 5) return { label: `검토 ${completed}/7`, variant: "warning" };
  return { label: `초안 ${completed}/7`, variant: "info" };
}

const BADGE_STYLES = {
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  info: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
} as const;

function ProgressDots({ completed, colorIndex }: { completed: number; colorIndex: number }) {
  const color = DOT_COLORS[colorIndex % DOT_COLORS.length];
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full transition-colors",
            i < completed ? color : "bg-line"
          )}
        />
      ))}
    </div>
  );
}

function IdeaCard({ idea, index }: { idea: IdeaItem; index: number }) {
  const completed = getCompletedCount(idea.analysisData);
  const badge = getStatusBadge(completed);

  return (
    <Link
      to={`/ideas/${idea.id}`}
      className="group flex flex-col gap-2 rounded-xl border border-line bg-surface-card px-4 py-3 transition-all hover:border-fg-tertiary hover:bg-surface-card-hover hover:shadow-sm"
    >
      <ProgressDots completed={completed} colorIndex={index} />
      <div className="flex items-center gap-1.5">
        <span className="truncate text-sm font-medium text-fg">
          {idea.title}
        </span>
        {idea.createdByAgent === 1 && (
          <span className="shrink-0 rounded border border-violet-300 px-1 py-0.5 text-[10px] font-medium text-violet-600 dark:border-violet-700 dark:text-violet-400">
            AI
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", BADGE_STYLES[badge.variant])}>
          {badge.label}
        </span>
      </div>
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
        className="flex h-full min-h-[88px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-line bg-transparent px-4 py-3 text-fg-tertiary transition-colors hover:border-fg-tertiary hover:bg-surface-secondary hover:text-fg-secondary disabled:opacity-50"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
        </svg>
        <span className="text-xs font-medium">{isCreating ? "생성 중..." : "새 아이디어"}</span>
      </button>
    </fetcher.Form>
  );
}

export function IdeaCardGrid({ myIdeas, teamIdeas, userName }: IdeaCardGridProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {/* 내 아이디어 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">내 아이디어</h2>
          {userName && (
            <span className="text-xs text-fg-tertiary">{userName}</span>
          )}
        </div>
        <div className="grid gap-2">
          <NewIdeaButton />
          {myIdeas.map((idea, i) => (
            <IdeaCard key={idea.id} idea={idea} index={i} />
          ))}
          {myIdeas.length === 0 && (
            <p className="py-4 text-center text-xs text-fg-tertiary">
              아직 아이디어가 없습니다.
            </p>
          )}
        </div>
      </section>

      {/* 팀 아이디어 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">팀 아이디어</h2>
          <span className="text-xs text-fg-tertiary">{teamIdeas.length}개</span>
        </div>
        <div className="grid gap-2">
          {teamIdeas.map((idea, i) => (
            <IdeaCard key={idea.id} idea={idea} index={i + myIdeas.length} />
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
