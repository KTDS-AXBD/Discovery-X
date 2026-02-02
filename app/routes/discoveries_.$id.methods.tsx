import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, Form, useNavigation } from "@remix-run/react";
import { eq, and } from "drizzle-orm";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import {
  discoveries,
  methodPacks,
  methodRuns,
  MethodRunStatus,
} from "~/db/schema";
import { PageLayout } from "~/components/layout/PageLayout";
import { PageHeader } from "~/components/layout/PageHeader";
import { Card, CardContent } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { MethodRunTimeline } from "~/components/methods/MethodRunTimeline";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env as unknown as Record<string, string>);
  const user = await getUserFromSession(request, db, secret);
  if (!user) return redirect("/login");

  const { id } = params;
  if (!id) throw new Response("Not Found", { status: 404 });

  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, id))
    .limit(1);

  if (!discovery[0]) throw new Response("Not Found", { status: 404 });

  // Get all method packs
  const allPacks = await db.select().from(methodPacks);

  // Get runs for this discovery
  const runs = await db
    .select()
    .from(methodRuns)
    .where(eq(methodRuns.discoveryId, id));

  // Build recommendations
  const currentStatus = discovery[0].status;
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
    discovery: discovery[0],
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
  const user = await getUserFromSession(request, db, secret);
  if (!user) return redirect("/login");

  const { id } = params;
  if (!id) throw new Response("Not Found", { status: 404 });

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "start-run") {
    const methodPackId = formData.get("methodPackId") as string;
    if (!methodPackId) return json({ error: "방법론 ID가 필요합니다." }, { status: 400 });

    // Check not already running
    const existing = await db
      .select()
      .from(methodRuns)
      .where(
        and(
          eq(methodRuns.discoveryId, id),
          eq(methodRuns.methodPackId, methodPackId),
          eq(methodRuns.status, MethodRunStatus.RUNNING)
        )
      );

    if (existing.length > 0) {
      return json({ error: "이미 실행 중인 방법론입니다." }, { status: 400 });
    }

    await db.insert(methodRuns).values({
      id: crypto.randomUUID(),
      discoveryId: id,
      methodPackId,
      status: MethodRunStatus.RUNNING,
      executorId: user.id,
    });

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
    <PageLayout user={user}>
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
          <h3 className="mb-3 text-sm font-semibold text-[var(--axis-text-primary)]">
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
                          <span className="text-xs text-[var(--axis-text-tertiary)]">
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
                            <span className="inline-flex items-center rounded-full bg-[var(--axis-badge-success-bg)] px-2 py-0.5 text-[10px] font-medium text-[var(--axis-badge-success-text)]">
                              2h
                            </span>
                          )}
                        </div>
                        <h4 className="mt-1 text-sm font-semibold text-[var(--axis-text-primary)]">
                          {rec.nameKo}
                        </h4>
                        <p className="mt-0.5 text-xs text-[var(--axis-text-tertiary)]">
                          {rec.reason}
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        {rec.alreadyRunning ? (
                          <span className="inline-flex items-center rounded-full bg-[var(--axis-badge-warning-bg)] px-2 py-0.5 text-xs font-medium text-[var(--axis-badge-warning-text)]">
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
          <h3 className="mb-3 text-sm font-semibold text-[var(--axis-text-primary)]">
            실행 이력
          </h3>
          <MethodRunTimeline runs={timelineRuns} />
        </div>
      </div>
    </PageLayout>
  );
}
