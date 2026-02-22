import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, evidence, users } from "~/db/schema";
import { DiscoveryService } from "~/lib/services/discovery.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { PageHeader } from "~/components/layout/PageHeader";
import { Card, CardContent } from "~/components/ui/Card";
import { Textarea } from "~/components/ui/Textarea";
import { FormField } from "~/components/ui/FormField";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { eq } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import { DiscoveryValidationRules, NextDecisionSchema } from "~/lib/validation/discovery-rules";
import { getFormErrorMessage } from "~/lib/utils/form-error";
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

  // Can only decide from OPEN or EXTENSION_REQUESTED status
  if (
    discovery.status !== DiscoveryStatus.IDEA_CARD &&
    discovery.status !== DiscoveryStatus.HYPOTHESIS
  ) {
    return redirect(`/discoveries/${id}`);
  }

  // Get evidence for quality check
  const allEvidence = await db
    .select()
    .from(evidence)
    .where(eq(evidence.discoveryId, id));

  const strongEvidence = allEvidence.filter((e) => e.strength === "A" || e.strength === "B");

  return json({ user, discovery, evidenceCount: allEvidence.length, strongEvidenceCount: strongEvidence.length });
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

  // Discovery 조회 (상태 검증 + 이메일용)
  const discovery = await db.query.discoveries.findFirst({
    where: eq(discoveries.id, id),
  });

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  if (
    discovery.status !== DiscoveryStatus.IDEA_CARD &&
    discovery.status !== DiscoveryStatus.HYPOTHESIS
  ) {
    return json(
      { error: "OPEN 또는 EXTENSION_REQUESTED 상태의 Discovery만 결정할 수 있습니다" },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const decisionRationale = formData.get("decisionRationale");

  try {
    const validated = NextDecisionSchema.parse({
      decisionRationale,
    });

    // 근거 품질 경고 (차단하지 않음, 기록용)
    const validationResult = await DiscoveryValidationRules.validateNextDecision(db, id);

    const service = new DiscoveryService(db);
    await service.submitForApproval(
      id,
      {
        pendingDecision: DiscoveryStatus.GATE1,
        pendingDecisionData: {
          decisionRationale: validated.decisionRationale,
          evidenceWarning: validationResult.warning || null,
        },
      },
      user.id,
    );

    // 이메일 발송 (라우트 유지)
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
            decision: "NEXT",
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

export default function DecideNext() {
  const { user, discovery, evidenceCount, strongEvidenceCount } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const hasWarning = strongEvidenceCount < 2;

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="NEXT 결정"
          description="Discovery를 전진(NEXT) 상태로 닫습니다"
        />

        {/* Discovery Info */}
        <div className="mb-6 rounded-lg bg-badge-success-bg p-4">
          <h2 className="text-lg font-semibold text-fg">{discovery.title}</h2>
          <p className="mt-2 text-sm text-fg-secondary">{discovery.seedSummary}</p>
          <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:space-x-4 text-xs text-fg-tertiary">
            <span>전체 Evidence: {evidenceCount}개</span>
            <span>강한 Evidence (A/B급): {strongEvidenceCount}개</span>
          </div>
        </div>

        {/* Evidence Quality Warning */}
        {hasWarning && (
          <AlertBanner variant="warning" className="mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-badge-warning-text"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium">근거 품질 경고</h3>
                <p className="mt-2 text-sm">
                  강한 근거(A/B급)가 {strongEvidenceCount}개뿐입니다. NEXT 결정은 <strong>최소 2개</strong>의
                  A/B급 근거를 권장합니다.
                </p>
                <p className="mt-1 text-xs opacity-80">
                  (경고지만 결정은 가능합니다)
                </p>
              </div>
            </div>
          </AlertBanner>
        )}

        {actionData?.error && (
          <AlertBanner variant="destructive" className="mb-6">
            <p>{actionData.error}</p>
          </AlertBanner>
        )}

        <Card>
          <CardContent className="pt-6">
            <Form method="post" className="space-y-6">
              <AlertBanner variant="success">
                <p>
                  <strong>NEXT 결정:</strong> 이 Discovery를 다음 단계로 진행합니다.
                  실행 계획, 예산 확보, 팀 편성 등 후속 작업으로 이어집니다.
                </p>
              </AlertBanner>

              {/* Decision Rationale */}
              <FormField label="결정 근거" htmlFor="decisionRationale" required hint="400자 이내">
                <Textarea
                  name="decisionRationale"
                  id="decisionRationale"
                  required
                  maxLength={400}
                  rows={5}
                  placeholder="왜 전진하기로 결정했는지, 어떤 근거가 충분했는지 기술합니다"
                />
              </FormField>

              {/* Actions */}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3 border-t border-line pt-6">
                <Button variant="outline" asChild>
                  <a href={`/discoveries/${discovery.id}`}>취소</a>
                </Button>
                <Button type="submit" variant="success">승인 요청 (NEXT)</Button>
              </div>
            </Form>
          </CardContent>
        </Card>

        {/* Info */}
        <div className="mt-6 rounded-md bg-surface-secondary p-4 text-sm text-fg-tertiary">
          <p className="font-semibold">NEXT 결정 후:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>상태: OPEN → NEXT</li>
            <li>Discovery는 "닫힘" 상태가 됩니다</li>
            <li>후속 작업: 실행 계획 수립, 리소스 확보 등</li>
            <li>Weekly Review에서 제외됩니다</li>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
