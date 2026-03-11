/**
 * 비용 관리 — /admin/costs
 *
 * 3-Ledger 비용 관리 UI: 비용 개요, 예산 정책, 모델 카탈로그, 라우팅 로그
 * 4-Tab 레이아웃으로 전체 비용 파이프라인을 한 곳에서 관리한다.
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
import { Button } from "~/components/ui/Button";
import { Skeleton } from "~/components/ui/Skeleton";

// ─── 타입 정의 ─────────────────────────────────────────────────────────

type TabId = "overview" | "budget" | "catalog" | "routing";
type RangeId = "7d" | "30d" | "90d";

// --- Overview (matches /api/admin/cost-report-v2 response) ---

interface DailyTrendRow {
  date: string;
  requests: number;
  tokens: number;
  costUsd: number;
}

interface BudgetStatusRow {
  policy: {
    id: string;
    tenantId: string;
    userId: string | null;
    purpose: string | null;
    budgetUsd: number;
    thresholdWarnPct: number;
    thresholdDegradePct: number;
    thresholdBlockPct: number;
  };
  cache: {
    currentUsageUsd: number;
    usagePct: number;
    budgetTier: string;
  } | null;
}

interface CostReportResponse {
  period: { startDate: string; endDate: string; days: number };
  summary: {
    totalRequests: number;
    totalTokens: number;
    totalCostUsd: number;
  };
  breakdown: { key: string; requests: number; tokens: number; costUsd: number }[];
  dailyTrend: DailyTrendRow[];
  budgetStatus: BudgetStatusRow[];
}

// --- Budget Policies (matches /api/admin/budget-policies response) ---

interface BudgetPolicyApiRow {
  policy: {
    id: string;
    tenantId: string;
    userId: string | null;
    purpose: string | null;
    budgetUsd: number;
    periodStart: number;
    periodEnd: number;
    thresholdWarnPct: number;
    thresholdDegradePct: number;
    thresholdBlockPct: number;
    isActive: boolean;
  };
  currentUsageUsd: number | null;
  usagePct: number | null;
  budgetTier: string | null;
}

interface BudgetPoliciesResponse {
  policies: BudgetPolicyApiRow[];
}

// --- Model Catalog (matches /api/admin/model-catalog response) ---

interface ModelCatalogRow {
  id: string;
  provider: string;
  modelId: string;
  displayName: string;
  capabilityScore: number;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsJsonMode: boolean;
  isActive: boolean;
  currentPrice: {
    inputPricePerMToken: number;
    outputPricePerMToken: number;
  } | null;
}

interface ModelCatalogResponse {
  models: ModelCatalogRow[];
}

// --- Routing Decisions (matches /api/admin/routing-decisions response) ---

interface RoutingDecisionRow {
  id: string;
  createdAt: number;
  userId: string;
  purpose: string;
  selectedProvider: string | null;
  selectedModel: string | null;
  reasonCode: string;
  fallbackCount: number;
}

interface RoutingDecisionsResponse {
  decisions: RoutingDecisionRow[];
  total: number;
}

// ─── 상수 ──────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "overview", label: "비용 개요", icon: "◈" },
  { id: "budget", label: "예산 정책", icon: "◇" },
  { id: "catalog", label: "모델 카탈로그", icon: "▣" },
  { id: "routing", label: "라우팅 로그", icon: "▤" },
];

const RANGES: { id: RangeId; label: string }[] = [
  { id: "7d", label: "7일" },
  { id: "30d", label: "30일" },
  { id: "90d", label: "90일" },
];

const PURPOSE_LABELS: Record<string, string> = {
  chat: "채팅",
  analysis: "분석",
  extraction: "추출",
  batch: "배치",
  "agent-tool": "에이전트",
  eval: "평가",
};

const REASON_BADGE: Record<string, { variant: "secondary" | "warning" | "destructive"; label: string }> = {
  primary: { variant: "secondary", label: "정상" },
  fallback_error: { variant: "warning", label: "에러 폴백" },
  fallback_credit: { variant: "warning", label: "크레딧 폴백" },
  budget_degrade: { variant: "warning", label: "저비용 전환" },
  budget_block: { variant: "destructive", label: "차단" },
  capability_skip: { variant: "warning", label: "역량 스킵" },
  policy_override: { variant: "secondary", label: "정책 오버라이드" },
  retry: { variant: "warning", label: "재시도" },
};

const TIER_BADGE: Record<string, { variant: "secondary" | "warning" | "destructive"; label: string }> = {
  normal: { variant: "secondary", label: "정상" },
  warn: { variant: "warning", label: "경고" },
  degrade: { variant: "destructive", label: "저비용 전환" },
  block: { variant: "destructive", label: "차단" },
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  deepseek: "DeepSeek",
  "workers-ai": "Workers AI",
};

// ─── 유틸 ──────────────────────────────────────────────────────────────

function formatUsd(n: number): string {
  return `$${n.toFixed(4)}`;
}

function formatUsdShort(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(4)}`;
}

function shortDate(dateStr: string): string {
  const parts = dateStr.split("-");
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

function formatTimestamp(ts: number | string | null): string {
  if (!ts) return "-";
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  if (isNaN(d.getTime())) return "-";
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${mo}/${day} ${h}:${m}`;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

function purposeLabel(p: string): string {
  return PURPOSE_LABELS[p] ?? p;
}

function scopeLabel(p: { userId: string | null; purpose: string | null }): string {
  if (p.userId && p.purpose) return `사용자+${purposeLabel(p.purpose)}`;
  if (p.userId) return "사용자";
  if (p.purpose) return purposeLabel(p.purpose);
  return "조직 전체";
}

// ─── Loader ────────────────────────────────────────────────────────────

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const currentUser = await requireAdmin(request, db, secret);
  return json({ currentUser });
}

// ─── 서브 컴포넌트 ─────────────────────────────────────────────────────

/** 요약 카드 — 좌측 accent border + 모노스페이스 값 */
function SummaryCard({
  label,
  value,
  sub,
  accent = "teal",
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "teal" | "amber" | "rose";
}) {
  const accentColor = {
    teal: "border-l-teal-500",
    amber: "border-l-amber-500",
    rose: "border-l-rose-500",
  }[accent];

  return (
    <Card className={`border-l-[3px] ${accentColor} overflow-hidden`}>
      <CardContent className="pt-5 pb-4 px-5">
        <p className="text-[10px] font-semibold text-fg-tertiary uppercase tracking-[0.08em]">
          {label}
        </p>
        <p className="mt-1.5 text-2xl font-bold text-fg tabular-nums tracking-tight" style={{ fontVariantNumeric: "tabular-nums" }}>
          {value}
        </p>
        {sub && <p className="mt-1 text-[11px] text-fg-tertiary">{sub}</p>}
      </CardContent>
    </Card>
  );
}

