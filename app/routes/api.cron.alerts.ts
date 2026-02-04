/**
 * /api/cron/alerts — Daily alert scan cron endpoint.
 * Scans for KPI threshold violations, stage SLA breaches, overdue discoveries,
 * and gate approval SLA expirations. Fires webhooks for new alerts.
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { alertRules } from "~/db/schema";
import { scanAndFireAlerts, DEFAULT_ALERT_RULES } from "~/lib/notifications/alert-engine";
import { fireWebhooks } from "~/lib/notifications/webhook";

interface CronEnv {
  DB: D1Database;
  CRON_SECRET?: string;
}

async function ensureDefaultRules(db: ReturnType<typeof getDb>) {
  const existing = await db.select().from(alertRules);
  if (existing.length > 0) return;

  for (const rule of DEFAULT_ALERT_RULES) {
    await db.insert(alertRules).values(rule);
  }
}

async function runAlertScan(env: CronEnv): Promise<{ fired: number; webhooksSent: number; errors: string[] }> {
  const db = getDb(env.DB);
  const errors: string[] = [];

  // Ensure default alert rules exist
  await ensureDefaultRules(db);

  // Scan and fire alerts
  const firedAlerts = await scanAndFireAlerts(db);

  // Send webhooks for each new alert
  let webhooksSent = 0;
  for (const alert of firedAlerts) {
    try {
      const sent = await fireWebhooks(db, alert);
      webhooksSent += sent;
    } catch (e) {
      errors.push(
        `webhook for alert ${alert.id}: ${e instanceof Error ? e.message : "unknown error"}`
      );
    }
  }

  return { fired: firedAlerts.length, webhooksSent, errors };
}

// HTTP endpoint for manual trigger
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as CronEnv;

  // Verify cron secret
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await runAlertScan(env);

  return new Response(JSON.stringify(result, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}

export { runAlertScan };
