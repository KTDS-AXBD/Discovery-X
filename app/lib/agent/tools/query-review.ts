/**
 * Query tools — 리뷰/재검토 큐/사용자 조회 함수.
 * getWeeklyReview, getRecallQueue, listUsers
 */

import { eq, sql } from "drizzle-orm";
import type { DB } from "~/db";
import {
  discoveries,
  experiments,
  users,
  DiscoveryStatus,
} from "~/db/schema";

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
