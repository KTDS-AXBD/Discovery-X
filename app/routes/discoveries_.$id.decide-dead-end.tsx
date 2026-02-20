import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, eventLogs, users } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { PageHeader } from "~/components/layout/PageHeader";
import { Card, CardContent } from "~/components/ui/Card";
import { Input } from "~/components/ui/Input";
import { Textarea } from "~/components/ui/Textarea";
import { FormField } from "~/components/ui/FormField";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { eq } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import { DiscoveryValidationRules, DeadEndDecisionSchema } from "~/lib/validation/discovery-rules";
import { getFormErrorMessage } from "~/lib/utils/form-error";
import { FAILURE_PATTERNS } from "~/lib/constants/failure-patterns";
import { ACTIVE_STATUSES } from "~/lib/constants/status";
import { createEmailClient } from "~/lib/notifications/email";
import { buildApprovalRequestEmail } from "~/lib/notifications/templates";

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

  // Get discovery
  const discovery = await db.query.discoveries.findFirst({
    where: eq(discoveries.id, id),
  });

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  // 활성 상태에서만 DROP 결정 가능
  if (!ACTIVE_STATUSES.includes(discovery.status as typeof ACTIVE_STATUSES[number])) {
    return redirect(`/discoveries/${id}`);
  }

  return json({ user, discovery });
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

  // Get discovery
  const discovery = await db.query.discoveries.findFirst({
    where: eq(discoveries.id, id),
  });

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  // 활성 상태에서만 DROP 결정 가능
  if (!ACTIVE_STATUSES.includes(discovery.status as typeof ACTIVE_STATUSES[number])) {
    return json(
      { error: "활성 상태의 Discovery만 결정할 수 있습니다" },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const decisionRationale = formData.get("decisionRationale");
  const deadEndEvidenceReason = formData.get("deadEndEvidenceReason");

  // Get selected failure patterns (checkboxes)
  const deadEndFailurePattern: string[] = [];
  for (const pattern of FAILURE_PATTERNS) {
    if (formData.get(`pattern_${pattern.id}`)) {
      deadEndFailurePattern.push(pattern.id);
    }
  }

  try {
    // Validate reviewer assigned
    DiscoveryValidationRules.validateReviewerRequired(discovery.reviewerId);
    // Block duplicate pending
    DiscoveryValidationRules.validateNoApprovalPending(discovery.approvalStatus);

    // Validate using Zod schema
    const validated = DeadEndDecisionSchema.parse({
      decisionRationale,
      deadEndFailurePattern,
      deadEndEvidenceReason,
    });

    // Save as PENDING instead of directly applying
    await db
      .update(discoveries)
      .set({
        approvalStatus: "PENDING",
        pendingDecision: DiscoveryStatus.DROP,
        pendingDecisionData: {
          decisionRationale: validated.decisionRationale,
          deadEndFailurePattern: validated.deadEndFailurePattern,
          deadEndEvidenceReason: validated.deadEndEvidenceReason,
        },
        updatedAt: new Date(),
      })
      .where(eq(discoveries.id, id));

    // Create event log
    await db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId: user.id,
      discoveryId: id,
      eventType: "SUBMIT_FOR_APPROVAL",
      metadata: {
        pendingDecision: DiscoveryStatus.DROP,
        decisionRationale: validated.decisionRationale,
        failurePattern: validated.deadEndFailurePattern,
        evidenceReason: validated.deadEndEvidenceReason,
      },
    });

    // Send email to reviewer
    try {
      const reviewerUser = await db.query.users.findFirst({
        where: eq(users.id, discovery.reviewerId!),
      });
      if (reviewerUser) {
        const env = context.cloudflare.env as unknown as Record<string, string>;
        if (env.RESEND_API_KEY) {
          const emailClient = createEmailClient(env.RESEND_API_KEY);
          const email = buildApprovalRequestEmail({
            discoveryId: id,
            discoveryTitle: discovery.title,
            ownerName: user.name,
            decision: "DROP",
          });
          await emailClient.send({ to: reviewerUser.email, ...email });
        }
      }
    } catch {
      // Email failure is non-blocking
    }

    return redirect(`/discoveries/${id}`);
  } catch (error: unknown) {
    return json(
      { error: getFormErrorMessage(error) },
      { status: 400 }
    );
  }
}

