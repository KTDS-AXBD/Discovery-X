/**
 * AssessmentCard — Value-up 평가 카드 (목록용)
 */

const TYPE_LABELS: Record<string, string> = {
  acquisition: "인수",
  partnership: "파트너십",
  investment: "투자",
  transformation: "전환",
};

const STATUS_STYLES: Record<string, { label: string; color: string }> = {
  draft: { label: "초안", color: "text-gray-600 dark:text-gray-400" },
  in_progress: { label: "진행 중", color: "text-blue-600 dark:text-blue-400" },
  completed: { label: "완료", color: "text-green-600 dark:text-green-400" },
  archived: { label: "보관", color: "text-yellow-600 dark:text-yellow-400" },
};

interface AssessmentCardProps {
  assessment: {
    id: string;
    targetName: string;
    assessmentType: string;
    status: string;
    overallScore: number | null;
    industryName: string | null;
    createdAt: string;
  };
}

export default function AssessmentCard({ assessment: a }: AssessmentCardProps) {
  const status = STATUS_STYLES[a.status] || STATUS_STYLES.draft;

  return (
    <div className="rounded-lg border border-[var(--dx-border-subtle,var(--axis-border-default))] bg-[var(--axis-surface-primary)] p-4 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-[var(--axis-text-primary)]">
            {a.targetName}
          </h3>
          <p className="mt-0.5 text-sm text-[var(--axis-text-tertiary)]">
            {a.industryName && `${a.industryName} / `}
            {TYPE_LABELS[a.assessmentType] || a.assessmentType}
          </p>
        </div>
        {a.overallScore !== null && (
          <div className="shrink-0 ml-4 rounded-full bg-[var(--axis-surface-secondary)] px-3 py-1">
            <span className="text-lg font-bold tabular-nums text-[var(--axis-text-primary)]">
              {a.overallScore}
            </span>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs">
        <span className={`font-medium ${status.color}`}>{status.label}</span>
        <span className="text-[var(--axis-text-tertiary)]">{a.createdAt}</span>
      </div>
    </div>
  );
}
