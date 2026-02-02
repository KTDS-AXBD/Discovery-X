/**
 * Webhook connector: sends alert payloads to registered webhook URLs.
 * Supports Slack (Block Kit), Teams (MessageCard), and custom JSON.
 */

import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import { webhookConfigs } from "~/db/schema";

interface AlertPayload {
  id: string;
  alertType: string;
  severity: string;
  message: string;
  discoveryId: string | null;
  kpiId: string | null;
}

const WEBHOOK_TIMEOUT_MS = 5000;

/**
 * Send alert to all matching enabled webhook configs.
 * Returns count of successful sends.
 */
export async function fireWebhooks(db: DB, alert: AlertPayload): Promise<number> {
  const configs = await db
    .select()
    .from(webhookConfigs)
    .where(eq(webhookConfigs.enabled, 1));

  let sent = 0;

  for (const config of configs) {
    // Check event filter
    if (config.events && Array.isArray(config.events)) {
      if (!config.events.includes(alert.alertType) && !config.events.includes("*")) {
        continue;
      }
    }

    const payload = buildPayload(config.platform || "custom", alert);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(config.headers || {}),
    };

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

      const response = await fetch(config.url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        sent++;
      } else {
        console.error(
          `[webhook] ${config.name} failed: ${response.status} ${response.statusText}`
        );
      }
    } catch (error) {
      console.error(
        `[webhook] ${config.name} error:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  return sent;
}

function buildPayload(
  platform: string,
  alert: AlertPayload
): Record<string, unknown> {
  switch (platform) {
    case "slack":
      return buildSlackPayload(alert);
    case "teams":
      return buildTeamsPayload(alert);
    default:
      return buildCustomPayload(alert);
  }
}

function severityColor(severity: string): string {
  switch (severity) {
    case "critical":
      return "#dc2626";
    case "warning":
      return "#f59e0b";
    default:
      return "#3b82f6";
  }
}

function severityEmoji(severity: string): string {
  switch (severity) {
    case "critical":
      return "🔴";
    case "warning":
      return "🟡";
    default:
      return "🔵";
  }
}

function buildSlackPayload(alert: AlertPayload): Record<string, unknown> {
  return {
    text: `${severityEmoji(alert.severity)} [Discovery-X] ${alert.message}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `${severityEmoji(alert.severity)} *${alert.severity.toUpperCase()}*\n${alert.message}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Alert ID: \`${alert.id}\` | Type: \`${alert.alertType}\`${alert.discoveryId ? ` | Discovery: \`${alert.discoveryId}\`` : ""}`,
          },
        ],
      },
    ],
    attachments: [
      {
        color: severityColor(alert.severity),
        fallback: alert.message,
      },
    ],
  };
}

function buildTeamsPayload(alert: AlertPayload): Record<string, unknown> {
  return {
    "@type": "MessageCard",
    "@context": "http://schema.org/extensions",
    themeColor: severityColor(alert.severity).replace("#", ""),
    summary: `[Discovery-X] ${alert.message}`,
    sections: [
      {
        activityTitle: `${severityEmoji(alert.severity)} Discovery-X Alert`,
        activitySubtitle: alert.severity.toUpperCase(),
        facts: [
          { name: "Type", value: alert.alertType },
          { name: "Severity", value: alert.severity },
          ...(alert.discoveryId
            ? [{ name: "Discovery", value: alert.discoveryId }]
            : []),
        ],
        text: alert.message,
      },
    ],
  };
}

function buildCustomPayload(alert: AlertPayload): Record<string, unknown> {
  return {
    alertId: alert.id,
    type: alert.alertType,
    severity: alert.severity,
    message: alert.message,
    discoveryId: alert.discoveryId,
    kpiId: alert.kpiId,
    timestamp: new Date().toISOString(),
    source: "discovery-x",
  };
}
