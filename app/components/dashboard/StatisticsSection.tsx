import { useState } from "react";

interface StatisticsSectionProps {
  monthlyActivity: { month: string; count: number }[];
  stageDuration: { stage: string; label: string; count: number }[];
  industryData: { name: string; count: number; color: string }[];
  totalSources: number;
  sourceBreakdown: { web: number; youtube: number; uncategorized: number };
}

export function StatisticsSection({
  monthlyActivity,
  stageDuration,
  industryData,
  totalSources,
  sourceBreakdown,
}: StatisticsSectionProps) {
  return (
    <section className="mt-8">
      <h2 className="mb-4 text-lg font-semibold text-[var(--axis-text-primary)]">
        통계
      </h2>
      <div className="grid grid-cols-4 gap-6">
        <MonthlyActivityChart data={monthlyActivity} />
        <StageDurationBars data={stageDuration} />
        <IndustryList data={industryData} />
        <CollectionStats
          totalSources={totalSources}
          breakdown={sourceBreakdown}
        />
      </div>
    </section>
  );
}

/* ── 월별 활동 현황 ─────────────────────────────────── */

function MonthlyActivityChart({
  data,
}: {
  data: { month: string; count: number }[];
}) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-[var(--axis-text-secondary)]">
        월별 활동 현황
      </h3>
      {data.length === 0 ? (
        <p className="py-8 text-center text-xs text-[var(--axis-text-tertiary)]">
          데이터 없음
        </p>
      ) : (
        <div className="flex items-end gap-1.5" style={{ height: 120 }}>
          {data.map((d) => {
            const h = Math.max((d.count / maxCount) * 100, 2);
            return (
              <div
                key={d.month}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <div className="flex w-full flex-1 items-end justify-center">
                  <div
                    className="w-full max-w-[28px] rounded-sm"
                    style={{
                      height: `${h}%`,
                      backgroundColor: "var(--axis-text-primary)",
                      minHeight: d.count > 0 ? 4 : 0,
                    }}
                  />
                </div>
                <span className="text-[10px] text-[var(--axis-text-tertiary)]">
                  {d.month}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── 단계별 평균 체류 시간 ──────────────────────────── */

function StageDurationBars({
  data,
}: {
  data: { stage: string; label: string; count: number }[];
}) {
  const filtered = data.filter((d) => d.count > 0);
  const maxCount = Math.max(...filtered.map((d) => d.count), 1);

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-[var(--axis-text-secondary)]">
        단계별 평균 체류 시간
      </h3>
      {filtered.length === 0 ? (
        <p className="py-8 text-center text-xs text-[var(--axis-text-tertiary)]">
          데이터 없음
        </p>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((d) => {
            const pct = (d.count / maxCount) * 100;
            return (
              <div key={d.stage}>
                <div className="mb-0.5 flex items-center justify-between">
                  <span className="text-sm text-[var(--axis-text-primary)]">
                    {d.label}
                  </span>
                  <span className="text-sm tabular-nums text-[var(--axis-text-secondary)]">
                    {d.count}건
                  </span>
                </div>
                <div className="h-2.5 w-full rounded-full bg-[var(--axis-surface-secondary)]">
                  <div
                    className="h-2.5 rounded-full"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: "var(--axis-text-primary)",
                      minWidth: pct > 0 ? 4 : 0,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── 산업 분포 ──────────────────────────────────────── */

function IndustryList({
  data,
}: {
  data: { name: string; count: number; color: string }[];
}) {
  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-[var(--axis-text-secondary)]">
        산업 분포
      </h3>
      {total === 0 ? (
        <p className="py-8 text-center text-xs text-[var(--axis-text-tertiary)]">
          데이터 없음
        </p>
      ) : (
        <div className="space-y-1.5">
          {data
            .sort((a, b) => b.count - a.count)
            .map((d) => {
              const pct =
                total > 0 ? Math.round((d.count / total) * 100) : 0;
              return (
                <div
                  key={d.name}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-[var(--axis-text-primary)]">
                    {d.name}
                  </span>
                  <span className="tabular-nums text-[var(--axis-text-secondary)]">
                    {pct}%
                  </span>
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

/* ── 수집 현황 ──────────────────────────────────────── */

function CollectionStats({
  totalSources,
  breakdown,
}: {
  totalSources: number;
  breakdown: { web: number; youtube: number; uncategorized: number };
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const segments = [
    { key: "web", label: "Web", count: breakdown.web, color: "#6B7280" },
    {
      key: "youtube",
      label: "Youtube",
      count: breakdown.youtube,
      color: "#9CA3AF",
    },
    {
      key: "uncategorized",
      label: "미분류 상태",
      count: breakdown.uncategorized,
      color: "#D1D5DB",
    },
  ].filter((s) => s.count > 0);

  const total = segments.reduce((s, seg) => s + seg.count, 0);
  const circumference = 2 * Math.PI * 40;

  const computed = segments.reduce<
    { key: string; label: string; count: number; color: string; dash: number; offset: number }[]
  >((acc, seg) => {
    const dash = total > 0 ? (seg.count / total) * circumference : 0;
    const prev = acc.length > 0 ? acc[acc.length - 1] : null;
    const offset = prev ? prev.offset + prev.dash : 0;
    acc.push({ ...seg, dash, offset });
    return acc;
  }, []);

  return (
    <div>
      <h3 className="mb-3 text-sm font-medium text-[var(--axis-text-secondary)]">
        수집 현황
      </h3>
      <div className="flex flex-col items-center">
        <svg viewBox="0 0 100 100" width="120" height="120">
          {total === 0 ? (
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="var(--axis-border-default)"
              strokeWidth="16"
            />
          ) : (
            computed.map((seg) => (
              <circle
                key={seg.key}
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke={seg.color}
                strokeWidth={hovered === seg.key ? 18 : 16}
                strokeDasharray={`${seg.dash} ${circumference - seg.dash}`}
                strokeDashoffset={-seg.offset}
                transform="rotate(-90 50 50)"
                style={{ transition: "stroke-width 0.2s", cursor: "pointer" }}
                onMouseEnter={() => setHovered(seg.key)}
                onMouseLeave={() => setHovered(null)}
              />
            ))
          )}
        </svg>
        <div className="mt-2 text-center">
          <p className="text-xs text-[var(--axis-text-tertiary)]">수집 소스</p>
          <p className="text-lg font-bold text-[var(--axis-text-primary)]">
            {totalSources}개
          </p>
        </div>
        <div className="mt-2 space-y-0.5 text-sm">
          {segments.map((seg) => (
            <div key={seg.key} className="flex items-center justify-between gap-4">
              <span className="text-[var(--axis-text-secondary)]">
                {seg.label}
              </span>
              <span className="font-bold text-[var(--axis-text-primary)]">
                {seg.count}건
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
