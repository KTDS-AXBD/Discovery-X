import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, Form, useNavigation, useActionData } from "@remix-run/react";
import { eq, and } from "drizzle-orm";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import {
  discoveries,
  gatePackages,
  gateApprovals,
  users,
  evidence,
  experiments,
  methodRuns,
  assumptions,
  MethodRunStatus,
  GateApprovalDecision,
  UserRole,
  eventLogs,
} from "~/db/schema";
import { PageLayout } from "~/components/layout/PageLayout";
import { PageHeader } from "~/components/layout/PageHeader";
import { Button } from "~/components/ui/Button";
import { Badge } from "~/components/ui/Badge";
import { Select } from "~/components/ui/Select";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
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

  // Get gate approvals with reviewer info
  const approvals = [];
  for (const pkg of packages) {
    const pkgApprovals = await db
      .select()
      .from(gateApprovals)
      .where(eq(gateApprovals.gatePackageId, pkg.id));

    for (const a of pkgApprovals) {
      const reviewer = await db.query.users.findFirst({ where: eq(users.id, a.reviewerId) });
      approvals.push({
        ...a,
        requestedAt: a.requestedAt.toISOString(),
        decidedAt: a.decidedAt?.toISOString() || null,
        slaDeadline: a.slaDeadline?.toISOString() || null,
        reviewerName: reviewer?.name || "알 수 없음",
      });
    }
  }

  // Get gatekeepers/admins for reviewer selection
  const allUsers = await db.select().from(users);
  const gatekeepers = allUsers.filter(
    (u) => u.role === UserRole.ADMIN || u.role === UserRole.GATEKEEPER
  );

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
    approvals,
    gatekeepers: gatekeepers.map((u) => ({ id: u.id, name: u.name })),
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

  if (intent === "request-approval") {
    const gatePackageId = formData.get("gatePackageId") as string;
    const reviewerId = formData.get("reviewerId") as string;

    if (!gatePackageId || !reviewerId) {
      return json({ error: "패키지와 리뷰어를 선택해주세요." }, { status: 400 });
    }

    // Verify reviewer is gatekeeper or admin
    const reviewer = await db.query.users.findFirst({ where: eq(users.id, reviewerId) });
    if (!reviewer || (reviewer.role !== UserRole.ADMIN && reviewer.role !== UserRole.GATEKEEPER)) {
      return json({ error: "Gatekeeper 또는 Admin만 리뷰어로 지정할 수 있습니다." }, { status: 400 });
    }

    const slaDeadline = new Date();
    slaDeadline.setDate(slaDeadline.getDate() + 3); // 3일 SLA

    const approvalId = crypto.randomUUID();
    await db.insert(gateApprovals).values({
      id: approvalId,
      gatePackageId,
      reviewerId,
      decision: GateApprovalDecision.PENDING,
      slaDeadline,
    });

    await db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId: user.id,
      discoveryId: id,
      eventType: "REQUEST_GATE_APPROVAL",
      metadata: { gatePackageId, reviewerId, approvalId },
    });

    return redirect(`/discoveries/${id}/gate`);
  }

  if (intent === "submit-approval") {
    const approvalId = formData.get("approvalId") as string;
    const decision = formData.get("decision") as string;
    const comment = formData.get("comment") as string;

    if (!approvalId || !decision) {
      return json({ error: "결정을 선택해주세요." }, { status: 400 });
    }

    // Verify current user is the reviewer
    const approval = await db.query.gateApprovals.findFirst({
      where: eq(gateApprovals.id, approvalId),
    });
    if (!approval || approval.reviewerId !== user.id) {
      return json({ error: "본인에게 할당된 승인만 처리할 수 있습니다." }, { status: 403 });
    }

    await db
      .update(gateApprovals)
      .set({
        decision,
        comment: comment || null,
        decidedAt: new Date(),
      })
      .where(eq(gateApprovals.id, approvalId));

    await db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId: user.id,
      discoveryId: id,
      eventType: "SUBMIT_GATE_DECISION",
      metadata: { approvalId, gatePackageId: approval.gatePackageId, decision, comment: comment || null },
    });

    // Auto-aggregate: check if all approvals for the gate package are decided
    const allApprovals = await db
      .select()
      .from(gateApprovals)
      .where(eq(gateApprovals.gatePackageId, approval.gatePackageId));

    const allDecided = allApprovals.every((a) =>
      a.id === approvalId ? true : a.decision !== GateApprovalDecision.PENDING
    );

    if (allDecided) {
      const decisions = allApprovals.map((a) =>
        a.id === approvalId ? decision : a.decision
      );
      const hasRejection = decisions.includes(GateApprovalDecision.REJECTED);
      const hasConditional = decisions.includes(GateApprovalDecision.CONDITIONAL);
      const aggregateDecision = hasRejection
        ? "NO_GO"
        : hasConditional
          ? "CONDITIONAL"
          : "GO";

      await db
        .update(gatePackages)
        .set({
          decision: aggregateDecision,
          decidedAt: new Date(),
          approverId: user.id,
        })
        .where(eq(gatePackages.id, approval.gatePackageId));
    }

    return redirect(`/discoveries/${id}/gate`);
  }

  return json({ error: "알 수 없는 요청" }, { status: 400 });
}

