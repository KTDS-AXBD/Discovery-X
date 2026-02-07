/**
 * Discovery 규제 준수 뷰 — 산업별 규제 검증 및 감사 추적 (Strategic Evolution F5)
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, Link } from "@remix-run/react";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "~/db";
import {
  discoveries,
  industryAdapters,
  industryRules,
  evidence,
  eventLogs,
  gatePackages,
} from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import ComplianceChecklist from "~/components/compliance/ComplianceChecklist";
import AuditTimeline from "~/components/compliance/AuditTimeline";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return redirect("/login");
  const user = ctx.user;

  const { id } = params;
  if (!id) throw new Response("Not Found", { status: 404 });

  const discovery = await db.query.discoveries.findFirst({
    where: eq(discoveries.id, id),
  });
  if (!discovery) throw new Response("Not Found", { status: 404 });

  // 산업 어댑터 정보
  let adapter = null;
  let rules: Array<{
    id: string;
    ruleType: string;
    nameKo: string;
    condition: Record<string, unknown> | null;
    action: Record<string, unknown> | null;
  }> = [];

  if (discovery.industryAdapterId) {
    const adapterResult = await db
      .select()
      .from(industryAdapters)
      .where(eq(industryAdapters.id, discovery.industryAdapterId))
      .limit(1);
    adapter = adapterResult[0] || null;

    if (adapter) {
      rules = await db
        .select()
        .from(industryRules)
        .where(
          and(
            eq(industryRules.industryAdapterId, adapter.id),
            eq(industryRules.enabled, 1)
          )
        );
    }
  }

  // 근거 조회
  const evs = await db
    .select()
    .from(evidence)
    .where(eq(evidence.discoveryId, id));

  // 준수 체크 수행
  const complianceReqs = (adapter?.complianceRequirements as string[]) || [];
  const checks = complianceReqs.map((req) => {
    const hasRelated = evs.some((ev) =>
      ev.content?.toLowerCase().includes(req.toLowerCase())
    );
    return {
      requirement: req,
      ruleType: "compliance",
      status: (hasRelated ? "pass" : "warning") as "pass" | "fail" | "warning",
      suggestion: hasRelated ? undefined : `"${req}" 관련 근거를 추가하세요.`,
    };
  });

  for (const rule of rules) {
    const condition = rule.condition;
    if (condition?.stage) {
      const stages = condition.stage as string[];
      if (!stages.includes(discovery.status)) continue;
    }
    checks.push({
      requirement: rule.nameKo,
      ruleType: rule.ruleType,
      status: "warning",
      suggestion: (rule.action?.message as string) || undefined,
    });
  }

  const passCount = checks.filter((c) => c.status === "pass").length;
  const overallCompliance = checks.length > 0 ? Math.round((passCount / checks.length) * 100) : 100;

  // 이벤트 타임라인
  const events = await db
    .select()
    .from(eventLogs)
    .where(eq(eventLogs.discoveryId, id))
    .orderBy(desc(eventLogs.timestamp))
    .limit(30);

  const timeline = events.map((e) => ({
    time: e.timestamp?.toISOString() || "",
    type: "event",
    action: e.eventType,
    actor: e.actorId,
  }));

  return json({
    user,
    discovery,
    adapter,
    checks,
    overallCompliance,
    timeline,
    evidenceCount: evs.length,
  });
}

export default function DiscoveryComplianceRoute() {
  const { user, discovery, adapter, checks, overallCompliance, timeline, evidenceCount } =
    useLoaderData<typeof loader>();

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        {/* 네비게이션 */}
        <div className="mb-4">
          <Link
            to={`/discoveries/${discovery.id}`}
            className="text-sm text-[var(--axis-text-brand)] hover:underline"
          >
            ← {discovery.title}
          </Link>
        </div>

        <h1 className="text-xl font-semibold text-[var(--axis-text-primary)] mb-6">
          규제 준수 현황
        </h1>

        {/* 산업 정보 */}
        {adapter ? (
          <Card className="mb-4">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>{adapter.icon}</span>
                <span>{adapter.nameKo}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h4 className="text-xs font-medium text-[var(--axis-text-tertiary)] mb-1">규제 프레임워크</h4>
                  <div className="space-y-1">
                    {((adapter.regulatoryFramework as string[]) || []).map((r, i) => (
                      <div key={i} className="text-sm text-[var(--axis-text-secondary)]">
                        {r}
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-medium text-[var(--axis-text-tertiary)] mb-1">기본 타임박스</h4>
                  <div className="text-sm text-[var(--axis-text-secondary)]">
                    {adapter.defaultTimeboxDays}일
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="mb-4">
            <CardContent className="py-6 text-center text-sm text-[var(--axis-text-tertiary)]">
              산업 어댑터가 지정되지 않았습니다. Discovery 편집에서 산업을 설정하세요.
            </CardContent>
          </Card>
        )}

        {/* 준수 체크리스트 */}
        <Card className="mb-4">
          <CardHeader>
            <CardTitle>준수 체크리스트</CardTitle>
          </CardHeader>
          <CardContent>
            <ComplianceChecklist
              checks={checks}
              industry={adapter?.nameKo}
              overallCompliance={overallCompliance}
            />
          </CardContent>
        </Card>

        {/* 감사 타임라인 */}
        <Card>
          <CardHeader>
            <CardTitle>감사 타임라인 (최근 30건)</CardTitle>
          </CardHeader>
          <CardContent>
            <AuditTimeline entries={timeline} />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
