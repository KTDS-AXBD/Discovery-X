import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, Form, useNavigation, useActionData } from "@remix-run/react";
import { eq, and } from "drizzle-orm";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import {
  discoveries,
  gatePackages,
  evidence,
  experiments,
  methodRuns,
  assumptions,
  MethodRunStatus,
} from "~/db/schema";
import { PageLayout } from "~/components/layout/PageLayout";
import { PageHeader } from "~/components/layout/PageHeader";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { GatePackageEditor } from "~/components/methods/GatePackageEditor";

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

  // Get existing gate packages
  const packages = await db
    .select()
    .from(gatePackages)
    .where(eq(gatePackages.discoveryId, id));

  return json({
    user,
    discovery: discovery[0],
    packages: packages.map((p) => ({
      id: p.id,
      gateType: p.gateType,
      decision: p.decision,
      rationale: p.rationale,
      autoDraftedAt: p.autoDraftedAt?.toISOString() || null,
      submittedAt: p.submittedAt?.toISOString() || null,
      decidedAt: p.decidedAt?.toISOString() || null,
      scorecard: p.scorecard as Record<string, unknown> | null,
      methodRunSummary: p.methodRunSummary as Array<Record<string, unknown>> | null,
      evidenceSummary: p.evidenceSummary as Array<Record<string, unknown>> | null,
      assumptions: p.assumptions as Array<Record<string, unknown>> | null,
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

  if (intent === "draft") {
    const gateType = (formData.get("gateType") as string) || "GATE1";

    const discovery = await db
      .select()
      .from(discoveries)
      .where(eq(discoveries.id, id))
      .limit(1);

    if (!discovery[0]) return json({ error: "Discovery를 찾을 수 없습니다." }, { status: 404 });

    // Gather data
    const allEvidence = await db
      .select()
      .from(evidence)
      .where(eq(evidence.discoveryId, id));

    const allExperiments = await db
      .select()
      .from(experiments)
      .where(eq(experiments.discoveryId, id));

    const runs = await db
      .select()
      .from(methodRuns)
      .where(eq(methodRuns.discoveryId, id));

    const completedRuns = runs.filter((r) => r.status === MethodRunStatus.COMPLETED);

    const allAssumptions = await db
      .select()
      .from(assumptions)
      .where(eq(assumptions.discoveryId, id));

    // Build scorecard
    const strongEvidence = allEvidence.filter((e) => e.strength === "A" || e.strength === "B");
    const confirmedEvidence = allEvidence.filter((e) => e.reliabilityLabel === "confirmed");
    const completedExperiments = allExperiments.filter((e) => e.completedAt);
    const validatedAssumptions = allAssumptions.filter((a) => a.status === "VALIDATED");

    let readinessScore = 0;
    readinessScore += Math.min(strongEvidence.length, 2) * 15;
    readinessScore += Math.min(confirmedEvidence.length, 2) * 5;
    readinessScore += Math.min(completedExperiments.length, 2) * 10;
    readinessScore += Math.min(completedRuns.length, 2) * 10;
    if (allAssumptions.length > 0) {
      readinessScore += Math.round((validatedAssumptions.length / allAssumptions.length) * 20);
    } else {
      readinessScore += 10;
    }
    readinessScore = Math.min(readinessScore, 100);

    const scorecard = {
      evidenceCount: allEvidence.length,
      strongEvidenceCount: strongEvidence.length,
      confirmedEvidenceCount: confirmedEvidence.length,
      experimentCount: allExperiments.length,
      completedExperimentCount: completedExperiments.length,
      methodRunCount: completedRuns.length,
      assumptionCount: allAssumptions.length,
      validatedAssumptionCount: validatedAssumptions.length,
      openAssumptionCount: allAssumptions.filter((a) => a.status === "OPEN").length,
      readinessScore,
    };

    const evidenceSummary = allEvidence.map((e) => ({
      id: e.id,
      type: e.type,
      strength: e.strength,
      reliabilityLabel: e.reliabilityLabel,
      content: e.content.slice(0, 100),
      hasSource: !!(e.sourceUrl || e.linkOrAttachment),
      hasDate: !!e.publishedOrObservedDate,
    }));

    const methodRunSummary = completedRuns.map((r) => ({
      runId: r.id,
      methodPackId: r.methodPackId,
      completedAt: r.completedAt?.toISOString(),
      hasOutput: !!r.structuredOutput,
    }));

    // Upsert gate package
    const existing = await db
      .select()
      .from(gatePackages)
      .where(
        and(
          eq(gatePackages.discoveryId, id),
          eq(gatePackages.gateType, gateType)
        )
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(gatePackages)
        .set({
          autoDraftedAt: new Date(),
          scorecard,
          methodRunSummary,
          evidenceSummary,
          assumptions: allAssumptions.map((a) => ({
            id: a.id,
            statement: a.statement,
            status: a.status,
            refutationQuestions: a.refutationQuestions,
          })),
        })
        .where(eq(gatePackages.id, existing[0].id));
    } else {
      await db.insert(gatePackages).values({
        id: crypto.randomUUID(),
        discoveryId: id,
        gateType,
        autoDraftedAt: new Date(),
        decision: "PENDING",
        scorecard,
        methodRunSummary,
        evidenceSummary,
        assumptions: allAssumptions.map((a) => ({
          id: a.id,
          statement: a.statement,
          status: a.status,
          refutationQuestions: a.refutationQuestions,
        })),
      });
    }

    return redirect(`/discoveries/${id}/gate`);
  }

  return json({ error: "알 수 없는 요청" }, { status: 400 });
}

export default function DiscoveryGatePage() {
  const { user, discovery, packages } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Type-safe casting for gate package data
  type GatePackageData = Parameters<typeof GatePackageEditor>[0]["gatePackage"];

  return (
    <PageLayout user={user}>
      <PageHeader
        title={`Gate 패키지 — ${discovery.title}`}
        description={`현재 단계: ${discovery.status}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <a href={`/discoveries/${discovery.id}`}>상세로</a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`/discoveries/${discovery.id}/methods`}>방법론</a>
            </Button>
          </div>
        }
      />

      {actionData && "error" in actionData && (
        <AlertBanner variant="destructive" className="mb-4">
          {actionData.error}
        </AlertBanner>
      )}

      {/* Draft buttons */}
      <div className="mb-6 flex gap-3">
        <Form method="post">
          <input type="hidden" name="intent" value="draft" />
          <input type="hidden" name="gateType" value="GATE1" />
          <Button type="submit" variant="outline" disabled={isSubmitting}>
            Gate1 초안 {packages.some((p) => p.gateType === "GATE1") ? "갱신" : "생성"}
          </Button>
        </Form>
        <Form method="post">
          <input type="hidden" name="intent" value="draft" />
          <input type="hidden" name="gateType" value="GATE2" />
          <Button type="submit" variant="outline" disabled={isSubmitting}>
            Gate2 초안 {packages.some((p) => p.gateType === "GATE2") ? "갱신" : "생성"}
          </Button>
        </Form>
      </div>

      {/* Gate packages */}
      {packages.length === 0 ? (
        <AlertBanner variant="info">
          아직 Gate 패키지가 없습니다. 위 버튼으로 자동 초안을 생성하세요.
        </AlertBanner>
      ) : (
        <div className="space-y-8">
          {packages.map((pkg) => (
            <GatePackageEditor key={pkg.id} gatePackage={pkg as unknown as GatePackageData} />
          ))}
        </div>
      )}
    </PageLayout>
  );
}
