import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, experiments, evidence, users, eventLogs } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { eq } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";

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

  // Get owner and reviewer
  const owner = discovery.ownerId
    ? await db.query.users.findFirst({ where: eq(users.id, discovery.ownerId) })
    : null;

  const reviewer = discovery.reviewerId
    ? await db.query.users.findFirst({ where: eq(users.id, discovery.reviewerId) })
    : null;

  // Get experiments
  const discoveryExperiments = await db
    .select()
    .from(experiments)
    .where(eq(experiments.discoveryId, id));

  // Get evidence
  const discoveryEvidence = await db
    .select()
    .from(evidence)
    .where(eq(evidence.discoveryId, id));

  // Get all users for Owner selection
  const allUsers = await db.select().from(users);

  return json({
    user,
    discovery,
    owner,
    reviewer,
    experiments: discoveryExperiments,
    evidence: discoveryEvidence,
    allUsers,
  });
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

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "changeOwner") {
    if (discovery.status !== DiscoveryStatus.INBOX && discovery.status !== DiscoveryStatus.OPEN) {
      return json({ error: "INBOX/OPEN 상태에서만 Owner를 변경할 수 있습니다" }, { status: 400 });
    }
    const newOwnerId = formData.get("ownerId");
    if (!newOwnerId) {
      return json({ error: "Owner를 선택해주세요" }, { status: 400 });
    }
    await db
      .update(discoveries)
      .set({ ownerId: String(newOwnerId), updatedAt: new Date() })
      .where(eq(discoveries.id, id));

    await db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId: user.id,
      discoveryId: id,
      eventType: "CHANGE_OWNER",
      metadata: { previousOwnerId: discovery.ownerId, newOwnerId: String(newOwnerId) },
    });

    return redirect(`/discoveries/${id}`);
  }

  if (intent === "changeReviewer") {
    if (discovery.status !== DiscoveryStatus.INBOX && discovery.status !== DiscoveryStatus.OPEN) {
      return json({ error: "INBOX/OPEN 상태에서만 Reviewer를 변경할 수 있습니다" }, { status: 400 });
    }
    const newReviewerId = formData.get("reviewerId") || null;
    await db
      .update(discoveries)
      .set({ reviewerId: newReviewerId ? String(newReviewerId) : null, updatedAt: new Date() })
      .where(eq(discoveries.id, id));

    return redirect(`/discoveries/${id}`);
  }

  return json({ error: "알 수 없는 요청입니다" }, { status: 400 });
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  [DiscoveryStatus.INBOX]: { label: "Inbox", color: "bg-blue-100 text-blue-800" },
  [DiscoveryStatus.OPEN]: { label: "진행 중", color: "bg-yellow-100 text-yellow-800" },
  [DiscoveryStatus.NEXT]: { label: "전진", color: "bg-green-100 text-green-800" },
  [DiscoveryStatus.NOT_NOW]: { label: "보류", color: "bg-gray-100 text-gray-800" },
  [DiscoveryStatus.DEAD_END]: { label: "중단", color: "bg-red-100 text-red-800" },
  [DiscoveryStatus.EXTENSION_REQUESTED]: {
    label: "연장 요청",
    color: "bg-purple-100 text-purple-800",
  },
};

