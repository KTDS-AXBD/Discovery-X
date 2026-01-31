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
  const sevenDaysAgo = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000);
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

  return json({
    user,
    stats: {
      total: stats[0][0]?.count || 0,
      inbox: stats[1][0]?.count || 0,
      open: stats[2][0]?.count || 0,
      next: stats[3][0]?.count || 0,
      inboxOverdue: stats[4][0]?.count || 0,
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

        {/* Statistics */}
        <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
