import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { DiscoveryService } from "~/features/discovery/service";
import { DiscoveryQueryExtraService } from "~/features/discovery/service/query-extra2";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { PageHeader } from "~/components/layout/PageHeader";
import { Card, CardContent } from "~/components/ui/Card";
import { Input } from "~/components/ui/Input";
import { Textarea } from "~/components/ui/Textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "~/components/ui/Select";
import { FormField } from "~/components/ui/FormField";
import { Button } from "~/components/ui/Button";
import { Separator } from "~/components/ui/Separator";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { DiscoveryStatus } from "~/db";
import { NotNowDecisionSchema } from "~/features/discovery/validation/discovery-rules";
import { getFormErrorMessage } from "~/lib/utils/form-error";
import { TRIGGER_TYPES } from "~/lib/constants/failure-patterns";
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
  const service = new DiscoveryService(db);
  const discovery = await service.getById(id);

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  // 활성 상태에서만 HOLD 결정 가능
  if (!ACTIVE_STATUSES.includes(discovery.status as typeof ACTIVE_STATUSES[number])) {
    return redirect(`/discoveries/${id}`);
  }

  const allUsers = await service.getAllUsers();

  return json({ user, discovery, allUsers });
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
  const service = new DiscoveryService(db);
  const discovery = await service.getById(id);

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  if (!ACTIVE_STATUSES.includes(discovery.status as typeof ACTIVE_STATUSES[number])) {
    return json(
      { error: "활성 상태의 Discovery만 결정할 수 있습니다" },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const decisionRationale = formData.get("decisionRationale");
  const notNowTriggerType = formData.get("notNowTriggerType");
  const notNowTriggerCondition = formData.get("notNowTriggerCondition");
  const revisitDateStr = formData.get("revisitDate");

  // Reviewer 선행 설정 (미지정 시 폼에서 선택)
  const reviewerId = formData.get("reviewerId");
  if (reviewerId && !discovery.reviewerId) {
    try {
      await service.changeReviewer({
        discoveryId: id,
        newReviewerId: String(reviewerId),
        actorId: user.id,
      });
    } catch (error: unknown) {
      return json(
        { error: getFormErrorMessage(error) },
        { status: 400 }
      );
    }
  }

  try {
    const revisitDate = revisitDateStr ? new Date(String(revisitDateStr)) : null;
    if (!revisitDate) {
      throw new Error("재검토 날짜를 입력해주세요");
    }

    const validated = NotNowDecisionSchema.parse({
      decisionRationale,
      notNowTriggerType,
      notNowTriggerCondition,
      revisitDate,
    });

    await service.submitForApproval(
      id,
      {
        pendingDecision: DiscoveryStatus.HOLD,
        pendingDecisionData: {
          decisionRationale: validated.decisionRationale,
          notNowTriggerType: validated.notNowTriggerType,
          notNowTriggerCondition: validated.notNowTriggerCondition,
          revisitDate: validated.revisitDate.toISOString(),
        },
      },
      user.id,
    );

    // 이메일 발송 (라우트 유지)
    try {
      const queryExtra = new DiscoveryQueryExtraService(db);
      const reviewerUser = discovery.reviewerId
        ? await queryExtra.getUserById(discovery.reviewerId)
        : null;
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
  const { user, discovery, allUsers } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const needsReviewer = !discovery.reviewerId;

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
        <div className="mb-6 rounded-lg bg-surface-secondary p-4">
          <h2 className="text-lg font-semibold text-fg">{discovery.title}</h2>
          <p className="mt-2 text-sm text-fg-secondary">{discovery.seedSummary}</p>
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

              {/* Reviewer 미지정 시 인라인 선택 */}
              {needsReviewer && (
                <>
                  <AlertBanner variant="info">
                    <p className="text-sm font-semibold">Reviewer 미지정</p>
                    <p className="mt-1 text-sm">결정을 제출하려면 Reviewer를 지정해야 합니다. 아래에서 선택하세요.</p>
                  </AlertBanner>
                  <FormField label="Reviewer 지정" htmlFor="reviewerId" required>
                    <Select name="reviewerId" required>
                      <SelectTrigger id="reviewerId">
                        <SelectValue placeholder="Reviewer 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {allUsers
                          .filter((u) => u.id !== user.id)
                          .map((u) => (
                            <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </FormField>
                  <Separator />
                </>
              )}

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

              <Separator />

              {/* Trigger Type */}
              <FormField label="트리거 유형" htmlFor="notNowTriggerType" required hint="재검토를 촉발하는 조건의 종류">
                <Select name="notNowTriggerType" required>
                  <SelectTrigger id="notNowTriggerType">
                    <SelectValue placeholder="선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_TYPES.map((trigger) => (
                      <SelectItem key={trigger.id} value={trigger.id}>
                        {trigger.label} - {trigger.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
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
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3 border-t border-line pt-6">
                <Button variant="outline" asChild>
                  <a href={`/discoveries/${discovery.id}`}>취소</a>
                </Button>
                <Button type="submit" variant="secondary">승인 요청 (NOT NOW)</Button>
              </div>
            </Form>
          </CardContent>
        </Card>

        {/* Trigger Examples */}
        <div className="mt-6 rounded-md bg-surface-secondary p-4 text-sm text-fg-tertiary">
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