export default function DecideDeadEnd() {
  const { user, discovery } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="DEAD END 결정"
          description="Discovery를 중단(DEAD END) 상태로 닫습니다"
        />

        {/* Discovery Info */}
        <div className="mb-6 rounded-lg bg-[var(--axis-surface-error)] p-4">
          <h2 className="text-lg font-semibold text-[var(--axis-text-primary)]">{discovery.title}</h2>
          <p className="mt-2 text-sm text-[var(--axis-text-secondary)]">{discovery.seedSummary}</p>
        </div>

        {actionData?.error && (
          <AlertBanner variant="destructive" className="mb-6">
            <p>{actionData.error}</p>
          </AlertBanner>
        )}

        <Card>
          <CardContent className="pt-6">
            <Form method="post" className="space-y-6">
              <AlertBanner variant="destructive">
                <p>
                  <strong>DEAD END 결정:</strong> 실패를 조직 자산으로 축적합니다.
                  왜 작동하지 않았는지, 어떤 패턴으로 실패했는지 명확히 기록해야 합니다.
                </p>
              </AlertBanner>

              {/* Decision Rationale */}
              <FormField label="결정 근거" htmlFor="decisionRationale" required hint="400자 이내">
                <Textarea
                  name="decisionRationale"
                  id="decisionRationale"
                  required
                  maxLength={400}
                  rows={4}
                  placeholder="왜 중단하기로 했는지 기술합니다"
                />
              </FormField>

              <hr className="border-[var(--axis-border-default)]" />

              {/* Failure Pattern */}
              <div>
                <label className="block text-sm font-medium text-[var(--axis-text-primary)]">
                  실패 패턴 <span className="text-[var(--axis-text-error)] ml-0.5">*</span> (1-3개 선택)
                </label>
                <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                  유사한 Discovery에서 같은 실패를 반복하지 않도록 패턴을 태깅합니다
                </p>
                <div className="mt-3 space-y-3">
                  {FAILURE_PATTERNS.map((pattern) => (
                    <div key={pattern.id} className="flex items-start">
                      <div className="flex h-5 items-center">
                        <input
                          id={`pattern_${pattern.id}`}
                          name={`pattern_${pattern.id}`}
                          type="checkbox"
                          className="h-4 w-4 rounded border-[var(--axis-border-default)] text-[var(--axis-text-error)] focus:ring-[var(--axis-border-error)]"
                        />
                      </div>
                      <div className="ml-3 text-sm">
                        <label
                          htmlFor={`pattern_${pattern.id}`}
                          className="font-medium text-[var(--axis-text-secondary)]"
                        >
                          {pattern.label}
                        </label>
                        <p className="text-[var(--axis-text-tertiary)]">{pattern.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Evidence Reason */}
              <FormField label="증거 기반 사유" htmlFor="deadEndEvidenceReason" required hint="실패 판단의 근거 (200자 이내)">
                <Input
                  type="text"
                  name="deadEndEvidenceReason"
                  id="deadEndEvidenceReason"
                  required
                  maxLength={200}
                  placeholder="예: 사용자 10명 테스트 결과 8명이 '불필요하다' 응답"
                />
              </FormField>

              {/* Actions */}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3 border-t border-[var(--axis-border-default)] pt-6">
                <Button variant="outline" asChild>
                  <a href={`/discoveries/${discovery.id}`}>취소</a>
                </Button>
                <Button type="submit" variant="destructive">승인 요청 (DEAD END)</Button>
              </div>
            </Form>
          </CardContent>
        </Card>

        {/* Info */}
        <div className="mt-6 rounded-md bg-[var(--axis-surface-warning)] p-4 text-sm text-[var(--axis-text-secondary)]">
          <p className="font-semibold">DEAD END 결정 후:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>상태: OPEN → DEAD END</li>
            <li>Discovery는 "닫힘" 상태가 됩니다</li>
            <li>실패 패턴이 태깅되어 조직 학습 자산으로 축적</li>
            <li>유사한 Seed 검색 시 "이미 실패한 사례"로 제안됨</li>
            <li>Monthly Failure Replay 회의에서 리뷰 대상이 됩니다</li>
          </ul>
        </div>

        <div className="mt-4 rounded-md bg-[var(--axis-surface-secondary)] p-4 text-sm text-[var(--axis-text-tertiary)]">
          <p className="font-semibold">실패를 자산으로 만드는 법:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              <strong>구체적인 근거:</strong> "안될 것 같다"가 아니라 "사용자 테스트에서
              80% 거부"
            </li>
            <li>
              <strong>명확한 패턴:</strong> 다음에 피할 수 있도록 왜 실패했는지 분류
            </li>
            <li>
              <strong>배운 것 기록:</strong> 무엇을 배웠는지, 다음엔 뭘 다르게 할지
            </li>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
