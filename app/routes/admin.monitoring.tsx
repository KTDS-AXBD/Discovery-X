/**
 * 시스템 모니터링 대시보드 — /admin/monitoring
 *
 * 시스템 전반 상태 요약, Cron 실행 이력을 보여준다.
 * cron_logs 테이블(raw SQL)에서 직접 조회한다.
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";

// ─── 타입 정의 ─────────────────────────────────────────────────────────

interface CronLogRow {
  id: number;
  cron_expression: string;
  results_json: string;
  created_at: number;
}

interface CronLogEntry {
  id: number;
  cronExpression: string;
  results: CronResult[];
  createdAt: number;
}

interface CronResult {
  name?: string;
  status?: string;
  duration?: number;
  error?: string;
}

interface SystemStats {
  dbTables: number;
  apiRoutes: number;
  agentTools: number;
  tests: number;
}

interface LoaderData {
  currentUser: { id: string; email: string; role: string; name: string | null };
  cronLogs: CronLogEntry[];
  stats: SystemStats;
}

// ─── Loader ────────────────────────────────────────────────────────────

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const currentUser = await requireAdmin(request, db, secret);

  // cron_logs: raw SQL 조회 (Drizzle 스키마 없음)
  let cronLogs: CronLogEntry[] = [];
  try {
    const raw = await context.cloudflare.env.DB.prepare(
      `SELECT id, cron_expression, results_json, created_at
       FROM cron_logs
       ORDER BY created_at DESC
       LIMIT 100`,
    ).all<CronLogRow>();

    cronLogs = (raw.results ?? []).map((row) => {
      let results: CronResult[] = [];
      try {
        results = JSON.parse(row.results_json);
      } catch {
        // 파싱 실패 시 빈 배열
      }
      return {
        id: row.id,
        cronExpression: row.cron_expression,
        results,
        createdAt: row.created_at,
      };
    });
  } catch {
    // cron_logs 테이블이 없을 수 있음
  }

  // 시스템 통계 (하드코딩)
  const stats: SystemStats = {
    dbTables: 87,
    apiRoutes: 167,
    agentTools: 54,
    tests: 925,
  };

  return json<LoaderData>({ currentUser, cronLogs, stats });
}

// ─── 유틸 ──────────────────────────────────────────────────────────────

/** 타임스탬프 → 읽기 쉬운 형태 (hydration-safe) */
function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  if (isNaN(d.getTime())) return "-";
  const mo = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${mo}/${day} ${h}:${m}:${s}`;
}

/** 소요시간 포맷 (ms → 읽기 쉬운 형태) */
function formatDuration(ms: number | undefined): string {
  if (ms === undefined || ms === null) return "-";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────

/** 통계 카드 */
function StatCard({
  label,
  value,
  unit,
}: {
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4 px-5">
        <p className="text-xs font-medium text-fg-tertiary uppercase tracking-wide">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold text-fg">
          {value}
          <span className="text-sm font-normal text-fg-tertiary ml-1">
            {unit}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────

export default function AdminMonitoring() {
  const { currentUser, cronLogs, stats } =
    useLoaderData<typeof loader>();

  return (
    <AppShell user={{ ...currentUser, name: currentUser.name ?? "" }}>
      {/* 페이지 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-fg">
          시스템 모니터링
        </h1>
        <p className="mt-1 text-sm text-fg-secondary">
          시스템 상태와 Cron 실행 이력을 확인합니다.
        </p>
      </div>

      {/* 시스템 통계 카드 */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="DB 테이블" value={stats.dbTables} unit="개" />
        <StatCard label="API 라우트" value={stats.apiRoutes} unit="개" />
        <StatCard label="Agent 도구" value={stats.agentTools} unit="개" />
        <StatCard label="테스트" value={stats.tests} unit="개" />
      </div>

      {/* Cron 실행 로그 */}
      <Card className="mt-6">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Cron 실행 로그</CardTitle>
            <span className="text-xs text-fg-tertiary">
              최근 {cronLogs.length}건
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {cronLogs.length === 0 ? (
            <p className="text-sm text-fg-tertiary py-4">
              실행 기록이 없습니다
            </p>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left py-2 px-5 text-xs font-medium text-fg-tertiary">
                      시간
                    </th>
                    <th className="text-left py-2 px-3 text-xs font-medium text-fg-tertiary">
                      작업
                    </th>
                    <th className="text-center py-2 px-3 text-xs font-medium text-fg-tertiary">
                      상태
                    </th>
                    <th className="text-right py-2 px-5 text-xs font-medium text-fg-tertiary">
                      소요시간
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {cronLogs.map((log) => {
                    // results 배열의 첫 번째 항목에서 정보 추출
                    const first = log.results[0];
                    const hasError = log.results.some(
                      (r) => r.status === "error" || r.error,
                    );
                    const totalDuration = log.results.reduce(
                      (sum, r) => sum + (r.duration ?? 0),
                      0,
                    );

                    return (
                      <tr key={log.id}>
                        <td className="py-2 px-5 text-xs text-fg-secondary whitespace-nowrap tabular-nums">
                          {formatTimestamp(log.createdAt)}
                        </td>
                        <td className="py-2 px-3 text-xs text-fg">
                          {first?.name ?? log.cronExpression}
                        </td>
                        <td className="py-2 px-3 text-center">
                          {hasError ? (
                            <Badge variant="destructive">실패</Badge>
                          ) : (
                            <Badge variant="default">성공</Badge>
                          )}
                        </td>
                        <td className="py-2 px-5 text-xs text-right text-fg-secondary tabular-nums">
                          {formatDuration(totalDuration || undefined)}
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
    </AppShell>
  );
}