export default function DiscoveryDetail() {
  const { user, discovery, owner, reviewer, experiments, evidence, allUsers } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const canPromoteToOpen = discovery.status === DiscoveryStatus.INBOX;
  const canEdit =
    discovery.status === DiscoveryStatus.INBOX || discovery.status === DiscoveryStatus.OPEN;
  const canChangeOwnership = canEdit;
  const isActive =
    discovery.status === DiscoveryStatus.OPEN ||
    discovery.status === DiscoveryStatus.EXTENSION_REQUESTED;
  const completedExperiments = experiments.filter((e) => e.completedAt);
  const maxExperiments =
    discovery.status === DiscoveryStatus.EXTENSION_REQUESTED ? 3 : 2;
  const isOverdue =
    isActive && discovery.dueDate && new Date(discovery.dueDate) < new Date();

  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav user={user} />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-3">
                <h1 className="text-2xl font-bold text-gray-900">{discovery.title}</h1>
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${
                    STATUS_LABELS[discovery.status]?.color || "bg-gray-100 text-gray-800"
                  }`}
                >
                  {STATUS_LABELS[discovery.status]?.label || discovery.status}
                </span>
              </div>
              <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                <span>Owner: {owner?.name || "미지정"}</span>
                <span>Reviewer: {reviewer?.name || "미지정"}</span>
                <span>생성: {new Date(discovery.createdAt).toLocaleDateString("ko-KR")}</span>
                {discovery.dueDate && (
                  <span className="text-red-600">
                    마감: {new Date(discovery.dueDate).toLocaleDateString("ko-KR")}
                  </span>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:mt-0 sm:flex-row sm:gap-3">
              {canEdit && (
                <Link
                  to={`/discoveries/${discovery.id}/edit`}
                  className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                >
                  편집
                </Link>
              )}
              {canPromoteToOpen && (
                <Link
                  to={`/discoveries/${discovery.id}/promote`}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                >
                  OPEN으로 승격
                </Link>
              )}
              {(discovery.status === DiscoveryStatus.OPEN ||
                discovery.status === DiscoveryStatus.EXTENSION_REQUESTED) && (
                <>
                  {discovery.status === DiscoveryStatus.OPEN &&
                    experiments.length >= 2 && (
                      <Link
                        to={`/discoveries/${discovery.id}/request-extension`}
                        className="rounded-md bg-purple-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-purple-700"
                      >
                        연장 요청
                      </Link>
                    )}
                  <Link
                    to={`/discoveries/${discovery.id}/decide-next`}
                    className="rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-green-700"
                  >
                    NEXT 결정
                  </Link>
                  <Link
                    to={`/discoveries/${discovery.id}/decide-not-now`}
                    className="rounded-md bg-gray-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-gray-700"
                  >
                    NOT NOW 결정
                  </Link>
                  <Link
                    to={`/discoveries/${discovery.id}/decide-dead-end`}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
                  >
                    DEAD END 결정
                  </Link>
                </>
              )}
              <a
                href={`/api/export/brief/${discovery.id}`}
                className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
                download
              >
                Brief 다운로드
              </a>
              <Link
                to="/discoveries"
                className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              >
                목록으로
              </Link>
            </div>
          </div>
        </div>

        {/* Overdue Warning */}
        {isOverdue && (
          <div className="mb-6 rounded-lg border-2 border-red-300 bg-red-50 p-4">
            <div className="flex items-center">
              <svg className="h-5 w-5 text-red-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
              </svg>
              <p className="ml-2 text-sm font-semibold text-red-800">
                기한 초과. 결정을 내려주세요.
              </p>
            </div>
          </div>
        )}

        {/* Seed Information */}
        <div className="mb-6 rounded-lg bg-white p-6 shadow">
          <h2 className="text-lg font-semibold text-gray-900">Seed 정보</h2>
          <div className="mt-4 space-y-4">
            <div>
              <dt className="text-sm font-medium text-gray-500">요약</dt>
              <dd className="mt-1 text-sm text-gray-900">{discovery.seedSummary}</dd>
            </div>
            {discovery.seedLinks && discovery.seedLinks.length > 0 && (
              <div>
                <dt className="text-sm font-medium text-gray-500">참고 링크</dt>
                <dd className="mt-1 space-y-1">
                  {discovery.seedLinks.map((link, idx) => (
                    <a
                      key={idx}
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm text-blue-600 hover:text-blue-800"
                    >
                      {link}
                    </a>
                  ))}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-gray-500">출처 유형</dt>
              <dd className="mt-1 text-sm text-gray-900">{discovery.sourceType}</dd>
            </div>
          </div>
        </div>

        {/* Owner/Reviewer Management */}
        {canChangeOwnership && (
          <div className="mb-6 rounded-lg bg-white p-6 shadow">
            <h2 className="text-lg font-semibold text-gray-900">담당자 관리</h2>
            {actionData?.error && (
              <div className="mt-3 rounded-md bg-red-50 p-3">
                <p className="text-sm text-red-800">{actionData.error}</p>
              </div>
            )}
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Form method="post">
                <input type="hidden" name="intent" value="changeOwner" />
                <label className="block text-sm font-medium text-gray-700">Owner</label>
                <div className="mt-1 flex space-x-2">
                  <select
                    name="ownerId"
                    defaultValue={discovery.ownerId || ""}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  >
                    <option value="">미지정</option>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    변경
                  </button>
                </div>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="changeReviewer" />
                <label className="block text-sm font-medium text-gray-700">Reviewer</label>
                <div className="mt-1 flex space-x-2">
                  <select
                    name="reviewerId"
                    defaultValue={discovery.reviewerId || ""}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
                  >
                    <option value="">없음</option>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="whitespace-nowrap rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    변경
                  </button>
                </div>
              </Form>
            </div>
          </div>
        )}

        {/* Experiments */}
        <div className="mb-6 rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Experiments ({experiments.length}/{maxExperiments})
              </h2>
              {experiments.length > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  {completedExperiments.length}/{experiments.length} 완료
                </p>
              )}
            </div>
            {((discovery.status === DiscoveryStatus.OPEN && experiments.length < 2) ||
              (discovery.status === DiscoveryStatus.EXTENSION_REQUESTED &&
                experiments.length < 3)) && (
              <Link
                to={`/discoveries/${discovery.id}/add-experiment`}
                className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
              >
                실험 추가
              </Link>
            )}
          </div>
          {experiments.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">
              아직 실험이 없습니다.
              {canPromoteToOpen && " OPEN으로 승격하면서 첫 실험을 등록하세요."}
            </p>
          ) : (
            <div className="mt-4 space-y-4">
              {experiments.map((exp) => (
                <div
                  key={exp.id}
                  className={`border-l-4 pl-4 ${exp.completedAt ? "border-green-500" : "border-blue-500"}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-gray-900">가설: {exp.hypothesis}</h3>
                      <p className="mt-1 text-sm text-gray-600">행동: {exp.minimalAction}</p>
                      <p className="mt-1 text-sm text-gray-500">
                        예상 근거: {exp.expectedEvidence}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        마감: {new Date(exp.deadline).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                    <div className="ml-3 flex flex-col items-end gap-1">
                      {exp.completedAt ? (
                        <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-800">
                          완료
                        </span>
                      ) : (
                        isActive && (
                          <Link
                            to={`/discoveries/${discovery.id}/complete-experiment?experimentId=${exp.id}`}
                            className="rounded bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800 hover:bg-yellow-200"
                          >
                            결과 기록
                          </Link>
                        )
                      )}
                    </div>
                  </div>
                  {exp.resultSummary && (
                    <p className="mt-2 text-sm text-gray-700">결과: {exp.resultSummary}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Evidence */}
        <div className="rounded-lg bg-white p-6 shadow">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Evidence ({evidence.length})
            </h2>
            {discovery.status !== DiscoveryStatus.INBOX && (
              <Link
                to={`/discoveries/${discovery.id}/add-evidence`}
                className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
              >
                근거 추가
              </Link>
            )}
          </div>
          {evidence.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">아직 근거가 없습니다.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {evidence.map((ev) => (
                <div
                  key={ev.id}
                  className={`rounded-md border p-3 ${
                    ev.type === "ASSUMPTION" ? "border-yellow-300 bg-yellow-50" : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-semibold text-gray-500">{ev.type}</span>
                        <span
                          className={`rounded px-2 py-0.5 text-xs font-semibold ${
                            ev.strength === "A"
                              ? "bg-green-100 text-green-800"
                              : ev.strength === "B"
                                ? "bg-blue-100 text-blue-800"
                                : ev.strength === "C"
                                  ? "bg-yellow-100 text-yellow-800"
                                  : "bg-red-100 text-red-800"
                          }`}
                        >
                          {ev.strength}급
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-gray-900">{ev.content}</p>
                      {ev.linkOrAttachment && (
                        <a
                          href={ev.linkOrAttachment}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 block text-xs text-blue-600 hover:text-blue-800"
                        >
                          {ev.linkOrAttachment}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
