/**
 * /dashboard/audit-log — Audit Log page showing recent event logs.
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { getDb } from "~/db";
import { eventLogs, discoveries, users, UserRole } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { eq, desc } from "drizzle-orm";
import { AuditLogList } from "~/components/dashboard/AuditLogList";
import { Badge } from "~/components/ui/Badge";
import { Select } from "~/components/ui/Select";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return redirect("/login");
  const user = ctx.user;

  // Only admin/gatekeeper can view audit logs
  if (user.role !== UserRole.ADMIN && user.role !== UserRole.GATEKEEPER) {
    throw new Response("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const filterEventType = url.searchParams.get("eventType") || "";
  const filterActorType = url.searchParams.get("actorType") || "";

  // Fetch recent 100 event logs (tenant-scoped via discoveries)
  const allLogs = await db
    .select({
      id: eventLogs.id,
      eventType: eventLogs.eventType,
      actorId: eventLogs.actorId,
      discoveryId: eventLogs.discoveryId,
      metadata: eventLogs.metadata,
      timestamp: eventLogs.timestamp,
    })
    .from(eventLogs)
    .innerJoin(discoveries, eq(eventLogs.discoveryId, discoveries.id))
    .where(eq(discoveries.tenantId, ctx.tenantId))
    .orderBy(desc(eventLogs.timestamp))
    .limit(100);

  // Resolve discovery titles and actor names
  const discoveryIds = [...new Set(allLogs.map((l) => l.discoveryId))];
  const actorIds = [...new Set(allLogs.map((l) => l.actorId))];

  const discoveryMap = new Map<string, string>();
  for (const did of discoveryIds) {
    const d = await db.query.discoveries.findFirst({ where: eq(discoveries.id, did) });
    discoveryMap.set(did, d?.title || did);
  }

  const actorMap = new Map<string, string>();
  for (const aid of actorIds) {
    if (aid === "system-agent" || aid === "system-radar" || aid === "system") {
      actorMap.set(aid, "\uC2DC\uC2A4\uD15C");
    } else {
      const u = await db.query.users.findFirst({ where: eq(users.id, aid) });
      actorMap.set(aid, u?.name || aid);
    }
  }

  let filtered = allLogs.map((l) => ({
    id: l.id,
    eventType: l.eventType,
    actorId: l.actorId,
    actorName: actorMap.get(l.actorId) || l.actorId,
    discoveryId: l.discoveryId,
    discoveryTitle: discoveryMap.get(l.discoveryId) || l.discoveryId,
    metadata: l.metadata,
    timestamp: l.timestamp?.toISOString() || new Date().toISOString(),
  }));

  if (filterEventType) {
    filtered = filtered.filter((l) => l.eventType === filterEventType);
  }
  if (filterActorType === "system") {
    filtered = filtered.filter((l) =>
      l.actorId === "system-agent" || l.actorId === "system-radar" || l.actorId === "system"
    );
  } else if (filterActorType === "user") {
    filtered = filtered.filter((l) =>
      l.actorId !== "system-agent" && l.actorId !== "system-radar" && l.actorId !== "system"
    );
  }

  // Collect unique event types for filter dropdown
  const eventTypes = [...new Set(allLogs.map((l) => l.eventType))].sort();

  return json({ logs: filtered, eventTypes, total: allLogs.length });
}

export default function DashboardAuditLog() {
  const { logs, eventTypes, total } = useLoaderData<typeof loader>();
  const [searchParams, setSearchParams] = useSearchParams();

  const currentEventType = searchParams.get("eventType") || "";
  const currentActorType = searchParams.get("actorType") || "";

  function updateFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    setSearchParams(params);
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--axis-text-primary)]">
          활동 기록
        </h2>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{logs.length} / {total}</Badge>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <div>
          <label className="block text-xs text-[var(--axis-text-tertiary)] mb-1">
            이벤트 타입
          </label>
          <Select
            value={currentEventType}
            onChange={(e) => updateFilter("eventType", e.target.value)}
          >
            <option value="">전체</option>
            {eventTypes.map((et) => (
              <option key={et} value={et}>{et}</option>
            ))}
          </Select>
        </div>
        <div>
          <label className="block text-xs text-[var(--axis-text-tertiary)] mb-1">
            액터 타입
          </label>
          <Select
            value={currentActorType}
            onChange={(e) => updateFilter("actorType", e.target.value)}
          >
            <option value="">전체</option>
            <option value="user">사용자</option>
            <option value="system">시스템</option>
          </Select>
        </div>
      </div>

      <AuditLogList logs={logs} />
    </div>
  );
}
