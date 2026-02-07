import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, users } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { tenantWhere } from "~/lib/query/tenant-scope";
import { AppShell } from "~/components/layout/AppShell";
import { PageHeader } from "~/components/layout/PageHeader";
import { StatusBadge } from "~/components/ui/StatusBadge";
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "~/components/ui/Table";
import { STATUS_CONFIG } from "~/lib/constants/status";
import { cn } from "~/lib/utils/cn";
import { eq, inArray } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import { formatDate, isOverdue } from "~/lib/format-date";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  // Get filter from query params
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");

  // Query discoveries with optional status filter + tenant scope
  let allDiscoveries;
  if (statusFilter === "OVERDUE") {
    // Special filter: OPEN/EXTENSION_REQUESTED + dueDate < now
    const openDiscoveries = await db.select().from(discoveries)
      .where(tenantWhere(discoveries, ctx.tenantId));
    allDiscoveries = openDiscoveries.filter(
      (d) =>
        (d.status === DiscoveryStatus.IDEA_CARD ||
          d.status === DiscoveryStatus.HYPOTHESIS) &&
        isOverdue(d.dueDate)
    );
  } else if (statusFilter && statusFilter in DiscoveryStatus) {
    allDiscoveries = await db.select().from(discoveries)
      .where(tenantWhere(discoveries, ctx.tenantId, eq(discoveries.status, statusFilter)));
  } else {
    allDiscoveries = await db.select().from(discoveries)
      .where(tenantWhere(discoveries, ctx.tenantId));
  }

  // Batch-fetch owner names
  const ownerIds = [...new Set(allDiscoveries.map((d) => d.ownerId).filter(Boolean))] as string[];
  const ownerList = ownerIds.length > 0
    ? await db.select().from(users).where(inArray(users.id, ownerIds))
    : [];
  const ownerMap = new Map(ownerList.map((u) => [u.id, u]));

  const discoveryList = allDiscoveries.map((discovery) => {
    const owner = discovery.ownerId ? ownerMap.get(discovery.ownerId) : null;

    const isInboxOverdue =
      discovery.status === DiscoveryStatus.DISCOVERY &&
      Date.now() - new Date(discovery.createdAt).getTime() > 7 * 24 * 60 * 60 * 1000;

    const isOpenOverdue =
      (discovery.status === DiscoveryStatus.IDEA_CARD ||
        discovery.status === DiscoveryStatus.HYPOTHESIS) &&
      isOverdue(discovery.dueDate);

    return {
      ...discovery,
      ownerName: owner?.name,
      isInboxOverdue,
      isOpenOverdue,
    };
  });

  return json({ user: ctx.user, discoveries: discoveryList });
}


