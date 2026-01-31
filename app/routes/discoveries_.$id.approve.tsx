import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, users, eventLogs } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { PageLayout } from "~/components/layout/PageLayout";
import { PageHeader } from "~/components/layout/PageHeader";
import { Card, CardContent } from "~/components/ui/Card";
import { Textarea } from "~/components/ui/Textarea";
import { FormField } from "~/components/ui/FormField";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { eq } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import { ApprovalDecisionSchema } from "~/lib/validation/discovery-rules";
import { getFormErrorMessage } from "~/lib/utils/form-error";
import { createEmailClient } from "~/lib/notifications/email";
import { buildApprovalResultEmail } from "~/lib/notifications/templates";

const DECISION_LABELS: Record<string, string> = {
  NEXT: "전진 (NEXT)",
  NOT_NOW: "보류 (NOT NOW)",
  DEAD_END: "중단 (DEAD END)",
  EXTENSION_REQUESTED: "연장 요청",
};

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const { id } = params;
  if (!id) {
    throw new Response("Not Found", { status: 404 });
  }

  const discovery = await db.query.discoveries.findFirst({
    where: eq(discoveries.id, id),
  });

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  // Must be PENDING approval
  if (discovery.approvalStatus !== "PENDING") {
    return redirect(`/discoveries/${id}`);
  }

  // Must be the reviewer
  if (discovery.reviewerId !== user.id) {
    return redirect(`/discoveries/${id}`);
  }

  // Get owner name
  const owner = discovery.ownerId
    ? await db.query.users.findFirst({ where: eq(users.id, discovery.ownerId) })
    : null;

  return json({
    user,
    discovery,
    ownerName: owner?.name || "알 수 없음",
    pendingDecision: discovery.pendingDecision,
    pendingDecisionData: discovery.pendingDecisionData as Record<string, unknown> | null,
  });
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const { id } = params;
  if (!id) {
    throw new Response("Not Found", { status: 404 });
  }

  const discovery = await db.query.discoveries.findFirst({
    where: eq(discoveries.id, id),
  });

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  if (discovery.approvalStatus !== "PENDING") {
    return json({ error: "승인 대기 중인 결정이 없습니다" }, { status: 400 });
  }

  if (discovery.reviewerId !== user.id) {
    return json({ error: "Reviewer만 승인/거부할 수 있습니다" }, { status: 400 });
  }

  const formData = await request.formData();
  const actionType = formData.get("action");
  const comment = formData.get("comment");

  try {
    const validated = ApprovalDecisionSchema.parse({
      action: actionType,
      comment: comment ? String(comment) : undefined,
    });

    const pendingData = discovery.pendingDecisionData as Record<string, unknown> | null;
    const pendingDecision = discovery.pendingDecision;

    if (validated.action === "approve") {
      // Apply the pending decision
      const updateData: Record<string, unknown> = {
        approvalStatus: "APPROVED",
        approvalComment: validated.comment || null,
        approvedAt: new Date(),
        approvedBy: user.id,
        pendingDecision: null,
        pendingDecisionData: null,
        updatedAt: new Date(),
      };

      if (pendingDecision === DiscoveryStatus.NEXT) {
        updateData.status = DiscoveryStatus.NEXT;
        updateData.decisionState = DiscoveryStatus.NEXT;
        updateData.decisionRationale = pendingData?.decisionRationale || null;
        updateData.decidedAt = new Date();
      } else if (pendingDecision === DiscoveryStatus.NOT_NOW) {
        updateData.status = DiscoveryStatus.NOT_NOW;
        updateData.decisionState = DiscoveryStatus.NOT_NOW;
        updateData.decisionRationale = pendingData?.decisionRationale || null;
        updateData.notNowTriggerType = pendingData?.notNowTriggerType || null;
        updateData.notNowTriggerCondition = pendingData?.notNowTriggerCondition || null;
        updateData.revisitDate = pendingData?.revisitDate
          ? new Date(pendingData.revisitDate as string)
          : null;
        updateData.decidedAt = new Date();
      } else if (pendingDecision === DiscoveryStatus.DEAD_END) {
        updateData.status = DiscoveryStatus.DEAD_END;
        updateData.decisionState = DiscoveryStatus.DEAD_END;
        updateData.decisionRationale = pendingData?.decisionRationale || null;
        updateData.deadEndFailurePattern = pendingData?.deadEndFailurePattern || null;
        updateData.deadEndEvidenceReason = pendingData?.deadEndEvidenceReason || null;
        updateData.decidedAt = new Date();
      } else if (pendingDecision === DiscoveryStatus.EXTENSION_REQUESTED) {
        updateData.status = DiscoveryStatus.EXTENSION_REQUESTED;
        updateData.decisionRationale = pendingData?.extensionRationale || null;
        if (pendingData?.newDueDate) {
          updateData.dueDate = new Date(pendingData.newDueDate as string);
        }
      }

      await db.update(discoveries).set(updateData).where(eq(discoveries.id, id));

      // Event log
      await db.insert(eventLogs).values({
        id: crypto.randomUUID(),
        actorId: user.id,
        discoveryId: id,
        eventType: "APPROVE_DECISION",
        metadata: {
          decision: pendingDecision,
          comment: validated.comment || null,
        },
      });
    } else {
      // Reject -- revert to no pending state
      await db
        .update(discoveries)
        .set({
          approvalStatus: "REJECTED",
          approvalComment: validated.comment || null,
          rejectedAt: new Date(),
          pendingDecision: null,
          pendingDecisionData: null,
          updatedAt: new Date(),
        })
        .where(eq(discoveries.id, id));

      // Event log
      await db.insert(eventLogs).values({
        id: crypto.randomUUID(),
        actorId: user.id,
        discoveryId: id,
        eventType: "REJECT_DECISION",
        metadata: {
          decision: pendingDecision,
          comment: validated.comment || null,
        },
      });
    }

    // Send email to owner
    try {
      if (discovery.ownerId) {
        const ownerUser = await db.query.users.findFirst({
          where: eq(users.id, discovery.ownerId),
        });
        if (ownerUser) {
          const env = context.cloudflare.env as unknown as Record<string, string>;
          if (env.RESEND_API_KEY) {
            const emailClient = createEmailClient(env.RESEND_API_KEY);
            const email = buildApprovalResultEmail({
              discoveryId: id,
              discoveryTitle: discovery.title,
              reviewerName: user.name,
              decision: pendingDecision || "",
              approved: validated.action === "approve",
              comment: validated.comment,
            });
            await emailClient.send({ to: ownerUser.email, ...email });
          }
        }
      }
    } catch {
      // Email failure is non-blocking
    }

    return redirect(`/discoveries/${id}`);
  } catch (error: unknown) {
    return json({ error: getFormErrorMessage(error) }, { status: 400 });
  }
}

