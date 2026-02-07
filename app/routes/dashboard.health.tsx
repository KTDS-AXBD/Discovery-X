/**
 * /dashboard/health — Pipeline health metrics view.
 * v3 R3: Stage dwell time, transition rates, evidence quality.
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, evidence, experiments, eventLogs } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { tenantWhere } from "~/lib/query/tenant-scope";
import { desc, inArray, sql } from "drizzle-orm";
import { HealthMetrics } from "~/components/dashboard/HealthMetrics";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return json({ health: null });

  const allDiscoveries = await db.select().from(discoveries)
    .where(tenantWhere(discoveries, ctx.tenantId));
  const discoveryIds = allDiscoveries.map(d => d.id);
  const allEvidence = discoveryIds.length > 0
    ? await db.select().from(evidence).where(inArray(evidence.discoveryId, discoveryIds))
    : [];
  const allExperiments = discoveryIds.length > 0
    ? await db.select().from(experiments).where(inArray(experiments.discoveryId, discoveryIds))
    : [];
  const allEvents = discoveryIds.length > 0
    ? await db.select().from(eventLogs)
        .where(sql`${eventLogs.discoveryId} IN (SELECT id FROM discoveries WHERE tenant_id = ${ctx.tenantId})`)
        .orderBy(desc(eventLogs.timestamp))
    : [];

  const now = new Date();

  // 1) Stage dwell time
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

  // 2) Stage transitions
  const transitionEvents = allEvents.filter((e) => e.eventType === "stage_transition");
  const stageTransitions: Record<string, number> = {};
  for (const ev of transitionEvents) {
    const meta = ev.metadata as { fromStatus?: string; toStatus?: string } | null;
    if (meta?.fromStatus) {
      const key = `${meta.fromStatus} → ${meta.toStatus}`;
      stageTransitions[key] = (stageTransitions[key] || 0) + 1;
    }
  }

  // 3) Evidence quality
  const evidenceByStrength: Record<string, number> = {};
  for (const e of allEvidence) {
    evidenceByStrength[e.strength] = (evidenceByStrength[e.strength] || 0) + 1;
  }
  const totalEvidence = allEvidence.length;
  const strongRatio = totalEvidence > 0
    ? Math.round(((evidenceByStrength["A"] || 0) + (evidenceByStrength["B"] || 0)) / totalEvidence * 100)
    : 0;

  // 4) Overdue
  const overdueCount = allDiscoveries.filter(
    (d) => d.dueDate && d.dueDate < now && d.status !== "HOLD" && d.status !== "DROP" && d.status !== "HANDOFF"
  ).length;

  // 5) Experiment completion
  const totalExp = allExperiments.length;
  const completedExp = allExperiments.filter((e) => e.completedAt).length;
  const expCompletionRate = totalExp > 0 ? Math.round((completedExp / totalExp) * 100) : 0;

  const activeCount = allDiscoveries.filter(
    (d) => d.status !== "HOLD" && d.status !== "DROP" && d.status !== "HANDOFF"
  ).length;
  const terminalCount = allDiscoveries.length - activeCount;

  return json({
    health: {
      summary: {
        totalDiscoveries: allDiscoveries.length,
        activeCount,
        terminalCount,
        overdueCount,
        totalEvidence,
        strongEvidenceRatio: `${strongRatio}%`,
        experimentCompletionRate: `${expCompletionRate}%`,
      },
      avgDwellByStage,
      stageTransitions,
      evidenceByStrength,
    },
  });
}

export default function DashboardHealth() {
  const { health } = useLoaderData<typeof loader>();

  if (!health) return null;

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-[var(--axis-text-primary)]">
        파이프라인 건강도
      </h2>
      <HealthMetrics data={health} />
    </div>
  );
}
