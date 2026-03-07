import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { discoveries, users, tenants, tenantMembers } from "~/db";
import { eq } from "drizzle-orm";
import { createEmailClient } from "~/lib/notifications/email";
import { buildWeeklySummaryEmail } from "~/lib/notifications/templates";
import { ACTIVE_STATUSES } from "~/lib/constants/status";

interface CronEnv {
  DB: D1Database;
  RESEND_API_KEY?: string;
  CRON_SECRET?: string;
}

export async function runWeeklySummary(env: CronEnv): Promise<{ sent: number; errors: string[] }> {
  const db = getDb(env.DB);
  const errors: string[] = [];
  let sent = 0;

  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: 0, errors: ["RESEND_API_KEY not configured"] };
  }

  const emailClient = createEmailClient(apiKey);
  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const STAGE_SLA_DAYS = 14;

  // Get all active tenants
  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  for (const tenant of activeTenants) {
    const tenantId = tenant.id;

    // Get discoveries for this tenant
    const allDiscoveries = await db
      .select()
      .from(discoveries)
      .where(eq(discoveries.tenantId, tenantId));

    // Active discoveries
    const activeStatuses = new Set<string>(ACTIVE_STATUSES);
    const activeDiscoveries = allDiscoveries.filter((d) => activeStatuses.has(d.status));

    // Status counts
    const statusCounts: Record<string, number> = {};
    for (const d of activeDiscoveries) {
      statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
    }

    // Overdue count
    const overdueCount = activeDiscoveries.filter((d) => d.dueDate && new Date(d.dueDate) < now).length;

    // Stalled count (> 14 days in current stage)
    const stalledCount = activeDiscoveries.filter((d) => {
      if (!d.stageUpdatedAt) return false;
      const days = (now.getTime() - new Date(d.stageUpdatedAt).getTime()) / (1000 * 60 * 60 * 24);
      return days > STAGE_SLA_DAYS;
    }).length;

    // New this week
    const newThisWeek = allDiscoveries.filter(
      (d) => d.createdAt && new Date(d.createdAt) >= oneWeekAgo
    ).length;

    // Completed this week (HANDOFF or DROP decided this week)
    const completedThisWeek = allDiscoveries.filter((d) => {
      if (d.status !== "HANDOFF" && d.status !== "DROP") return false;
      if (!d.decidedAt) return false;
      return new Date(d.decidedAt) >= oneWeekAgo;
    }).length;

    const summaryData = {
      totalActive: activeDiscoveries.length,
      statusCounts,
      overdueCount,
      stalledCount,
      newThisWeek,
      completedThisWeek,
    };

    const { subject, html } = buildWeeklySummaryEmail(summaryData);

    // Send to tenant members only
    const tenantMemberRows = await db
      .select({ userId: tenantMembers.userId })
      .from(tenantMembers)
      .where(eq(tenantMembers.tenantId, tenantId));
    const tenantUserIds = new Set(tenantMemberRows.map((m) => m.userId));

    const allUsers = await db.select().from(users);
    const recipients = allUsers
      .filter((u) => tenantUserIds.has(u.id) && !u.email.endsWith("@system"))
      .map((u) => u.email);

    for (let i = 0; i < recipients.length; i++) {
      const email = recipients[i];
      const result = await emailClient.send({ to: email, subject, html });
      if (result.success) sent++;
      else if (result.error) errors.push(`weeklySummary→${email}: ${result.error}`);
      // Resend rate limit (2 req/s) 회피를 위한 delay
      if (i < recipients.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }
    }
  } // end tenant loop

  return { sent, errors };
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as CronEnv;

  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await runWeeklySummary(env);

  return new Response(JSON.stringify(result, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}

export { runWeeklySummary as weeklyHandler };
