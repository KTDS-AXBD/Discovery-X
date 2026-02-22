/**
 * Token usage bar chart — CSS-only, no charting library dependency.
 * Shows daily token usage by mode (stacked bars) with budget line.
 */

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";

interface DailySummary {
  date: string;
  mode: string;
  total_tokens: number;
  request_count: number;
}

interface TodayUsage {
  tokensUsedToday: number;
  dailyTokenBudget: number;
  tokenResetDate: string | null;
}

interface TokenUsageChartProps {
  dailySummary: DailySummary[];
  todayUsage: TodayUsage;
  range: "7d" | "30d";
  onRangeChange: (range: "7d" | "30d") => void;
}

const MODE_COLORS: Record<string, string> = {
  default: "var(--axis-text-brand, #6366f1)",
  ideas: "var(--axis-accent-green, #22c55e)",
  direct: "var(--axis-accent-amber, #f59e0b)",
};

const MODE_LABELS: Record<string, string> = {
  default: "기본",
  ideas: "Ideas",
  direct: "전용 분석",
};

export function TokenUsageChart({
  dailySummary,
  todayUsage,
  range,
  onRangeChange,
}: TokenUsageChartProps) {
  // Aggregate by date
  const dateMap = new Map<string, Record<string, number>>();
  for (const row of dailySummary) {
    if (!dateMap.has(row.date)) {
      dateMap.set(row.date, {});
    }
    const entry = dateMap.get(row.date)!;
    entry[row.mode] = (entry[row.mode] || 0) + row.total_tokens;
  }

  // Fill in missing dates
  const days = range === "30d" ? 30 : 7;
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  // Calculate max for scaling
  let maxTokens = 0;
  for (const date of dates) {
    const entry = dateMap.get(date) || {};
    const total = Object.values(entry).reduce((a, b) => a + b, 0);
    if (total > maxTokens) maxTokens = total;
  }
  // Include budget in max for scaling
  maxTokens = Math.max(maxTokens, todayUsage.dailyTokenBudget);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">일별 토큰 사용량</CardTitle>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => onRangeChange("7d")}
              className={`rounded px-2 py-0.5 text-xs ${
                range === "7d"
                  ? "bg-surface-brand text-fg-brand"
                  : "text-fg-tertiary hover:bg-surface-secondary"
              }`}
            >
              7일
            </button>
            <button
              type="button"
              onClick={() => onRangeChange("30d")}
              className={`rounded px-2 py-0.5 text-xs ${
                range === "30d"
                  ? "bg-surface-brand text-fg-brand"
                  : "text-fg-tertiary hover:bg-surface-secondary"
              }`}
            >
              30일
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Legend */}
        <div className="mb-3 flex items-center gap-4">
          {Object.entries(MODE_LABELS).map(([mode, label]) => (
            <div key={mode} className="flex items-center gap-1.5">
              <div
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: MODE_COLORS[mode] }}
              />
              <span className="text-[10px] text-fg-tertiary">{label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div className="h-0 w-4 border-t-2 border-dashed border-red-400" />
            <span className="text-[10px] text-fg-tertiary">예산</span>
          </div>
        </div>

        {/* Chart area */}
        <div className="relative h-40">
          {/* Budget line */}
          {maxTokens > 0 && (
            <div
              className="absolute left-0 right-0 border-t-2 border-dashed border-red-400/50"
              style={{
                bottom: `${(todayUsage.dailyTokenBudget / maxTokens) * 100}%`,
              }}
            />
          )}

          {/* Bars */}
          <div className="flex h-full items-end gap-px">
            {dates.map((date) => {
              const entry = dateMap.get(date) || {};
              const total = Object.values(entry).reduce((a, b) => a + b, 0);
              const heightPct = maxTokens > 0 ? (total / maxTokens) * 100 : 0;

              return (
                <div
                  key={date}
                  className="group relative flex flex-1 flex-col justify-end"
                  style={{ height: "100%" }}
                >
                  {/* Tooltip on hover */}
                  <div className="pointer-events-none absolute -top-16 left-1/2 z-10 hidden -translate-x-1/2 rounded bg-surface px-2 py-1 text-[10px] shadow-lg group-hover:block">
                    <div className="font-medium text-fg">
                      {date.slice(5)}
                    </div>
                    <div className="text-fg-tertiary">
                      {total.toLocaleString()} tokens
                    </div>
                  </div>

                  {/* Stacked bar */}
                  <div
                    className="flex w-full flex-col justify-end overflow-hidden rounded-t-sm transition-all"
                    style={{ height: `${heightPct}%`, minHeight: total > 0 ? "2px" : "0" }}
                  >
                    {["default", "ideas", "direct"].map((mode) => {
                      const modeVal = entry[mode] || 0;
                      if (modeVal === 0) return null;
                      const modePct = total > 0 ? (modeVal / total) * 100 : 0;
                      return (
                        <div
                          key={mode}
                          style={{
                            height: `${modePct}%`,
                            backgroundColor: MODE_COLORS[mode],
                            minHeight: "1px",
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* X-axis labels (show a subset) */}
        <div className="mt-1 flex justify-between">
          <span className="text-[9px] text-fg-tertiary">
            {dates[0]?.slice(5)}
          </span>
          <span className="text-[9px] text-fg-tertiary">
            {dates[dates.length - 1]?.slice(5)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