export default function DiscoveriesIndex() {
  const { user, discoveries } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const currentFilter = searchParams.get("status");

  return (
    <AppShell user={user}>
      <PageHeader
        title="Discoveries"
        description="전체 Discovery 목록을 확인하고 관리합니다"
        actions={
          <Button asChild>
            <Link to="/discoveries/new">새 Discovery 만들기</Link>
          </Button>
        }
      />

      {/* Filters — flat text style */}
      <div className="mt-6 flex flex-wrap gap-4">
        <Link
          to="/discoveries"
          className={cn(
            "pb-1 text-sm font-medium transition-colors duration-[var(--dx-transition-normal)]",
            !currentFilter
              ? "text-[var(--axis-text-primary)] font-semibold border-b-2 border-[var(--axis-text-brand)]"
              : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]"
          )}
        >
          전체
        </Link>
        {Object.entries(STATUS_CONFIG).map(([status, { label }]) => (
          <Link
            key={status}
            to={`/discoveries?status=${status}`}
            className={cn(
              "pb-1 text-sm font-medium transition-colors duration-[var(--dx-transition-normal)]",
              currentFilter === status
                ? "text-[var(--axis-text-primary)] font-semibold border-b-2 border-[var(--axis-text-brand)]"
                : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]"
            )}
          >
            {label}
          </Link>
        ))}
        <Link
          to="/discoveries?status=OVERDUE"
          className={cn(
            "pb-1 text-sm font-medium transition-colors duration-[var(--dx-transition-normal)]",
            currentFilter === "OVERDUE"
              ? "text-[var(--axis-text-error)] font-semibold border-b-2 border-[var(--axis-text-error)]"
              : "text-[var(--axis-text-error)] opacity-60 hover:opacity-100"
          )}
        >
          기한초과
        </Link>
      </div>

      {/* Mobile Cards */}
      <div className="mt-8 space-y-3 sm:hidden">
        {discoveries.length === 0 ? (
          <p className="py-12 text-center text-sm text-[var(--axis-text-tertiary)]">
            표시할 Discovery가 없습니다.
          </p>
        ) : (
          discoveries.map((discovery) => (
            <Link
              key={discovery.id}
              to={`/discoveries/${discovery.id}`}
              className={cn(
                "block rounded-[var(--dx-card-radius)] bg-[var(--dx-surface-card,var(--axis-surface-default))] p-5 border border-[var(--dx-border-subtle,var(--dx-card-border-subtle))] transition-colors hover:bg-[var(--dx-surface-card-hover,var(--axis-surface-secondary))]",
                (discovery.isInboxOverdue || discovery.isOpenOverdue) && "ring-2 ring-[var(--axis-border-error)]"
              )}
            >
              <div className="flex items-start justify-between">
                <h3 className="text-sm font-medium text-[var(--axis-text-primary)]">
                  {discovery.title}
                </h3>
                <span className="ml-2 shrink-0">
                  <StatusBadge status={discovery.status} />
                </span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-[var(--axis-text-tertiary)]">
                <span>{discovery.ownerName || "미지정"}</span>
                <span>{formatDate(discovery.createdAt)}</span>
                {discovery.isInboxOverdue && <Badge variant="destructive">7일 초과</Badge>}
                {discovery.isOpenOverdue && <Badge variant="destructive">OVERDUE</Badge>}
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Desktop Table */}
      <div className="mt-8 hidden sm:block">
        <Table>
          <TableHeader>
            <tr>
              <TableHead className="pl-6">제목</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>생성일</TableHead>
              <TableHead className="text-right pr-6">
                <span className="sr-only">액션</span>
              </TableHead>
            </tr>
          </TableHeader>
          <TableBody>
            {discoveries.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-sm text-[var(--axis-text-tertiary)]">
                  표시할 Discovery가 없습니다.
                </td>
              </tr>
            ) : (
              discoveries.map((discovery) => (
                <TableRow
                  key={discovery.id}
                  className={cn(
                    "transition-colors hover:bg-[var(--axis-surface-secondary)]",
                    (discovery.isInboxOverdue || discovery.isOpenOverdue) && "bg-[var(--axis-surface-error)]"
                  )}
                >
                  <TableCell className="pl-6 font-medium text-[var(--axis-text-primary)]">
                    <Link
                      to={`/discoveries/${discovery.id}`}
                      className="hover:text-[var(--axis-text-brand)]"
                    >
                      {discovery.title}
                    </Link>
                    {discovery.isInboxOverdue && (
                      <Badge variant="destructive" className="ml-2">7일 초과</Badge>
                    )}
                    {discovery.isOpenOverdue && (
                      <Badge variant="destructive" className="ml-2">OVERDUE</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={discovery.status} />
                  </TableCell>
                  <TableCell>{discovery.ownerName || "—"}</TableCell>
                  <TableCell>
                    {formatDate(discovery.createdAt)}
                  </TableCell>
                  <TableCell className="text-right pr-6">
                    <Link
                      to={`/discoveries/${discovery.id}`}
                      className="text-[var(--axis-text-brand)] hover:underline"
                    >
                      보기
                    </Link>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}
