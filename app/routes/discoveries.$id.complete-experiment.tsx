import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, experiments, eventLogs } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { eq, and } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import { CompleteExperimentSchema } from "~/lib/validation/discovery-rules";

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

  const url = new URL(request.url);
  const experimentId = url.searchParams.get("experimentId");
  if (!experimentId) {
    return redirect(`/discoveries/${id}`);
  }

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
    return redirect(`/discoveries/${id}`);
  }

  const experiment = await db.query.experiments.findFirst({
    where: and(
      eq(experiments.id, experimentId),
      eq(experiments.discoveryId, id)
    ),
  });

  if (!experiment || experiment.completedAt) {
    return redirect(`/discoveries/${id}`);
  }

  return json({ user, discovery, experiment });
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

  const formData = await request.formData();
  const experimentId = formData.get("experimentId");
  const resultSummary = formData.get("resultSummary");

  if (!experimentId) {
    return json({ error: "실험 ID가 필요합니다" }, { status: 400 });
  }

  const experiment = await db.query.experiments.findFirst({
    where: and(
      eq(experiments.id, String(experimentId)),
      eq(experiments.discoveryId, id)
    ),
  });

  if (!experiment) {
    return json({ error: "실험을 찾을 수 없습니다" }, { status: 400 });
  }

  if (experiment.completedAt) {
    return json({ error: "이미 완료된 실험입니다" }, { status: 400 });
  }

  try {
    const validated = CompleteExperimentSchema.parse({ resultSummary });

    await db
      .update(experiments)
      .set({
        resultSummary: validated.resultSummary,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(experiments.id, String(experimentId)));

    await db
      .update(discoveries)
      .set({ updatedAt: new Date() })
      .where(eq(discoveries.id, id));

    await db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId: user.id,
      discoveryId: id,
      eventType: "COMPLETE_EXPERIMENT",
      metadata: {
        experimentId: String(experimentId),
        resultSummary: validated.resultSummary,
      },
    });

    return redirect(`/discoveries/${id}`);
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "입력값이 유효하지 않습니다";
    return json({ error: message }, { status: 400 });
  }
}

export default function CompleteExperiment() {
  const { user, discovery, experiment } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav user={user} />

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">실험 결과 기록</h1>
          <p className="mt-2 text-sm text-gray-600">
            실험의 결과를 기록하고 완료 처리합니다
          </p>
        </div>

        {/* Discovery Info */}
        <div className="mb-6 rounded-lg bg-blue-50 p-4">
          <h2 className="text-lg font-semibold text-blue-900">{discovery.title}</h2>
        </div>

        {/* Experiment Info */}
        <div className="mb-6 rounded-lg bg-gray-50 p-4">
          <h3 className="text-sm font-medium text-gray-900">실험 정보</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="font-medium text-gray-500">가설</dt>
              <dd className="mt-1 text-gray-900">{experiment.hypothesis}</dd>
            </div>
            <div>
              <dt className="font-medium text-gray-500">최소 행동</dt>
              <dd className="mt-1 text-gray-900">{experiment.minimalAction}</dd>
            </div>
            <div>
              <dt className="font-medium text-gray-500">예상 근거</dt>
              <dd className="mt-1 text-gray-900">{experiment.expectedEvidence}</dd>
            </div>
            <div>
              <dt className="font-medium text-gray-500">마감일</dt>
              <dd className="mt-1 text-gray-900">
                {new Date(experiment.deadline).toLocaleDateString("ko-KR")}
              </dd>
            </div>
          </dl>
        </div>

        {actionData?.error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{actionData.error}</p>
          </div>
        )}

        <Form method="post" className="space-y-6 bg-white p-6 shadow sm:rounded-lg">
          <input type="hidden" name="experimentId" value={experiment.id} />

          <div>
            <label
              htmlFor="resultSummary"
              className="block text-sm font-medium text-gray-700"
            >
              결과 요약 <span className="text-red-500">*</span>
            </label>
            <textarea
              name="resultSummary"
              id="resultSummary"
              required
              maxLength={400}
              rows={5}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="실험 결과를 요약합니다. 가설이 검증되었는지, 어떤 데이터/피드백을 얻었는지 기술합니다."
            />
            <p className="mt-1 text-xs text-gray-500">400자 이내</p>
          </div>

          <div className="flex justify-end space-x-3 border-t border-gray-200 pt-6">
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
              결과 기록 완료
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
