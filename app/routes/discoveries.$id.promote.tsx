import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, experiments, users, eventLogs } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { eq } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import { DiscoveryValidationRules, PromoteToOpenSchema } from "~/lib/validation/discovery-rules";

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

  // Can only promote INBOX discoveries
  if (discovery.status !== DiscoveryStatus.INBOX) {
    return redirect(`/discoveries/${id}`);
  }

  // Get all users for Owner selection
  const allUsers = await db.select().from(users);

  return json({ user, discovery, allUsers });
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

  if (discovery.status !== DiscoveryStatus.INBOX) {
    return json({ error: "INBOX 상태의 Discovery만 승격할 수 있습니다" }, { status: 400 });
  }

  const formData = await request.formData();
  const ownerId = formData.get("ownerId");
  const reviewerId = formData.get("reviewerId") || null;
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
    const validated = PromoteToOpenSchema.parse({
      ownerId,
      firstExperiment: {
        hypothesis,
        minimalAction,
        deadline,
        expectedEvidence,
      },
    });

    // Additional validation: Owner required
    DiscoveryValidationRules.validateOwnerRequired(validated.ownerId);

    // Calculate due date (createdAt + 28 days)
    const dueDate = DiscoveryValidationRules.calculateDueDate(discovery.createdAt);

    // Create experiment
    const experimentId = crypto.randomUUID();
    await db.insert(experiments).values({
      id: experimentId,
      discoveryId: id,
      hypothesis: validated.firstExperiment.hypothesis,
      minimalAction: validated.firstExperiment.minimalAction,
      deadline: validated.firstExperiment.deadline,
      expectedEvidence: validated.firstExperiment.expectedEvidence,
    });

    // Update discovery status
    await db
      .update(discoveries)
      .set({
        status: DiscoveryStatus.OPEN,
        ownerId: validated.ownerId,
        reviewerId: reviewerId ? String(reviewerId) : null,
        dueDate,
        updatedAt: new Date(),
      })
      .where(eq(discoveries.id, id));

    // Create event log
    await db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId: user.id,
      discoveryId: id,
      eventType: "PROMOTE_OPEN",
      metadata: {
        ownerId: validated.ownerId,
        experimentId,
        dueDate: dueDate.toISOString(),
      },
    });

    return redirect(`/discoveries/${id}`);
  } catch (error: any) {
    return json(
      { error: error.message || "입력값이 유효하지 않습니다" },
      { status: 400 }
    );
  }
}

export default function PromoteToOpen() {
  const { user, discovery, allUsers } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  // Calculate default deadline (today + 7 days)
  const defaultDeadline = new Date();
  defaultDeadline.setDate(defaultDeadline.getDate() + 7);
  const defaultDeadlineStr = defaultDeadline.toISOString().split("T")[0];

  // Calculate expected due date (createdAt + 28 days)
  const expectedDueDate = new Date(discovery.createdAt);
  expectedDueDate.setDate(expectedDueDate.getDate() + 28);

  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav user={user} />

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">OPEN으로 승격</h1>
          <p className="mt-2 text-sm text-gray-600">
            Owner를 지정하고 첫 번째 실험을 등록하여 Discovery를 시작합니다
          </p>
        </div>

        {/* Discovery Info */}
        <div className="mb-6 rounded-lg bg-blue-50 p-4">
          <h2 className="text-lg font-semibold text-blue-900">{discovery.title}</h2>
          <p className="mt-2 text-sm text-blue-800">{discovery.seedSummary}</p>
          <div className="mt-3 flex items-center space-x-4 text-xs text-blue-700">
            <span>
              생성: {new Date(discovery.createdAt).toLocaleDateString("ko-KR")}
            </span>
            <span>
              → 예상 마감: {expectedDueDate.toLocaleDateString("ko-KR")} (28일)
            </span>
          </div>
        </div>

        {actionData?.error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{actionData.error}</p>
          </div>
        )}

        <Form method="post" className="space-y-6 bg-white p-6 shadow sm:rounded-lg">
          <div className="rounded-md bg-yellow-50 p-4">
            <p className="text-sm text-yellow-800">
              <strong>필수 조건:</strong> Owner 지정 + 첫 번째 Experiment 등록
            </p>
          </div>

          {/* Owner Selection */}
          <div>
            <label
              htmlFor="ownerId"
              className="block text-sm font-medium text-gray-700"
            >
              Owner 지정 <span className="text-red-500">*</span>
            </label>
            <select
              name="ownerId"
              id="ownerId"
              required
              defaultValue={user.id}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            >
              <option value="">선택하세요</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Discovery의 책임자 (실험, 문서, 결정 담당)
            </p>
          </div>

          {/* Reviewer Selection */}
          <div>
            <label
              htmlFor="reviewerId"
              className="block text-sm font-medium text-gray-700"
            >
              Reviewer 지정 (선택)
            </label>
            <select
              name="reviewerId"
              id="reviewerId"
              defaultValue=""
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            >
              <option value="">없음</option>
              {allUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Decision Review 시 검토를 담당할 사람 (권장)
            </p>
          </div>

          <hr className="border-gray-200" />

          <div>
            <h3 className="text-lg font-medium text-gray-900">첫 번째 Experiment</h3>
            <p className="mt-1 text-sm text-gray-500">
              가설을 검증하기 위한 최소 행동을 정의합니다
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
              placeholder="예: 사용자들은 검색 시간을 15분 → 3분으로 단축하고 싶어할 것이다"
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
              placeholder="예: 5명에게 프로토타입 보여주고 사용 시간 측정"
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
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
            <p className="mt-1 text-xs text-gray-500">
              기본 D+7일 (최대 Discovery 마감일까지)
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
              placeholder="예: 5명 중 3명 이상이 시간 단축 체감, 정량 데이터 로그"
            />
            <p className="mt-1 text-xs text-gray-500">200자 이내</p>
          </div>

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
              OPEN으로 승격
            </button>
          </div>
        </Form>

        {/* Info Box */}
        <div className="mt-6 rounded-md bg-gray-50 p-4 text-sm text-gray-600">
          <p className="font-semibold">승격 시 자동 설정:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>상태: INBOX → OPEN</li>
            <li>Discovery 마감일: {expectedDueDate.toLocaleDateString("ko-KR")} (생성일 + 28일)</li>
            <li>첫 번째 Experiment 등록 (최대 2개까지 추가 가능)</li>
            <li>EventLog 기록 (PROMOTE_OPEN)</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
