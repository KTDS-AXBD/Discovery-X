/**
 * Indicator tools — KPI registration, measurement, status, pipeline health.
 * v3 R3: 4 tools for leading indicator management.
 */

import { eq, desc } from "drizzle-orm";
import type { DB } from "~/db";
import {
  discoveryKpis,
  kpiMeasurements,
  discoveries,
  evidence,
  eventLogs,
  experiments,
} from "~/db/schema";

function generateId(): string {
  return crypto.randomUUID();
}

/**
 * register_kpi — Discovery에 KPI 등록 (최대 5개)
 */
export async function registerKpi(
  db: DB,
  input: {
    discoveryId: string;
    name: string;
    unit: string;
    targetValue?: number;
    warningThreshold?: number;
    criticalThreshold?: number;
    direction?: string;
    methodPackId?: string;
  }
): Promise<string> {
  // Check discovery exists
  const disc = await db
    .select({ id: discoveries.id })
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (disc.length === 0) {
    return JSON.stringify({ error: `Discovery를 찾을 수 없습니다: ${input.discoveryId}` });
  }

  // Check max 5 KPIs per discovery
  const existingKpis = await db
    .select({ id: discoveryKpis.id })
    .from(discoveryKpis)
    .where(eq(discoveryKpis.discoveryId, input.discoveryId));

  if (existingKpis.length >= 5) {
    return JSON.stringify({ error: "Discovery당 KPI는 최대 5개까지 등록할 수 있습니다." });
  }

  const id = generateId();
  await db.insert(discoveryKpis).values({
    id,
    discoveryId: input.discoveryId,
    name: input.name,
    unit: input.unit,
    targetValue: input.targetValue,
    warningThreshold: input.warningThreshold,
    criticalThreshold: input.criticalThreshold,
    direction: input.direction || "higher_is_better",
    methodPackId: input.methodPackId,
  });

  return JSON.stringify({
    success: true,
    kpiId: id,
    message: `KPI "${input.name}" 등록 완료 (${existingKpis.length + 1}/5)`,
  });
}

/**
 * record_kpi_measurement — KPI 측정값 입력
 */
export async function recordKpiMeasurement(
  db: DB,
  input: {
    kpiId: string;
    value: number;
    note?: string;
    measuredAt?: string;
  }
): Promise<string> {
  // Check KPI exists
  const kpi = await db
    .select()
    .from(discoveryKpis)
    .where(eq(discoveryKpis.id, input.kpiId))
    .limit(1);

  if (kpi.length === 0) {
    return JSON.stringify({ error: `KPI를 찾을 수 없습니다: ${input.kpiId}` });
  }

  const id = generateId();
  const measuredAt = input.measuredAt ? new Date(input.measuredAt) : new Date();

  await db.insert(kpiMeasurements).values({
    id,
    kpiId: input.kpiId,
    value: input.value,
    note: input.note,
    measuredAt,
  });

  // Check threshold violations
  const k = kpi[0];
  let warning: string | undefined;
  const isHigherBetter = k.direction === "higher_is_better";

  if (k.criticalThreshold != null) {
    const violated = isHigherBetter
      ? input.value <= k.criticalThreshold
      : input.value >= k.criticalThreshold;
    if (violated) {
      warning = `⚠️ CRITICAL: "${k.name}" 값(${input.value})이 임계치(${k.criticalThreshold})를 초과했습니다.`;
    }
  }
  if (!warning && k.warningThreshold != null) {
    const violated = isHigherBetter
      ? input.value <= k.warningThreshold
      : input.value >= k.warningThreshold;
    if (violated) {
      warning = `주의: "${k.name}" 값(${input.value})이 경고 임계치(${k.warningThreshold})에 도달했습니다.`;
    }
  }

  return JSON.stringify({
    success: true,
    measurementId: id,
    kpiName: k.name,
    value: input.value,
    warning,
  });
}

/**
 * get_kpi_status — KPI 현황 + 임계치 위반 조회
 */
