/**
 * /dashboard/alerts — Alert list page with acknowledge actions.
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { alerts } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { eq, desc } from "drizzle-orm";
import { AlertList } from "~/components/dashboard/AlertList";
import { Badge } from "~/components/ui/Badge";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);
  if (!user) return json({ alerts: [], counts: { total: 0, unack: 0, critical: 0 } });

  const allAlerts = await db
    .select()
    .from(alerts)
    .orderBy(desc(alerts.firedAt))
    .limit(100);

  const serialized = allAlerts.map((a) => ({
    id: a.id,
    severity: a.severity,
    message: a.message,
    discoveryId: a.discoveryId,
    acknowledged: !!a.acknowledged,
    firedAt: a.firedAt?.toISOString() || new Date().toISOString(),
    acknowledgedAt: a.acknowledgedAt?.toISOString() || null,
  }));

  const unack = serialized.filter((a) => !a.acknowledged).length;
  const critical = serialized.filter((a) => a.severity === "critical" && !a.acknowledged).length;

  return json({
    alerts: serialized,
    counts: { total: serialized.length, unack, critical },
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);
  if (!user) return json({ error: "Unauthorized" }, { status: 401 });

  const formData = await request.formData();
  const actionType = formData.get("_action");

  if (actionType === "acknowledge") {
    const alertId = formData.get("alertId") as string;
    if (!alertId) return json({ error: "Missing alertId" }, { status: 400 });

    await db
      .update(alerts)
      .set({
        acknowledged: 1,
        acknowledgedAt: new Date(),
        acknowledgedBy: user.id,
      })
      .where(eq(alerts.id, alertId));

    return json({ success: true });
  }

  return json({ error: "Unknown action" }, { status: 400 });
}

export default function DashboardAlerts() {
  const { alerts: alertList, counts } = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--axis-text-primary)]">
          알림
        </h2>
        <div className="flex items-center gap-2">
          {counts.critical > 0 && (
            <Badge variant="destructive">{counts.critical} 긴급</Badge>
          )}
          {counts.unack > 0 && (
            <Badge variant="warning">{counts.unack} 미확인</Badge>
          )}
          <Badge variant="secondary">{counts.total} 전체</Badge>
        </div>
      </div>

      <AlertList alerts={alertList} />
    </div>
  );
}
