import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, experiments } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { eq, count } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import { DiscoveryValidationRules, CreateExperimentSchema } from "~/lib/validation/discovery-rules";
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

  // Can only add experiments to OPEN or EXTENSION_REQUESTED discoveries
  if (
    discovery.status !== DiscoveryStatus.OPEN &&
    discovery.status !== DiscoveryStatus.EXTENSION_REQUESTED
  ) {
    return redirect(`/discoveries/${id}`);
  }

  // Check experiment count
  const experimentCount = await db
    .select({ count: count() })
    .from(experiments)
    .where(eq(experiments.discoveryId, id));

  const currentCount = experimentCount[0]?.count || 0;
  const maxExperiments =
    discovery.status === DiscoveryStatus.EXTENSION_REQUESTED ? 3 : 2;

  if (currentCount >= maxExperiments) {
    return redirect(`/discoveries/${id}`);
  }

  return json({ user, discovery, currentCount });
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
      { error: "OPEN 또는 EXTENSION_REQUESTED 상태의 Discovery만 실험을 추가할 수 있습니다" },
      { status: 400 }
    );
  }

  // Validate experiment limit (max 2, or max 3 if EXTENSION_REQUESTED)
  if (discovery.status === DiscoveryStatus.EXTENSION_REQUESTED) {
    const expCount = await db
      .select({ count: count() })
      .from(experiments)
      .where(eq(experiments.discoveryId, id));
    if ((expCount[0]?.count || 0) >= 3) {
      return json(
        { error: "연장 상태에서도 최대 3개 실험만 가능합니다." },
        { status: 400 }
      );
    }
  } else {
    try {
      await DiscoveryValidationRules.validateExperimentLimit(db, id);
    } catch (error: unknown) {
      return json({ error: getFormErrorMessage(error, "실험 제한 초과") }, { status: 400 });
    }
  }

  const formData = await request.formData();
  const hypothesis = formData.get("hypothesis");
  const minimalAction = formData.get("minimalAction");
  const deadlineStr = formData.get("deadline");
  const expectedEvidence = formData.get("expectedEvidence");

  try {
    // Parse deadline
    const deadline = deadlineStr ? new Date(String(deadlineStr)) : null;
    if (!deadline) {
      throw new Error("실험 마감일을 입력해주세요");
    }

    // Validate using Zod schema
    const validated = CreateExperimentSchema.parse({
      hypothesis,
      minimalAction,
      deadline,
      expectedEvidence,
    });

    // Create experiment
    const experimentId = crypto.randomUUID();
    await db.insert(experiments).values({
      id: experimentId,
      discoveryId: id,
      hypothesis: validated.hypothesis,
      minimalAction: validated.minimalAction,
      deadline: validated.deadline,
      expectedEvidence: validated.expectedEvidence,
    });

    // Update discovery updatedAt
    await db
      .update(discoveries)
      .set({ updatedAt: new Date() })
      .where(eq(discoveries.id, id));

    return redirect(`/discoveries/${id}`);
  } catch (error: unknown) {
    return json(
      { error: getFormErrorMessage(error) },
      { status: 400 }
    );
  }
}

export default function AddExperiment() {
  const { user, discovery, currentCount } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  // Calculate default deadline (today + 7 days)
  const defaultDeadline = new Date();
  defaultDeadline.setDate(defaultDeadline.getDate() + 7);
  const defaultDeadlineStr = defaultDeadline.toISOString().split("T")[0];

  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav user={user} />

      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Experiment 추가</h1>
          <p className="mt-2 text-sm text-gray-600">
            두 번째 실험을 등록합니다 (현재: {currentCount}/2)
          </p>
        </div>

        {/* Discovery Info */}
        <div className="mb-6 rounded-lg bg-blue-50 p-4">
          <h2 className="text-lg font-semibold text-blue-900">{discovery.title}</h2>
          <p className="mt-2 text-sm text-blue-800">{discovery.seedSummary}</p>
        </div>

        {actionData?.error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{actionData.error}</p>
          </div>
        )}

        <Form method="post" className="space-y-6 bg-white p-6 shadow sm:rounded-lg">
          <div className="rounded-md bg-yellow-50 p-4">
            <p className="text-sm text-yellow-800">
              <strong>주의:</strong> Discovery당 최대 2개의 실험만 가능합니다.
              3번째 실험은 Reviewer 승인이 필요합니다.
            </p>
          </div>

          {/* Hypothesis */}
          <div>
            <label
              htmlFor="hypothesis"
              className="block text-sm font-medium text-gray-700"
            >
              가설 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="hypothesis"
              id="hypothesis"
              required
              maxLength={200}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="예: 대시보드 UI를 개선하면 사용자 만족도가 향상될 것이다"
            />
            <p className="mt-1 text-xs text-gray-500">200자 이내</p>
          </div>

          {/* Minimal Action */}
          <div>
            <label
              htmlFor="minimalAction"
              className="block text-sm font-medium text-gray-700"
            >
              최소 행동 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="minimalAction"
              id="minimalAction"
              required
              maxLength={200}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="예: Figma 프로토타입 제작 후 5명 사용자 테스트"
            />
            <p className="mt-1 text-xs text-gray-500">200자 이내</p>
          </div>

          {/* Deadline */}
          <div>
            <label
              htmlFor="deadline"
              className="block text-sm font-medium text-gray-700"
            >
              실험 마감일 <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              name="deadline"
              id="deadline"
              required
              defaultValue={defaultDeadlineStr}
              max={discovery.dueDate ? new Date(discovery.dueDate).toISOString().split("T")[0] : undefined}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              Discovery 마감일:{" "}
              {discovery.dueDate
                ? new Date(discovery.dueDate).toLocaleDateString("ko-KR")
                : "미정"}
            </p>
          </div>

          {/* Expected Evidence */}
          <div>
            <label
              htmlFor="expectedEvidence"
              className="block text-sm font-medium text-gray-700"
            >
              예상 근거 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="expectedEvidence"
              id="expectedEvidence"
              required
              maxLength={200}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="예: 사용자 만족도 점수 3.5 → 4.0 이상 향상"
            />
            <p className="mt-1 text-xs text-gray-500">200자 이내</p>
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
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              실험 추가
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