export default function DiscoveryGatePage() {
  const { user, discovery, packages, approvals, gatekeepers } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Type-safe casting for gate package data
  type GatePackageData = Parameters<typeof GatePackageEditor>[0]["gatePackage"];

  const decisionBadge = (decision: string) => {
    switch (decision) {
      case "APPROVED": return <Badge variant="success">승인</Badge>;
      case "REJECTED": return <Badge variant="destructive">거부</Badge>;
      case "CONDITIONAL": return <Badge variant="warning">조건부</Badge>;
      default: return <Badge variant="secondary">대기</Badge>;
    }
  };

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

      {/* 승인 현황 */}
      {packages.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-lg">승인 현황</CardTitle>
          </CardHeader>
          <CardContent>
            {/* 승인 요청 */}
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-medium text-[var(--axis-text-secondary)]">승인 요청</h3>
              <Form method="post" className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="intent" value="request-approval" />
                <div>
                  <label className="block text-xs text-[var(--axis-text-tertiary)]">Gate 패키지</label>
                  <Select name="gatePackageId" className="mt-1">
                    {packages.map((pkg) => (
                      <option key={pkg.id} value={pkg.id}>
                        {pkg.gateType} {pkg.decision === "PENDING" ? "(대기)" : `(${pkg.decision})`}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-xs text-[var(--axis-text-tertiary)]">리뷰어 (Gatekeeper)</label>
                  <Select name="reviewerId" className="mt-1">
                    <option value="">선택...</option>
                    {gatekeepers.map((g) => (
                      <option key={g.id} value={g.id}>{g.name}</option>
                    ))}
                  </Select>
                </div>
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  승인 요청
                </Button>
              </Form>
            </div>

            {/* 승인 목록 */}
            {approvals.length === 0 ? (
              <p className="text-sm text-[var(--axis-text-tertiary)]">아직 승인 요청이 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {approvals.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-md border border-[var(--axis-border-default)] p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--axis-text-primary)]">
                          {a.reviewerName}
                        </span>
                        {decisionBadge(a.decision)}
                        {a.slaDeadline && a.decision === "PENDING" && (
                          <span className="text-xs text-[var(--axis-text-tertiary)]">
                            기한: {new Date(a.slaDeadline).toLocaleDateString("ko-KR")}
                          </span>
                        )}
                      </div>
                      {a.decidedAt && (
                        <span className="text-xs text-[var(--axis-text-tertiary)]">
                          {new Date(a.decidedAt).toLocaleDateString("ko-KR")}
                        </span>
                      )}
                    </div>
                    {a.comment && (
                      <p className="mt-1 text-sm text-[var(--axis-text-secondary)]">{a.comment}</p>
                    )}

                    {/* 본인이 리뷰어이고 아직 PENDING인 경우 승인/거부 폼 */}
                    {a.decision === "PENDING" && a.reviewerId === user.id && (
                      <Form method="post" className="mt-3 space-y-2 border-t border-[var(--axis-border-default)] pt-3">
                        <input type="hidden" name="intent" value="submit-approval" />
                        <input type="hidden" name="approvalId" value={a.id} />
                        <textarea
                          name="comment"
                          placeholder="코멘트 (선택)"
                          rows={2}
                          className="w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-default)] px-3 py-2 text-sm text-[var(--axis-text-primary)] placeholder-[var(--axis-text-tertiary)]"
                        />
                        <div className="flex gap-2">
                          <Button type="submit" name="decision" value="APPROVED" variant="success" size="sm" disabled={isSubmitting}>
                            승인
                          </Button>
                          <Button type="submit" name="decision" value="CONDITIONAL" variant="secondary" size="sm" disabled={isSubmitting}>
                            조건부
                          </Button>
                          <Button type="submit" name="decision" value="REJECTED" variant="destructive" size="sm" disabled={isSubmitting}>
                            거부
                          </Button>
                        </div>
                      </Form>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </PageLayout>
  );
}
