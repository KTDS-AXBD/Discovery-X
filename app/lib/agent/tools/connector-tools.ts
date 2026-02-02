/**
 * Connector tools — Discovery linking (inter-discovery relationships).
 * v3 R3: 2 tools for discovery connections.
 */

import { eq, or } from "drizzle-orm";
import type { DB } from "~/db";
import { discoveryLinks, discoveries } from "~/db/schema";

function generateId(): string {
  return crypto.randomUUID();
}

const BIDIRECTIONAL_TYPES = ["similar", "alternative"];
const INVERSE_MAP: Record<string, string> = {
  predecessor: "successor",
  successor: "predecessor",
  similar: "similar",
  alternative: "alternative",
};

/**
 * link_discoveries — Discovery 간 관계 생성
 */
export async function linkDiscoveries(
  db: DB,
  input: {
    fromDiscoveryId: string;
    toDiscoveryId: string;
    linkType: string;
    note?: string;
  }
): Promise<string> {
  if (input.fromDiscoveryId === input.toDiscoveryId) {
    return JSON.stringify({ error: "동일한 Discovery를 연결할 수 없습니다." });
  }

  // Validate both discoveries exist
  const [fromDisc, toDisc] = await Promise.all([
    db.select({ id: discoveries.id, title: discoveries.title })
      .from(discoveries)
      .where(eq(discoveries.id, input.fromDiscoveryId))
      .limit(1),
    db.select({ id: discoveries.id, title: discoveries.title })
      .from(discoveries)
      .where(eq(discoveries.id, input.toDiscoveryId))
      .limit(1),
  ]);

  if (fromDisc.length === 0) {
    return JSON.stringify({ error: `출발 Discovery를 찾을 수 없습니다: ${input.fromDiscoveryId}` });
  }
  if (toDisc.length === 0) {
    return JSON.stringify({ error: `도착 Discovery를 찾을 수 없습니다: ${input.toDiscoveryId}` });
  }

  // Check duplicate
  const existing = await db
    .select({ id: discoveryLinks.id })
    .from(discoveryLinks)
    .where(
      eq(discoveryLinks.fromDiscoveryId, input.fromDiscoveryId)
    );

  const duplicate = existing.length > 0
    ? (await db
        .select()
        .from(discoveryLinks)
        .where(eq(discoveryLinks.fromDiscoveryId, input.fromDiscoveryId)))
        .find(
          (l) => l.toDiscoveryId === input.toDiscoveryId && l.linkType === input.linkType
        )
    : undefined;

  if (duplicate) {
    return JSON.stringify({ error: "이미 동일한 관계가 존재합니다." });
  }

  // Create forward link
  const forwardId = generateId();
  await db.insert(discoveryLinks).values({
    id: forwardId,
    fromDiscoveryId: input.fromDiscoveryId,
    toDiscoveryId: input.toDiscoveryId,
    linkType: input.linkType,
    note: input.note,
  });

  // Create reverse link for bidirectional types
  let reverseId: string | undefined;
  if (BIDIRECTIONAL_TYPES.includes(input.linkType)) {
    reverseId = generateId();
    await db.insert(discoveryLinks).values({
      id: reverseId,
      fromDiscoveryId: input.toDiscoveryId,
      toDiscoveryId: input.fromDiscoveryId,
      linkType: INVERSE_MAP[input.linkType] || input.linkType,
      note: input.note,
    });
  }

  return JSON.stringify({
    success: true,
    linkId: forwardId,
    reverseLinkId: reverseId,
    from: { id: fromDisc[0].id, title: fromDisc[0].title },
    to: { id: toDisc[0].id, title: toDisc[0].title },
    linkType: input.linkType,
    bidirectional: BIDIRECTIONAL_TYPES.includes(input.linkType),
  });
}

/**
 * get_linked_discoveries — 연결된 Discovery 조회
 */
export async function getLinkedDiscoveries(
  db: DB,
  input: { discoveryId: string }
): Promise<string> {
  const links = await db
    .select()
    .from(discoveryLinks)
    .where(
      or(
        eq(discoveryLinks.fromDiscoveryId, input.discoveryId),
        eq(discoveryLinks.toDiscoveryId, input.discoveryId)
      )
    );

  if (links.length === 0) {
    return JSON.stringify({ links: [], message: "연결된 Discovery가 없습니다." });
  }

  // Collect unique linked discovery IDs
  const linkedIds = new Set<string>();
  for (const link of links) {
    if (link.fromDiscoveryId !== input.discoveryId) linkedIds.add(link.fromDiscoveryId);
    if (link.toDiscoveryId !== input.discoveryId) linkedIds.add(link.toDiscoveryId);
  }

  // Fetch discovery info
  const discMap: Record<string, { id: string; title: string; status: string }> = {};
  for (const did of linkedIds) {
    const d = await db
      .select({ id: discoveries.id, title: discoveries.title, status: discoveries.status })
      .from(discoveries)
      .where(eq(discoveries.id, did))
      .limit(1);
    if (d[0]) discMap[did] = d[0];
  }

  // Deduplicate bidirectional links
  const seen = new Set<string>();
  const result = [];
  for (const link of links) {
    const otherDiscId = link.fromDiscoveryId === input.discoveryId
      ? link.toDiscoveryId
      : link.fromDiscoveryId;
    const direction = link.fromDiscoveryId === input.discoveryId ? "outgoing" : "incoming";
    const key = `${otherDiscId}-${link.linkType}`;

    if (seen.has(key)) continue;
    seen.add(key);

    result.push({
      linkId: link.id,
      linkType: link.linkType,
      direction,
      discovery: discMap[otherDiscId] || { id: otherDiscId },
      note: link.note,
      createdAt: link.createdAt,
    });
  }

  return JSON.stringify({ links: result });
}
