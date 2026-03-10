/**
 * Cost monitoring widget — CSS-only bar chart + model summary table + today card.
 * Uses Anthropic Admin API data. No chart library dependency.
 */

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import type { UsageBucket, CostBucket, ClaudeCodeMetric } from "~/lib/cost/anthropic-admin-client";

interface CostMonitorWidgetProps {
  usage: UsageBucket[];
  cost: CostBucket[];
  analytics: ClaudeCodeMetric[];
  available: boolean;
  range: "7d" | "30d";
  onRangeChange: (range: "7d" | "30d") => void;
}

// ── Helpers ─────────────────────────────────────────────────────

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}

function getModelColor(model: string): string {
  if (model.includes("opus")) return "var(--axis-accent-purple, #a855f7)";
  if (model.includes("sonnet")) return "var(--axis-text-brand, #6366f1)";
  if (model.includes("haiku")) return "var(--axis-accent-green, #22c55e)";
  return "var(--axis-accent-amber, #f59e0b)";
}

// ── Component ───────────────────────────────────────────────────

export function CostMonitorWidget({
  usage,
  cost,
  analytics,
  available,
  range,
  onRangeChange,
}: CostMonitorWidgetProps) {
  if (!available) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">비용 모니터링</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <Badge variant="warning">미설정</Badge>
            <p className="text-sm text-fg-tertiary">
              Admin API Key가 설정되지 않았어요.
            </p>
            <p className="text-xs text-fg-tertiary">
              .dev.vars에 ANTHROPIC_ADMIN_API_KEY를 추가하세요.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ── Aggregate cost by date ──
  const dateCostMap = new Map<string, number>();
  for (const row of cost) {
    const date = row.start_time.slice(0, 10);
    dateCostMap.set(date, (dateCostMap.get(date) || 0) + row.cost_usd);
  }

  // Fill dates
  const days = range === "30d" ? 30 : 7;
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const maxCost = Math.max(...dates.map((d) => dateCostMap.get(d) || 0), 0.01);

  // ── Model summary from usage ──
  const modelMap = new Map<string, { input: number; output: number; requests: number }>();
  for (const row of usage) {
    const prev = modelMap.get(row.model) || { input: 0, output: 0, requests: 0 };
    modelMap.set(row.model, {
      input: prev.input + row.input_tokens,
      output: prev.output + row.output_tokens,
      requests: prev.requests + row.request_count,
    });
  }

  // ── Today totals ──
  const today = new Date().toISOString().slice(0, 10);
  const todayCost = dateCostMap.get(today) || 0;
  const todayTokens = usage
    .filter((r) => r.start_time.slice(0, 10) === today)
    .reduce((sum, r) => sum + r.total_tokens, 0);
  const todayRequests = usage
    .filter((r) => r.start_time.slice(0, 10) === today)
    .reduce((sum, r) => sum + r.request_count, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Section 1: Daily cost bar chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">일별 API 비용</CardTitle>
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
          <div className="relative h-40">
            <div className="flex h-full items-end gap-px">
              {dates.map((date) => {
                const dayCost = dateCostMap.get(date) || 0;
                const heightPct = (dayCost / maxCost) * 100;

                return (
                  <div
                    key={date}
                    className="group relative flex flex-1 flex-col justify-end"
                    style={{ height: "100%" }}
                  >
                    {/* Tooltip */}
                    <div className="pointer-events-none absolute -top-16 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-surface px-2 py-1 text-[10px] shadow-lg group-hover:block">
                      <div className="font-medium text-fg">{date.slice(5)}</div>
                      <div className="text-fg-tertiary">{formatUsd(dayCost)}</div>
                    </div>
                    <div
                      className="w-full rounded-t-sm transition-all"
                      style={{
                        height: `${heightPct}%`,
                        minHeight: dayCost > 0 ? "2px" : "0",
                        backgroundColor: "var(--axis-text-brand, #6366f1)",
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-[9px] text-fg-tertiary">{dates[0]?.slice(5)}</span>
            <span className="text-[9px] text-fg-tertiary">{dates[dates.length - 1]?.slice(5)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Model summary table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">모델별 토큰 사용량</CardTitle>
        </CardHeader>
        <CardContent>
          {modelMap.size === 0 ? (
            <p className="py-4 text-center text-sm text-fg-tertiary">데이터 없음</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-fg-tertiary">
                    <th className="pb-2 font-medium">모델</th>
                    <th className="pb-2 text-right font-medium">Input</th>
                    <th className="pb-2 text-right font-medium">Output</th>
                    <th className="pb-2 text-right font-medium">요청</th>
                  </tr>
                </thead>
                <tbody>
                  {[...modelMap.entries()]
                    .sort((a, b) => b[1].input + b[1].output - (a[1].input + a[1].output))
                    .map(([model, data]) => (
                      <tr key={model} className="border-b border-border/50">
                        <td className="py-1.5">
                          <div className="flex items-center gap-1.5">
                            <div
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: getModelColor(model) }}
                            />
                            <span className="text-fg">{model}</span>
                          </div>
                        </td>
                        <td className="py-1.5 text-right text-fg-secondary">
                          {formatTokens(data.input)}
                        </td>
                        <td className="py-1.5 text-right text-fg-secondary">
                          {formatTokens(data.output)}
                        </td>
                        <td className="py-1.5 text-right text-fg-secondary">
                          {data.requests.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Today's summary card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">오늘 요약</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-secondary p-3">
              <span className="text-lg font-semibold text-fg">{formatUsd(todayCost)}</span>
              <span className="text-[10px] text-fg-tertiary">총 비용</span>
            </div>
            <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-secondary p-3">
              <span className="text-lg font-semibold text-fg">{formatTokens(todayTokens)}</span>
              <span className="text-[10px] text-fg-tertiary">총 토큰</span>
            </div>
            <div className="flex flex-col items-center gap-1 rounded-lg bg-surface-secondary p-3">
              <span className="text-lg font-semibold text-fg">{todayRequests}</span>
              <span className="text-[10px] text-fg-tertiary">요청 수</span>
            </div>
          </div>
          {analytics.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-[10px] text-fg-tertiary">
                Claude Code 활동: {analytics.length}건
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
