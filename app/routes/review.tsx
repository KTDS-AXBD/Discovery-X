import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, users } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { PageLayout } from "~/components/layout/PageLayout";
import { PageHeader } from "~/components/layout/PageHeader";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "~/components/ui/Table";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { Card } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import { cn } from "~/lib/utils/cn";
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
    <PageLayout user={user}>
      <PageHeader
        title="Weekly Review"
        description="진행 중인 Discovery를 검토하고 결정합니다 (목표: 30분 내 검토 완료)"
        actions={
          <div className="text-sm text-[var(--axis-text-tertiary)]">
            총 <span className="font-semibold text-[var(--axis-text-primary)]">{discoveries.length}</span>개 진행 중
          </div>
        }
      />

      {/* Color Legend */}
      <Card className="p-4">
        <h3 className="text-sm font-medium text-[var(--axis-text-primary)]">경과 일수 색상 기준</h3>
        <div className="mt-2 flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-green-600"></div>
            <span className="text-[var(--axis-text-secondary)]">&lt;14일: 초록</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-yellow-600"></div>
            <span className="text-[var(--axis-text-secondary)]">14-21일: 노랑</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-red-600"></div>
            <span className="text-[var(--axis-text-secondary)]">&gt;21일: 빨강</span>
          </div>
        </div>
      </Card>

      {/* Discovery List - Mobile Cards */}
      <div className="mt-8 space-y-3 sm:hidden">
        {discoveries.length === 0 ? (
          <p className="py-12 text-center text-sm text-[var(--axis-text-tertiary)]">
            진행 중인 Discovery가 없습니다.
          </p>
        ) : (
          discoveries.map((discovery) => (
            <Link
              key={discovery.id}
              to={`/discoveries/${discovery.id}`}
              className={cn("block rounded-lg p-4 shadow", getAgeBgColor(discovery.ageInDays))}
            >
              <div className="flex items-start justify-between">
                <h3 className="text-sm font-medium text-[var(--axis-text-primary)]">{discovery.title}</h3>
                <span className={cn("ml-2 shrink-0 text-xs font-semibold", getAgeColor(discovery.ageInDays))}>
                  {discovery.ageInDays}일
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--axis-text-tertiary)]">
                <span>{discovery.ownerName || "미지정"}</span>
                {discovery.isOverdue && (
                  <Badge variant="destructive">OVERDUE</Badge>
                )}
                {!discovery.isOverdue && discovery.daysUntilDue !== null && (
                  <span>{discovery.daysUntilDue}일 남음</span>
                )}
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Discovery List - Desktop Table */}
      <div className="mt-8 hidden sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-6">제목</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>경과 (일)</TableHead>
              <TableHead>기한</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="pr-6">
                <span className="sr-only">액션</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {discoveries.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-12 text-center text-[var(--axis-text-tertiary)]"
                >
                  진행 중인 Discovery가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              discoveries.map((discovery) => (
                <TableRow key={discovery.id} className={getAgeBgColor(discovery.ageInDays)}>
                  <TableCell className="whitespace-nowrap pl-6 font-medium text-[var(--axis-text-primary)]">
                    <Link
                      to={`/discoveries/${discovery.id}`}
                      className="hover:text-[var(--axis-text-brand)]"
                    >
                      {discovery.title}
                    </Link>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {discovery.ownerName || "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className={cn("font-semibold", getAgeColor(discovery.ageInDays))}>
                      {discovery.ageInDays}일
                    </span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {discovery.dueDate ? (
                      <div>
                        <div>{new Date(discovery.dueDate).toLocaleDateString("ko-KR")}</div>
                        {discovery.isOverdue ? (
                          <Badge variant="destructive">OVERDUE</Badge>
                        ) : discovery.daysUntilDue !== null ? (
                          <span className="text-xs text-[var(--axis-text-tertiary)]">
                            ({discovery.daysUntilDue}일 남음)
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant="warning">진행 중</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap pr-6 text-right font-medium">
                    <Link
                      to={`/discoveries/${discovery.id}`}
                      className="text-[var(--axis-text-brand)] hover:underline"
                    >
                      결정하기
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Tips */}
      <AlertBanner variant="info" title="💡 Weekly Review 팁" className="mt-6">
        <ul className="mt-2 space-y-1">
          <li>• 가장 오래된 Discovery(맨 위)부터 검토하세요</li>
          <li>• 각 Discovery를 클릭하여 Experiments와 Evidence를 확인하세요</li>
          <li>• 28일 기한을 넘긴 항목(OVERDUE)은 우선 결정해야 합니다</li>
          <li>• 목표: 10개 Discovery를 30분 내 검토 완료</li>
        </ul>
      </AlertBanner>
    </PageLayout>
  );
}
