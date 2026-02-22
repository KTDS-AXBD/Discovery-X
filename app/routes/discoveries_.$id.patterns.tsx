/**
 * Discovery 패턴 뷰 — 추출된 의사결정 패턴 목록 (Strategic Evolution F3)
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, Link } from "@remix-run/react";
import { eq, desc } from "drizzle-orm";
import { getDb } from "~/db";
import { extractedPatterns, reusableRules, decisionLogs } from "~/db/schema";
import { DiscoveryService } from "~/lib/services";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import PatternCard from "~/components/patterns/PatternCard";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return redirect("/login");
  const user = ctx.user;

  const { id } = params;
  if (!id) throw new Response("Not Found", { status: 404 });

  const service = new DiscoveryService(db);
  const discovery = await service.getById(id);
  if (!discovery) throw new Response("Not Found", { status: 404 });

  // 관련 패턴 조회
  const logCount = await db
    .select({ count: decisionLogs.id })
    .from(decisionLogs)
    .where(eq(decisionLogs.discoveryId, id));

  const patterns = await db
    .select()
    .from(extractedPatterns)
    .orderBy(desc(extractedPatterns.createdAt))
    .limit(50);

  // 재사용 규칙 조회
  const rules = await db
    .select()
    .from(reusableRules)
    .where(eq(reusableRules.enabled, 1))
    .limit(20);

  return json({
    user,
    discovery,
    patterns,
    rules,
    logCount: logCount.length,
  });
}

export default function DiscoveryPatternsRoute() {
  const { user, discovery, patterns, rules, logCount } = useLoaderData<typeof loader>();

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        {/* 네비게이션 */}
        <div className="mb-4">
          <Link
            to={`/discoveries/${discovery.id}`}
            className="text-sm text-fg-brand hover:underline"
          >
            ← {discovery.title}
          </Link>
        </div>

        <h1 className="text-xl font-semibold text-fg mb-6">
          의사결정 패턴
        </h1>

        {/* 요약 */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-2xl font-bold text-fg">{logCount}</div>
              <div className="text-xs text-fg-tertiary">의사결정 로그</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-2xl font-bold text-fg">{patterns.length}</div>
              <div className="text-xs text-fg-tertiary">추출된 패턴</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-4 text-center">
              <div className="text-2xl font-bold text-fg">{rules.length}</div>
              <div className="text-xs text-fg-tertiary">재사용 규칙</div>
            </CardContent>
          </Card>
        </div>

        {/* 패턴 목록 */}
        <Card>
          <CardHeader>
            <CardTitle>추출된 패턴</CardTitle>
          </CardHeader>
          <CardContent>
            {patterns.length === 0 ? (
              <div className="py-8 text-center text-sm text-fg-tertiary">
                아직 추출된 패턴이 없습니다. Agent 활동이 축적되면 자동으로 패턴이 추출됩니다.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {patterns.map((p) => (
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

        {/* 재사용 규칙 */}
        {rules.length > 0 && (
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>활성 재사용 규칙</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {rules.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between rounded-md border border-line-subtle px-3 py-2"
                  >
                    <div>
                      <span className="text-sm text-fg">{r.name}</span>
                      <span className="ml-2 text-xs text-fg-tertiary">
                        ({r.ruleType})
                      </span>
                    </div>
                    <span className="text-xs text-fg-tertiary">
                      우선순위: {r.priority}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
