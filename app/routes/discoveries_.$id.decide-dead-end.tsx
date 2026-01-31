import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, eventLogs, users } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { eq } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import { DiscoveryValidationRules, DeadEndDecisionSchema } from "~/lib/validation/discovery-rules";
import { getFormErrorMessage } from "~/lib/utils/form-error";
import { FAILURE_PATTERNS } from "~/lib/constants/failure-patterns";
import { createEmailClient } from "~/lib/notifications/email";
import { buildApprovalRequestEmail } from "~/lib/notifications/templates";

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

  // Get discovery
  const discovery = await db.query.discoveries.findFirst({
    where: eq(discoveries.id, id),
  });

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  // Can only decide from OPEN or EXTENSION_REQUESTED status
  if (
    discovery.status !== DiscoveryStatus.OPEN &&
    discovery.status !== DiscoveryStatus.EXTENSION_REQUESTED
  ) {
    return redirect(`/discoveries/${id}`);
  }

  return json({ user, discovery });
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

  // Get discovery
  const discovery = await db.query.discoveries.findFirst({
    where: eq(discoveries.id, id),
  });

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  if (
    discovery.status !== DiscoveryStatus.OPEN &&
    discovery.status !== DiscoveryStatus.EXTENSION_REQUESTED
  ) {
    return json(
      { error: "OPEN 또는 EXTENSION_REQUESTED 상태의 Discovery만 결정할 수 있습니다" },
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
        pendingDecision: DiscoveryStatus.DEAD_END,
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
        pendingDecision: DiscoveryStatus.DEAD_END,
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
            decision: "DEAD_END",
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
    <div className="min-h-screen bg-gray-50">
      <MainNav user={user} />

      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">DEAD END 결정</h1>
          <p className="mt-2 text-sm text-gray-600">
            Discovery를 중단(DEAD END) 상태로 닫습니다
          </p>
        </div>

        {/* Discovery Info */}
        <div className="mb-6 rounded-lg bg-red-50 p-4">
          <h2 className="text-lg font-semibold text-red-900">{discovery.title}</h2>
          <p className="mt-2 text-sm text-red-800">{discovery.seedSummary}</p>
        </div>

        {actionData?.error && (
          <div className="mb-6 rounded-md bg-red-50 p-4 ring-1 ring-red-400">
            <p className="text-sm text-red-800">{actionData.error}</p>
          </div>
        )}

        <Form method="post" className="space-y-6 bg-white p-6 shadow sm:rounded-lg">
          <div className="rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">
              <strong>DEAD END 결정:</strong> 실패를 조직 자산으로 축적합니다.
              왜 작동하지 않았는지, 어떤 패턴으로 실패했는지 명확히 기록해야 합니다.
            </p>
          </div>

          {/* Decision Rationale */}
          <div>
            <label
              htmlFor="decisionRationale"
              className="block text-sm font-medium text-gray-700"
            >
              결정 근거 <span className="text-red-500">*</span>
            </label>
            <textarea
              name="decisionRationale"
              id="decisionRationale"
              required
              maxLength={400}
              rows={4}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-red-500 focus:outline-none focus:ring-red-500"
              placeholder="왜 중단하기로 했는지 기술합니다"
            />
            <p className="mt-1 text-xs text-gray-500">400자 이내</p>
          </div>

          <hr className="border-gray-200" />

          {/* Failure Pattern */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              실패 패턴 <span className="text-red-500">*</span> (1-3개 선택)
            </label>
            <p className="mt-1 text-xs text-gray-500">
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
                      className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                  </div>
                  <div className="ml-3 text-sm">
                    <label
                      htmlFor={`pattern_${pattern.id}`}
                      className="font-medium text-gray-700"
                    >
                      {pattern.label}
                    </label>
                    <p className="text-gray-500">{pattern.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Evidence Reason */}
          <div>
            <label
              htmlFor="deadEndEvidenceReason"
              className="block text-sm font-medium text-gray-700"
            >
              증거 기반 사유 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="deadEndEvidenceReason"
              id="deadEndEvidenceReason"
              required
              maxLength={200}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-red-500 focus:outline-none focus:ring-red-500"
              placeholder="예: 사용자 10명 테스트 결과 8명이 '불필요하다' 응답"
            />
            <p className="mt-1 text-xs text-gray-500">
              실패 판단의 근거 (200자 이내)
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3 border-t border-gray-200 pt-6">
            <a
              href={`/discoveries/${discovery.id}`}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              취소
            </a>
            <button
              type="submit"
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              승인 요청 (DEAD END)
            </button>
          </div>
        </Form>

        {/* Info */}
        <div className="mt-6 rounded-md bg-orange-50 p-4 text-sm text-orange-800">
          <p className="font-semibold">DEAD END 결정 후:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>상태: OPEN → DEAD END</li>
            <li>Discovery는 "닫힘" 상태가 됩니다</li>
            <li>실패 패턴이 태깅되어 조직 학습 자산으로 축적</li>
            <li>유사한 Seed 검색 시 "이미 실패한 사례"로 제안됨</li>
            <li>Monthly Failure Replay 회의에서 리뷰 대상이 됩니다</li>
          </ul>
        </div>

        <div className="mt-4 rounded-md bg-gray-50 p-4 text-sm text-gray-600">
          <p className="font-semibold">💡 실패를 자산으로 만드는 법:</p>
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
    </div>
  );
}