/** 스켈레톤 카드 */
function SkeletonCard() {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 px-5 space-y-2">
        <Skeleton className="h-3 w-20 rounded" />
        <Skeleton className="h-7 w-28 rounded" />
        <Skeleton className="h-3 w-16 rounded" />
      </CardContent>
    </Card>
  );
}

/** 사용률 프로그레스 바 — threshold 마커 포함 */
function UsageBar({ pct, warnAt = 80, degradeAt = 100, blockAt = 120 }: { pct: number; warnAt?: number; degradeAt?: number; blockAt?: number }) {
  const maxPct = Math.max(blockAt, 120);
  const barPct = Math.min((pct / maxPct) * 100, 100);
  const isDanger = pct >= degradeAt;
  const isWarning = pct >= warnAt;
  const isBlock = pct >= blockAt;

  const barColor = isBlock
    ? "bg-red-600 dark:bg-red-500"
    : isDanger
      ? "bg-orange-500"
      : isWarning
        ? "bg-amber-500"
        : "bg-teal-500";

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 h-2 rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-visible">
        <div className="absolute inset-0 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${barPct}%` }}
          />
        </div>
        {/* threshold 마커 */}
        <div
          className="absolute top-[-1px] w-[1.5px] h-[10px] bg-amber-400 opacity-60"
          style={{ left: `${(warnAt / maxPct) * 100}%` }}
          title={`경고 ${warnAt}%`}
        />
        <div
          className="absolute top-[-1px] w-[1.5px] h-[10px] bg-orange-500 opacity-60"
          style={{ left: `${(degradeAt / maxPct) * 100}%` }}
          title={`저비용 전환 ${degradeAt}%`}
        />
        <div
          className="absolute top-[-1px] w-[1.5px] h-[10px] bg-red-500 opacity-60"
          style={{ left: `${(blockAt / maxPct) * 100}%` }}
          title={`차단 ${blockAt}%`}
        />
      </div>
      <span className={`text-[11px] whitespace-nowrap w-12 text-right tabular-nums font-medium ${
        isBlock ? "text-red-600 dark:text-red-400" : isDanger ? "text-orange-600 dark:text-orange-400" : "text-fg-tertiary"
      }`}>
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

/** 일별 비용 바 차트 (CSS 전용) */
function DailyCostChart({ data }: { data: DailyTrendRow[] }) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-sm text-fg-tertiary">
        데이터가 없습니다
      </div>
    );
  }

  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const maxCost = Math.max(...sorted.map((r) => r.costUsd), 0.0001);

  return (
    <div>
      <div className="relative flex items-end gap-1 h-48">
        {/* 수평 그리드 라인 */}
        {[25, 50, 75].map((pct) => (
          <div
            key={pct}
            className="absolute left-0 right-0 border-t border-dashed border-neutral-200 dark:border-neutral-700/50 pointer-events-none"
            style={{ bottom: `${pct}%` }}
          />
        ))}
        {sorted.map((row) => {
          const pct = (row.costUsd / maxCost) * 100;
          return (
            <div
              key={row.date}
              className="flex-1 flex flex-col justify-end group relative min-w-0"
            >
              <div
                className="w-full rounded-t-sm bg-gradient-to-t from-teal-600 to-teal-400 dark:from-teal-500 dark:to-teal-300/80"
                style={{
                  height: `${pct}%`,
                  minHeight: row.costUsd > 0 ? "2px" : 0,
                }}
              />
              {/* 툴팁 */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                <div className="bg-neutral-900 text-white text-[10px] rounded px-2 py-1.5 whitespace-nowrap shadow-lg">
                  <p className="font-medium">{row.date}</p>
                  <p>비용: {formatUsd(row.costUsd)}</p>
                  <p>요청: {formatNumber(row.requests)}건</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-1 mt-1.5">
        {sorted.map((row, i) => (
          <div key={row.date} className="flex-1 min-w-0">
            {sorted.length <= 14 || i % 2 === 0 ? (
              <p className="text-[10px] text-center text-fg-tertiary truncate">
                {shortDate(row.date)}
              </p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

/** 테이블 스켈레톤 (행 N개) */
function TableSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-10 rounded" />
      ))}
    </div>
  );
}

// ─── Tab 1: 비용 개요 ─────────────────────────────────────────────────

function OverviewTab() {
  const [range, setRange] = useState<RangeId>("7d");
  const fetcher = useFetcher<CostReportResponse>();

  const load = useCallback(
    (r: string) => {
      fetcher.load(`/api/admin/cost-report-v2?range=${r}`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetcher.load],
  );

  useEffect(() => {
    load(range);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleRangeChange(r: RangeId) {
    setRange(r);
    load(r);
  }

  const data = fetcher.data;
  const isLoading = fetcher.state === "loading";
  const rangeDays = range === "7d" ? 7 : range === "30d" ? 30 : 90;

  return (
    <div className="space-y-6">
      {/* 기간 토글 */}
      <div className="flex items-center justify-end">
        <div className="flex items-center gap-1 rounded-lg bg-surface-tertiary p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => handleRangeChange(r.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                range === r.id
                  ? "bg-surface text-fg shadow-sm"
                  : "text-fg-tertiary hover:text-fg-secondary"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* 요약 카드 3개 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {isLoading ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <SummaryCard
              label="총 추정 비용"
              value={formatUsdShort(data?.summary.totalCostUsd ?? 0)}
              sub={`최근 ${rangeDays}일`}
              accent="teal"
            />
            <SummaryCard
              label="총 요청 수"
              value={formatNumber(data?.summary.totalRequests ?? 0)}
              sub={`${data?.period.days ?? 0}일 기준`}
              accent="amber"
            />
            <SummaryCard
              label="일평균 비용"
              value={formatUsdShort(
                (data?.period.days ?? 0) > 0
                  ? (data?.summary.totalCostUsd ?? 0) / (data?.period.days ?? 1)
                  : 0,
              )}
              sub="USD / 일"
              accent="rose"
            />
          </>
        )}
      </div>

      {/* 일별 비용 트렌드 차트 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">일별 비용 추이</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-48 rounded" />
          ) : (
            <DailyCostChart data={data?.dailyTrend ?? []} />
          )}
        </CardContent>
      </Card>

      {/* 활성 예산 정책 상태 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">활성 예산 정책</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={3} />
          ) : !data?.budgetStatus?.length ? (
            <p className="text-sm text-fg-tertiary py-4">
              활성 예산 정책이 없습니다
            </p>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left py-2 px-5 text-xs font-medium text-fg-tertiary">
                      범위
                    </th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-fg-tertiary">
                      예산
                    </th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-fg-tertiary">
                      사용액
                    </th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-fg-tertiary w-40">
                      사용률
                    </th>
                    <th className="text-center py-2 px-5 text-xs font-medium text-fg-tertiary">
                      상태
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.budgetStatus.map((bs) => {
                    const tier = bs.cache?.budgetTier ?? "normal";
                    const badge = TIER_BADGE[tier] ?? TIER_BADGE.normal;
                    return (
                      <tr key={bs.policy.id}>
                        <td className="py-2.5 px-5 text-fg">{scopeLabel(bs.policy)}</td>
                        <td className="py-2.5 px-3 text-right text-fg-secondary tabular-nums">
                          {formatUsdShort(bs.policy.budgetUsd)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-fg-secondary tabular-nums">
                          {formatUsdShort(bs.cache?.currentUsageUsd ?? 0)}
                        </td>
                        <td className="py-2.5 px-3">
                          <UsageBar pct={bs.cache?.usagePct ?? 0} />
                        </td>
                        <td className="py-2.5 px-5 text-center">
                          <Badge variant={badge.variant}>{badge.label}</Badge>
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
    </div>
  );
}

// ─── Tab 2: 예산 정책 ─────────────────────────────────────────────────

function BudgetTab() {
  const fetcher = useFetcher<BudgetPoliciesResponse>();
  const actionFetcher = useFetcher();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // 폼 상태
  const [formScope, setFormScope] = useState<"org" | "purpose">("org");
  const [formPurpose, setFormPurpose] = useState("chat");
  const [formBudget, setFormBudget] = useState("10");
  const [formWarn, setFormWarn] = useState("80");
  const [formDegrade, setFormDegrade] = useState("100");
  const [formBlock, setFormBlock] = useState("120");

  const load = useCallback(() => {
    fetcher.load("/api/admin/budget-policies");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.load]);

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // actionFetcher 완료 시 목록 새로고침
  useEffect(() => {
    if (actionFetcher.state === "idle" && actionFetcher.data) {
      load();
      setShowForm(false);
      setEditId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFetcher.state, actionFetcher.data]);

  function resetForm() {
    setFormScope("org");
    setFormPurpose("chat");
    setFormBudget("10");
    setFormWarn("80");
    setFormDegrade("100");
    setFormBlock("120");
    setEditId(null);
  }

  function startEdit(row: BudgetPolicyApiRow) {
    const p = row.policy;
    setEditId(p.id);
    setFormScope(p.purpose ? "purpose" : "org");
    setFormPurpose(p.purpose ?? "chat");
    setFormBudget(String(p.budgetUsd));
    setFormWarn(String(p.thresholdWarnPct));
    setFormDegrade(String(p.thresholdDegradePct));
    setFormBlock(String(p.thresholdBlockPct));
    setShowForm(true);
  }

  function handleSubmit() {
    const payload = {
      purpose: formScope === "purpose" ? formPurpose : null,
      budgetUsd: parseFloat(formBudget),
      thresholdWarnPct: parseInt(formWarn, 10),
      thresholdDegradePct: parseInt(formDegrade, 10),
      thresholdBlockPct: parseInt(formBlock, 10),
    };

    if (editId) {
      actionFetcher.submit(JSON.stringify(payload), {
        method: "PUT",
        action: `/api/admin/budget-policies/${editId}`,
        encType: "application/json",
      });
    } else {
      actionFetcher.submit(JSON.stringify(payload), {
        method: "POST",
        action: "/api/admin/budget-policies",
        encType: "application/json",
      });
    }
  }

  function handleDelete(id: string) {
    if (!confirm("이 정책을 삭제하시겠어요?")) return;
    actionFetcher.submit(null, {
      method: "DELETE",
      action: `/api/admin/budget-policies/${id}`,
    });
  }

  const data = fetcher.data;
  const isLoading = fetcher.state === "loading";
  const isSaving = actionFetcher.state !== "idle";

  return (
    <div className="space-y-6">
      {/* 헤더 + 새 정책 버튼 */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-fg-secondary">
          예산 정책을 관리합니다. 범위별로 예산 한도와 임계값을 설정하세요.
        </p>
        <Button
          size="sm"
          onClick={() => {
            resetForm();
            setShowForm(!showForm);
          }}
        >
          {showForm ? "취소" : "새 정책"}
        </Button>
      </div>

      {/* 인라인 폼 */}
      {showForm && (
        <Card>
          <CardContent className="pt-5 pb-4 px-5">
            <h3 className="text-sm font-semibold text-fg mb-4">
              {editId ? "정책 수정" : "새 정책 추가"}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* 범위 */}
              <div>
                <label className="text-xs font-medium text-fg-tertiary block mb-1">
                  범위
                </label>
                <select
                  value={formScope}
                  onChange={(e) =>
                    setFormScope(e.target.value as "org" | "purpose")
                  }
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="org">조직 전체</option>
                  <option value="purpose">용도별</option>
                </select>
              </div>

              {/* 용도 (scope=purpose일 때만) */}
              {formScope === "purpose" && (
                <div>
                  <label className="text-xs font-medium text-fg-tertiary block mb-1">
                    용도
                  </label>
                  <select
                    value={formPurpose}
                    onChange={(e) => setFormPurpose(e.target.value)}
                    className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.entries(PURPOSE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* 예산 (USD) */}
              <div>
                <label className="text-xs font-medium text-fg-tertiary block mb-1">
                  예산 (USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formBudget}
                  onChange={(e) => setFormBudget(e.target.value)}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* 임계값 */}
              <div>
                <label className="text-xs font-medium text-fg-tertiary block mb-1">
                  임계값 (경고/저비용/차단 %)
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    max="200"
                    value={formWarn}
                    onChange={(e) => setFormWarn(e.target.value)}
                    className="w-full rounded-md border border-line bg-surface px-2 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    title="경고 임계값 (%)"
                  />
                  <input
                    type="number"
                    min="0"
                    max="200"
                    value={formDegrade}
                    onChange={(e) => setFormDegrade(e.target.value)}
                    className="w-full rounded-md border border-line bg-surface px-2 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    title="저비용 전환 임계값 (%)"
                  />
                  <input
                    type="number"
                    min="0"
                    max="200"
                    value={formBlock}
                    onChange={(e) => setFormBlock(e.target.value)}
                    className="w-full rounded-md border border-line bg-surface px-2 py-2 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    title="차단 임계값 (%)"
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <Button size="sm" onClick={handleSubmit} loading={isSaving}>
                {editId ? "수정" : "추가"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 정책 목록 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">예산 정책 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={4} />
          ) : !data?.policies?.length ? (
            <p className="text-sm text-fg-tertiary py-4">
              등록된 예산 정책이 없습니다
            </p>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left py-2 px-5 text-xs font-medium text-fg-tertiary">
                      범위
                    </th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-fg-tertiary">
                      예산
                    </th>
                    <th className="text-center py-2 px-3 text-xs font-medium text-fg-tertiary">
                      임계값
                    </th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-fg-tertiary w-36">
                      사용률
                    </th>
                    <th className="text-center py-2 px-3 text-xs font-medium text-fg-tertiary">
                      상태
                    </th>
                    <th className="text-center py-2 px-5 text-xs font-medium text-fg-tertiary">
                      작업
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.policies.map((row) => {
                    const p = row.policy;
                    const tier = row.budgetTier ?? "normal";
                    const badge = TIER_BADGE[tier] ?? TIER_BADGE.normal;
                    return (
                      <tr
                        key={p.id}
                        className={
                          !p.isActive ? "opacity-50" : ""
                        }
                      >
                        <td className="py-2.5 px-5 text-fg">
                          {scopeLabel(p)}
                          {!p.isActive && (
                            <span className="ml-1 text-xs text-fg-tertiary">
                              (비활성)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right text-fg-secondary tabular-nums">
                          {formatUsdShort(p.budgetUsd)}
                        </td>
                        <td className="py-2.5 px-3 text-center text-xs text-fg-tertiary tabular-nums">
                          {p.thresholdWarnPct}/{p.thresholdDegradePct}/{p.thresholdBlockPct}%
                        </td>
                        <td className="py-2.5 px-3">
                          <UsageBar pct={row.usagePct ?? 0} />
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </td>
                        <td className="py-2.5 px-5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => startEdit(row)}
                              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            >
                              수정
                            </button>
                            <span className="text-fg-tertiary">|</span>
                            <button
                              type="button"
                              onClick={() => handleDelete(p.id)}
                              className="text-xs text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                            >
                              삭제
                            </button>
                          </div>
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
    </div>
  );
}

// ─── Tab 3: 모델 카탈로그 ─────────────────────────────────────────────

function CatalogTab() {
  const fetcher = useFetcher<ModelCatalogResponse>();
  const actionFetcher = useFetcher();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editScore, setEditScore] = useState("");

  const load = useCallback(() => {
    fetcher.load("/api/admin/model-catalog");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetcher.load]);

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // actionFetcher 완료 시 새로고침
  useEffect(() => {
    if (actionFetcher.state === "idle" && actionFetcher.data) {
      load();
      setEditingId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionFetcher.state, actionFetcher.data]);

  function startEdit(model: ModelCatalogRow) {
    setEditingId(model.id);
    setEditScore(String(model.capabilityScore));
  }

  function saveScore(id: string) {
    const score = parseInt(editScore, 10);
    if (isNaN(score) || score < 0 || score > 100) return;
    actionFetcher.submit(
      JSON.stringify({ capabilityScore: score }),
      {
        method: "PUT",
        action: `/api/admin/model-catalog/${encodeURIComponent(id)}`,
        encType: "application/json",
      },
    );
  }

  function toggleActive(model: ModelCatalogRow) {
    actionFetcher.submit(
      JSON.stringify({ isActive: !model.isActive }),
      {
        method: "PUT",
        action: `/api/admin/model-catalog/${encodeURIComponent(model.id)}`,
        encType: "application/json",
      },
    );
  }

  const data = fetcher.data;
  const isLoading = fetcher.state === "loading";

  return (
    <div className="space-y-6">
      <p className="text-sm text-fg-secondary">
        등록된 AI 모델과 역량 점수, 가격 정보를 확인하고 관리합니다.
      </p>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">모델 목록</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={5} />
          ) : !data?.models?.length ? (
            <p className="text-sm text-fg-tertiary py-4">
              등록된 모델이 없습니다
            </p>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left py-2 px-5 text-xs font-medium text-fg-tertiary">
                      모델
                    </th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-fg-tertiary">
                      프로바이더
                    </th>
                    <th className="text-center py-2 px-3 text-xs font-medium text-fg-tertiary">
                      역량 점수
                    </th>
                    <th className="text-center py-2 px-3 text-xs font-medium text-fg-tertiary">
                      기능
                    </th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-fg-tertiary">
                      입력 가격
                    </th>
                    <th className="text-right py-2 px-3 text-xs font-medium text-fg-tertiary">
                      출력 가격
                    </th>
                    <th className="text-center py-2 px-5 text-xs font-medium text-fg-tertiary">
                      활성
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.models.map((m) => (
                    <tr
                      key={m.id}
                      className={!m.isActive ? "opacity-50" : ""}
                    >
                      <td className="py-2.5 px-5">
                        <div>
                          <p className="text-fg font-medium text-xs">
                            {m.displayName}
                          </p>
                          <p className="text-[10px] text-fg-tertiary truncate max-w-[180px]">
                            {m.id}
                          </p>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-xs text-fg-secondary">
                        {PROVIDER_LABELS[m.provider] ?? m.provider}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {editingId === m.id ? (
                          <div className="flex items-center gap-1 justify-center">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              value={editScore}
                              onChange={(e) => setEditScore(e.target.value)}
                              className="w-14 rounded border border-line bg-surface px-1.5 py-1 text-xs text-center text-fg focus:outline-none focus:ring-1 focus:ring-blue-500"
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveScore(m.id);
                                if (e.key === "Escape") setEditingId(null);
                              }}
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => saveScore(m.id)}
                              className="text-[10px] text-blue-600 dark:text-blue-400"
                            >
                              저장
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit(m)}
                            className="text-xs tabular-nums text-fg hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer"
                            title="클릭하여 수정"
                          >
                            {m.capabilityScore}
                          </button>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {m.supportsTools && (
                            <Badge variant="subtle" className="text-[10px]">
                              도구
                            </Badge>
                          )}
                          {m.supportsStreaming && (
                            <Badge variant="subtle" className="text-[10px]">
                              스트림
                            </Badge>
                          )}
                          {m.supportsJsonMode && (
                            <Badge variant="subtle" className="text-[10px]">
                              JSON
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right text-xs text-fg-secondary tabular-nums">
                        {m.currentPrice
                          ? `$${m.currentPrice.inputPricePerMToken.toFixed(2)}/M`
                          : "-"}
                      </td>
                      <td className="py-2.5 px-3 text-right text-xs text-fg-secondary tabular-nums">
                        {m.currentPrice
                          ? `$${m.currentPrice.outputPricePerMToken.toFixed(2)}/M`
                          : "-"}
                      </td>
                      <td className="py-2.5 px-5 text-center">
                        <button
                          type="button"
                          onClick={() => toggleActive(m)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 ${
                            m.isActive
                              ? "bg-teal-500"
                              : "bg-neutral-300 dark:bg-neutral-600"
                          }`}
                          title={m.isActive ? "비활성화" : "활성화"}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-sm transition-transform ${
                              m.isActive ? "translate-x-4" : "translate-x-1"
                            }`}
                          />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab 4: 라우팅 로그 ───────────────────────────────────────────────

function RoutingTab() {
  const fetcher = useFetcher<RoutingDecisionsResponse>();
  const [page, setPage] = useState(1);
  const [filterReason, setFilterReason] = useState("");
  const [filterProvider, setFilterProvider] = useState("");
  const [filterPurpose, setFilterPurpose] = useState("");

  const load = useCallback(
    (p: number, reason: string, provider: string, purpose: string) => {
      const pageSize = 50;
      const params = new URLSearchParams();
      params.set("limit", String(pageSize));
      params.set("offset", String((p - 1) * pageSize));
      if (reason) params.set("reasonCode", reason);
      if (provider) params.set("provider", provider);
      if (purpose) params.set("purpose", purpose);
      fetcher.load(`/api/admin/routing-decisions?${params.toString()}`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fetcher.load],
  );

  useEffect(() => {
    load(page, filterReason, filterProvider, filterPurpose);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function applyFilters() {
    setPage(1);
    load(1, filterReason, filterProvider, filterPurpose);
  }

  function changePage(newPage: number) {
    setPage(newPage);
    load(newPage, filterReason, filterProvider, filterPurpose);
  }

  const data = fetcher.data;
  const isLoading = fetcher.state === "loading";
  const pageSize = 50;
  const totalPages = data ? Math.ceil(data.total / pageSize) : 0;

  return (
    <div className="space-y-6">
      {/* 필터 */}
      <Card>
        <CardContent className="pt-4 pb-3 px-5">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-medium text-fg-tertiary block mb-1">
                라우팅 사유
              </label>
              <select
                value={filterReason}
                onChange={(e) => setFilterReason(e.target.value)}
                className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">전체</option>
                {Object.entries(REASON_BADGE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-fg-tertiary block mb-1">
                프로바이더
              </label>
              <select
                value={filterProvider}
                onChange={(e) => setFilterProvider(e.target.value)}
                className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">전체</option>
                {Object.entries(PROVIDER_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-fg-tertiary block mb-1">
                용도
              </label>
              <select
                value={filterPurpose}
                onChange={(e) => setFilterPurpose(e.target.value)}
                className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-fg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">전체</option>
                {Object.entries(PURPOSE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <Button size="sm" variant="outline" onClick={applyFilters}>
              조회
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 로그 테이블 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">라우팅 결정 로그</CardTitle>
            {data && (
              <span className="text-xs text-fg-tertiary">
                총 {formatNumber(data.total)}건
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton rows={6} />
          ) : !data?.decisions?.length ? (
            <p className="text-sm text-fg-tertiary py-4">
              라우팅 로그가 없습니다
            </p>
          ) : (
            <>
              <div className="overflow-x-auto -mx-5">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line">
                      <th className="text-left py-2 px-5 text-xs font-medium text-fg-tertiary">
                        시간
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-fg-tertiary">
                        사용자
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-fg-tertiary">
                        용도
                      </th>
                      <th className="text-left py-2 px-3 text-xs font-medium text-fg-tertiary">
                        모델
                      </th>
                      <th className="text-center py-2 px-3 text-xs font-medium text-fg-tertiary">
                        사유
                      </th>
                      <th className="text-center py-2 px-5 text-xs font-medium text-fg-tertiary">
                        폴백
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.decisions.map((d) => {
                      const reasonInfo = REASON_BADGE[d.reasonCode] ?? {
                        variant: "subtle" as const,
                        label: d.reasonCode,
                      };
                      return (
                        <tr key={d.id}>
                          <td className="py-2 px-5 text-xs text-fg-secondary whitespace-nowrap tabular-nums">
                            {formatTimestamp(d.createdAt)}
                          </td>
                          <td className="py-2 px-3 text-xs text-fg-secondary truncate max-w-[140px]">
                            {d.userId.slice(0, 8)}
                          </td>
                          <td className="py-2 px-3">
                            <Badge variant="subtle">
                              {purposeLabel(d.purpose)}
                            </Badge>
                          </td>
                          <td className="py-2 px-3 text-xs text-fg-secondary">
                            {d.selectedProvider && d.selectedModel ? (
                              <span>
                                <span className="text-fg-tertiary">
                                  {PROVIDER_LABELS[d.selectedProvider] ?? d.selectedProvider}
                                </span>
                                <span className="mx-1 text-fg-tertiary">{"\u2192"}</span>
                                <span className="text-fg">{d.selectedModel}</span>
                              </span>
                            ) : (
                              <span className="text-fg-tertiary">-</span>
                            )}
                          </td>
                          <td className="py-2 px-3 text-center">
                            <Badge variant={reasonInfo.variant}>
                              {reasonInfo.label}
                            </Badge>
                          </td>
                          <td className="py-2 px-5 text-center text-xs text-fg-secondary tabular-nums">
                            {d.fallbackCount > 0 ? (
                              <span className="text-amber-600 dark:text-amber-400 font-medium">
                                {d.fallbackCount}
                              </span>
                            ) : (
                              <span className="text-fg-tertiary">0</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* 페이지네이션 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => changePage(page - 1)}
                    disabled={page <= 1}
                  >
                    이전
                  </Button>
                  <span className="text-xs text-fg-secondary tabular-nums">
                    {page} / {totalPages}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => changePage(page + 1)}
                    disabled={page >= totalPages}
                  >
                    다음
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────

export default function AdminCosts() {
  const { currentUser } = useLoaderData<typeof loader>();
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  return (
    <AppShell user={currentUser}>
      {/* 페이지 헤더 — utilitarian control panel aesthetic */}
      <div className="relative">
        <div className="flex items-baseline gap-3">
          <h1 className="text-xl font-bold text-fg tracking-tight">
            비용 관리
          </h1>
          <span className="text-[10px] font-mono text-fg-tertiary tracking-wider uppercase">
            3-Ledger System
          </span>
        </div>
        <div className="mt-1 h-[1px] bg-gradient-to-r from-teal-500/60 via-teal-500/20 to-transparent" />
      </div>

      {/* 탭 네비게이션 — underline indicator style */}
      <nav className="mt-5 border-b border-line" role="tablist">
        <div className="flex gap-0 -mb-[1px]">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "text-fg"
                  : "text-fg-tertiary hover:text-fg-secondary"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <span className={`text-[11px] ${activeTab === tab.id ? "opacity-100" : "opacity-40"}`}>
                  {tab.icon}
                </span>
                {tab.label}
              </span>
              {/* 하단 인디케이터 */}
              {activeTab === tab.id && (
                <span className="absolute inset-x-0 bottom-0 h-[2px] bg-teal-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* 탭 컨텐츠 */}
      <div className="mt-6">
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "budget" && <BudgetTab />}
        {activeTab === "catalog" && <CatalogTab />}
        {activeTab === "routing" && <RoutingTab />}
      </div>
    </AppShell>
  );
}
