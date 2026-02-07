/**
 * Dashboard: Knowledge Assets 탭 — 패턴/규칙 통계 (Strategic Evolution F3)
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { sql, eq, desc, and } from "drizzle-orm";
import { getDb } from "~/db";
import {
  decisionLogs,
  extractedPatterns,
  reusableRules,
  industryAdapters,
} from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import PatternCard from "~/components/patterns/PatternCard";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return redirect("/login");

  // 통계 조회
  const [logStats] = await db
    .select({ count: sql<number>`count(*)` })
    .from(decisionLogs)
    .where(sql`${decisionLogs.discoveryId} IN (SELECT id FROM discoveries WHERE tenant_id = ${ctx.tenantId})`);

  const [patternStats] = await db
    .select({ count: sql<number>`count(*)` })
    .from(extractedPatterns);

  const [ruleStats] = await db
    .select({ count: sql<number>`count(*)` })
    .from(reusableRules)
    .where(eq(reusableRules.enabled, 1));

  const [adapterStats] = await db
    .select({ count: sql<number>`count(*)` })
    .from(industryAdapters)
    .where(and(eq(industryAdapters.enabled, 1), eq(industryAdapters.tenantId, ctx.tenantId)));

  // 최근 패턴
  const recentPatterns = await db
    .select()
    .from(extractedPatterns)
    .orderBy(desc(extractedPatterns.createdAt))
    .limit(6);

  // 최근 규칙
  const recentRules = await db
    .select()
    .from(reusableRules)
    .where(eq(reusableRules.enabled, 1))
    .orderBy(desc(reusableRules.createdAt))
    .limit(10);

  // 산업 어댑터 목록
  const adapters = await db
    .select()
    .from(industryAdapters)
    .where(and(eq(industryAdapters.enabled, 1), eq(industryAdapters.tenantId, ctx.tenantId)));

  return json({
    user: ctx.user,
    stats: {
      logs: logStats?.count || 0,
      patterns: patternStats?.count || 0,
      rules: ruleStats?.count || 0,
      adapters: adapterStats?.count || 0,
    },
    recentPatterns,
    recentRules,
    adapters,
  });
}

export default function DashboardAssetsRoute() {
  const { stats, recentPatterns, recentRules, adapters } = useLoaderData<typeof loader>();

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-[var(--axis-text-primary)]">{stats.logs}</div>
            <div className="text-xs text-[var(--axis-text-tertiary)]">의사결정 로그</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-[var(--axis-text-primary)]">{stats.patterns}</div>
            <div className="text-xs text-[var(--axis-text-tertiary)]">추출된 패턴</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-[var(--axis-text-primary)]">{stats.rules}</div>
            <div className="text-xs text-[var(--axis-text-tertiary)]">활성 규칙</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4 text-center">
            <div className="text-2xl font-bold text-[var(--axis-text-primary)]">{stats.adapters}</div>
            <div className="text-xs text-[var(--axis-text-tertiary)]">산업 어댑터</div>
          </CardContent>
        </Card>
      </div>

      {/* 산업 어댑터 */}
      <Card>
        <CardHeader>
          <CardTitle>산업 어댑터</CardTitle>
        </CardHeader>
        <CardContent>
          {adapters.length === 0 ? (
            <div className="py-4 text-center text-sm text-[var(--axis-text-tertiary)]">
              등록된 산업 어댑터가 없습니다.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {adapters.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-3 rounded-lg border border-[var(--dx-border-subtle)] p-3"
                >
                  <span className="text-xl">{a.icon}</span>
                  <div>
                    <div className="text-sm font-medium text-[var(--axis-text-primary)]">
                      {a.nameKo}
                    </div>
                    <div className="text-xs text-[var(--axis-text-tertiary)]">
                      {a.code} / {a.defaultTimeboxDays}일
                    </div>
                  </div>
                  <div
                    className="ml-auto h-3 w-3 rounded-full"
                    style={{ backgroundColor: a.color }}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 최근 패턴 */}
      <Card>
        <CardHeader>
          <CardTitle>최근 추출 패턴</CardTitle>
        </CardHeader>
        <CardContent>
          {recentPatterns.length === 0 ? (
            <div className="py-4 text-center text-sm text-[var(--axis-text-tertiary)]">
              아직 추출된 패턴이 없습니다. Agent 활동이 축적되면 자동으로 패턴이 추출됩니다.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {recentPatterns.map((p) => (
                <PatternCard
                  key={p.id}
                  pattern={{
                    id: p.id,
                    patternType: p.patternType,
                    name: p.name,
                    description: p.description || undefined,
                    frequency: p.frequency || 1,
                    confidenceScore: p.confidenceScore || undefined,
                    validatedAt: p.validatedAt ? String(p.validatedAt) : undefined,
                    createdAt: String(p.createdAt),
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 최근 규칙 */}
      {recentRules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>활성 재사용 규칙</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentRules.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between rounded-md border border-[var(--dx-border-subtle)] px-3 py-2"
                >
                  <div>
                    <span className="text-sm text-[var(--axis-text-primary)]">{r.name}</span>
                    <span className="ml-2 text-xs text-[var(--axis-text-tertiary)]">
                      ({r.ruleType})
                    </span>
                  </div>
                  <span className="text-xs text-[var(--axis-text-tertiary)]">
                    우선순위: {r.priority}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
