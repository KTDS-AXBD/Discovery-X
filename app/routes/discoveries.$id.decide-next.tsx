import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, evidence, eventLogs } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { eq } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import { DiscoveryValidationRules, NextDecisionSchema } from "~/lib/validation/discovery-rules";
import { getFormErrorMessage } from "~/lib/utils/form-error";

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

  try {
    // Validate using Zod schema
    const validated = NextDecisionSchema.parse({
      decisionRationale,
    });

    // Check evidence quality (warning only, not blocking)
    const validationResult = await DiscoveryValidationRules.validateNextDecision(db, id);

    // Update discovery
    await db
      .update(discoveries)
      .set({
        status: DiscoveryStatus.NEXT,
        decisionState: DiscoveryStatus.NEXT,
        decisionRationale: validated.decisionRationale,
        decidedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(discoveries.id, id));

    // Create event log
    await db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId: user.id,
      discoveryId: id,
      eventType: "DECIDE_NEXT",
      metadata: {
        decisionRationale: validated.decisionRationale,
        evidenceWarning: validationResult.warning || null,
      },
    });

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
    <div className="min-h-screen bg-gray-50">
      <MainNav user={user} />

      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">NEXT 결정</h1>
          <p className="mt-2 text-sm text-gray-600">
            Discovery를 전진(NEXT) 상태로 닫습니다
          </p>
        </div>

        {/* Discovery Info */}
        <div className="mb-6 rounded-lg bg-green-50 p-4">
          <h2 className="text-lg font-semibold text-green-900">{discovery.title}</h2>
          <p className="mt-2 text-sm text-green-800">{discovery.seedSummary}</p>
          <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:space-x-4 text-xs text-green-700">
            <span>전체 Evidence: {evidenceCount}개</span>
            <span>강한 Evidence (A/B급): {strongEvidenceCount}개</span>
          </div>
        </div>

        {/* Evidence Quality Warning */}
        {hasWarning && (
          <div className="mb-6 rounded-md bg-yellow-50 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg
                  className="h-5 w-5 text-yellow-400"
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
                <h3 className="text-sm font-medium text-yellow-800">근거 품질 경고</h3>
                <p className="mt-2 text-sm text-yellow-700">
                  강한 근거(A/B급)가 {strongEvidenceCount}개뿐입니다. NEXT 결정은 <strong>최소 2개</strong>의
                  A/B급 근거를 권장합니다.
                </p>
                <p className="mt-1 text-xs text-yellow-600">
                  (경고지만 결정은 가능합니다)
                </p>
              </div>
            </div>
          </div>
        )}

        {actionData?.error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{actionData.error}</p>
          </div>
        )}

        <Form method="post" className="space-y-6 bg-white p-6 shadow sm:rounded-lg">
          <div className="rounded-md bg-green-50 p-4">
            <p className="text-sm text-green-800">
              <strong>NEXT 결정:</strong> 이 Discovery를 다음 단계로 진행합니다.
              실행 계획, 예산 확보, 팀 편성 등 후속 작업으로 이어집니다.
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
              rows={5}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-green-500 focus:outline-none focus:ring-green-500"
              placeholder="왜 전진하기로 결정했는지, 어떤 근거가 충분했는지 기술합니다"
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
              className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              NEXT로 결정
            </button>
          </div>
        </Form>

        {/* Info */}
        <div className="mt-6 rounded-md bg-gray-50 p-4 text-sm text-gray-600">
          <p className="font-semibold">NEXT 결정 후:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>상태: OPEN → NEXT</li>
            <li>Discovery는 "닫힘" 상태가 됩니다</li>
            <li>후속 작업: 실행 계획 수립, 리소스 확보 등</li>
            <li>Weekly Review에서 제외됩니다</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
