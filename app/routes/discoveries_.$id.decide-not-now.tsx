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
import { Select } from "~/components/ui/Select";
import { FormField } from "~/components/ui/FormField";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { eq } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import { DiscoveryValidationRules, NotNowDecisionSchema } from "~/lib/validation/discovery-rules";
import { getFormErrorMessage } from "~/lib/utils/form-error";
import { TRIGGER_TYPES } from "~/lib/constants/failure-patterns";
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
    discovery.status !== DiscoveryStatus.IDEA_CARD
  ) {
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

  if (
    discovery.status !== DiscoveryStatus.IDEA_CARD &&
    discovery.status !== DiscoveryStatus.IDEA_CARD
  ) {
    return json(
      { error: "OPEN 또는 EXTENSION_REQUESTED 상태의 Discovery만 결정할 수 있습니다" },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const decisionRationale = formData.get("decisionRationale");
  const notNowTriggerType = formData.get("notNowTriggerType");
  const notNowTriggerCondition = formData.get("notNowTriggerCondition");
  const revisitDateStr = formData.get("revisitDate");

  try {
    // Validate reviewer assigned
    DiscoveryValidationRules.validateReviewerRequired(discovery.reviewerId);
    // Block duplicate pending
    DiscoveryValidationRules.validateNoApprovalPending(discovery.approvalStatus);

    // Parse revisit date
    const revisitDate = revisitDateStr ? new Date(String(revisitDateStr)) : null;
    if (!revisitDate) {
      throw new Error("재검토 날짜를 입력해주세요");
    }

    // Validate using Zod schema
    const validated = NotNowDecisionSchema.parse({
      decisionRationale,
      notNowTriggerType,
      notNowTriggerCondition,
      revisitDate,
    });

    // Save as PENDING instead of directly applying
    await db
      .update(discoveries)
      .set({
        approvalStatus: "PENDING",
        pendingDecision: DiscoveryStatus.HOLD,
        pendingDecisionData: {
          decisionRationale: validated.decisionRationale,
          notNowTriggerType: validated.notNowTriggerType,
          notNowTriggerCondition: validated.notNowTriggerCondition,
          revisitDate: validated.revisitDate.toISOString(),
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
        pendingDecision: DiscoveryStatus.HOLD,
        decisionRationale: validated.decisionRationale,
        triggerType: validated.notNowTriggerType,
        triggerCondition: validated.notNowTriggerCondition,
        revisitDate: validated.revisitDate.toISOString(),
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
            decision: "HOLD",
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

export default function DecideNotNow() {
  const { user, discovery } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  // Calculate default revisit date (3 months from now)
  const defaultRevisitDate = new Date();
  defaultRevisitDate.setMonth(defaultRevisitDate.getMonth() + 3);
  const defaultRevisitDateStr = defaultRevisitDate.toISOString().split("T")[0];

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="NOT NOW 결정"
          description="Discovery를 보류(NOT NOW) 상태로 닫습니다"
        />

        {/* Discovery Info */}
        <div className="mb-6 rounded-lg bg-[var(--axis-surface-secondary)] p-4">
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
              <AlertBanner variant="warning">
                <p>
                  <strong>NOT NOW 결정:</strong> 지금은 아니지만, 특정 조건이 충족되면 재검토합니다.
                  트리거 조건과 재검토 날짜를 명확히 지정해야 합니다.
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
                  placeholder="왜 지금은 진행하지 않기로 했는지 기술합니다"
                />
              </FormField>

              <hr className="border-[var(--axis-border-default)]" />

              {/* Trigger Type */}
              <FormField label="트리거 유형" htmlFor="notNowTriggerType" required hint="재검토를 촉발하는 조건의 종류">
                <Select
                  name="notNowTriggerType"
                  id="notNowTriggerType"
                  required
                >
                  <option value="">선택하세요</option>
                  {TRIGGER_TYPES.map((trigger) => (
                    <option key={trigger.id} value={trigger.id}>
                      {trigger.label} - {trigger.description}
                    </option>
                  ))}
                </Select>
              </FormField>

              {/* Trigger Condition */}
              <FormField label="트리거 조건" htmlFor="notNowTriggerCondition" required hint="구체적인 조건 (200자 이내)">
                <Input
                  type="text"
                  name="notNowTriggerCondition"
                  id="notNowTriggerCondition"
                  required
                  maxLength={200}
                  placeholder="예: WebGPU 브라우저 지원률 80% 도달"
                />
              </FormField>

              {/* Revisit Date */}
              <FormField label="재검토 날짜" htmlFor="revisitDate" required hint="이 날짜에 Recall Queue에 자동 등재됩니다 (기본: 3개월 후)">
                <Input
                  type="date"
                  name="revisitDate"
                  id="revisitDate"
                  required
                  defaultValue={defaultRevisitDateStr}
                  min={new Date().toISOString().split("T")[0]}
                />
              </FormField>

              {/* Actions */}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3 border-t border-[var(--axis-border-default)] pt-6">
                <Button variant="outline" asChild>
                  <a href={`/discoveries/${discovery.id}`}>취소</a>
                </Button>
                <Button type="submit" variant="secondary">승인 요청 (NOT NOW)</Button>
              </div>
            </Form>
          </CardContent>
        </Card>

        {/* Trigger Examples */}
        <div className="mt-6 rounded-md bg-[var(--axis-surface-secondary)] p-4 text-sm text-[var(--axis-text-tertiary)]">
          <p className="font-semibold">트리거 조건 예시:</p>
          <ul className="mt-2 space-y-2">
            {TRIGGER_TYPES.map((trigger) => (
              <li key={trigger.id}>
                <strong>{trigger.label}:</strong> {trigger.example}
              </li>
            ))}
          </ul>
        </div>

        {/* Info */}
        <AlertBanner variant="info" className="mt-4">
          <p className="font-semibold">NOT NOW 결정 후:</p>
          <ul className="mt-2 list-inside list-disc space-y-1 text-sm">
            <li>상태: OPEN → NOT NOW</li>
            <li>Discovery는 "닫힘" 상태가 됩니다</li>
            <li>재검토 날짜에 Recall Queue에 자동 등재</li>
            <li>유사한 Seed 검색 시 참고용으로 제안될 수 있음</li>
          </ul>
        </AlertBanner>
      </div>
    </AppShell>
  );
}
