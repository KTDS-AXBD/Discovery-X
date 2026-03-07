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
import { DeadEndDecisionSchema } from "~/features/discovery/validation/discovery-rules";
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
  const service = new DiscoveryService(db);
  const discovery = await service.getById(id);

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  // 활성 상태에서만 DROP 결정 가능
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
  const deadEndEvidenceReason = formData.get("deadEndEvidenceReason");

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

  // 체크박스에서 선택된 실패 패턴 수집
  const deadEndFailurePattern: string[] = [];
  for (const pattern of FAILURE_PATTERNS) {
    if (formData.get(`pattern_${pattern.id}`)) {
      deadEndFailurePattern.push(pattern.id);
    }
  }

  try {
    const validated = DeadEndDecisionSchema.parse({
      decisionRationale,
      deadEndFailurePattern,
      deadEndEvidenceReason,
    });

    await service.submitForApproval(
      id,
      {
        pendingDecision: DiscoveryStatus.DROP,
        pendingDecisionData: {
          decisionRationale: validated.decisionRationale,
          deadEndFailurePattern: validated.deadEndFailurePattern,
          deadEndEvidenceReason: validated.deadEndEvidenceReason,
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
  const { user, discovery, allUsers } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const needsReviewer = !discovery.reviewerId;

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="DEAD END 결정"
          description="Discovery를 중단(DEAD END) 상태로 닫습니다"
        />

        {/* Discovery Info */}
        <div className="mb-6 rounded-lg bg-surface-error p-4">
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
              <AlertBanner variant="destructive">
                <p>
                  <strong>DEAD END 결정:</strong> 실패를 조직 자산으로 축적합니다.
                  왜 작동하지 않았는지, 어떤 패턴으로 실패했는지 명확히 기록해야 합니다.
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
                  placeholder="왜 중단하기로 했는지 기술합니다"
                />
              </FormField>

              <Separator />

              {/* Failure Pattern */}
              <div>
                <label className="block text-sm font-medium text-fg">
                  실패 패턴 <span className="text-fg-error ml-0.5">*</span> (1-3개 선택)
                </label>
                <p className="mt-1 text-xs text-fg-tertiary">
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
                          className="h-4 w-4 rounded border-line text-fg-error focus:ring-line-error"
                        />
                      </div>
                      <div className="ml-3 text-sm">
                        <label
                          htmlFor={`pattern_${pattern.id}`}
                          className="font-medium text-fg-secondary"
                        >
                          {pattern.label}
                        </label>
                        <p className="text-fg-tertiary">{pattern.description}</p>
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
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3 border-t border-line pt-6">
                <Button variant="outline" asChild>
                  <a href={`/discoveries/${discovery.id}`}>취소</a>
                </Button>
                <Button type="submit" variant="destructive">승인 요청 (DEAD END)</Button>
              </div>
            </Form>
          </CardContent>
        </Card>

        {/* Info */}
        <div className="mt-6 rounded-md bg-surface-warning p-4 text-sm text-fg-secondary">
          <p className="font-semibold">DEAD END 결정 후:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>상태: OPEN → DEAD END</li>
            <li>Discovery는 "닫힘" 상태가 됩니다</li>
            <li>실패 패턴이 태깅되어 조직 학습 자산으로 축적</li>
            <li>유사한 Seed 검색 시 "이미 실패한 사례"로 제안됨</li>
            <li>Monthly Failure Replay 회의에서 리뷰 대상이 됩니다</li>
          </ul>
        </div>

        <div className="mt-4 rounded-md bg-surface-secondary p-4 text-sm text-fg-tertiary">
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
