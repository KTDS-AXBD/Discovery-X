import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { discoveries, users, tenants, tenantMembers } from "~/db/schema";
import { eq, inArray, and, lt } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import { ACTIVE_STATUSES } from "~/lib/constants/status";
import { DiscoveryValidationRules, ValidationError } from "~/lib/validation/discovery-rules";
import { formatDate } from "~/lib/format-date";
import { createEmailClient } from "~/lib/notifications/email";
import {
  buildOverdueEmail,
  buildDueSoonEmail,
  buildRevisitEmail,
  buildAutoClosedEmail,
  buildGateExpiredEmail,
  buildGateReminderEmail,
  buildStalledStageEmail,
  type OverdueDiscovery,
  type ExpiringDiscovery,
  type RevisitDiscovery,
  type AutoClosedDiscovery,
  type StalledStageDiscovery,
} from "~/lib/notifications/templates";
import { processExpiredGateApprovals, scanAndFireAlerts, DEFAULT_ALERT_RULES } from "~/lib/notifications/alert-engine";
import { fireWebhooks } from "~/lib/notifications/webhook";
import { eventLogs, alertRules } from "~/db/schema";

interface CronEnv {
  DB: D1Database;
  RESEND_API_KEY?: string;
  CRON_SECRET?: string;
}

async function ensureDefaultAlertRules(db: ReturnType<typeof getDb>) {
  const existing = await db.select().from(alertRules);
  if (existing.length > 0) return;
  for (const rule of DEFAULT_ALERT_RULES) {
    await db.insert(alertRules).values(rule);
  }
}

