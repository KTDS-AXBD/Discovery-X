import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, users } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { eq, and, lte } from "drizzle-orm";
import { DiscoveryStatus, TriggerType } from "~/db/schema";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  // Get all NOT_NOW discoveries where revisitDate <= today
  const now = new Date();
  const notNowDiscoveries = await db
    .select()
    .from(discoveries)
    .where(
      and(
        eq(discoveries.status, DiscoveryStatus.NOT_NOW),
        lte(discoveries.revisitDate, now)
      )
    );

  // Enrich with owner info
  const discoveryList = await Promise.all(
    notNowDiscoveries.map(async (discovery) => {
      const owner = discovery.ownerId
        ? await db.query.users.findFirst({
            where: eq(users.id, discovery.ownerId),
          })
        : null;

      // Calculate days since revisit date was supposed to trigger
      const daysSinceRevisit = discovery.revisitDate
        ? Math.floor(
            (Date.now() - new Date(discovery.revisitDate).getTime()) / (1000 * 60 * 60 * 24)
          )
        : 0;

      return {
        ...discovery,
        ownerName: owner?.name,
        daysSinceRevisit,
      };
    })
  );

  // Sort by revisitDate ascending (oldest first)
  discoveryList.sort((a, b) => {
    const dateA = a.revisitDate ? new Date(a.revisitDate).getTime() : 0;
    const dateB = b.revisitDate ? new Date(b.revisitDate).getTime() : 0;
    return dateA - dateB;
  });

  return json({ user, discoveries: discoveryList });
}

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  [TriggerType.TECHNOLOGY_MATURITY]: "기술 성숙도",
  [TriggerType.POLICY_REGULATION]: "정책/규제",
  [TriggerType.CUSTOMER_BEHAVIOR]: "고객 행동",
  [TriggerType.INTERNAL_CAPABILITY]: "내부 역량",
};

export default function RecallQueue() {
  const { user, discoveries } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav user={user} />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="sm:flex sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Recall Queue</h1>
            <p className="mt-2 text-sm text-gray-700">
              재검토 날짜가 도래한 NOT_NOW Discovery 목록
            </p>
          </div>
          <div className="mt-4 sm:mt-0">
            <div className="text-sm text-gray-500">
              총 <span className="font-semibold text-gray-900">{discoveries.length}</span>개 재검토 대기
            </div>
          </div>
        </div>

        {/* Discovery List - Mobile Cards */}
        <div className="mt-8 space-y-3 sm:hidden">
          {discoveries.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">
              재검토 대기 중인 Discovery가 없습니다.
            </p>
          ) : (
            discoveries.map((discovery) => (
              <Link
                key={discovery.id}
                to={`/discoveries/${discovery.id}`}
                className={`block rounded-lg p-4 shadow ${
                  discovery.daysSinceRevisit > 7
                    ? "bg-yellow-50"
                    : discovery.daysSinceRevisit > 0
                    ? "bg-blue-50"
                    : "bg-white"
                }`}
              >
                <h3 className="text-sm font-medium text-gray-900">{discovery.title}</h3>
                <div className="mt-2 space-y-1 text-xs text-gray-500">
                  <p>{discovery.ownerName || "미지정"}</p>
                  {discovery.revisitDate && (
                    <p>
                      재검토: {new Date(discovery.revisitDate).toLocaleDateString("ko-KR")}
                      {discovery.daysSinceRevisit > 0 && ` (${discovery.daysSinceRevisit}일 경과)`}
                    </p>
                  )}
                  {discovery.notNowTriggerType && (
                    <p>
                      {TRIGGER_TYPE_LABELS[discovery.notNowTriggerType] || discovery.notNowTriggerType}
                    </p>
                  )}
                </div>
              </Link>
            ))
          )}
        </div>

        {/* Discovery List - Desktop Table */}
        <div className="mt-8 hidden flow-root sm:block">
          <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
            <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
              <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                <table className="min-w-full divide-y divide-gray-300 bg-white">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-900 sm:pl-6">
                        제목
                      </th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Original Owner
                      </th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        재검토 날짜
                      </th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        트리거 유형
                      </th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        트리거 조건
                      </th>
                      <th className="relative py-3.5 pl-3 pr-4 sm:pr-6">
                        <span className="sr-only">액션</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {discoveries.length === 0 ? (
                      <tr>
                        <td
                          colSpan={6}
                          className="py-12 text-center text-sm text-gray-500"
                        >
                          재검토 대기 중인 Discovery가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      discoveries.map((discovery) => (
                        <tr
                          key={discovery.id}
                          className={
                            discovery.daysSinceRevisit > 7
                              ? "bg-yellow-50"
                              : discovery.daysSinceRevisit > 0
                              ? "bg-blue-50"
                              : ""
                          }
                        >
                          <td className="max-w-xs truncate py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                            <Link
                              to={`/discoveries/${discovery.id}`}
                              className="hover:text-blue-600"
                            >
                              {discovery.title}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {discovery.ownerName || "—"}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {discovery.revisitDate ? (
                              <div>
                                <div>
                                  {new Date(discovery.revisitDate).toLocaleDateString("ko-KR")}
                                </div>
                                {discovery.daysSinceRevisit > 0 && (
                                  <span className="text-xs text-gray-500">
                                    ({discovery.daysSinceRevisit}일 경과)
                                  </span>
                                )}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {discovery.notNowTriggerType
                              ? TRIGGER_TYPE_LABELS[discovery.notNowTriggerType] ||
                                discovery.notNowTriggerType
                              : "—"}
                          </td>
                          <td className="max-w-xs truncate px-3 py-4 text-sm text-gray-500">
                            {discovery.notNowTriggerCondition || "—"}
                          </td>
                          <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                            <Link
                              to={`/discoveries/${discovery.id}`}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              재평가하기
                            </Link>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Tips */}
        <div className="mt-6 rounded-lg border border-purple-200 bg-purple-50 p-4">
          <h3 className="text-sm font-medium text-purple-900">💡 Recall Queue 사용법</h3>
          <ul className="mt-2 space-y-1 text-sm text-purple-800">
            <li>• 가장 오래된 재검토 날짜(맨 위)부터 확인하세요</li>
            <li>• 트리거 조건이 충족되었는지 평가하세요</li>
            <li>• "재평가하기"를 클릭하여 NEXT, NOT_NOW(날짜 변경), DEAD_END 중 선택하세요</li>
            <li>• 노란색 배경: 재검토 날짜로부터 7일 이상 경과 (우선 처리 필요)</li>
          </ul>
        </div>

        {/* Trigger Type Reference */}
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-medium text-gray-900">트리거 유형 참고</h3>
          <dl className="mt-2 grid grid-cols-2 gap-4 text-sm">
            {Object.entries(TRIGGER_TYPE_LABELS).map(([key, label]) => (
              <div key={key}>
                <dt className="font-medium text-gray-700">{label}</dt>
                <dd className="mt-1 text-xs text-gray-500">
                  {key === TriggerType.TECHNOLOGY_MATURITY &&
                    "새로운 기술/도구의 성숙도가 임계점에 도달"}
                  {key === TriggerType.POLICY_REGULATION &&
                    "정책, 규제, 법률 변화가 발생"}
                  {key === TriggerType.CUSTOMER_BEHAVIOR &&
                    "고객 행동 패턴이나 시장 트렌드 변화"}
                  {key === TriggerType.INTERNAL_CAPABILITY &&
                    "내부 조직의 역량/리소스가 확보됨"}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
