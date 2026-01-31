/**
 * Query tools — read-only operations for listing, searching, metrics, radar.
 */

import { eq, desc, sql } from "drizzle-orm";
import type { DB } from "~/db";
import {
  discoveries,
  experiments,
  evidence,
  radarItems,
  users,
  DiscoveryStatus,
} from "~/db/schema";

export async function listDiscoveries(
  db: DB,
  input: { status?: string; limit?: number }
): Promise<string> {
  const limit = input.limit || 20;

  let query = db
    .select({
      id: discoveries.id,
      title: discoveries.title,
      status: discoveries.status,
      ownerId: discoveries.ownerId,
      createdAt: discoveries.createdAt,
      dueDate: discoveries.dueDate,
      createdByAgent: discoveries.createdByAgent,
    })
    .from(discoveries);

  if (input.status) {
    query = query.where(eq(discoveries.status, input.status)) as typeof query;
  }

  const results = await query.orderBy(desc(discoveries.updatedAt)).limit(limit);

  return JSON.stringify({
    total: results.length,
    discoveries: results.map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      ownerId: d.ownerId || "미지정",
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
      dueDate: d.dueDate ? new Date(d.dueDate).toISOString() : null,
      createdByAgent: !!d.createdByAgent,
    })),
  });
}

export async function getDiscoveryDetail(
  db: DB,
  input: { discoveryId: string }
): Promise<string> {
  const discovery = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.id, input.discoveryId))
    .limit(1);

  if (!discovery[0]) return JSON.stringify({ error: "Discovery를 찾을 수 없습니다." });

  const d = discovery[0];
  const exps = await db
    .select()
    .from(experiments)
    .where(eq(experiments.discoveryId, input.discoveryId));
  const evs = await db
    .select()
    .from(evidence)
    .where(eq(evidence.discoveryId, input.discoveryId));

  return JSON.stringify({
    discovery: {
      id: d.id,
      title: d.title,
      seedSummary: d.seedSummary,
      seedLinks: d.seedLinks,
      sourceType: d.sourceType,
      status: d.status,
      ownerId: d.ownerId,
      reviewerId: d.reviewerId,
      dueDate: d.dueDate ? new Date(d.dueDate).toISOString() : null,
      createdAt: d.createdAt ? new Date(d.createdAt).toISOString() : null,
      decisionState: d.decisionState,
      decisionRationale: d.decisionRationale,
      notNowTriggerType: d.notNowTriggerType,
      revisitDate: d.revisitDate ? new Date(d.revisitDate).toISOString() : null,
      deadEndFailurePattern: d.deadEndFailurePattern,
      deadEndEvidenceReason: d.deadEndEvidenceReason,
      approvalStatus: d.approvalStatus,
      createdByAgent: !!d.createdByAgent,
    },
    experiments: exps.map((e) => ({
      id: e.id,
      hypothesis: e.hypothesis,
      minimalAction: e.minimalAction,
      deadline: e.deadline ? new Date(e.deadline).toISOString() : null,
      expectedEvidence: e.expectedEvidence,
      resultSummary: e.resultSummary,
      completed: !!e.completedAt,
    })),
    evidence: evs.map((e) => ({
      id: e.id,
      type: e.type,
      strength: e.strength,
      content: e.content,
      linkOrAttachment: e.linkOrAttachment,
      experimentId: e.experimentId,
    })),
  });
}

export async function searchSimilar(
  db: DB,
  input: { query: string }
): Promise<string> {
  try {
    const results = await db.all(
      sql`SELECT d.id, d.title, d.seed_summary, d.status
          FROM discovery_fts fts
          JOIN discoveries d ON d.id = fts.rowid
          WHERE discovery_fts MATCH ${input.query}
          LIMIT 10`
    );
    return JSON.stringify({ results });
  } catch {
    // FTS5 not available, fall back to LIKE
    const results = await db
      .select({
        id: discoveries.id,
        title: discoveries.title,
        seedSummary: discoveries.seedSummary,
        status: discoveries.status,
      })
      .from(discoveries)
      .where(sql`${discoveries.title} LIKE ${'%' + input.query + '%'} OR ${discoveries.seedSummary} LIKE ${'%' + input.query + '%'}`)
      .limit(10);
    return JSON.stringify({ results });
  }
}

export async function getMetrics(db: DB): Promise<string> {
  const allDiscoveries = await db.select().from(discoveries);

  const statusCounts: Record<string, number> = {};
  for (const d of allDiscoveries) {
    statusCounts[d.status] = (statusCounts[d.status] || 0) + 1;
  }

  const agentCreated = allDiscoveries.filter((d) => d.createdByAgent).length;

  // Average time from INBOX to OPEN (for those that transitioned)
  const openDiscoveries = allDiscoveries.filter((d) => d.status !== DiscoveryStatus.INBOX);
  let avgDaysToOpen = 0;
  if (openDiscoveries.length > 0) {
    const totalDays = openDiscoveries.reduce((sum, d) => {
      if (d.dueDate && d.createdAt) {
        const created = new Date(d.createdAt).getTime();
        const due = new Date(d.dueDate).getTime();
        return sum + (due - created) / (1000 * 60 * 60 * 24);
      }
      return sum;
    }, 0);
    avgDaysToOpen = Math.round(totalDays / openDiscoveries.length);
  }

  return JSON.stringify({
    total: allDiscoveries.length,
    statusCounts,
    agentCreated,
    humanCreated: allDiscoveries.length - agentCreated,
    avgDaysToOpen,
  });
}

export async function getRadarItems(
  db: DB,
  input: { status?: string; limit?: number }
): Promise<string> {
  const limit = input.limit || 20;

  let query = db
    .select({
      id: radarItems.id,
      title: radarItems.title,
      titleKo: radarItems.titleKo,
      summary: radarItems.summary,
      summaryKo: radarItems.summaryKo,
      url: radarItems.url,
      relevanceScore: radarItems.relevanceScore,
      status: radarItems.status,
      discoveryId: radarItems.discoveryId,
      collectedAt: radarItems.collectedAt,
    })
    .from(radarItems);

  if (input.status) {
    query = query.where(eq(radarItems.status, input.status)) as typeof query;
  }

  const results = await query.orderBy(desc(radarItems.collectedAt)).limit(limit);

  return JSON.stringify({
    total: results.length,
    items: results.map((item) => ({
      ...item,
      collectedAt: item.collectedAt ? new Date(item.collectedAt).toISOString() : null,
    })),
  });
}

export async function listUsers(db: DB): Promise<string> {
  const allUsers = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users);

  // Filter out system users
  const humanUsers = allUsers.filter(
    (u) => !u.id.startsWith("system-")
  );

  return JSON.stringify({ users: humanUsers });
}
