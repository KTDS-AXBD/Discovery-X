import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
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

  // Get filter from query params
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");

  const now = new Date();

  // Query discoveries with optional status filter
  let allDiscoveries;
  if (statusFilter === "OVERDUE") {
    // Special filter: OPEN/EXTENSION_REQUESTED + dueDate < now
    const openDiscoveries = await db.select().from(discoveries);
    allDiscoveries = openDiscoveries.filter(
      (d) =>
        (d.status === DiscoveryStatus.OPEN ||
          d.status === DiscoveryStatus.EXTENSION_REQUESTED) &&
        d.dueDate &&
        new Date(d.dueDate) < now
    );
  } else if (statusFilter && statusFilter in DiscoveryStatus) {
    allDiscoveries = await db.select().from(discoveries).where(eq(discoveries.status, statusFilter));
  } else {
    allDiscoveries = await db.select().from(discoveries);
  }

  // Get owner names
  const discoveryList = await Promise.all(
    allDiscoveries.map(async (discovery) => {
      const owner = discovery.ownerId
        ? await db.query.users.findFirst({
            where: eq(users.id, discovery.ownerId),
          })
        : null;

      const isInboxOverdue =
        discovery.status === DiscoveryStatus.INBOX &&
        Date.now() - new Date(discovery.createdAt).getTime() > 7 * 24 * 60 * 60 * 1000;

      const isOpenOverdue =
        (discovery.status === DiscoveryStatus.OPEN ||
          discovery.status === DiscoveryStatus.EXTENSION_REQUESTED) &&
        discovery.dueDate &&
        new Date(discovery.dueDate) < now;

      return {
        ...discovery,
        ownerName: owner?.name,
        isInboxOverdue,
        isOpenOverdue,
      };
    })
  );

  return json({ user, discoveries: discoveryList });
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  [DiscoveryStatus.INBOX]: { label: "Inbox", color: "bg-blue-100 text-blue-800" },
  [DiscoveryStatus.OPEN]: { label: "진행 중", color: "bg-yellow-100 text-yellow-800" },
  [DiscoveryStatus.NEXT]: { label: "전진", color: "bg-green-100 text-green-800" },
  [DiscoveryStatus.NOT_NOW]: { label: "보류", color: "bg-gray-100 text-gray-800" },
  [DiscoveryStatus.DEAD_END]: { label: "중단", color: "bg-red-100 text-red-800" },
  [DiscoveryStatus.EXTENSION_REQUESTED]: { label: "연장 요청", color: "bg-purple-100 text-purple-800" },
};

export default function DiscoveriesIndex() {
  const { user, discoveries } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const currentFilter = searchParams.get("status");

  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav user={user} />

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="sm:flex sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Discoveries</h1>
            <p className="mt-2 text-sm text-gray-700">
              전체 Discovery 목록을 확인하고 관리합니다
            </p>
          </div>
          <div className="mt-4 sm:mt-0">
            <Link
              to="/discoveries/new"
              className="inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              새 Discovery 만들기
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            to="/discoveries"
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              !currentFilter
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            }`}
          >
            전체
          </Link>
          {Object.entries(STATUS_LABELS).map(([status, { label }]) => (
            <Link
              key={status}
              to={`/discoveries?status=${status}`}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                currentFilter === status
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
              }`}
            >
              {label}
            </Link>
          ))}
          <Link
            to="/discoveries?status=OVERDUE"
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              currentFilter === "OVERDUE"
                ? "bg-red-600 text-white"
                : "bg-white text-red-700 ring-1 ring-inset ring-red-300 hover:bg-red-50"
            }`}
          >
            기한초과
          </Link>
        </div>

        {/* Discovery List - Mobile Cards */}
        <div className="mt-8 space-y-3 sm:hidden">
          {discoveries.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">
              Discovery가 없습니다. 새로 만들어보세요!
            </p>
          ) : (
            discoveries.map((discovery) => (
              <Link
                key={discovery.id}
                to={`/discoveries/${discovery.id}`}
                className={`block rounded-lg bg-white p-4 shadow ${
                  discovery.isInboxOverdue || discovery.isOpenOverdue
                    ? "ring-2 ring-red-300"
                    : ""
                }`}
              >
                <div className="flex items-start justify-between">
                  <h3 className="text-sm font-medium text-gray-900">
                    {discovery.title}
                  </h3>
                  <span
                    className={`ml-2 inline-flex shrink-0 rounded-full px-2 text-xs font-semibold leading-5 ${
                      STATUS_LABELS[discovery.status]?.color ||
                      "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {STATUS_LABELS[discovery.status]?.label || discovery.status}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                  <span>{discovery.ownerName || "미지정"}</span>
                  <span>{new Date(discovery.createdAt).toLocaleDateString("ko-KR")}</span>
                  {discovery.isInboxOverdue && (
                    <span className="rounded-full bg-red-100 px-2 text-xs font-semibold text-red-800">
                      7일 초과
                    </span>
                  )}
                  {discovery.isOpenOverdue && (
                    <span className="rounded-full bg-red-100 px-2 text-xs font-semibold text-red-800">
                      OVERDUE
                    </span>
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
                        상태
                      </th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        Owner
                      </th>
                      <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">
                        생성일
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
                          colSpan={5}
                          className="py-12 text-center text-sm text-gray-500"
                        >
                          Discovery가 없습니다. 새로 만들어보세요!
                        </td>
                      </tr>
                    ) : (
                      discoveries.map((discovery) => (
                          <tr key={discovery.id} className={discovery.isInboxOverdue || discovery.isOpenOverdue ? "bg-red-50" : ""}>
                            <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-medium text-gray-900 sm:pl-6">
                              <Link
                                to={`/discoveries/${discovery.id}`}
                                className="hover:text-blue-600"
                              >
                                {discovery.title}
                              </Link>
                              {discovery.isInboxOverdue && (
                                <span className="ml-2 inline-flex rounded-full bg-red-100 px-2 text-xs font-semibold leading-5 text-red-800">
                                  7일 초과
                                </span>
                              )}
                              {discovery.isOpenOverdue && (
                                <span className="ml-2 inline-flex rounded-full bg-red-100 px-2 text-xs font-semibold leading-5 text-red-800">
                                  OVERDUE
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm">
                              <span
                                className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${
                                  STATUS_LABELS[discovery.status]?.color ||
                                  "bg-gray-100 text-gray-800"
                                }`}
                              >
                                {STATUS_LABELS[discovery.status]?.label || discovery.status}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                              {discovery.ownerName || "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                              {new Date(discovery.createdAt).toLocaleDateString("ko-KR")}
                            </td>
                            <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                              <Link
                                to={`/discoveries/${discovery.id}`}
                                className="text-blue-600 hover:text-blue-900"
                              >
                                보기
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
      </div>
    </div>
  );
}
