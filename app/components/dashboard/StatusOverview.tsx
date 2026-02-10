interface StatusOverviewProps {
  recentCollections: {
    total: number;
    items: { id: string; title: string; summary?: string | null }[];
  };
  totalDiscoveries: {
    total: number;
    items: { id: string; title: string; status: string }[];
  };
  strategyProposals: {
    total: number;
    items: { id: string; title: string; status: string }[];
  };
  totalSources: number;
  timestamp: string;
}

export function StatusOverview({
  recentCollections,
  totalDiscoveries,
  strategyProposals,
  timestamp,
}: StatusOverviewProps) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--axis-text-primary)]">현황</h2>
        <span className="text-xs text-[var(--axis-text-tertiary)]">{timestamp}</span>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 최근 수집 소스 */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--axis-text-primary)]">
            최근 수집 소스
          </h3>
          <div className="max-h-[360px] overflow-y-auto">
            {recentCollections.items.map((item) => (
              <div
                key={item.id}
                className="border-b border-[var(--axis-border-default)] py-2.5 last:border-b-0"
              >
                <p className="text-sm font-medium text-[var(--axis-text-primary)] truncate">
                  {item.title}
                </p>
                {item.summary && (
                  <p className="mt-0.5 text-xs text-[var(--axis-text-tertiary)] line-clamp-2">
                    {item.summary}
                  </p>
                )}
              </div>
            ))}
            {recentCollections.items.length === 0 && (
              <p className="py-4 text-center text-xs text-[var(--axis-text-tertiary)]">
                수집 항목 없음
              </p>
            )}
          </div>
        </div>

        {/* 특집 현황 */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-[var(--axis-text-primary)]">
            특집 현황
          </h3>
          <div className="space-y-4 text-sm text-[var(--axis-text-secondary)]">
            <p>
              현재 등록된 발굴(Discovery)은 총{" "}
              <span className="font-semibold text-[var(--axis-text-primary)]">
                {totalDiscoveries.total}
              </span>
              건입니다.
              {totalDiscoveries.total > 0 && (
                <> 파이프라인 내 다양한 단계에서 진행 중이며, 각 발굴 건별 실험과 근거 수집이 이루어지고 있습니다.</>
              )}
            </p>
            <p>
              사업제안(Proposal)은 총{" "}
              <span className="font-semibold text-[var(--axis-text-primary)]">
                {strategyProposals.total}
              </span>
              건이 등록되어 있습니다.
              {strategyProposals.total > 0 && (
                <> 제출된 제안에 대한 검토 및 의사결정이 진행되고 있습니다.</>
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
