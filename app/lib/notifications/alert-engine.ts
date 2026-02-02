/**
 * Alert Engine: scans for KPI threshold violations, stage SLA breaches,
 * overdue discoveries, and gate approval SLA expirations.
 * Creates alert records in the alerts table.
 */

import { eq, sql } from "drizzle-orm";
import type { DB } from "~/db";
import {
  alerts,
  alertRules,
  discoveries,
  discoveryKpis,
  kpiMeasurements,
  gateApprovals,
  AlertType,
  AlertSeverity,
} from "~/db/schema";

interface FiredAlert {
  id: string;
  alertType: string;
  severity: string;
  message: string;
  discoveryId: string | null;
  kpiId: string | null;
}

const STAGE_SLA_DAYS = 14;

/**
 * Scan all 4 alert types and create alert records for violations.
 * Deduplicates: skips if same alertType + discoveryId already fired today.
 */
export async function scanAndFireAlerts(db: DB): Promise<FiredAlert[]> {
  const fired: FiredAlert[] = [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // Get today's existing alerts for dedup
  const todayAlerts = await db
    .select({ id: alerts.id, discoveryId: alerts.discoveryId, kpiId: alerts.kpiId, ruleId: alerts.ruleId })
    .from(alerts)
    .where(sql`${alerts.firedAt} >= ${Math.floor(todayStart.getTime() / 1000)}`);

  const todayAlertKeys = new Set(
    todayAlerts.map((a) => `${a.ruleId}:${a.discoveryId || ""}:${a.kpiId || ""}`)
  );

  // Load enabled rules
  const rules = await db
    .select()
    .from(alertRules)
    .where(eq(alertRules.enabled, 1));

  const ruleByType = new Map(rules.map((r) => [r.alertType, r]));

  // 1. KPI Threshold violations
  const kpiRule = ruleByType.get(AlertType.KPI_THRESHOLD);
  if (kpiRule) {
    const kpis = await db.select().from(discoveryKpis);
    for (const kpi of kpis) {
      if (!kpi.criticalThreshold && !kpi.warningThreshold) continue;

      const key = `${kpiRule.id}:${kpi.discoveryId}:${kpi.id}`;
      if (todayAlertKeys.has(key)) continue;

      // Get latest measurement
      const latest = await db
        .select()
        .from(kpiMeasurements)
        .where(eq(kpiMeasurements.kpiId, kpi.id))
        .orderBy(sql`${kpiMeasurements.measuredAt} DESC`)
        .limit(1);

      if (latest.length === 0) continue;

      const value = latest[0].value;
      const higherBetter = kpi.direction === "higher_is_better";

      let severity: string | null = null;
      if (kpi.criticalThreshold != null) {
        const violated = higherBetter
          ? value <= kpi.criticalThreshold
          : value >= kpi.criticalThreshold;
        if (violated) severity = AlertSeverity.CRITICAL;
      }
      if (!severity && kpi.warningThreshold != null) {
        const violated = higherBetter
          ? value <= kpi.warningThreshold
          : value >= kpi.warningThreshold;
        if (violated) severity = AlertSeverity.WARNING;
      }

      if (severity) {
        const alert = await createAlert(db, {
          ruleId: kpiRule.id,
          discoveryId: kpi.discoveryId,
          kpiId: kpi.id,
          severity,
          message: `KPI "${kpi.name}" 임계치 위반: 현재값 ${value}${kpi.unit} (${severity === "critical" ? "위험" : "경고"} 임계치: ${severity === "critical" ? kpi.criticalThreshold : kpi.warningThreshold}${kpi.unit})`,
        });
        fired.push(alert);
      }
    }
  }

  // 2. Stage SLA breaches
  const slaRule = ruleByType.get(AlertType.STAGE_SLA);
  if (slaRule) {
    const now = new Date();
    const activeDiscoveries = await db
      .select()
      .from(discoveries)
      .where(
        sql`${discoveries.status} NOT IN ('HOLD', 'DROP', 'HANDOFF')`
      );

    for (const d of activeDiscoveries) {
      if (!d.stageUpdatedAt) continue;

      const key = `${slaRule.id}:${d.id}:`;
      if (todayAlertKeys.has(key)) continue;

      const daysInStage = Math.floor(
        (now.getTime() - d.stageUpdatedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysInStage > STAGE_SLA_DAYS) {
        const alert = await createAlert(db, {
          ruleId: slaRule.id,
          discoveryId: d.id,
          kpiId: null,
          severity: daysInStage > STAGE_SLA_DAYS * 2 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
          message: `"${d.title}" ${d.status} 단계 체류 ${daysInStage}일 — SLA ${STAGE_SLA_DAYS}일 초과`,
        });
        fired.push(alert);
      }
    }
  }

  // 3. Overdue discoveries
  const overdueRule = ruleByType.get(AlertType.OVERDUE);
  if (overdueRule) {
    const now = new Date();
    const activeDiscoveries = await db
      .select()
      .from(discoveries)
      .where(
        sql`${discoveries.status} NOT IN ('HOLD', 'DROP', 'HANDOFF')`
      );

    for (const d of activeDiscoveries) {
      if (!d.dueDate) continue;

      const key = `${overdueRule.id}:${d.id}:`;
      if (todayAlertKeys.has(key)) continue;

      if (d.dueDate < now) {
        const daysOverdue = Math.floor(
          (now.getTime() - d.dueDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        const alert = await createAlert(db, {
          ruleId: overdueRule.id,
          discoveryId: d.id,
          kpiId: null,
          severity: daysOverdue > 7 ? AlertSeverity.CRITICAL : AlertSeverity.WARNING,
          message: `"${d.title}" 기한 ${daysOverdue}일 초과`,
        });
        fired.push(alert);
      }
    }
  }

  // 4. Gate approval SLA breaches
  const gateRule = ruleByType.get(AlertType.GATE_APPROVAL);
  if (gateRule) {
    const now = new Date();
    const pendingApprovals = await db
      .select()
      .from(gateApprovals)
      .where(eq(gateApprovals.decision, "PENDING"));

    for (const ga of pendingApprovals) {
      if (!ga.slaDeadline) continue;

      // We don't have discoveryId directly on gateApprovals, use gatePackageId as ref
      const key = `${gateRule.id}:${ga.gatePackageId}:`;
      if (todayAlertKeys.has(key)) continue;

      if (ga.slaDeadline < now) {
        const alert = await createAlert(db, {
          ruleId: gateRule.id,
          discoveryId: ga.gatePackageId, // Use gatePackageId as reference
          kpiId: null,
          severity: AlertSeverity.WARNING,
          message: `Gate 승인 요청(${ga.id}) SLA 기한 초과 — 리뷰어 응답 대기 중`,
        });
        fired.push(alert);
      }
    }
  }

  return fired;
}

async function createAlert(
  db: DB,
  params: {
    ruleId: string;
    discoveryId: string | null;
    kpiId: string | null;
    severity: string;
    message: string;
  }
): Promise<FiredAlert> {
  const id = crypto.randomUUID();
  await db.insert(alerts).values({
    id,
    ruleId: params.ruleId,
    discoveryId: params.discoveryId,
    kpiId: params.kpiId,
    severity: params.severity,
    message: params.message,
  });
  return {
    id,
    alertType: params.ruleId,
    severity: params.severity,
    message: params.message,
    discoveryId: params.discoveryId,
    kpiId: params.kpiId,
  };
}

/**
 * Default alert rules — seed data for initial setup.
 */
export const DEFAULT_ALERT_RULES = [
  {
    id: "RULE-KPI",
    alertType: AlertType.KPI_THRESHOLD,
    name: "KPI 임계치 위반",
    condition: { description: "KPI 측정값이 warning/critical 임계치를 초과" },
    severity: AlertSeverity.WARNING,
  },
  {
    id: "RULE-SLA",
    alertType: AlertType.STAGE_SLA,
    name: "단계 SLA 초과",
    condition: { slaDays: STAGE_SLA_DAYS },
    severity: AlertSeverity.WARNING,
  },
  {
    id: "RULE-OVERDUE",
    alertType: AlertType.OVERDUE,
    name: "기한 초과",
    condition: { description: "Discovery dueDate 경과" },
    severity: AlertSeverity.WARNING,
  },
  {
    id: "RULE-GATE",
    alertType: AlertType.GATE_APPROVAL,
    name: "Gate 승인 대기 SLA 초과",
    condition: { description: "Gate 승인 요청 slaDeadline 경과" },
    severity: AlertSeverity.WARNING,
  },
];
