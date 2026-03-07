/**
 * Discovery tools 공유 유틸리티 — generateId, AGENT_ACTOR_ID, logEvent.
 */

import type { DB } from "~/db";
import { eventLogs } from "~/db";

export function generateId(): string {
  return crypto.randomUUID();
}

export const AGENT_ACTOR_ID = "system-agent";

export async function logEvent(
  db: DB,
  discoveryId: string,
  eventType: string,
  metadata?: Record<string, unknown>
) {
  await db.insert(eventLogs).values({
    id: generateId(),
    actorId: AGENT_ACTOR_ID,
    discoveryId,
    eventType,
    metadata: metadata || {},
  });
}
