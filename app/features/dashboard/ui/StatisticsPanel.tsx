import { useMemo } from "react";
import { ACTIVE_STATUSES, STATUS_CONFIG } from "~/lib/constants/status";

interface DiscoveryItem {
  id: string;
  status: string;
  createdAt: string | null;
  stageUpdatedAt: string | null;
  industryAdapterId: string | null;
}

interface ProposalItem {
  id: string;
  status: string;
  createdAt: string | null;
}

interface AdapterItem {
  id: string;
  nameKo: string;
  color: string;
}

interface SourceStat {
  sourceType: string;
  count: number;
}

interface StatisticsPanelProps {
  discoveries: DiscoveryItem[];
  proposals: ProposalItem[];
  industryAdapters: AdapterItem[];
  sourceStats: SourceStat[];
  totalCollections: number;
  serverNow: number;
  from?: string;
  to?: string;
}

// ────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────

function toDate(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [, m] = key.split("-");
  return `${Number(m)}월`;
}

function getRecentMonths(n: number): string[] {
  const now = new Date();
  const months: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(monthKey(d));
  }
  return months;
}

function getMonthsInRange(from: string, to: string): string[] {
  const start = new Date(from);
  const end = new Date(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return getRecentMonths(6);
  }
  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cursor <= endMonth) {
    months.push(monthKey(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months.length > 0 ? months : getRecentMonths(6);
}

// ────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────

function MonthlyActivityChart({
  discoveries,
  proposals,
  from,
  to,
}: {
  discoveries: DiscoveryItem[];
  proposals: ProposalItem[];
  from?: string;
  to?: string;
}) {
  const months = useMemo(
    () => (from && to ? getMonthsInRange(from, to) : getRecentMonths(6)),
    [from, to],
  );

  const data = useMemo(() => {
    const discByMonth: Record<string, number> = {};
    const propByMonth: Record<string, number> = {};
    for (const d of discoveries) {
      const dt = toDate(d.createdAt);
      if (dt) {
        const k = monthKey(dt);
        discByMonth[k] = (discByMonth[k] ?? 0) + 1;
      }
    }
    for (const p of proposals) {
      const dt = toDate(p.createdAt);
      if (dt) {
        const k = monthKey(dt);
        propByMonth[k] = (propByMonth[k] ?? 0) + 1;
      }
    }

    return months.map((m) => ({
      month: m,
      discoveries: discByMonth[m] ?? 0,
      proposals: propByMonth[m] ?? 0,
    }));
  }, [discoveries, proposals, months]);

  const maxVal = Math.max(1, ...data.map((d) => d.discoveries + d.proposals));

  return (
    <div className="dx-panel flex flex-col p-4">
      <h4 className="mb-3 text-sm font-semibold text-fg">
        월별 활동 현황
      </h4>
      <div className="flex flex-1 items-end gap-3">
        {data.map((d) => {
          const discH = (d.discoveries / maxVal) * 100;
          const propH = (d.proposals / maxVal) * 100;
          return (
            <div key={d.month} className="flex flex-1 flex-col items-center gap-1">
              <div className="flex h-24 w-full items-end justify-center gap-0.5">
                <div
                  className="w-3 rounded-t"
                  style={{
                    height: `${Math.max(discH, 2)}%`,
                    backgroundColor: "var(--axis-chart-bar)",
                  }}
                  title={`아이디어 ${d.discoveries}건`}
                />
                <div
                  className="w-3 rounded-t"
                  style={{
                    height: `${Math.max(propH, 2)}%`,
                    backgroundColor: "var(--axis-badge-purple-text, #6B21A8)",
                  }}
                  title={`사업제안 ${d.proposals}건`}
                />
              </div>
              <span className="text-[10px] text-fg-tertiary">
                {monthLabel(d.month)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-4 text-[10px] text-fg-tertiary">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: "var(--axis-chart-bar)" }} />
          아이디어
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: "var(--axis-badge-purple-text, #6B21A8)" }} />
          사업제안
        </span>
      </div>
    </div>
  );
}

function IndustryDonutChart({
  discoveries,
  adapters,
}: {
  discoveries: DiscoveryItem[];
  adapters: AdapterItem[];
}) {
  const segments = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of discoveries) {
      const key = d.industryAdapterId ?? "_none";
      counts[key] = (counts[key] ?? 0) + 1;
    }

    const adapterMap = new Map(adapters.map((a) => [a.id, a]));
    const result: { label: string; count: number; color: string }[] = [];

    for (const [key, count] of Object.entries(counts)) {
      const adapter = adapterMap.get(key);
      result.push({
        label: adapter?.nameKo ?? "미지정",
        count,
        color: adapter?.color ?? "#9CA3AF",
      });
    }
    return result.sort((a, b) => b.count - a.count);
  }, [discoveries, adapters]);

  const total = segments.reduce((s, seg) => s + seg.count, 0);

  // SVG donut — precompute offsets to avoid mutation in render
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const donutArcs = useMemo(
    () =>
      segments.map((seg, i) => {
        const pct = seg.count / total || 0;
        const dash = pct * circumference;
        const offset = segments
          .slice(0, i)
          .reduce((sum, prev) => sum + ((prev.count / total || 0) * circumference), 0);
        return { label: seg.label, color: seg.color, dash, offset };
      }),
    [segments, total, circumference],
  );

  return (
    <div className="dx-panel flex flex-col p-4">
      <h4 className="mb-3 text-sm font-semibold text-fg">
        산업 분포
      </h4>
      {total === 0 ? (
        <p className="py-6 text-center text-xs text-fg-tertiary">
          데이터 없음
        </p>
      ) : (
        <div className="flex items-center gap-4">
          <svg width="100" height="100" viewBox="0 0 100 100" className="shrink-0">
            {donutArcs.map((arc) => (
              <circle
                key={arc.label}
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={arc.color}
                strokeWidth="16"
                strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                strokeDashoffset={-arc.offset}
                transform="rotate(-90 50 50)"
              />
            ))}
          </svg>
          <div className="flex flex-col gap-1.5 overflow-hidden">
            {segments.slice(0, 5).map((seg) => (
              <div key={seg.label} className="flex items-center gap-2 text-xs">
                <span
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: seg.color }}
                />
                <span className="truncate text-fg-secondary">
                  {seg.label}
                </span>
                <span className="ml-auto shrink-0 font-medium text-fg">
                  {seg.count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CollectionStats({
  totalCollections,
  sourceStats,
}: {
  totalCollections: number;
  sourceStats: SourceStat[];
}) {
  const statMap = new Map(sourceStats.map((s) => [s.sourceType, s.count]));

  const items = [
    { label: "전체 수집", value: totalCollections },
    { label: "RSS", value: statMap.get("rss") ?? 0 },
    { label: "Web", value: statMap.get("web") ?? 0 },
    { label: "YouTube", value: statMap.get("youtube") ?? 0 },
  ];

  return (
    <div className="dx-panel flex flex-col p-4">
      <h4 className="mb-3 text-sm font-semibold text-fg">
        수집 현황
      </h4>
      <div className="grid grid-cols-2 gap-3">
        {items.map((item) => (
          <div key={item.label}>
            <p className="text-xl font-bold text-fg">
              {item.value.toLocaleString()}
            </p>
            <p className="text-[11px] text-fg-tertiary">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StageResidencyChart({
  discoveries,
  now,
}: {
  discoveries: DiscoveryItem[];
  now: number;
}) {
  const stageData = useMemo(() => {
    const grouped: Record<string, number[]> = {};

    for (const d of discoveries) {
      if (!(ACTIVE_STATUSES as readonly string[]).includes(d.status)) continue;
      const dt = toDate(d.stageUpdatedAt) ?? toDate(d.createdAt);
      if (!dt) continue;
      const days = Math.floor((now - dt.getTime()) / (1000 * 60 * 60 * 24));
      if (!grouped[d.status]) grouped[d.status] = [];
      grouped[d.status].push(days);
    }

    return (ACTIVE_STATUSES as readonly string[])
      .filter((s) => grouped[s]?.length)
      .map((status) => {
        const arr = grouped[status]!;
        const avg = Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
        return {
          status,
          label: STATUS_CONFIG[status]?.label ?? status,
          avgDays: avg,
          count: arr.length,
        };
      });
  }, [discoveries, now]);

  const maxDays = Math.max(1, ...stageData.map((s) => s.avgDays));

  return (
    <div className="dx-panel flex flex-col p-4">
      <h4 className="mb-3 text-sm font-semibold text-fg">
        단계별 평균 체류
      </h4>
      {stageData.length === 0 ? (
        <p className="py-6 text-center text-xs text-fg-tertiary">
          데이터 없음
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {stageData.map((s) => (
            <div key={s.status} className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-right text-[11px] text-fg-secondary">
                {s.label}
              </span>
              <div className="relative h-4 flex-1 overflow-hidden rounded bg-surface-secondary">
                <div
                  className="h-full rounded"
                  style={{
                    width: `${Math.max((s.avgDays / maxDays) * 100, 4)}%`,
                    backgroundColor: "var(--axis-chart-bar)",
                  }}
                />
              </div>
              <span className="w-10 shrink-0 text-right text-[11px] font-medium text-fg">
                {s.avgDays}일
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────

export function StatisticsPanel({
  discoveries,
  proposals,
  industryAdapters: adapters,
  sourceStats,
  totalCollections,
  serverNow,
  from,
  to,
}: StatisticsPanelProps) {
  return (
    <div>
      <h3 className="mb-4 text-base font-bold text-fg">
        통계
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <MonthlyActivityChart discoveries={discoveries} proposals={proposals} from={from} to={to} />
        <IndustryDonutChart discoveries={discoveries} adapters={adapters} />
        <CollectionStats totalCollections={totalCollections} sourceStats={sourceStats} />
        <StageResidencyChart discoveries={discoveries} now={serverNow} />
      </div>
    </div>
  );
}
