import { Link } from "@remix-run/react";
import { Card, CardContent } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";

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
  totalSources,
  timestamp,
}: StatusOverviewProps) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--axis-text-primary)]">현황</h2>
        <span className="text-xs text-[var(--axis-text-tertiary)]">{timestamp}</span>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* 최근 수집 */}
        <Card
          style={{
            opacity: 0,
            animation: "dx-fade-in-up 0.3s ease-out forwards",
            animationDelay: "0ms",
          }}
        >
          <CardContent className="p-4">
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[var(--axis-text-brand)]">
                {recentCollections.total}
              </span>
              <span className="text-sm text-[var(--axis-text-secondary)]">최근 수집</span>
            </div>
            <div className="max-h-[300px] space-y-2 overflow-y-auto">
              {recentCollections.items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-md border border-[var(--axis-border-default)] px-3 py-2"
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
          </CardContent>
        </Card>

        {/* 전체 발굴 */}
        <Card
          style={{
            opacity: 0,
            animation: "dx-fade-in-up 0.3s ease-out forwards",
            animationDelay: "80ms",
          }}
        >
          <CardContent className="p-4">
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[var(--axis-text-brand)]">
                {totalDiscoveries.total}
              </span>
              <span className="text-sm text-[var(--axis-text-secondary)]">전체 발굴</span>
            </div>
            <div className="max-h-[300px] space-y-2 overflow-y-auto">
              {totalDiscoveries.items.map((item) => (
                <Link
                  key={item.id}
                  to={`/discoveries/${item.id}`}
                  className="block rounded-md border border-[var(--axis-border-default)] px-3 py-2 transition-colors hover:bg-[var(--axis-surface-secondary)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--axis-text-primary)] truncate">
                      {item.title}
                    </p>
                    <Badge variant="subtle" className="shrink-0 text-xs">
                      {item.status}
                    </Badge>
                  </div>
                </Link>
              ))}
              {totalDiscoveries.items.length === 0 && (
                <p className="py-4 text-center text-xs text-[var(--axis-text-tertiary)]">
                  발굴 항목 없음
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 전략 건의 */}
        <Card
          style={{
            opacity: 0,
            animation: "dx-fade-in-up 0.3s ease-out forwards",
            animationDelay: "160ms",
          }}
        >
          <CardContent className="p-4">
            <div className="mb-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold text-[var(--axis-text-brand)]">
                {strategyProposals.total}
              </span>
              <span className="text-sm text-[var(--axis-text-secondary)]">전략 건의</span>
            </div>
            <div className="max-h-[300px] space-y-2 overflow-y-auto">
              {strategyProposals.items.map((item) => (
                <Link
                  key={item.id}
                  to={`/proposals/${item.id}`}
                  className="block rounded-md border border-[var(--axis-border-default)] px-3 py-2 transition-colors hover:bg-[var(--axis-surface-secondary)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--axis-text-primary)] truncate">
                      {item.title}
                    </p>
                    <Badge variant="subtle" className="shrink-0 text-xs">
                      {item.status}
                    </Badge>
                  </div>
                </Link>
              ))}
              {strategyProposals.items.length === 0 && (
                <p className="py-4 text-center text-xs text-[var(--axis-text-tertiary)]">
                  건의 항목 없음
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-3 text-right">
        <span className="text-xs text-[var(--axis-text-tertiary)]">
          수집 소스: {totalSources}개
        </span>
      </div>
    </section>
  );
}
