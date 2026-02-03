/**
 * Venture Analytics Repository
 * (AnalyticsSnapshot, WorkEvent)
 */

import { eq, desc, and, gte, lte } from "drizzle-orm";
import type { DB } from "~/db";
import {
  vdAnalyticsSnapshots,
  vdWorkEvents,
  type VdAnalyticsSnapshot,
  type NewVdAnalyticsSnapshot,
  type VdWorkEvent,
  type NewVdWorkEvent,
} from "../db/schema";
import type { VdAnalyticsData, VdActorType, VdEntityType } from "../types";

// ============================================================================
// ANALYTICS SNAPSHOT
// ============================================================================

export async function createAnalyticsSnapshot(
  db: DB,
  sprintId: string | null,
  snapshotType: "daily" | "gate" | "final",
  data: VdAnalyticsData
): Promise<VdAnalyticsSnapshot> {
  const id = crypto.randomUUID();
  const now = new Date();

  const snapshot: NewVdAnalyticsSnapshot = {
    id,
    sprintId,
    snapshotType,
    data,
    createdAt: now,
  };

  await db.insert(vdAnalyticsSnapshots).values(snapshot);

  return snapshot as VdAnalyticsSnapshot;
}

export async function getLatestSnapshot(
  db: DB,
  sprintId: string | null,
  snapshotType?: "daily" | "gate" | "final"
): Promise<VdAnalyticsSnapshot | null> {
  const conditions = sprintId
    ? [eq(vdAnalyticsSnapshots.sprintId, sprintId)]
    : [];

  if (snapshotType) {
    conditions.push(eq(vdAnalyticsSnapshots.snapshotType, snapshotType));
  }

  const results = await db
    .select()
    .from(vdAnalyticsSnapshots)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(vdAnalyticsSnapshots.createdAt))
    .limit(1);

  return results[0] || null;
}

export async function listSnapshotsBySprint(
  db: DB,
  sprintId: string,
  limit?: number
): Promise<VdAnalyticsSnapshot[]> {
  let query = db
    .select()
    .from(vdAnalyticsSnapshots)
    .where(eq(vdAnalyticsSnapshots.sprintId, sprintId))
    .orderBy(desc(vdAnalyticsSnapshots.createdAt));

  if (limit) {
    query = query.limit(limit) as typeof query;
  }

  return query;
}

export async function getGlobalSnapshots(
  db: DB,
  snapshotType?: "daily" | "gate" | "final",
  limit?: number
): Promise<VdAnalyticsSnapshot[]> {
  const conditions = [];

  if (snapshotType) {
    conditions.push(eq(vdAnalyticsSnapshots.snapshotType, snapshotType));
  }

  let query = db
    .select()
    .from(vdAnalyticsSnapshots)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(vdAnalyticsSnapshots.createdAt));

  if (limit) {
    query = query.limit(limit) as typeof query;
  }

  return query;
}

// ============================================================================
// WORK EVENT
// ============================================================================

export async function createWorkEvent(
  db: DB,
  sprintId: string,
  input: {
    eventType: string;
    actorType: VdActorType;
    actorId?: string;
    entityType?: VdEntityType;
    entityId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<VdWorkEvent> {
  const id = crypto.randomUUID();
  const now = new Date();

  const event: NewVdWorkEvent = {
    id,
    sprintId,
    eventType: input.eventType,
    actorType: input.actorType,
    actorId: input.actorId,
    entityType: input.entityType,
    entityId: input.entityId,
    metadata: input.metadata,
    createdAt: now,
  };

  await db.insert(vdWorkEvents).values(event);

  return event as VdWorkEvent;
}

export async function listWorkEventsBySprint(
  db: DB,
  sprintId: string,
  filter?: {
    actorType?: VdActorType;
    entityType?: VdEntityType;
    eventType?: string;
    fromDate?: Date;
    toDate?: Date;
    limit?: number;
  }
): Promise<VdWorkEvent[]> {
  const conditions = [eq(vdWorkEvents.sprintId, sprintId)];

  if (filter?.actorType) {
    conditions.push(eq(vdWorkEvents.actorType, filter.actorType));
  }
  if (filter?.entityType) {
    conditions.push(eq(vdWorkEvents.entityType, filter.entityType));
  }
  if (filter?.eventType) {
    conditions.push(eq(vdWorkEvents.eventType, filter.eventType));
  }
  if (filter?.fromDate) {
    conditions.push(gte(vdWorkEvents.createdAt, filter.fromDate));
  }
  if (filter?.toDate) {
    conditions.push(lte(vdWorkEvents.createdAt, filter.toDate));
  }

  let query = db
    .select()
    .from(vdWorkEvents)
    .where(and(...conditions))
    .orderBy(desc(vdWorkEvents.createdAt));

  if (filter?.limit) {
    query = query.limit(filter.limit) as typeof query;
  }

  return query;
}

export async function getWorkEventCountByActor(
  db: DB,
  sprintId: string
): Promise<{ human: number; agent: number }> {
  const events = await db.select().from(vdWorkEvents).where(eq(vdWorkEvents.sprintId, sprintId));

  let human = 0;
  let agent = 0;

  for (const event of events) {
    if (event.actorType === "human") {
      human++;
    } else {
      agent++;
    }
  }

  return { human, agent };
}

export async function getRecentEvents(
  db: DB,
  sprintId: string,
  limit: number = 20
): Promise<VdWorkEvent[]> {
  return db
    .select()
    .from(vdWorkEvents)
    .where(eq(vdWorkEvents.sprintId, sprintId))
    .orderBy(desc(vdWorkEvents.createdAt))
    .limit(limit);
}