async function runDailyNotifications(env: CronEnv): Promise<{ sent: number; errors: string[]; autoClosed: number; inboxExpired: number; gateExpired: number; gateHeld: number; alertsFired: number; alertsWebhooksSent: number }> {
  const db = getDb(env.DB);
  const errors: string[] = [];
  let sent = 0;

  const apiKey = env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: 0, errors: ["RESEND_API_KEY not configured"], autoClosed: 0, inboxExpired: 0, gateExpired: 0, gateHeld: 0, alertsFired: 0, alertsWebhooksSent: 0 };
  }

  const emailClient = createEmailClient(apiKey);
  const now = new Date();
  const threeDaysFromNow = new Date();
  threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

  // Get all active tenants
  const activeTenants = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.status, "active"));

  let gateExpired = 0;
  let gateHeld = 0;
  let totalAutoClosed = 0;
  let totalInboxExpired = 0;

  for (const tenant of activeTenants) {
    const tenantId = tenant.id;

    // Get users for this tenant
    const tenantMemberRows = await db
      .select({ userId: tenantMembers.userId })
      .from(tenantMembers)
      .where(eq(tenantMembers.tenantId, tenantId));
    const tenantUserIds = new Set(tenantMemberRows.map((m) => m.userId));

    const allUsers = await db.select().from(users);
    const tenantUsers = allUsers.filter((u) => tenantUserIds.has(u.id));
    const userMap = new Map(tenantUsers.map((u) => [u.id, u]));

    // 1. Find overdue active discoveries for this tenant
    const activeDiscoveries = await db
      .select()
      .from(discoveries)
      .where(and(
        inArray(discoveries.status, [...ACTIVE_STATUSES]),
        eq(discoveries.tenantId, tenantId)
      ));

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
          dueDate: formatDate(dueDate),
          ownerName,
          daysOverdue,
        });
      } else if (dueDate <= threeDaysFromNow) {
        const daysRemaining = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        dueSoonItems.push({
          id: d.id,
          title: d.title,
          dueDate: formatDate(dueDate),
          ownerName,
          daysRemaining,
        });
      }
    }

    // 2. Find NOT_NOW discoveries with revisitDate <= today for this tenant
    const notNowDiscoveries = await db
      .select()
      .from(discoveries)
      .where(and(
        eq(discoveries.status, DiscoveryStatus.HOLD),
        eq(discoveries.tenantId, tenantId)
      ));

    const revisitItems: RevisitDiscovery[] = notNowDiscoveries
      .filter((d) => d.revisitDate && new Date(d.revisitDate) <= now)
      .map((d) => ({
        id: d.id,
        title: d.title,
        revisitDate: formatDate(d.revisitDate!),
        triggerType: d.notNowTriggerType || "",
        triggerCondition: d.notNowTriggerCondition || "",
      }));

    // 3. Send emails to tenant users (broadcast approach for small team)
    const recipients = tenantUsers
      .filter((u) => !u.email.endsWith("@system"))
      .map((u) => u.email);

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

    // 4. Auto-close overdue discoveries as DEAD_END
    // Exclude items with approvalStatus === "PENDING" (awaiting reviewer approval)
    const autoCloseTargets = activeDiscoveries.filter((d) => {
      if (!d.dueDate) return false;
      if (d.approvalStatus === "PENDING") return false;
      return new Date(d.dueDate) < now;
    });

    const autoClosedItems: AutoClosedDiscovery[] = [];

    for (const d of autoCloseTargets) {
      // Validate transition is allowed
      try {
        DiscoveryValidationRules.validateTransition(d.status, DiscoveryStatus.DROP);
      } catch (e) {
        if (e instanceof ValidationError) continue;
        throw e;
      }

      const dueDate = new Date(d.dueDate!);
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      const owner = d.ownerId ? userMap.get(d.ownerId) : null;

      await db
        .update(discoveries)
        .set({
          status: DiscoveryStatus.DROP,
          deadEndFailurePattern: ["time_constraint"],
          deadEndEvidenceReason: `자동 종료: ${daysOverdue}일 기한 초과`,
          decidedAt: now,
          updatedAt: now,
        })
        .where(eq(discoveries.id, d.id));

      await db.insert(eventLogs).values({
        id: crypto.randomUUID(),
        actorId: "system-radar",
        discoveryId: d.id,
        eventType: "AUTO_CLOSED_OVERDUE",
        metadata: { daysOverdue, previousStatus: d.status },
      });

      autoClosedItems.push({
        id: d.id,
        title: d.title,
        ownerName: owner?.name || "미지정",
        daysOverdue,
      });
    }

    if (autoClosedItems.length > 0) {
      const { subject, html } = buildAutoClosedEmail(autoClosedItems);
      for (const email of recipients) {
        const result = await emailClient.send({ to: email, subject, html });
        if (result.success) sent++;
        else if (result.error) errors.push(`autoClosed→${email}: ${result.error}`);
      }
    }

    totalAutoClosed += autoClosedItems.length;

    // 5. Stage SLA check — notify for discoveries stalled > 14 days in a stage
    const STAGE_SLA_DAYS = 14;
    const stalledItems: StalledStageDiscovery[] = [];
    for (const d of activeDiscoveries) {
      if (!d.stageUpdatedAt) continue;
      const stageDate = new Date(d.stageUpdatedAt);
      const daysInStage = Math.floor((now.getTime() - stageDate.getTime()) / (1000 * 60 * 60 * 24));
      if (daysInStage > STAGE_SLA_DAYS) {
        const owner = d.ownerId ? userMap.get(d.ownerId) : null;
        stalledItems.push({
          id: d.id,
          title: d.title,
          status: d.status,
          ownerName: owner?.name || "미지정",
          daysInStage,
        });
      }
    }

    if (stalledItems.length > 0) {
      const { subject, html } = buildStalledStageEmail(stalledItems);
      for (const email of recipients) {
        const result = await emailClient.send({ to: email, subject, html });
        if (result.success) sent++;
        else if (result.error) errors.push(`stalledStage→${email}: ${result.error}`);
      }
    }

    // 6. Inbox TTL 만료 처리 — DISCOVERY 상태 14일 초과 시 자동 DROP
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const expiredInboxItems = await db
      .select()
      .from(discoveries)
      .where(
        and(
          eq(discoveries.status, DiscoveryStatus.DISCOVERY),
          lt(discoveries.createdAt, fourteenDaysAgo),
          eq(discoveries.tenantId, tenantId)
        )
      );

    for (const d of expiredInboxItems) {
      try {
        DiscoveryValidationRules.validateTransition(d.status, DiscoveryStatus.DROP);
      } catch (e) {
        if (e instanceof ValidationError) continue;
        throw e;
      }

      await db
        .update(discoveries)
        .set({
          status: DiscoveryStatus.DROP,
          deadEndFailurePattern: ["inbox_timeout"],
          deadEndEvidenceReason: `Inbox 자동 만료: 14일 초과 미처리`,
          decidedAt: now,
          updatedAt: now,
        })
        .where(eq(discoveries.id, d.id));

      await db.insert(eventLogs).values({
        id: crypto.randomUUID(),
        actorId: "system-radar",
        discoveryId: d.id,
        eventType: "INBOX_EXPIRED",
        metadata: {
          daysInInbox: Math.floor((now.getTime() - new Date(d.createdAt).getTime()) / (1000 * 60 * 60 * 24)),
          previousStatus: d.status,
        },
      });

      totalInboxExpired++;
    }
  } // end tenant loop

  // 7. Process expired gate approvals (auto-reject + HOLD) — runs globally
  try {
    const gateResult = await processExpiredGateApprovals(db);
    gateExpired = gateResult.expiredCount;
    gateHeld = gateResult.holdCount;

    // Get all non-system users for gate notifications
    const allUsers = await db.select().from(users);
    const recipients = allUsers
      .filter((u) => !u.email.endsWith("@system"))
      .map((u) => u.email);

    // Send gate expired notification
    if (gateResult.expiredCount > 0) {
      const { subject, html } = buildGateExpiredEmail({
        expiredCount: gateResult.expiredCount,
        holdCount: gateResult.holdCount,
        items: gateResult.details.expired.map((e) => ({
          gatePackageId: e.gatePackageId,
          reviewerId: e.reviewerId,
        })),
      });
      for (const email of recipients) {
        const result = await emailClient.send({ to: email, subject, html });
        if (result.success) sent++;
        else if (result.error) errors.push(`gateExpired→${email}: ${result.error}`);
      }
    }

    // Send gate reminder notification (< 24h to deadline)
    if (gateResult.reminderCount > 0) {
      const { subject, html } = buildGateReminderEmail({
        reminderCount: gateResult.reminderCount,
        items: gateResult.details.reminders.map((r) => ({
          gatePackageId: r.gatePackageId,
          reviewerId: r.reviewerId,
          hoursLeft: r.hoursLeft,
        })),
      });
      for (const email of recipients) {
        const result = await emailClient.send({ to: email, subject, html });
        if (result.success) sent++;
        else if (result.error) errors.push(`gateReminder→${email}: ${result.error}`);
      }
    }
  } catch (e) {
    errors.push(`gateTimeout: ${e instanceof Error ? e.message : "Unknown error"}`);
  }

  // 8. Alert scan (KPI 임계값 + SLA 위반 감지)
  let alertsFired = 0;
  let alertsWebhooksSent = 0;
  try {
    await ensureDefaultAlertRules(db);
    for (const tenant of activeTenants) {
      const firedAlerts = await scanAndFireAlerts(db, tenant.id);
      alertsFired += firedAlerts.length;
      for (const alert of firedAlerts) {
        try {
          const sent = await fireWebhooks(db, alert);
          alertsWebhooksSent += sent;
        } catch (e) {
          errors.push(`webhook for alert ${alert.id}: ${e instanceof Error ? e.message : "unknown error"}`);
        }
      }
    }
  } catch (e) {
    errors.push(`alertScan: ${e instanceof Error ? e.message : "Unknown error"}`);
  }

  return { sent, errors, autoClosed: totalAutoClosed, inboxExpired: totalInboxExpired, gateExpired, gateHeld, alertsFired, alertsWebhooksSent };
}

// HTTP endpoint for manual trigger
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as CronEnv;

  // Verify cron secret for manual triggers
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET) {
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
