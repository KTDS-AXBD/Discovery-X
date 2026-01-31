import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, experiments, eventLogs, users } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { eq, count } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import {
  DiscoveryValidationRules,
  ExtensionRequestedSchema,
} from "~/lib/validation/discovery-rules";
import { getFormErrorMessage } from "~/lib/utils/form-error";
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

  const discovery = await db.query.discoveries.findFirst({
    where: eq(discoveries.id, id),
  });

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  // Can only request extension from OPEN status
  if (discovery.status !== DiscoveryStatus.OPEN) {
    return redirect(`/discoveries/${id}`);
  }

  // Must have exactly 2 experiments
  const experimentCount = await db
    .select({ count: count() })
    .from(experiments)
    .where(eq(experiments.discoveryId, id));

  const currentCount = experimentCount[0]?.count || 0;

  if (currentCount < 2) {
    return redirect(`/discoveries/${id}`);
  }

  return json({ user, discovery, experimentCount: currentCount });
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

  if (discovery.status !== DiscoveryStatus.OPEN) {
    return json(
      { error: "OPEN 상태의 Discovery만 연장 요청할 수 있습니다" },
      { status: 400 }
    );
  }

  // Verify 2 experiments exist
  const experimentCount = await db
    .select({ count: count() })
    .from(experiments)
    .where(eq(experiments.discoveryId, id));

  if ((experimentCount[0]?.count || 0) < 2) {
    return json(
      { error: "실험이 2개 이상이어야 연장 요청할 수 있습니다" },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const extensionRationale = formData.get("extensionRationale");

  try {
    // Validate reviewer assigned
    DiscoveryValidationRules.validateReviewerRequired(discovery.reviewerId);
    // Block duplicate pending
    DiscoveryValidationRules.validateNoApprovalPending(discovery.approvalStatus);

    const validated = ExtensionRequestedSchema.parse({
      extensionRationale,
    });

    // Calculate new due date (+14 days)
    const currentDueDate = discovery.dueDate
      ? new Date(discovery.dueDate)
      : new Date();
    const newDueDate =
      DiscoveryValidationRules.calculateExtensionDueDate(currentDueDate);

    // Save as PENDING instead of directly applying
    await db
      .update(discoveries)
      .set({
        approvalStatus: "PENDING",
        pendingDecision: DiscoveryStatus.EXTENSION_REQUESTED,
        pendingDecisionData: {
          extensionRationale: validated.extensionRationale,
          previousDueDate: discovery.dueDate
            ? new Date(discovery.dueDate).toISOString()
            : null,
          newDueDate: newDueDate.toISOString(),
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
        pendingDecision: DiscoveryStatus.EXTENSION_REQUESTED,
        extensionRationale: validated.extensionRationale,
        previousDueDate: discovery.dueDate
          ? new Date(discovery.dueDate).toISOString()
          : null,
        newDueDate: newDueDate.toISOString(),
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
            decision: "EXTENSION_REQUESTED",
          });
          await emailClient.send({ to: reviewerUser.email, ...email });
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

export default function RequestExtension() {
  const { user, discovery, experimentCount } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav user={user} />

      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">연장 요청</h1>
          <p className="mt-2 text-sm text-gray-600">
            3번째 실험을 위해 Discovery 기한을 연장합니다
          </p>
        </div>

        {/* Discovery Info */}
        <div className="mb-6 rounded-lg bg-purple-50 p-4">
          <h2 className="text-lg font-semibold text-purple-900">
            {discovery.title}
          </h2>
          <p className="mt-2 text-sm text-purple-800">
            {discovery.seedSummary}
          </p>
          <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:space-x-4 text-xs text-purple-700">
            <span>실험 수: {experimentCount}/2</span>
            {discovery.dueDate && (
              <span>
                현재 마감일:{" "}
                {new Date(discovery.dueDate).toLocaleDateString("ko-KR")}
              </span>
            )}
          </div>
        </div>

        {actionData?.error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{actionData.error}</p>
          </div>
        )}

        <Form
          method="post"
          className="space-y-6 bg-white p-6 shadow sm:rounded-lg"
        >
          <div className="rounded-md bg-purple-50 p-4">
            <p className="text-sm text-purple-800">
              <strong>연장 요청:</strong> 2회 실험을 모두 소진했지만 추가
              탐색이 필요한 경우, 기한을 14일 연장하고 3번째 실험을 추가할 수
              있습니다.
            </p>
          </div>

          {/* Extension Rationale */}
          <div>
            <label
              htmlFor="extensionRationale"
              className="block text-sm font-medium text-gray-700"
            >
              연장 사유 <span className="text-red-500">*</span>
            </label>
            <textarea
              name="extensionRationale"
              id="extensionRationale"
              required
              maxLength={400}
              rows={5}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-purple-500 focus:outline-none focus:ring-purple-500"
              placeholder="왜 추가 실험이 필요한지, 기존 2회 실험에서 무엇을 배웠고 3번째 실험으로 무엇을 확인하려 하는지 기술합니다"
            />
            <p className="mt-1 text-xs text-gray-500">400자 이내</p>
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
              className="rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2"
            >
              승인 요청 (연장)
            </button>
          </div>
        </Form>

        {/* Info */}
        <div className="mt-6 rounded-md bg-gray-50 p-4 text-sm text-gray-600">
          <p className="font-semibold">연장 요청 후:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>상태: OPEN → EXTENSION_REQUESTED</li>
            <li>마감일이 현재 기준 +14일 연장됩니다</li>
            <li>3번째 실험을 추가할 수 있습니다</li>
            <li>
              이후 NEXT / NOT NOW / DEAD END 결정이 가능합니다
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
