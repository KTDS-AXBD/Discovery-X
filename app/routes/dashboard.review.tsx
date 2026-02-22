import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries } from "~/db/schema";
import { PageHeader } from "~/components/layout/PageHeader";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "~/components/ui/Table";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { Card } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import { cn } from "~/lib/utils/cn";
import { and, eq, inArray } from "drizzle-orm";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { formatDate, daysUntilDue } from "~/lib/format-date";
import { ACTIVE_STATUSES, STATUS_CONFIG } from "~/lib/constants/status";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return redirect("/login");

  const openDiscoveries = await db
    .select()
    .from(discoveries)
    .where(
      and(
        inArray(discoveries.status, [...ACTIVE_STATUSES]),
        eq(discoveries.tenantId, ctx.tenantId),
      )
    );

  const discoveryList = await Promise.all(
    openDiscoveries.map(async (discovery) => {
      const owner = discovery.ownerId
        ? await db.query.users.findFirst({
            where: (u, { eq }) => eq(u.id, discovery.ownerId!),
          })
        : null;

      const ageInDays = Math.floor(
        (Date.now() - new Date(discovery.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      const daysLeft = daysUntilDue(discovery.dueDate);

      return {
        ...discovery,
        ownerName: owner?.name,
        ageInDays,
        daysUntilDue: daysLeft,
        isOverdue: daysLeft !== null && daysLeft < 0,
      };
    })
  );

  discoveryList.sort((a, b) => b.ageInDays - a.ageInDays);

  return json({ discoveries: discoveryList });
}

function getAgeColor(ageInDays: number): string {
  if (ageInDays < 14) return "text-badge-success-text";
  if (ageInDays < 21) return "text-badge-warning-text";
  return "text-fg-error";
}

function getAgeBgColor(ageInDays: number): string {
  if (ageInDays < 14) return "bg-badge-success-bg";
  if (ageInDays < 21) return "bg-badge-warning-bg";
  return "bg-surface-error";
}

export default function DashboardReview() {
  const { discoveries } = useLoaderData<typeof loader>();

  return (
    <>
      <PageHeader
        title="Weekly Review"
        description="진행 중인 Discovery를 검토하고 결정합니다 (목표: 30분 내 검토 완료)"
        actions={
          <div className="text-sm text-fg-tertiary">
            총 <span className="font-semibold text-fg">{discoveries.length}</span>개 진행 중
          </div>
        }
      />

      {/* Color Legend */}
      <Card className="p-4">
        <h3 className="text-sm font-medium text-fg">경과 일수 색상 기준</h3>
        <div className="mt-2 flex gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-badge-success-text"></div>
            <span className="text-fg-secondary">&lt;14일: 초록</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-badge-warning-text"></div>
            <span className="text-fg-secondary">14-21일: 노랑</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-fg-error"></div>
            <span className="text-fg-secondary">&gt;21일: 빨강</span>
          </div>
        </div>
      </Card>

      {/* Discovery List - Mobile Cards */}
      <div className="mt-8 space-y-3 sm:hidden">
        {discoveries.length === 0 ? (
          <p className="py-12 text-center text-sm text-fg-tertiary">
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
                <h3 className="text-sm font-medium text-fg">{discovery.title}</h3>
                <span className={cn("ml-2 shrink-0 text-xs font-semibold", getAgeColor(discovery.ageInDays))}>
                  {discovery.ageInDays}일
                </span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-tertiary">
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
                  className="py-12 text-center text-fg-tertiary"
                >
                  진행 중인 Discovery가 없습니다.
                </TableCell>
              </TableRow>
            ) : (
              discoveries.map((discovery) => (
                <TableRow key={discovery.id} className={getAgeBgColor(discovery.ageInDays)}>
                  <TableCell className="whitespace-nowrap pl-6 font-medium text-fg">
                    <Link
                      to={`/discoveries/${discovery.id}`}
                      className="hover:text-fg-brand"
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
                        <div>{formatDate(discovery.dueDate)}</div>
                        {discovery.isOverdue ? (
                          <Badge variant="destructive">OVERDUE</Badge>
                        ) : discovery.daysUntilDue !== null ? (
                          <span className="text-xs text-fg-tertiary">
                            ({discovery.daysUntilDue}일 남음)
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant={STATUS_CONFIG[discovery.status]?.variant ?? "warning"}>
                      {STATUS_CONFIG[discovery.status]?.label ?? discovery.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap pr-6 text-right font-medium">
                    <Link
                      to={`/discoveries/${discovery.id}`}
                      className="text-fg-brand hover:underline"
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
      <AlertBanner variant="info" title="Weekly Review 팁" className="mt-6">
        <ul className="mt-2 space-y-1">
          <li>가장 오래된 Discovery(맨 위)부터 검토하세요</li>
          <li>각 Discovery를 클릭하여 Experiments와 Evidence를 확인하세요</li>
          <li>28일 기한을 넘긴 항목(OVERDUE)은 우선 결정해야 합니다</li>
          <li>목표: 10개 Discovery를 30분 내 검토 완료</li>
        </ul>
      </AlertBanner>
    </>
  );
}
