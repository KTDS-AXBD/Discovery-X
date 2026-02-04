/**
 * Agent tools for alert management and webhook configuration.
 */

import { eq, and, desc } from "drizzle-orm";
import type { DB } from "~/db";
import { alerts, webhookConfigs } from "~/db/schema";

// ── get_alerts ──────────────────────────────────────────────────────────────

interface GetAlertsInput {
  severity?: string;
  acknowledged?: boolean;
  limit?: number;
}

export async function getAlerts(db: DB, input: GetAlertsInput): Promise<string> {
  const limit = input.limit || 20;

  let query = db
    .select()
    .from(alerts)
    .orderBy(desc(alerts.firedAt))
    .limit(limit);

  if (input.severity) {
    query = query.where(eq(alerts.severity, input.severity)) as typeof query;
  }

  if (input.acknowledged !== undefined) {
    const ackVal = input.acknowledged ? 1 : 0;
    if (input.severity) {
      query = query.where(
        and(eq(alerts.severity, input.severity), eq(alerts.acknowledged, ackVal))
      ) as typeof query;
    } else {
      query = query.where(eq(alerts.acknowledged, ackVal)) as typeof query;
    }
  }

  const results = await query;

  return JSON.stringify({
    alerts: results.map((a) => ({
      id: a.id,
      severity: a.severity,
      message: a.message,
      discoveryId: a.discoveryId,
      kpiId: a.kpiId,
      acknowledged: !!a.acknowledged,
      firedAt: a.firedAt?.toISOString(),
      acknowledgedAt: a.acknowledgedAt?.toISOString(),
    })),
    total: results.length,
  });
}

// ── acknowledge_alert ───────────────────────────────────────────────────────

interface AcknowledgeAlertInput {
  alertId: string;
  userId?: string;
}

export async function acknowledgeAlert(db: DB, input: AcknowledgeAlertInput): Promise<string> {
  const existing = await db
    .select()
    .from(alerts)
    .where(eq(alerts.id, input.alertId))
    .limit(1);

  if (existing.length === 0) {
    return JSON.stringify({ error: `알림을 찾을 수 없습니다: ${input.alertId}` });
  }

  if (existing[0].acknowledged) {
    return JSON.stringify({ message: "이미 확인된 알림입니다.", alertId: input.alertId });
  }

  await db
    .update(alerts)
    .set({
      acknowledged: 1,
      acknowledgedAt: new Date(),
      acknowledgedBy: input.userId || null,
    })
    .where(eq(alerts.id, input.alertId));

  return JSON.stringify({
    message: "알림이 확인 처리되었습니다.",
    alertId: input.alertId,
  });
}

// ── manage_webhook ──────────────────────────────────────────────────────────

interface ManageWebhookInput {
  action: "create" | "update" | "delete" | "list";
  webhookId?: string;
  name?: string;
  url?: string;
  platform?: string;
  events?: string[];
  headers?: Record<string, string>;
  enabled?: boolean;
}

export async function manageWebhook(db: DB, input: ManageWebhookInput): Promise<string> {
  switch (input.action) {
    case "list": {
      const configs = await db.select().from(webhookConfigs);
      return JSON.stringify({
        webhooks: configs.map((c) => ({
          id: c.id,
          name: c.name,
          url: c.url,
          platform: c.platform,
          events: c.events,
          enabled: !!c.enabled,
          createdAt: c.createdAt?.toISOString(),
        })),
        total: configs.length,
      });
    }

    case "create": {
      if (!input.name || !input.url) {
        return JSON.stringify({ error: "name과 url은 필수입니다." });
      }
      if (!/^https?:\/\//i.test(input.url)) {
        return JSON.stringify({ error: "웹훅 URL은 http:// 또는 https://로 시작해야 합니다." });
      }
      const id = crypto.randomUUID();
      await db.insert(webhookConfigs).values({
        id,
        name: input.name,
        url: input.url,
        platform: input.platform || "custom",
        events: input.events || ["*"],
        headers: input.headers || {},
        enabled: input.enabled !== false ? 1 : 0,
      });
      return JSON.stringify({ message: "웹훅이 생성되었습니다.", webhookId: id });
    }

    case "update": {
      if (!input.webhookId) {
        return JSON.stringify({ error: "webhookId는 필수입니다." });
      }
      const existing = await db
        .select()
        .from(webhookConfigs)
        .where(eq(webhookConfigs.id, input.webhookId))
        .limit(1);

      if (existing.length === 0) {
        return JSON.stringify({ error: `웹훅을 찾을 수 없습니다: ${input.webhookId}` });
      }

      const updates: Record<string, unknown> = {};
      if (input.name !== undefined) updates.name = input.name;
      if (input.url !== undefined) {
        if (!/^https?:\/\//i.test(input.url)) {
          return JSON.stringify({ error: "웹훅 URL은 http:// 또는 https://로 시작해야 합니다." });
        }
        updates.url = input.url;
      }
      if (input.platform !== undefined) updates.platform = input.platform;
      if (input.events !== undefined) updates.events = input.events;
      if (input.headers !== undefined) updates.headers = input.headers;
      if (input.enabled !== undefined) updates.enabled = input.enabled ? 1 : 0;

      await db
        .update(webhookConfigs)
        .set(updates)
        .where(eq(webhookConfigs.id, input.webhookId));

      return JSON.stringify({ message: "웹훅이 업데이트되었습니다.", webhookId: input.webhookId });
    }

    case "delete": {
      if (!input.webhookId) {
        return JSON.stringify({ error: "webhookId는 필수입니다." });
      }
      await db.delete(webhookConfigs).where(eq(webhookConfigs.id, input.webhookId));
      return JSON.stringify({ message: "웹훅이 삭제되었습니다.", webhookId: input.webhookId });
    }

    default:
      return JSON.stringify({ error: `알 수 없는 action: ${input.action}` });
  }
}
