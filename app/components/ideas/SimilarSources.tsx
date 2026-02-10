interface SimilarSource {
  id: string;
  title: string;
  summaryKo?: string | null;
  url?: string;
  score: number;
}

interface SimilarSourcesProps {
  sources: SimilarSource[];
  source: "vectorize" | "fallback" | "none";
}

export function SimilarSources({ sources, source }: SimilarSourcesProps) {
  if (sources.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-[var(--axis-text-primary)]">관련 소스</h3>
        <span className="rounded bg-[var(--axis-surface-secondary)] px-1.5 py-0.5 text-[10px] text-[var(--axis-text-tertiary)]">
          {source === "vectorize" ? "Vectorize" : "스코어 유사도"}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {sources.map((s) => (
          <a
            key={s.id}
            href={s.url || `/ideas/${s.id}`}
            target={s.url ? "_blank" : undefined}
            rel={s.url ? "noopener noreferrer" : undefined}
            className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] p-3 transition-colors hover:border-[var(--axis-border-brand)]"
          >
            <p className="text-sm font-medium text-[var(--axis-text-primary)] line-clamp-2">
              {s.title}
            </p>
            {s.summaryKo && (
              <p className="mt-1 text-xs text-[var(--axis-text-secondary)] line-clamp-2">
                {s.summaryKo}
              </p>
            )}
            <div className="mt-2 text-[10px] text-[var(--axis-text-tertiary)]">
              유사도: {Math.round(s.score * 100)}%
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
