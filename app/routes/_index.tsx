import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { count, eq, and, lt } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";

export const meta: MetaFunction = () => {
  return [
    { title: "Discovery-X" },
    { name: "description", content: "내부 실험 중심 사고 시스템" },
  ];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  // Get statistics
  const now = new Date();
  const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  const stats = await Promise.all([
    db.select({ count: count() }).from(discoveries),
    db.select({ count: count() }).from(discoveries).where(eq(discoveries.status, DiscoveryStatus.INBOX)),
    db.select({ count: count() }).from(discoveries).where(eq(discoveries.status, DiscoveryStatus.OPEN)),
    db.select({ count: count() }).from(discoveries).where(eq(discoveries.status, DiscoveryStatus.NEXT)),
    // INBOX items older than 7 days
    db.select({ count: count() }).from(discoveries).where(
      and(
        eq(discoveries.status, DiscoveryStatus.INBOX),
        lt(discoveries.createdAt, new Date(sevenDaysAgo * 1000))
      )
    ),
  ]);

  // Overdue and dueSoon - fetch all OPEN/EXTENSION_REQUESTED with dueDate
  const activeDiscoveries = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.status, DiscoveryStatus.OPEN));
  const extensionDiscoveries = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.status, DiscoveryStatus.EXTENSION_REQUESTED));
  const allActive = [...activeDiscoveries, ...extensionDiscoveries];

  const overdueOpen = allActive.filter(
    (d) => d.dueDate && new Date(d.dueDate) < now
  ).length;
  const dueSoon = allActive.filter(
    (d) =>
      d.dueDate &&
      new Date(d.dueDate) >= now &&
      new Date(d.dueDate) <= threeDaysFromNow
  ).length;

  // Recall due
  const notNowDiscoveries = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.status, DiscoveryStatus.NOT_NOW));
  const recallDue = notNowDiscoveries.filter(
    (d) => d.revisitDate && new Date(d.revisitDate) <= now
  ).length;

  return json({
    user,
    stats: {
      total: stats[0][0]?.count || 0,
      inbox: stats[1][0]?.count || 0,
      open: stats[2][0]?.count || 0,
      next: stats[3][0]?.count || 0,
      inboxOverdue: stats[4][0]?.count || 0,
      overdueOpen,
      dueSoon,
      recallDue,
    },
  });
}

export default function Index() {
  const { user, stats } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav user={user} />

      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold text-gray-900">Discovery-X</h1>
          <p className="mt-4 text-lg text-gray-600">
            AX 신사업을 위한 내부 실험 중심 사고 시스템
          </p>
          <p className="mt-2 text-sm text-gray-500">
            관찰을 행동으로, 행동을 근거 있는 문서로
          </p>
        </div>

        {/* Alert Banners */}
        {(stats.overdueOpen > 0 || stats.dueSoon > 0) && (
          <div className="mt-8 rounded-lg border-2 border-red-300 bg-red-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                {stats.overdueOpen > 0 && (
                  <p className="text-sm font-semibold text-red-800">
                    기한 초과 Discovery {stats.overdueOpen}건 — 즉시 결정이 필요합니다
                  </p>
                )}
                {stats.dueSoon > 0 && (
                  <p className="text-sm text-red-700">
                    3일 이내 마감 {stats.dueSoon}건
                  </p>
                )}
              </div>
              <Link
                to="/discoveries?status=OVERDUE"
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                확인하기
              </Link>
            </div>
          </div>
        )}

        {/* Statistics */}
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
            <dt className="truncate text-sm font-medium text-gray-500">
              전체 Discovery
            </dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">
              {stats.total}
            </dd>
          </div>
          <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
            <dt className="truncate text-sm font-medium text-gray-500">
              Inbox
            </dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-blue-600">
              {stats.inbox}
            </dd>
            {stats.inboxOverdue > 0 && (
              <dd className="mt-1">
                <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                  {stats.inboxOverdue}건 7일 초과
                </span>
              </dd>
            )}
          </div>
          <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
            <dt className="truncate text-sm font-medium text-gray-500">
              진행 중 (OPEN)
            </dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-yellow-600">
              {stats.open}
            </dd>
          </div>
          <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
            <dt className="truncate text-sm font-medium text-gray-500">
              전진 (NEXT)
            </dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-green-600">
              {stats.next}
            </dd>
          </div>
        </div>

        {/* Secondary Stats */}
        <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {stats.overdueOpen > 0 && (
            <Link
              to="/discoveries?status=OVERDUE"
              className="overflow-hidden rounded-lg border-2 border-red-200 bg-red-50 px-4 py-5 shadow hover:bg-red-100 sm:p-6"
            >
              <dt className="truncate text-sm font-medium text-red-600">
                기한 초과
              </dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight text-red-700">
                {stats.overdueOpen}
              </dd>
            </Link>
          )}
          {stats.recallDue > 0 && (
            <Link
              to="/recall"
              className="overflow-hidden rounded-lg border-2 border-blue-200 bg-blue-50 px-4 py-5 shadow hover:bg-blue-100 sm:p-6"
            >
              <dt className="truncate text-sm font-medium text-blue-600">
                재검토 대기
              </dt>
              <dd className="mt-1 text-3xl font-semibold tracking-tight text-blue-700">
                {stats.recallDue}
              </dd>
              <dd className="mt-1 text-xs text-blue-600">Recall Queue에서 확인</dd>
            </Link>
          )}
        </div>

        {/* Quick Actions */}
        <div className="mt-12 flex justify-center space-x-4">
          <Link
            to="/discoveries/new"
            className="rounded-md bg-blue-600 px-6 py-3 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            새 Discovery 만들기
          </Link>
          <Link
            to="/discoveries"
            className="rounded-md bg-white px-6 py-3 text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
          >
            전체 목록 보기
          </Link>
        </div>
      </div>
    </div>
  );
}
