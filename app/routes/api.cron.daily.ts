import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { discoveries, users } from "~/db/schema";
import { eq } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import { createEmailClient } from "~/lib/notifications/email";
import {
  buildOverdueEmail,
  buildDueSoonEmail,
  buildRevisitEmail,
  type OverdueDiscovery,
  type ExpiringDiscovery,
  type RevisitDiscovery,
} from "~/lib/notifications/templates";

interface CronEnv {
  DB: D1Database;
  RESEND_API_KEY?: string;
  CRON_SECRET?: string;
}

async function runDailyNotifications(env: CronEnv): Promise<{ sent: number; errors: string[] }> {
  const db = getDb(env.DB);
  const errors: string[] = [];
  let sent = 0;

  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: 0, errors: ["RESEND_API_KEY not configured"] };
  }

  const emailClient = createEmailClient(apiKey);
  const now = new Date();
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  // Get all users for email lookup
  const allUsers = await db.select().from(users);
  const userMap = new Map(allUsers.map((u) => [u.id, u]));

  // 1. Find overdue OPEN/EXTENSION_REQUESTED discoveries
  const openDiscoveries = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.status, DiscoveryStatus.OPEN));
  const extDiscoveries = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.status, DiscoveryStatus.EXTENSION_REQUESTED));
  const activeDiscoveries = [...openDiscoveries, ...extDiscoveries];

  const overdueItems: OverdueDiscovery[] = [];
  const dueSoonItems: ExpiringDiscovery[] = [];

  for (const d of activeDiscoveries) {
    if (!d.dueDate) continue;
    const dueDate = new Date(d.dueDate);
    const owner = d.ownerId ? userMap.get(d.ownerId) : null;
    const ownerName = owner?.name || "미지정";

    if (dueDate < now) {
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      overdueItems.push({
        id: d.id,
        title: d.title,
        dueDate: dueDate.toLocaleDateString("ko-KR"),
        ownerName,
        daysOverdue,
      });
    } else if (dueDate <= threeDaysFromNow) {
      const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      dueSoonItems.push({
        id: d.id,
        title: d.title,
        dueDate: dueDate.toLocaleDateString("ko-KR"),
        ownerName,
        daysRemaining,
      });
    }
  }

  // 2. Find NOT_NOW discoveries with revisitDate <= today
  const notNowDiscoveries = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.status, DiscoveryStatus.NOT_NOW));

  const revisitItems: RevisitDiscovery[] = notNowDiscoveries
    .filter((d) => d.revisitDate && new Date(d.revisitDate) <= now)
    .map((d) => ({
      id: d.id,
      title: d.title,
      revisitDate: new Date(d.revisitDate!).toLocaleDateString("ko-KR"),
      triggerType: d.notNowTriggerType || "",
      triggerCondition: d.notNowTriggerCondition || "",
    }));

  // 3. Send emails to all users (broadcast approach for small team)
  const recipients = allUsers.map((u) => u.email);

  if (overdueItems.length > 0) {
    const { subject, html } = buildOverdueEmail(overdueItems);
    for (const email of recipients) {
      const result = await emailClient.send({ to: email, subject, html });
      if (result.success) sent++;
      else if (result.error) errors.push(`overdue→${email}: ${result.error}`);
    }
  }

  if (dueSoonItems.length > 0) {
    const { subject, html } = buildDueSoonEmail(dueSoonItems);
    for (const email of recipients) {
      const result = await emailClient.send({ to: email, subject, html });
      if (result.success) sent++;
      else if (result.error) errors.push(`dueSoon→${email}: ${result.error}`);
    }
  }

  if (revisitItems.length > 0) {
    const { subject, html } = buildRevisitEmail(revisitItems);
    for (const email of recipients) {
      const result = await emailClient.send({ to: email, subject, html });
      if (result.success) sent++;
      else if (result.error) errors.push(`revisit→${email}: ${result.error}`);
    }
  }

  return { sent, errors };
}

// HTTP endpoint for manual trigger
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as CronEnv;

  // Verify cron secret for manual triggers
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (env.CRON_SECRET && secret !== env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await runDailyNotifications(env);

  return new Response(JSON.stringify(result, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}

// Cloudflare Cron Trigger handler
// Note: For Cloudflare Pages, cron triggers work via _worker.js scheduled handler
// This export allows the cron to call this endpoint internally
export { runDailyNotifications };
