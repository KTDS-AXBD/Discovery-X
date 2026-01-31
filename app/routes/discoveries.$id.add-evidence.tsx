import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, evidence, experiments } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { eq } from "drizzle-orm";
import { DiscoveryStatus, EvidenceType, EvidenceStrength } from "~/db/schema";
import { CreateEvidenceSchema } from "~/lib/validation/discovery-rules";
import { EVIDENCE_TYPES, EVIDENCE_STRENGTHS } from "~/lib/constants/failure-patterns";

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

  // Cannot add evidence to INBOX
  if (discovery.status === DiscoveryStatus.INBOX) {
    return redirect(`/discoveries/${id}`);
  }

  // Get experiments for linking
  const discoveryExperiments = await db
    .select()
    .from(experiments)
    .where(eq(experiments.discoveryId, id));

  return json({ user, discovery, experiments: discoveryExperiments });
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

  if (discovery.status === DiscoveryStatus.INBOX) {
    return json({ error: "INBOX 상태에서는 Evidence를 추가할 수 없습니다" }, { status: 400 });
  }

  const formData = await request.formData();
  const type = formData.get("type");
  const strength = formData.get("strength");
  const content = formData.get("content");
  const linkOrAttachment = formData.get("linkOrAttachment") || undefined;
  const experimentId = formData.get("experimentId") || undefined;

  try {
    // Validate using Zod schema
    const validated = CreateEvidenceSchema.parse({
      type,
      strength,
      content,
      linkOrAttachment,
      experimentId,
    });

    // Create evidence
    const evidenceId = crypto.randomUUID();
    await db.insert(evidence).values({
      id: evidenceId,
      discoveryId: id,
      experimentId: validated.experimentId || null,
      type: validated.type,
      strength: validated.strength,
      content: validated.content,
      linkOrAttachment: validated.linkOrAttachment || null,
      createdById: user.id,
    });

    // Update discovery updatedAt
    await db
      .update(discoveries)
      .set({ updatedAt: new Date() })
      .where(eq(discoveries.id, id));

    return redirect(`/discoveries/${id}`);
  } catch (error: any) {
    return json(
      { error: error.message || "입력값이 유효하지 않습니다" },
      { status: 400 }
    );
  }
}

export default function AddEvidence() {
  const { user, discovery, experiments } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav user={user} />

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Evidence 추가</h1>
          <p className="mt-2 text-sm text-gray-600">
            실험 결과나 관찰한 근거를 기록합니다
          </p>
        </div>

        {/* Discovery Info */}
        <div className="mb-6 rounded-lg bg-blue-50 p-4">
          <h2 className="text-lg font-semibold text-blue-900">{discovery.title}</h2>
          <p className="mt-2 text-sm text-blue-800">
            상태:{" "}
            <span className="font-semibold">
              {discovery.status === DiscoveryStatus.OPEN
                ? "진행 중"
                : discovery.status}
            </span>
          </p>
        </div>

        {actionData?.error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{actionData.error}</p>
          </div>
        )}

        <Form method="post" className="space-y-6 bg-white p-6 shadow sm:rounded-lg">
          {/* Evidence Type */}
          <div>
            <label
              htmlFor="type"
              className="block text-sm font-medium text-gray-700"
            >
              근거 유형 <span className="text-red-500">*</span>
            </label>
            <select
              name="type"
              id="type"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            >
              <option value="">선택하세요</option>
              {EVIDENCE_TYPES.map((evidenceType) => (
                <option key={evidenceType.id} value={evidenceType.id}>
                  {evidenceType.label} - {evidenceType.description}
                </option>
              ))}
            </select>
          </div>

          {/* Evidence Strength */}
          <div>
            <label
              htmlFor="strength"
              className="block text-sm font-medium text-gray-700"
            >
              근거 강도 <span className="text-red-500">*</span>
            </label>
            <select
              name="strength"
              id="strength"
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            >
              <option value="">선택하세요</option>
              {EVIDENCE_STRENGTHS.map((str) => (
                <option key={str.id} value={str.id}>
                  {str.label} - {str.description}
                </option>
              ))}
            </select>
          </div>

          {/* Content */}
          <div>
            <label
              htmlFor="content"
              className="block text-sm font-medium text-gray-700"
            >
              내용 <span className="text-red-500">*</span>
            </label>
            <textarea
              name="content"
              id="content"
              required
              maxLength={400}
              rows={4}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="근거 내용을 구체적으로 기술합니다"
            />
            <p className="mt-1 text-xs text-gray-500">400자 이내</p>
          </div>

          {/* Link or Attachment */}
          <div>
            <label
              htmlFor="linkOrAttachment"
              className="block text-sm font-medium text-gray-700"
            >
              링크 또는 첨부 (선택)
            </label>
            <input
              type="url"
              name="linkOrAttachment"
              id="linkOrAttachment"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="https://..."
            />
            <p className="mt-1 text-xs text-gray-500">
              데이터, 문서, 프로토타입 링크 등
            </p>
          </div>

          {/* Experiment Link */}
          {experiments.length > 0 && (
            <div>
              <label
                htmlFor="experimentId"
                className="block text-sm font-medium text-gray-700"
              >
                연결된 Experiment (선택)
              </label>
              <select
                name="experimentId"
                id="experimentId"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              >
                <option value="">없음 (Discovery 직접 연결)</option>
                {experiments.map((exp) => (
                  <option key={exp.id} value={exp.id}>
                    {exp.hypothesis.substring(0, 60)}
                    {exp.hypothesis.length > 60 ? "..." : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3 border-t border-gray-200 pt-6">
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
              Evidence 추가
            </button>
          </div>
        </Form>

        {/* Helper */}
        <div className="mt-6 rounded-md bg-gray-50 p-4 text-sm text-gray-600">
          <p className="font-semibold">Evidence 작성 팁:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              <strong>A급 (Hard):</strong> 재현 가능한 정량 데이터 (로그, A/B 테스트)
            </li>
            <li>
              <strong>B급 (Direct):</strong> 직접 관찰, 사용자 인터뷰
            </li>
            <li>
              <strong>C급 (Indirect):</strong> 경쟁사 사례, 논문, 벤치마크
            </li>
            <li>
              <strong>D급 (Intuition):</strong> 추론, 직관, 가정
            </li>
          </ul>
          <p className="mt-3 text-xs text-yellow-700">
            ⚠️ NEXT 결정은 A/B급 Evidence 2개 이상 권장됩니다
          </p>
        </div>
      </div>
    </div>
  );
}
