/**
 * 비용 대시보드 — /admin/costs
 *
 * 토큰 사용 현황(일별 차트, 요약)과 사용자별 예산 상태를 보여준다.
 * API: GET /api/admin/token-usage, GET /api/admin/token-budget
 */

import { useState, useEffect, useCallback } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { getDb } from "~/db";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import type { BudgetStatus } from "~/lib/cost/token-budget";

// ─── 타입 정의 ─────────────────────────────────────────────────────────

interface DailySummaryRow {
  date: string;
  mode: string;
  totalTokens: number;
  requestCount: number;
}

interface TodayUsage {
  tokensUsedToday: number;
  dailyTokenBudget: number;
  tokenResetDate: string | null;
}

interface RecentLog {
  id: string;
  mode: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolRounds: number;
  createdAt: string;
}

interface TokenUsageResponse {
  dailySummary: DailySummaryRow[];
  todayUsage: TodayUsage;
  recentLogs: RecentLog[];
}

interface UserBudgetRow {
  userId: string;
  email: string;
  budget: BudgetStatus;
}

interface TokenBudgetResponse {
  users: UserBudgetRow[];
  summary: { total: number; overBudget: number };
}

// ─── 유틸 ──────────────────────────────────────────────────────────────

/** 토큰 수를 읽기 쉬운 형태로 포맷 (예: 1,234,567 → "1.23M") */
function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** 날짜 문자열(YYYY-MM-DD) → "2/16" 형식 */
function shortDate(dateStr: string): string {
  const parts = dateStr.split("-");
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

/** 모드 라벨 */
function modeLabel(mode: string): string {
  const labels: Record<string, string> = {
    default: "기본",
    ideas: "아이디어",
    direct: "직접",
  };
  return labels[mode] ?? mode;
}

/** 모드별 CSS 색상 클래스 (바 차트용) */
const MODE_COLORS: Record<string, string> = {
  default: "bg-blue-500",
  ideas: "bg-emerald-500",
  direct: "bg-orange-500",
};

const MODE_DOT_COLORS: Record<string, string> = {
  default: "bg-blue-500",
  ideas: "bg-emerald-500",
  direct: "bg-orange-500",
};

// ─── Loader ────────────────────────────────────────────────────────────

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const currentUser = await requireAdmin(request, db, secret);
  return json({ currentUser });
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────

/** 요약 카드 1개 */
function SummaryCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 px-5">
        <p className="text-xs font-medium text-fg-tertiary uppercase tracking-wide">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold text-fg">
          {value}
        </p>
        {sub && (
          <p className="mt-0.5 text-xs text-fg-tertiary">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

/** 일별 스택 바 차트 (CSS 전용) */
function DailyChart({ data }: { data: DailySummaryRow[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-fg-tertiary">
        데이터가 없습니다
      </div>
    );
  }

  // 날짜별로 모드 합산
  const dateMap = new Map<string, Record<string, number>>();
  for (const row of data) {
    if (!dateMap.has(row.date)) {
      dateMap.set(row.date, {});
    }
    const entry = dateMap.get(row.date)!;
    entry[row.mode] = (entry[row.mode] ?? 0) + row.totalTokens;
  }

  const dates = [...dateMap.keys()].sort();
  const modes = ["default", "ideas", "direct"];

  // 날짜별 합산 최댓값
  let maxTokens = 0;
  for (const modeMap of dateMap.values()) {
    const total = Object.values(modeMap).reduce((s, v) => s + v, 0);
    if (total > maxTokens) maxTokens = total;
  }
  if (maxTokens === 0) maxTokens = 1; // 0 나누기 방지

  return (
    <div>
      {/* 범례 */}
      <div className="flex items-center gap-4 mb-3">
        {modes.map((mode) => (
          <div key={mode} className="flex items-center gap-1.5">
            <span className={`inline-block w-2.5 h-2.5 rounded-sm ${MODE_DOT_COLORS[mode]}`} />
            <span className="text-xs text-fg-secondary">{modeLabel(mode)}</span>
          </div>
        ))}
      </div>

      {/* 차트 영역 */}
      <div className="flex items-end gap-1 h-48">
        {dates.map((date) => {
          const modeMap = dateMap.get(date) ?? {};
          return (
            <div key={date} className="flex-1 flex flex-col justify-end group relative min-w-0">
              {/* 스택 바: 아래부터 default → ideas → direct 순서 */}
              {modes.map((mode) => {
                const tokens = modeMap[mode] ?? 0;
                if (tokens === 0) return null;
                const pct = (tokens / maxTokens) * 100;
                return (
                  <div
                    key={mode}
                    className={`${MODE_COLORS[mode]} w-full rounded-t-sm first:rounded-b-sm`}
                    style={{ height: `${pct}%`, minHeight: tokens > 0 ? "2px" : 0 }}
                  />
                );
              })}

              {/* 툴팁 */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                <div className="bg-neutral-900 text-white text-[10px] rounded px-2 py-1.5 whitespace-nowrap shadow-lg">
                  <p className="font-medium">{date}</p>
                  {modes.map((mode) => {
                    const tokens = modeMap[mode] ?? 0;
                    if (tokens === 0) return null;
                    return (
                      <p key={mode}>
                        {modeLabel(mode)}: {formatTokenCount(tokens)}
                      </p>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* X축 날짜 라벨 */}
      <div className="flex gap-1 mt-1.5">
        {dates.map((date, i) => (
          <div key={date} className="flex-1 min-w-0">
            {/* 날짜가 많으면 짝수만 표시 */}
            {dates.length <= 14 || i % 2 === 0 ? (
              <p className="text-[10px] text-center text-fg-tertiary truncate">
                {shortDate(date)}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 예산 사용률 프로그레스 바 */
function UsageBar({ used, limit }: { used: number; limit: number }) {
  const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const isWarning = pct >= 80;
  const isDanger = pct >= 95;

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isDanger
              ? "bg-red-500"
              : isWarning
                ? "bg-amber-500"
                : "bg-blue-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-fg-tertiary whitespace-nowrap w-12 text-right">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────

export default function AdminCosts() {
  const { currentUser } = useLoaderData<typeof loader>();
  const [range, setRange] = useState<"7d" | "30d">("7d");

  const usageFetcher = useFetcher<TokenUsageResponse>();
  const budgetFetcher = useFetcher<TokenBudgetResponse>();

  // 기간 변경 시 사용량 데이터 로드
  const loadUsage = useCallback(
    (r: string) => {
      usageFetcher.load(`/api/admin/token-usage?range=${r}`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usageFetcher.load],
  );

  // 예산 데이터 로드
  const loadBudget = useCallback(() => {
    budgetFetcher.load("/api/admin/token-budget");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgetFetcher.load]);

  useEffect(() => {
    loadUsage(range);
    loadBudget();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // 기간 변경
  function handleRangeChange(newRange: "7d" | "30d") {
    setRange(newRange);
    loadUsage(newRange);
  }

  const usageData = usageFetcher.data;
  const budgetData = budgetFetcher.data;
  const isLoadingUsage = usageFetcher.state === "loading";
  const isLoadingBudget = budgetFetcher.state === "loading";

  // 요약 계산
  const totalTokens = usageData?.dailySummary.reduce((s, r) => s + r.totalTokens, 0) ?? 0;
  const uniqueDates = new Set(usageData?.dailySummary.map((r) => r.date) ?? []);
  const avgPerDay = uniqueDates.size > 0 ? Math.round(totalTokens / uniqueDates.size) : 0;

  // 가장 많이 쓴 모드
  const modeTokens: Record<string, number> = {};
  for (const row of usageData?.dailySummary ?? []) {
    modeTokens[row.mode] = (modeTokens[row.mode] ?? 0) + row.totalTokens;
  }
  const topMode = Object.entries(modeTokens).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "-";

  return (
    <AppShell user={currentUser}>
      {/* 페이지 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-fg">
            비용 대시보드
          </h1>
          <p className="mt-1 text-sm text-fg-secondary">
            토큰 사용 현황과 사용자별 예산 상태를 확인합니다.
          </p>
        </div>

        {/* 기간 토글 */}
        <div className="flex items-center gap-1 rounded-lg bg-surface-tertiary p-1">
          <button
            type="button"
            onClick={() => handleRangeChange("7d")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              range === "7d"
                ? "bg-surface text-fg shadow-sm"
                : "text-fg-tertiary hover:text-fg-secondary"
            }`}
          >
            7일
          </button>
          <button
            type="button"
            onClick={() => handleRangeChange("30d")}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              range === "30d"
                ? "bg-surface text-fg shadow-sm"
                : "text-fg-tertiary hover:text-fg-secondary"
            }`}
          >
            30일
          </button>
        </div>
      </div>

      {/* 요약 카드 */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isLoadingUsage ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <SummaryCard
              label="총 토큰 사용량"
              value={formatTokenCount(totalTokens)}
              sub={`최근 ${range === "7d" ? "7일" : "30일"}`}
            />
            <SummaryCard
              label="일평균"
              value={formatTokenCount(avgPerDay)}
              sub={`${uniqueDates.size}일 기준`}
            />
            <SummaryCard
              label="가장 많이 쓴 모드"
              value={modeLabel(topMode)}
              sub={topMode !== "-" ? `${formatTokenCount(modeTokens[topMode] ?? 0)} 토큰` : undefined}
            />
          </>
        )}
      </div>

      {/* 오늘 사용량 + 일별 차트 */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* 오늘 사용량 카드 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">오늘 사용량</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingUsage ? (
              <div className="h-16 animate-pulse bg-neutral-200 dark:bg-neutral-700 rounded" />
            ) : usageData?.todayUsage ? (
              <div>
                <p className="text-xl font-bold text-fg">
                  {formatTokenCount(usageData.todayUsage.tokensUsedToday)}
                </p>
                <p className="text-xs text-fg-tertiary mt-1">
                  일일 한도: {formatTokenCount(usageData.todayUsage.dailyTokenBudget)}
                </p>
                <div className="mt-3">
                  <UsageBar
                    used={usageData.todayUsage.tokensUsedToday}
                    limit={usageData.todayUsage.dailyTokenBudget}
                  />
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* 일별 차트 */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">일별 사용량</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingUsage ? (
              <div className="h-48 animate-pulse bg-neutral-200 dark:bg-neutral-700 rounded" />
            ) : (
              <DailyChart data={usageData?.dailySummary ?? []} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* 사용자별 예산 현황 */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">사용자별 예산 현황</CardTitle>
            {budgetData?.summary && (
              <span className="text-xs text-fg-tertiary">
                {budgetData.summary.overBudget > 0 && (
                  <Badge variant="destructive" className="mr-2">
                    초과 {budgetData.summary.overBudget}명
                  </Badge>
                )}
                전체 {budgetData.summary.total}명
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingBudget ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse bg-neutral-200 dark:bg-neutral-700 rounded" />
              ))}
            </div>
          ) : !budgetData?.users?.length ? (
            <p className="text-sm text-fg-tertiary py-4">사용자 데이터가 없습니다</p>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left py-2 px-5 text-xs font-medium text-fg-tertiary">이메일</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-fg-tertiary">메모리 사용</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-fg-tertiary">월간 사용</th>
                    <th className="text-center py-2 px-3 text-xs font-medium text-fg-tertiary">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {budgetData.users.map((user) => {
                    const memoryPct =
                      user.budget.memoryLimit > 0
                        ? (user.budget.memoryUsed / user.budget.memoryLimit) * 100
                        : 0;
                    const monthlyPct =
                      user.budget.monthlyLimit > 0
                        ? (user.budget.monthlyUsed / user.budget.monthlyLimit) * 100
                        : 0;
                    const isOver = !user.budget.memoryOk || !user.budget.monthlyOk;

                    return (
                      <tr
                        key={user.userId}
                        className={isOver ? "bg-red-50 dark:bg-red-950/20" : ""}
                      >
                        <td className="py-2.5 px-5 text-fg truncate max-w-[200px]">
                          {user.email}
                        </td>
                        <td className="py-2.5 px-3 w-48">
                          <div>
                            <span className="text-xs text-fg-secondary">
                              {formatTokenCount(user.budget.memoryUsed)} / {formatTokenCount(user.budget.memoryLimit)}
                            </span>
                            <UsageBar used={user.budget.memoryUsed} limit={user.budget.memoryLimit} />
                          </div>
                        </td>
                        <td className="py-2.5 px-3 w-48">
                          <div>
                            <span className="text-xs text-fg-secondary">
                              {formatTokenCount(user.budget.monthlyUsed)} / {formatTokenCount(user.budget.monthlyLimit)}
                            </span>
                            <UsageBar used={user.budget.monthlyUsed} limit={user.budget.monthlyLimit} />
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {isOver ? (
                            <Badge variant="destructive">초과</Badge>
                          ) : memoryPct >= 80 || monthlyPct >= 80 ? (
                            <Badge variant="warning">주의</Badge>
                          ) : (
                            <Badge variant="secondary">정상</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 최근 사용 로그 */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">최근 사용 로그</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingUsage ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 animate-pulse bg-neutral-200 dark:bg-neutral-700 rounded" />
              ))}
            </div>
          ) : !usageData?.recentLogs?.length ? (
            <p className="text-sm text-fg-tertiary py-4">최근 로그가 없습니다</p>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left py-2 px-5 text-xs font-medium text-fg-tertiary">시간</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-fg-tertiary">모드</th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-fg-tertiary">모델</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-fg-tertiary">입력</th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-fg-tertiary">출력</th>
                    <th className="text-right py-2 px-5 text-xs font-medium text-fg-tertiary">합계</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {usageData.recentLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 px-5 text-xs text-fg-secondary whitespace-nowrap">
                        {formatLogTime(log.createdAt)}
                      </td>
                      <td className="py-2 px-3">
                        <Badge variant="subtle">{modeLabel(log.mode)}</Badge>
                      </td>
                      <td className="py-2 px-3 text-xs text-fg-secondary truncate max-w-[120px]">
                        {log.model}
                      </td>
                      <td className="py-2 px-3 text-xs text-right text-fg-secondary tabular-nums">
                        {formatTokenCount(log.inputTokens)}
                      </td>
                      <td className="py-2 px-3 text-xs text-right text-fg-secondary tabular-nums">
                        {formatTokenCount(log.outputTokens)}
                      </td>
                      <td className="py-2 px-5 text-xs text-right font-medium text-fg tabular-nums">
                        {formatTokenCount(log.totalTokens)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}

// ─── 보조 컴포넌트 ────────────────────────────────────────────────────

/** 로딩 스켈레톤 카드 */
function SkeletonCard() {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 px-5 space-y-2">
        <div className="h-3 w-20 animate-pulse bg-neutral-200 dark:bg-neutral-700 rounded" />
        <div className="h-7 w-28 animate-pulse bg-neutral-200 dark:bg-neutral-700 rounded" />
        <div className="h-3 w-16 animate-pulse bg-neutral-200 dark:bg-neutral-700 rounded" />
      </CardContent>
    </Card>
  );
}

/** 로그 시간 포맷 (hydration-safe) */
function formatLogTime(iso: string | number | null): string {
  if (!iso) return "-";
  const d = typeof iso === "number" ? new Date(iso * 1000) : new Date(iso);
  if (isNaN(d.getTime())) return "-";
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${mo}/${day} ${h}:${m}`;
}
