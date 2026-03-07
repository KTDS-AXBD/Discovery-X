import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { DiscoveryService } from "~/features/discovery/service";
import { DiscoveryQueryExtraService } from "~/features/discovery/service/query-extra2";
import { AppShell } from "~/components/layout/AppShell";
import { PageHeader } from "~/components/layout/PageHeader";
import { Card, CardContent } from "~/components/ui/Card";
import { Textarea } from "~/components/ui/Textarea";
import { FormField } from "~/components/ui/FormField";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { ApprovalDecisionSchema } from "~/features/discovery/validation/discovery-rules";
import { getFormErrorMessage } from "~/lib/utils/form-error";
import { createEmailClient } from "~/lib/notifications/email";
import { buildApprovalResultEmail } from "~/lib/notifications/templates";
import { formatDate } from "~/lib/format-date";

const DECISION_LABELS: Record<string, string> = {
  NEXT: "전진 (NEXT)",
  NOT_NOW: "보류 (NOT NOW)",
  DEAD_END: "중단 (DEAD END)",
  EXTENSION_REQUESTED: "연장 요청",
};

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }
  const user = ctx.user;

  const { id } = params;
  if (!id) {
    throw new Response("Not Found", { status: 404 });
  }

  const service = new DiscoveryService(db);
  const discovery = await service.getById(id);
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
  const queryExtra = new DiscoveryQueryExtraService(db);
  const owner = discovery.ownerId
    ? await queryExtra.getUserById(discovery.ownerId)
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
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }
  const user = ctx.user;

  const { id } = params;
  if (!id) {
    throw new Response("Not Found", { status: 404 });
  }

  const service = new DiscoveryService(db);
  const discovery = await service.getById(id);
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

    const result = validated.action === "approve"
      ? await service.approveDecision(id, user.id, validated.comment)
      : await service.rejectDecision(id, user.id, validated.comment);

    // Send email to owner
    try {
      if (discovery.ownerId) {
        const queryExtra = new DiscoveryQueryExtraService(db);
        const ownerUser = await queryExtra.getUserById(discovery.ownerId);
        if (ownerUser) {
          const env = context.cloudflare.env as unknown as Record<string, string>;
          if (env.RESEND_API_KEY) {
            const emailClient = createEmailClient(env.RESEND_API_KEY);
            const email = buildApprovalResultEmail({
              discoveryId: id,
              discoveryTitle: discovery.title,
              reviewerName: user.name,
              decision: result.pendingDecision || "",
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
    <AppShell user={user}>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="결정 승인/거부"
          description="Reviewer로서 제출된 결정을 검토합니다"
        />

        {/* Discovery Summary */}
        <div className="mb-6 rounded-lg bg-badge-purple-bg p-4">
          <h2 className="text-lg font-semibold text-fg">{discovery.title}</h2>
          <p className="mt-2 text-sm text-fg-secondary">{discovery.seedSummary}</p>
          <div className="mt-3 text-xs text-fg-tertiary">
            <span>Owner: {ownerName}</span>
            <span className="mx-2">|</span>
            <span>현재 상태: {discovery.status}</span>
          </div>
        </div>

        {/* Pending Decision Details */}
        <Card className="mb-6 border-2 border-badge-purple-bg">
          <CardContent className="pt-6">
            <h3 className="text-lg font-semibold text-fg">
              제출된 결정: <span className="text-badge-purple-text">{decisionLabel}</span>
            </h3>

            {pendingDecisionData && (
              <dl className="mt-4 space-y-3">
                {pendingDecisionData.decisionRationale && (
                  <div>
                    <dt className="text-sm font-medium text-fg-tertiary">결정 근거</dt>
                    <dd className="mt-1 text-sm text-fg">
                      {String(pendingDecisionData.decisionRationale)}
                    </dd>
                  </div>
                )}
                {pendingDecisionData.extensionRationale && (
                  <div>
                    <dt className="text-sm font-medium text-fg-tertiary">연장 사유</dt>
                    <dd className="mt-1 text-sm text-fg">
                      {String(pendingDecisionData.extensionRationale)}
                    </dd>
                  </div>
                )}
                {pendingDecisionData.notNowTriggerType && (
                  <div>
                    <dt className="text-sm font-medium text-fg-tertiary">트리거 유형</dt>
                    <dd className="mt-1 text-sm text-fg">
                      {String(pendingDecisionData.notNowTriggerType)}
                    </dd>
                  </div>
                )}
                {pendingDecisionData.notNowTriggerCondition && (
                  <div>
                    <dt className="text-sm font-medium text-fg-tertiary">트리거 조건</dt>
                    <dd className="mt-1 text-sm text-fg">
                      {String(pendingDecisionData.notNowTriggerCondition)}
                    </dd>
                  </div>
                )}
                {pendingDecisionData.revisitDate && (
                  <div>
                    <dt className="text-sm font-medium text-fg-tertiary">재검토 날짜</dt>
                    <dd className="mt-1 text-sm text-fg">
                      {formatDate(String(pendingDecisionData.revisitDate))}
                    </dd>
                  </div>
                )}
                {pendingDecisionData.deadEndFailurePattern && (
                  <div>
                    <dt className="text-sm font-medium text-fg-tertiary">실패 패턴</dt>
                    <dd className="mt-1 flex flex-wrap gap-1">
                      {(pendingDecisionData.deadEndFailurePattern as string[]).map((p) => (
                        <span
                          key={p}
                          className="rounded bg-badge-destructive-bg px-2 py-0.5 text-xs text-fg-error"
                        >
                          {p}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                {pendingDecisionData.deadEndEvidenceReason && (
                  <div>
                    <dt className="text-sm font-medium text-fg-tertiary">증거 기반 사유</dt>
                    <dd className="mt-1 text-sm text-fg">
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
                <legend className="text-sm font-medium text-fg-secondary">결정</legend>
                <div className="mt-3 space-y-3">
                  <div className="flex items-center">
                    <input
                      id="approve"
                      name="action"
                      type="radio"
                      value="approve"
                      defaultChecked
                      className="h-4 w-4 border-line text-badge-success-text focus:ring-badge-success-bg"
                    />
                    <label htmlFor="approve" className="ml-3 text-sm font-medium text-fg-secondary">
                      승인 -- 결정을 적용합니다
                    </label>
                  </div>
                  <div className="flex items-center">
                    <input
                      id="reject"
                      name="action"
                      type="radio"
                      value="reject"
                      className="h-4 w-4 border-line text-fg-error focus:ring-line-error"
                    />
                    <label htmlFor="reject" className="ml-3 text-sm font-medium text-fg-secondary">
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
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3 border-t border-line pt-6">
                <Button variant="outline" asChild>
                  <a href={`/discoveries/${discovery.id}`}>취소</a>
                </Button>
                <Button type="submit" variant="purple">제출</Button>
              </div>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
