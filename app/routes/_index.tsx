import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { PageLayout } from "~/components/layout/PageLayout";
import { Card, CardContent } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { Badge } from "~/components/ui/Badge";
import { count, eq, and, lt } from "drizzle-orm";
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
    <PageLayout user={user}>
      <div className="text-center">
        <h1 className="text-4xl font-bold text-[var(--axis-text-primary)]">Discovery-X</h1>
        <p className="mt-4 text-lg text-[var(--axis-text-secondary)]">
          AX 신사업을 위한 내부 실험 중심 사고 시스템
        </p>
        <p className="mt-2 text-sm text-[var(--axis-text-tertiary)]">
          관찰을 행동으로, 행동을 근거 있는 문서로
        </p>
      </div>

      {/* Alert Banners */}
      {(stats.overdueOpen > 0 || stats.dueSoon > 0) && (
        <AlertBanner variant="destructive" className="mt-8">
          <div className="flex items-center justify-between">
            <div>
              {stats.overdueOpen > 0 && (
                <p className="text-sm font-semibold">
                  기한 초과 Discovery {stats.overdueOpen}건 — 즉시 결정이 필요합니다
                </p>
              )}
              {stats.dueSoon > 0 && (
                <p className="text-sm">
                  3일 이내 마감 {stats.dueSoon}건
                </p>
              )}
            </div>
            <Button variant="destructive" size="sm" asChild>
              <Link to="/discoveries?status=OVERDUE">확인하기</Link>
            </Button>
          </div>
        </AlertBanner>
      )}

      {/* Statistics */}
      <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="px-4 py-5 sm:p-6">
            <dt className="truncate text-sm font-medium text-[var(--axis-text-tertiary)]">
              전체 Discovery
            </dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-[var(--axis-text-primary)]">
              {stats.total}
            </dd>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-5 sm:p-6">
            <dt className="truncate text-sm font-medium text-[var(--axis-text-tertiary)]">
              Inbox
            </dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-[var(--axis-text-brand)]">
              {stats.inbox}
            </dd>
            {stats.inboxOverdue > 0 && (
              <dd className="mt-1">
                <Badge variant="destructive">{stats.inboxOverdue}건 7일 초과</Badge>
              </dd>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-5 sm:p-6">
            <dt className="truncate text-sm font-medium text-[var(--axis-text-tertiary)]">
              진행 중 (OPEN)
            </dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-[var(--axis-badge-warning-text)]">
              {stats.open}
            </dd>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="px-4 py-5 sm:p-6">
            <dt className="truncate text-sm font-medium text-[var(--axis-text-tertiary)]">
              전진 (NEXT)
            </dt>
            <dd className="mt-1 text-3xl font-semibold tracking-tight text-[var(--axis-badge-success-text)]">
              {stats.next}
            </dd>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Stats */}
      <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {stats.overdueOpen > 0 && (
          <Link to="/discoveries?status=OVERDUE">
            <Card className="border-2 border-[var(--axis-border-error)] bg-[var(--axis-surface-error)] hover:opacity-90">
              <CardContent className="px-4 py-5 sm:p-6">
                <dt className="truncate text-sm font-medium text-[var(--axis-text-error)]">
                  기한 초과
                </dt>
                <dd className="mt-1 text-3xl font-semibold tracking-tight text-[var(--axis-text-error)]">
                  {stats.overdueOpen}
                </dd>
              </CardContent>
            </Card>
          </Link>
        )}
        {stats.recallDue > 0 && (
          <Link to="/recall">
            <Card className="border-2 border-[var(--axis-border-brand)] bg-[var(--axis-surface-brand)] hover:opacity-90">
              <CardContent className="px-4 py-5 sm:p-6">
                <dt className="truncate text-sm font-medium text-[var(--axis-text-brand)]">
                  재검토 대기
                </dt>
                <dd className="mt-1 text-3xl font-semibold tracking-tight text-[var(--axis-text-brand)]">
                  {stats.recallDue}
                </dd>
                <dd className="mt-1 text-xs text-[var(--axis-text-brand)]">Recall Queue에서 확인</dd>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      {/* Quick Actions */}
      <div className="mt-12 flex justify-center gap-4">
        <Button asChild>
          <Link to="/discoveries/new">새 Discovery 만들기</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/discoveries">전체 목록 보기</Link>
        </Button>
      </div>
    </PageLayout>
  );
}
