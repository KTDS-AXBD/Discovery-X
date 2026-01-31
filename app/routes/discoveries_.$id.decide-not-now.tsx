import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, eventLogs, users } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
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
        pendingDecision: DiscoveryStatus.NOT_NOW,
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
        pendingDecision: DiscoveryStatus.NOT_NOW,
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
        const env = context.cloudflare.env as Record<string, string>;
        if (env.RESEND_API_KEY) {
          const emailClient = createEmailClient(env.RESEND_API_KEY);
          const email = buildApprovalRequestEmail({
            discoveryId: id,
            discoveryTitle: discovery.title,
            ownerName: user.name,
            decision: "NOT_NOW",
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
    <div className="min-h-screen bg-gray-50">
      <MainNav user={user} />

      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">NOT NOW 결정</h1>
          <p className="mt-2 text-sm text-gray-600">
            Discovery를 보류(NOT NOW) 상태로 닫습니다
          </p>
        </div>

        {/* Discovery Info */}
        <div className="mb-6 rounded-lg bg-gray-50 p-4">
          <h2 className="text-lg font-semibold text-gray-900">{discovery.title}</h2>
          <p className="mt-2 text-sm text-gray-800">{discovery.seedSummary}</p>
        </div>

        {actionData?.error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{actionData.error}</p>
          </div>
        )}

        <Form method="post" className="space-y-6 bg-white p-6 shadow sm:rounded-lg">
          <div className="rounded-md bg-yellow-50 p-4">
            <p className="text-sm text-yellow-800">
              <strong>NOT NOW 결정:</strong> 지금은 아니지만, 특정 조건이 충족되면 재검토합니다.
              트리거 조건과 재검토 날짜를 명확히 지정해야 합니다.
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
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="왜 지금은 진행하지 않기로 했는지 기술합니다"
            />
            <p className="mt-1 text-xs text-gray-500">400자 이내</p>
          </div>

          <hr className="border-gray-200" />

          {/* Trigger Type */}
          <div>
            <label
              htmlFor="notNowTriggerType"
              className="block text-sm font-medium text-gray-700"
            >
              트리거 유형 <span className="text-red-500">*</span>
            </label>
            <select
              name="notNowTriggerType"
              id="notNowTriggerType"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            >
              <option value="">선택하세요</option>
              {TRIGGER_TYPES.map((trigger) => (
                <option key={trigger.id} value={trigger.id}>
                  {trigger.label} - {trigger.description}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              재검토를 촉발하는 조건의 종류
            </p>
          </div>

          {/* Trigger Condition */}
          <div>
            <label
              htmlFor="notNowTriggerCondition"
              className="block text-sm font-medium text-gray-700"
            >
              트리거 조건 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="notNowTriggerCondition"
              id="notNowTriggerCondition"
              required
              maxLength={200}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="예: WebGPU 브라우저 지원률 80% 도달"
            />
            <p className="mt-1 text-xs text-gray-500">
              구체적인 조건 (200자 이내)
            </p>
          </div>

          {/* Revisit Date */}
          <div>
            <label
              htmlFor="revisitDate"
              className="block text-sm font-medium text-gray-700"
            >
              재검토 날짜 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="revisitDate"
              id="revisitDate"
              required
              defaultValue={defaultRevisitDateStr}
              min={new Date().toISOString().split("T")[0]}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              이 날짜에 Recall Queue에 자동 등재됩니다 (기본: 3개월 후)
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
              className="rounded-md bg-gray-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            >
              승인 요청 (NOT NOW)
            </button>
          </div>
        </Form>

        {/* Trigger Examples */}
        <div className="mt-6 rounded-md bg-gray-50 p-4 text-sm text-gray-600">
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
        <div className="mt-4 rounded-md bg-blue-50 p-4 text-sm text-blue-700">
          <p className="font-semibold">NOT NOW 결정 후:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>상태: OPEN → NOT NOW</li>
            <li>Discovery는 "닫힘" 상태가 됩니다</li>
            <li>재검토 날짜에 Recall Queue에 자동 등재</li>
            <li>유사한 Seed 검색 시 참고용으로 제안될 수 있음</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