export default function ApproveDecision() {
  const loaderData = useLoaderData<typeof loader>();
  const { user, discovery, ownerName, pendingDecision } = loaderData;
  const pendingDecisionData = loaderData.pendingDecisionData as Record<string, string | string[] | null | undefined> | null;
  const actionData = useActionData<typeof action>();

  const decisionLabel = DECISION_LABELS[pendingDecision || ""] || pendingDecision;

  return (
    <PageLayout user={user}>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="결정 승인/거부"
          description="Reviewer로서 제출된 결정을 검토합니다"
        />

        {/* Discovery Summary */}
        <div className="mb-6 rounded-lg bg-[var(--axis-badge-purple-bg)] p-4">
          <h2 className="text-lg font-semibold text-[var(--axis-text-primary)]">{discovery.title}</h2>
          <p className="mt-2 text-sm text-[var(--axis-text-secondary)]">{discovery.seedSummary}</p>
          <div className="mt-3 text-xs text-[var(--axis-text-tertiary)]">
            <span>Owner: {ownerName}</span>
            <span className="mx-2">|</span>
            <span>현재 상태: {discovery.status}</span>
          </div>
        </div>

        {/* Pending Decision Details */}
        <Card className="mb-6 border-2 border-[var(--axis-badge-purple-border)]">
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold text-[var(--axis-text-primary)]">
              제출된 결정: <span className="text-[var(--axis-badge-purple-text)]">{decisionLabel}</span>
            </h3>

            {pendingDecisionData && (
              <dl className="mt-4 space-y-3">
                {pendingDecisionData.decisionRationale && (
                  <div>
                    <dt className="text-sm font-medium text-[var(--axis-text-tertiary)]">결정 근거</dt>
                    <dd className="mt-1 text-sm text-[var(--axis-text-primary)]">
                      {String(pendingDecisionData.decisionRationale)}
                    </dd>
                  </div>
                )}
                {pendingDecisionData.extensionRationale && (
                  <div>
                    <dt className="text-sm font-medium text-[var(--axis-text-tertiary)]">연장 사유</dt>
                    <dd className="mt-1 text-sm text-[var(--axis-text-primary)]">
                      {String(pendingDecisionData.extensionRationale)}
                    </dd>
                  </div>
                )}
                {pendingDecisionData.notNowTriggerType && (
                  <div>
                    <dt className="text-sm font-medium text-[var(--axis-text-tertiary)]">트리거 유형</dt>
                    <dd className="mt-1 text-sm text-[var(--axis-text-primary)]">
                      {String(pendingDecisionData.notNowTriggerType)}
                    </dd>
                  </div>
                )}
                {pendingDecisionData.notNowTriggerCondition && (
                  <div>
                    <dt className="text-sm font-medium text-[var(--axis-text-tertiary)]">트리거 조건</dt>
                    <dd className="mt-1 text-sm text-[var(--axis-text-primary)]">
                      {String(pendingDecisionData.notNowTriggerCondition)}
                    </dd>
                  </div>
                )}
                {pendingDecisionData.revisitDate && (
                  <div>
                    <dt className="text-sm font-medium text-[var(--axis-text-tertiary)]">재검토 날짜</dt>
                    <dd className="mt-1 text-sm text-[var(--axis-text-primary)]">
                      {new Date(String(pendingDecisionData.revisitDate)).toLocaleDateString("ko-KR")}
                    </dd>
                  </div>
                )}
                {pendingDecisionData.deadEndFailurePattern && (
                  <div>
                    <dt className="text-sm font-medium text-[var(--axis-text-tertiary)]">실패 패턴</dt>
                    <dd className="mt-1 flex flex-wrap gap-1">
                      {(pendingDecisionData.deadEndFailurePattern as string[]).map((p) => (
                        <span
                          key={p}
                          className="rounded bg-[var(--axis-badge-error-bg)] px-2 py-0.5 text-xs text-[var(--axis-badge-error-text)]"
                        >
                          {p}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                {pendingDecisionData.deadEndEvidenceReason && (
                  <div>
                    <dt className="text-sm font-medium text-[var(--axis-text-tertiary)]">증거 기반 사유</dt>
                    <dd className="mt-1 text-sm text-[var(--axis-text-primary)]">
                      {String(pendingDecisionData.deadEndEvidenceReason)}
                    </dd>
                  </div>
                )}
                {pendingDecisionData.evidenceWarning && (
                  <AlertBanner variant="warning" className="mt-3">
                    <p>{String(pendingDecisionData.evidenceWarning)}</p>
                  </AlertBanner>
                )}
              </dl>
            )}
          </CardContent>
        </Card>

        {actionData?.error && (
          <AlertBanner variant="destructive" className="mb-6">
            <p>{actionData.error}</p>
          </AlertBanner>
        )}

        <Card>
          <CardContent className="pt-6">
            <Form method="post" className="space-y-6">
              {/* Action Selection */}
              <fieldset>
                <legend className="text-sm font-medium text-[var(--axis-text-secondary)]">결정</legend>
                <div className="mt-3 space-y-3">
                  <div className="flex items-center">
                    <input
                      id="approve"
                      name="action"
                      type="radio"
                      value="approve"
                      defaultChecked
                      className="h-4 w-4 border-[var(--axis-border-default)] text-[var(--axis-badge-success-text)] focus:ring-[var(--axis-badge-success-border)]"
                    />
                    <label htmlFor="approve" className="ml-3 text-sm font-medium text-[var(--axis-text-secondary)]">
                      승인 -- 결정을 적용합니다
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      id="reject"
                      name="action"
                      type="radio"
                      value="reject"
                      className="h-4 w-4 border-[var(--axis-border-default)] text-[var(--axis-text-error)] focus:ring-[var(--axis-border-error)]"
                    />
                    <label htmlFor="reject" className="ml-3 text-sm font-medium text-[var(--axis-text-secondary)]">
                      거부 -- Owner에게 반려합니다
                    </label>
                  </div>
                </div>
              </fieldset>

              {/* Comment */}
              <FormField label="코멘트 (선택)" htmlFor="comment" hint="400자 이내">
                <Textarea
                  name="comment"
                  id="comment"
                  maxLength={400}
                  rows={3}
                  placeholder="승인/거부 사유나 피드백"
                />
              </FormField>

              {/* Actions */}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3 border-t border-[var(--axis-border-default)] pt-6">
                <Button variant="outline" asChild>
                  <a href={`/discoveries/${discovery.id}`}>취소</a>
                </Button>
                <Button type="submit" variant="purple">제출</Button>
              </div>
            </Form>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
