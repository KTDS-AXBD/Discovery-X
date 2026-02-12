import { PIPELINE_COLUMNS, STAGE_CATEGORIES } from "~/lib/constants/status";

interface PipelineSectionProps {
  discoveries: { status: string }[];
}

const CATEGORY_ORDER = ["ideation", "validation", "execution", "terminal"] as const;

export function PipelineSection({ discoveries }: PipelineSectionProps) {
  const countByStatus: Record<string, number> = {};
  for (const d of discoveries) {
    countByStatus[d.status] = (countByStatus[d.status] ?? 0) + 1;
  }

  const grouped = CATEGORY_ORDER.map((catKey) => ({
    key: catKey,
    ...STAGE_CATEGORIES[catKey],
    stages: PIPELINE_COLUMNS.filter((c) => c.category === catKey),
  }));

  return (
    <div className="dx-panel p-5">
      <h3 className="mb-4 text-base font-bold text-[var(--axis-text-primary)]">
        파이프라인
      </h3>

      <div className="flex flex-wrap items-start gap-6">
        {grouped.map((cat) => (
          <div key={cat.key}>
            <p
              className="mb-2 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: cat.color }}
            >
              {cat.label}
            </p>
            <div className="flex items-center gap-1.5">
              {cat.stages.map((stage, i) => (
                <div key={stage.status} className="flex items-center gap-1.5">
                  <div className="flex min-w-[56px] flex-col items-center rounded border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] px-2.5 py-2">
                    <span className="text-lg font-bold text-[var(--axis-text-primary)]">
                      {countByStatus[stage.status] ?? 0}
                    </span>
                    <span className="whitespace-nowrap text-[10px] text-[var(--axis-text-secondary)]">
                      {stage.label}
                    </span>
                  </div>
                  {i < cat.stages.length - 1 && (
                    <span className="text-xs text-[var(--axis-text-tertiary)]">
                      &rarr;
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
