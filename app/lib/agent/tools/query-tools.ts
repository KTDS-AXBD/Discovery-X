/**
 * Query tools — read-only operations for listing, searching, metrics, radar.
 */

import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
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
  input: { status?: string; limit?: number; offset?: number }
): Promise<string> {
  const limit = input.limit || 20;
  const offset = input.offset || 0;

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

  const results = await query.orderBy(desc(discoveries.updatedAt)).limit(limit + 1).offset(offset);
  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;

  return JSON.stringify({
    total: items.length,
    offset,
    hasMore,
    discoveries: items.map((d) => ({
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

  if (!discovery[0]) return JSON.stringify({ error: "Discovery를 찾을 수 없습니다.", suggestion: "list_discoveries로 기존 목록을 확인해보세요." });

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
      reliabilityLabel: e.reliabilityLabel,
      sourceUrl: e.sourceUrl,
      publishedOrObservedDate: e.publishedOrObservedDate,
      validatorId: e.validatorId,
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

export async function getMetrics(
  db: DB,
  input?: { fromDate?: string; toDate?: string }
): Promise<string> {
  // Build date filter conditions
  const conditions = [];
  if (input?.fromDate) conditions.push(gte(discoveries.createdAt, new Date(input.fromDate)));
  if (input?.toDate) conditions.push(lte(discoveries.createdAt, new Date(input.toDate)));
  const dateFilter = conditions.length > 0 ? and(...conditions) : undefined;

  // 1) Status counts — SQL GROUP BY
  const statusRows = await db
    .select({ status: discoveries.status, count: sql<number>`count(*)` })
    .from(discoveries)
    .where(dateFilter)
    .groupBy(discoveries.status);

  const statusCounts: Record<string, number> = {};
  let total = 0;
  for (const row of statusRows) {
    statusCounts[row.status] = Number(row.count);
    total += Number(row.count);
  }

  // 2) Agent-created count — SQL COUNT + WHERE
  const agentRow = await db
    .select({ count: sql<number>`count(*)` })
    .from(discoveries)
    .where(dateFilter ? and(dateFilter, eq(discoveries.createdByAgent, 1)) : eq(discoveries.createdByAgent, 1));
  const agentCreated = Number(agentRow[0]?.count ?? 0);

  // 3) Average days from creation to due date (for non-INBOX)
  const avgRow = await db
    .select({ avg: sql<number>`avg(julianday(due_date) - julianday(created_at))` })
    .from(discoveries)
    .where(
      dateFilter
        ? and(dateFilter, sql`${discoveries.status} != 'DISCOVERY'`, sql`due_date IS NOT NULL`)
        : and(sql`${discoveries.status} != 'DISCOVERY'`, sql`due_date IS NOT NULL`)
    );
  const avgDaysToOpen = Math.round(Number(avgRow[0]?.avg ?? 0));

  return JSON.stringify({
    total,
    statusCounts,
    agentCreated,
    humanCreated: total - agentCreated,
    avgDaysToOpen,
  });
}

export async function getRadarItems(
  db: DB,
  input: { status?: string; limit?: number; offset?: number }
): Promise<string> {
  const limit = input.limit || 20;
  const offset = input.offset || 0;

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

  const results = await query.orderBy(desc(radarItems.collectedAt)).limit(limit + 1).offset(offset);
  const hasMore = results.length > limit;
  const items = hasMore ? results.slice(0, limit) : results;

  return JSON.stringify({
    total: items.length,
    offset,
    hasMore,
    items: items.map((item) => ({
      ...item,
      collectedAt: item.collectedAt ? new Date(item.collectedAt).toISOString() : null,
    })),
  });
}

export async function getWeeklyReview(db: DB): Promise<string> {
  // Active = all non-terminal statuses except DISCOVERY
  const activeStatuses = [
    DiscoveryStatus.IDEA_CARD, DiscoveryStatus.HYPOTHESIS, DiscoveryStatus.EXPERIMENT,
    DiscoveryStatus.EVIDENCE_REVIEW, DiscoveryStatus.GATE1, DiscoveryStatus.SPRINT,
    DiscoveryStatus.GATE2, DiscoveryStatus.HANDOFF,
  ];
  const openDiscoveries = await db
    .select()
    .from(discoveries)
    .where(sql`${discoveries.status} IN (${sql.join(activeStatuses.map(s => sql`${s}`), sql`, `)})`);

  const now = Date.now();
  const items = [];

  for (const d of openDiscoveries) {
    const exps = await db
      .select()
      .from(experiments)
      .where(eq(experiments.discoveryId, d.id));

    const createdMs = d.createdAt ? new Date(d.createdAt).getTime() : now;
    const dueMs = d.dueDate ? new Date(d.dueDate).getTime() : null;
    const elapsedDays = Math.floor((now - createdMs) / (1000 * 60 * 60 * 24));
    const remainingDays = dueMs ? Math.ceil((dueMs - now) / (1000 * 60 * 60 * 24)) : null;
    const isOverdue = remainingDays !== null && remainingDays < 0;

    const activeExps = exps.filter((e) => !e.completedAt);
    const completedExps = exps.filter((e) => e.completedAt);

    items.push({
      id: d.id,
      title: d.title,
      ownerId: d.ownerId || "미지정",
      elapsedDays,
      remainingDays,
      isOverdue,
      dueDate: dueMs ? new Date(dueMs).toISOString().slice(0, 10) : null,
      experiments: {
        total: exps.length,
        active: activeExps.length,
        completed: completedExps.length,
      },
      activeHypotheses: activeExps.map((e) => e.hypothesis),
    });
  }

  // Sort: overdue first, then by remaining days ascending
  items.sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    return (a.remainingDays ?? 999) - (b.remainingDays ?? 999);
  });

  return JSON.stringify({
    total: items.length,
    reviewDate: new Date().toISOString().slice(0, 10),
    items,
  });
}

export async function getRecallQueue(db: DB): Promise<string> {
  const now = new Date();
  const notNowDiscoveries = await db
    .select()
    .from(discoveries)
    .where(eq(discoveries.status, DiscoveryStatus.HOLD));

  const dueItems = notNowDiscoveries.filter((d) => {
    if (!d.revisitDate) return false;
    return new Date(d.revisitDate) <= now;
  });

  const upcomingItems = notNowDiscoveries.filter((d) => {
    if (!d.revisitDate) return false;
    const revisit = new Date(d.revisitDate);
    const diffDays = (revisit.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    return diffDays > 0 && diffDays <= 14;
  });

  const formatItem = (d: typeof notNowDiscoveries[0]) => ({
    id: d.id,
    title: d.title,
    ownerId: d.ownerId || "미지정",
    triggerType: d.notNowTriggerType,
    triggerCondition: d.notNowTriggerCondition,
    revisitDate: d.revisitDate ? new Date(d.revisitDate).toISOString().slice(0, 10) : null,
    decisionRationale: d.decisionRationale,
  });

  return JSON.stringify({
    due: { total: dueItems.length, items: dueItems.map(formatItem) },
    upcoming: { total: upcomingItems.length, items: upcomingItems.map(formatItem) },
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
