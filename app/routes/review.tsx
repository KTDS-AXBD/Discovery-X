import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, users } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { eq } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  // Get all OPEN discoveries
  const openDiscoveries = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.status, DiscoveryStatus.OPEN));

  // Enrich with owner info and calculate age
  const discoveryList = await Promise.all(
    openDiscoveries.map(async (discovery) => {
      const owner = discovery.ownerId
        ? await db.query.users.findFirst({
            where: eq(users.id, discovery.ownerId),
          })
        : null;

      // Calculate age in days since OPEN status
      // For now, use createdAt as proxy (in real implementation, track status change timestamp)
      const ageInDays = Math.floor(
        (Date.now() - new Date(discovery.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      // Calculate days until due date
      const daysUntilDue = discovery.dueDate
        ? Math.floor(
            (new Date(discovery.dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
          )
        : null;

      return {
        ...discovery,
        ownerName: owner?.name,
        ageInDays,
        daysUntilDue,
        isOverdue: daysUntilDue !== null && daysUntilDue < 0,
      };
    })
  );

  // Sort by age descending (oldest first)
  discoveryList.sort((a, b) => b.ageInDays - a.ageInDays);

  return json({ user, discoveries: discoveryList });
}

function getAgeColor(ageInDays: number): string {
  if (ageInDays < 14) return "text-green-600";
  if (ageInDays < 21) return "text-yellow-600";
  return "text-red-600";
}

function getAgeBgColor(ageInDays: number): string {
  if (ageInDays < 14) return "bg-green-50";
  if (ageInDays < 21) return "bg-yellow-50";
  return "bg-red-50";
}

export default function WeeklyReview() {
  const { user, discoveries } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav user={user} />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="sm:flex sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Weekly Review</h1>
            <p className="mt-2 text-sm text-gray-700">
              진행 중인 Discovery를 검토하고 결정합니다 (목표: 30분 내 검토 완료)
            </p>
          </div>
          <div className="mt-4 sm:mt-0">
            <div className="text-sm text-gray-500">
              총 <span className="font-semibold text-gray-900">{discoveries.length}</span>개 진행 중
            </div>
          </div>
        </div>

        {/* Color Legend */}
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-medium text-gray-900">경과 일수 색상 기준</h3>
          <div className="mt-2 flex gap-6 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-green-600"></div>
              <span className="text-gray-700">&lt;14일: 초록</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-yellow-600"></div>
              <span className="text-gray-700">14-21일: 노랑</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-600"></div>
              <span className="text-gray-700">&gt;21일: 빨강</span>
            </div>
          </div>
        </div>

        {/* Discovery List */}
        <div className="mt-8 flow-root">
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
                        Owner
                      </th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        경과 (일)
                      </th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        기한
                      </th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        상태
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
                          진행 중인 Discovery가 없습니다!
                        </td>
                      </tr>
                    ) : (
                      discoveries.map((discovery) => (
                        <tr key={discovery.id} className={getAgeBgColor(discovery.ageInDays)}>
                          <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
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
                          <td className="whitespace-nowrap px-3 py-4 text-sm">
                            <span className={`font-semibold ${getAgeColor(discovery.ageInDays)}`}>
                              {discovery.ageInDays}일
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                            {discovery.dueDate ? (
                              <div>
                                <div>{new Date(discovery.dueDate).toLocaleDateString("ko-KR")}</div>
                                {discovery.isOverdue ? (
                                  <span className="inline-flex rounded-full bg-red-100 px-2 text-xs font-semibold text-red-800">
                                    OVERDUE
                                  </span>
                                ) : discovery.daysUntilDue !== null ? (
                                  <span className="text-xs text-gray-500">
                                    ({discovery.daysUntilDue}일 남음)
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-4 text-sm">
                            <span className="inline-flex rounded-full bg-yellow-100 px-2 text-xs font-semibold leading-5 text-yellow-800">
                              진행 중
                            </span>
                          </td>
                          <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                            <Link
                              to={`/discoveries/${discovery.id}`}
                              className="text-blue-600 hover:text-blue-900"
                            >
                              결정하기
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
        <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h3 className="text-sm font-medium text-blue-900">💡 Weekly Review 팁</h3>
          <ul className="mt-2 space-y-1 text-sm text-blue-800">
            <li>• 가장 오래된 Discovery(맨 위)부터 검토하세요</li>
            <li>• 각 Discovery를 클릭하여 Experiments와 Evidence를 확인하세요</li>
            <li>• 28일 기한을 넘긴 항목(OVERDUE)은 우선 결정해야 합니다</li>
            <li>• 목표: 10개 Discovery를 30분 내 검토 완료</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