export async function getKpiStatus(
  db: DB,
  input: { discoveryId: string }
): Promise<string> {
  const kpis = await db
    .select()
    .from(discoveryKpis)
    .where(eq(discoveryKpis.discoveryId, input.discoveryId));

  if (kpis.length === 0) {
    return JSON.stringify({ kpis: [], message: "등록된 KPI가 없습니다." });
  }

  const result = [];
  for (const kpi of kpis) {
    const measurements = await db
      .select()
      .from(kpiMeasurements)
      .where(eq(kpiMeasurements.kpiId, kpi.id))
      .orderBy(desc(kpiMeasurements.measuredAt))
      .limit(10);

    const latest = measurements[0];
    const isHigherBetter = kpi.direction === "higher_is_better";
    let status = "normal";

    if (latest && kpi.criticalThreshold != null) {
      const violated = isHigherBetter
        ? latest.value <= kpi.criticalThreshold
        : latest.value >= kpi.criticalThreshold;
      if (violated) status = "critical";
    }
    if (status === "normal" && latest && kpi.warningThreshold != null) {
      const violated = isHigherBetter
        ? latest.value <= kpi.warningThreshold
        : latest.value >= kpi.warningThreshold;
      if (violated) status = "warning";
    }

    // Trend: compare latest vs previous
    let trend: string | undefined;
    if (measurements.length >= 2) {
      const diff = latest.value - measurements[1].value;
      trend = diff > 0 ? `+${diff}` : `${diff}`;
    }

    result.push({
      id: kpi.id,
      name: kpi.name,
      unit: kpi.unit,
      target: kpi.targetValue,
      direction: kpi.direction,
      latestValue: latest?.value ?? null,
      latestMeasuredAt: latest?.measuredAt ?? null,
      measurementCount: measurements.length,
      trend,
      status,
      methodPackId: kpi.methodPackId,
    });
  }

  return JSON.stringify({ kpis: result });
}

/**
 * get_pipeline_health — 시스템 전체 건강지표
 */
export async function getPipelineHealth(
  db: DB,
  _input: Record<string, unknown>
): Promise<string> {
  const allDiscoveries = await db.select().from(discoveries);
  const allEvidence = await db.select().from(evidence);
  const allExperiments = await db.select().from(experiments);
  const allEvents = await db
    .select()
    .from(eventLogs)
    .orderBy(desc(eventLogs.timestamp));

  const now = new Date();

  // 1) Stage dwell time (avg days per stage for active discoveries)
  const stageDwell: Record<string, { total: number; count: number }> = {};
  for (const d of allDiscoveries) {
    if (d.status === "HOLD" || d.status === "DROP") continue;
    const stageStart = d.stageUpdatedAt || d.createdAt;
    if (stageStart) {
      const days = (now.getTime() - stageStart.getTime()) / (1000 * 60 * 60 * 24);
      if (!stageDwell[d.status]) stageDwell[d.status] = { total: 0, count: 0 };
      stageDwell[d.status].total += days;
      stageDwell[d.status].count += 1;
    }
  }

  const avgDwellByStage: Record<string, number> = {};
  for (const [stage, data] of Object.entries(stageDwell)) {
    avgDwellByStage[stage] = Math.round((data.total / data.count) * 10) / 10;
  }

  // 2) Stage transition rates (from event logs)
  const transitionEvents = allEvents.filter((e) => e.eventType === "stage_transition");
  const stageTransitions: Record<string, number> = {};
  for (const ev of transitionEvents) {
    const meta = ev.metadata as { fromStatus?: string; toStatus?: string } | null;
    if (meta?.fromStatus) {
      const key = `${meta.fromStatus} → ${meta.toStatus}`;
      stageTransitions[key] = (stageTransitions[key] || 0) + 1;
    }
  }

  // 3) Evidence quality distribution
  const evidenceByStrength: Record<string, number> = {};
  for (const e of allEvidence) {
    evidenceByStrength[e.strength] = (evidenceByStrength[e.strength] || 0) + 1;
  }
  const totalEvidence = allEvidence.length;
  const strongRatio = totalEvidence > 0
    ? Math.round(((evidenceByStrength["A"] || 0) + (evidenceByStrength["B"] || 0)) / totalEvidence * 100)
    : 0;

  // 4) Overdue discoveries
  const overdue = allDiscoveries.filter(
    (d) => d.dueDate && d.dueDate < now && d.status !== "HOLD" && d.status !== "DROP" && d.status !== "HANDOFF"
  ).length;

  // 5) Experiment completion rate
  const totalExp = allExperiments.length;
  const completedExp = allExperiments.filter((e) => e.completedAt).length;
  const expCompletionRate = totalExp > 0 ? Math.round((completedExp / totalExp) * 100) : 0;

  // 6) Active / Terminal counts
  const activeCount = allDiscoveries.filter(
    (d) => d.status !== "HOLD" && d.status !== "DROP" && d.status !== "HANDOFF"
  ).length;
  const terminalCount = allDiscoveries.filter(
    (d) => d.status === "HOLD" || d.status === "DROP" || d.status === "HANDOFF"
  ).length;

  return JSON.stringify({
    summary: {
      totalDiscoveries: allDiscoveries.length,
      activeCount,
      terminalCount,
      overdueCount: overdue,
      totalEvidence,
      strongEvidenceRatio: `${strongRatio}%`,
      experimentCompletionRate: `${expCompletionRate}%`,
    },
    avgDwellByStage,
    stageTransitions,
    evidenceByStrength,
  });
}
