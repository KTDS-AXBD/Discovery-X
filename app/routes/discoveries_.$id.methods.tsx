import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, Form, useNavigation } from "@remix-run/react";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { MethodRunStatus } from "~/db/schema";
import { DiscoveryService } from "~/lib/services";
import { DiscoveryEntityService } from "~/lib/services/discovery/entity";
import { DiscoveryQueryExtraService } from "~/lib/services/discovery/query-extra2";
import { AppShell } from "~/components/layout/AppShell";
import { PageHeader } from "~/components/layout/PageHeader";
import { Card, CardContent } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { MethodRunTimeline } from "~/components/methods/MethodRunTimeline";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env as unknown as Record<string, string>);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return redirect("/login");
  const user = ctx.user;

  const { id } = params;
  if (!id) throw new Response("Not Found", { status: 404 });

  const service = new DiscoveryService(db);
  const discovery = await service.getById(id);
  if (!discovery) throw new Response("Not Found", { status: 404 });

  // Get method packs and runs
  const queryExtra = new DiscoveryQueryExtraService(db);
  const { allPacks, runs } = await queryExtra.getMethodsPageData(id, discovery.status);

  // Build recommendations
  const currentStatus = discovery.status;
  const applicable = allPacks.filter((pack) => {
    const stages = pack.applicableStages as string[] | null;
    return stages?.includes(currentStatus) ?? false;
  });

  const completedPackIds = runs
    .filter((r) => r.status === MethodRunStatus.COMPLETED)
    .map((r) => r.methodPackId);
  const runningPackIds = runs
    .filter((r) => r.status === MethodRunStatus.RUNNING)
    .map((r) => r.methodPackId);

  const recommendations = applicable
    .filter((p) => !completedPackIds.includes(p.id))
    .sort((a, b) => {
      if (a.tier === "Tier-0" && b.tier !== "Tier-0") return -1;
      if (a.tier !== "Tier-0" && b.tier === "Tier-0") return 1;
      if (a.quickRun === 1 && b.quickRun !== 1) return -1;
      if (a.quickRun !== 1 && b.quickRun === 1) return 1;
      return 0;
    })
    .slice(0, 3)
    .map((p) => ({
      id: p.id,
      nameKo: p.nameKo,
      tier: p.tier,
      category: p.category,
      quickRun: p.quickRun === 1,
      timebox: p.timebox,
      whenToUse: p.whenToUse,
      alreadyRunning: runningPackIds.includes(p.id),
      reason:
        p.tier === "Tier-0"
          ? "필수 방법론 (Tier-0) — Gate1 패키지에 포함 권장"
          : `현재 단계(${currentStatus})에 적합한 방법론`,
    }));

  // Build timeline runs with pack names
  const packMap = Object.fromEntries(allPacks.map((p) => [p.id, p.nameKo]));
  const timelineRuns = runs.map((r) => ({
    id: r.id,
    methodPackId: r.methodPackId,
    methodPackName: packMap[r.methodPackId] || r.methodPackId,
    status: r.status,
    startedAt: r.startedAt.toISOString(),
    completedAt: r.completedAt?.toISOString() || null,
  }));

  return json({
    user,
    discovery,
    recommendations,
    timelineRuns,
    allPacks: allPacks.map((p) => ({
      id: p.id,
      nameKo: p.nameKo,
      tier: p.tier,
      category: p.category,
    })),
  });
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env as unknown as Record<string, string>);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return redirect("/login");
  const user = ctx.user;

  const { id } = params;
  if (!id) throw new Response("Not Found", { status: 404 });

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "start-run") {
    const methodPackId = formData.get("methodPackId") as string;
    if (!methodPackId) return json({ error: "방법론 ID가 필요합니다." }, { status: 400 });

    try {
      const entityService = new DiscoveryEntityService(db);
      await entityService.startMethodRun(id, methodPackId, user.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "알 수 없는 오류";
      return json({ error: message }, { status: 400 });
    }

    return redirect(`/discoveries/${id}/methods`);
  }

  return json({ error: "알 수 없는 요청" }, { status: 400 });
}

export default function DiscoveryMethodsPage() {
  const { user, discovery, recommendations, timelineRuns } =
    useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <AppShell user={user}>
      <PageHeader
        title={`방법론 — ${discovery.title}`}
        description={`현재 단계: ${discovery.status}`}
        actions={
          <Button variant="outline" asChild>
            <a href={`/discoveries/${discovery.id}`}>Discovery 상세로</a>
          </Button>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Recommendations */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-fg">
            추천 방법론
          </h3>
          {recommendations.length > 0 ? (
            <div className="space-y-3">
              {recommendations.map((rec, idx) => (
                <Card
                  key={rec.id}
                  className="overflow-hidden"
                  style={{
                    opacity: 0,
                    animation: "dx-fade-in-up 0.3s ease-out forwards",
                    animationDelay: `${idx * 80}ms`,
                  }}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-fg-tertiary">
                            {rec.id}
                          </span>
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium"
                            style={{
                              backgroundColor:
                                rec.tier === "Tier-0"
                                  ? "var(--axis-badge-destructive-bg, #FEF2F2)"
                                  : "var(--axis-surface-secondary)",
                              color:
                                rec.tier === "Tier-0"
                                  ? "var(--axis-badge-destructive-text, #EF4444)"
                                  : "var(--axis-text-tertiary)",
                            }}
                          >
                            {rec.tier}
                          </span>
                          {rec.quickRun && (
                            <span className="inline-flex items-center rounded-full bg-badge-success-bg px-2 py-0.5 text-[10px] font-medium text-badge-success-text">
                              2h
                            </span>
                          )}
                        </div>
                        <h4 className="mt-1 text-sm font-semibold text-fg">
                          {rec.nameKo}
                        </h4>
                        <p className="mt-0.5 text-xs text-fg-tertiary">
                          {rec.reason}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        {rec.alreadyRunning ? (
                          <span className="inline-flex items-center rounded-full bg-badge-warning-bg px-2 py-0.5 text-xs font-medium text-badge-warning-text">
                            실행 중
                          </span>
                        ) : (
                          <Form method="post">
                            <input type="hidden" name="intent" value="start-run" />
                            <input
                              type="hidden"
                              name="methodPackId"
                              value={rec.id}
                            />
                            <Button
                              type="submit"
                              variant="outline"
                              size="sm"
                              disabled={isSubmitting}
                            >
                              실행
                            </Button>
                          </Form>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <AlertBanner variant="info">
              현재 단계에 추천할 방법론이 없습니다.
            </AlertBanner>
          )}
        </div>

        {/* Right: Timeline */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-fg">
            실행 이력
          </h3>
          <MethodRunTimeline runs={timelineRuns} />
        </div>
      </div>
    </AppShell>
  );
}
