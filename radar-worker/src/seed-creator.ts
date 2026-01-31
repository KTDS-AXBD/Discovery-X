import type { ScoredItem } from "./types";
import { hashUrl } from "./dedup";

/**
 * Create Discovery INBOX seeds from high-scoring radar items.
 */
export async function createSeeds(
  db: D1Database,
  items: ScoredItem[],
  runId: string,
  threshold: number,
  maxSeeds: number
): Promise<number> {
  // Filter items above threshold, sorted by score descending
  const candidates = items
    .filter((item) => item.relevanceScore >= threshold)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, maxSeeds);

  let seedsCreated = 0;

  for (const item of candidates) {
    try {
      const discoveryId = crypto.randomUUID();
      const now = Math.floor(Date.now() / 1000);
      const urlHash = await hashUrl(item.url);

      // Insert discovery as INBOX seed (no owner)
      await db
        .prepare(
          `INSERT INTO discoveries (id, title, seed_summary, seed_links, source_type, status, created_at, updated_at, approval_status)
           VALUES (?, ?, ?, ?, ?, 'INBOX', ?, ?, 'NONE')`
        )
        .bind(
          discoveryId,
          item.titleKo.substring(0, 80),
          item.summaryKo.substring(0, 400),
          JSON.stringify([item.url]),
          "article",
          now,
          now
        )
        .run();

      // Insert radar_item record
      const radarItemId = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO radar_items (id, source_id, run_id, url_hash, url, title, summary, title_ko, summary_ko, relevance_score, discovery_id, status, collected_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SEEDED', ?)`
        )
        .bind(
          radarItemId,
          item.sourceId,
          runId,
          urlHash,
          item.url,
          item.title,
          item.summary,
          item.titleKo,
          item.summaryKo,
          item.relevanceScore,
          discoveryId,
          now
        )
        .run();

      // Log event
      const eventId = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO event_logs (id, timestamp, actor_id, discovery_id, event_type, metadata)
           VALUES (?, ?, 'system-radar', ?, 'AUTO_SEED_CREATED', ?)`
        )
        .bind(
          eventId,
          now,
          discoveryId,
          JSON.stringify({
            source: item.sourceId,
            url: item.url,
            relevanceScore: item.relevanceScore,
            runId,
          })
        )
        .run();

      seedsCreated++;
    } catch (error) {
      console.error(`[seed-creator] Failed to create seed for ${item.url}:`, error);
    }
  }

  return seedsCreated;
}

/**
 * Record collected items that weren't turned into seeds.
 */
export async function recordItems(
  db: D1Database,
  items: ScoredItem[],
  runId: string,
  threshold: number
): Promise<void> {
  for (const item of items) {
    try {
      const urlHash = await hashUrl(item.url);
      const now = Math.floor(Date.now() / 1000);
      const status = item.relevanceScore >= threshold ? "SCORED" : "SKIPPED";
      const radarItemId = crypto.randomUUID();

      await db
        .prepare(
          `INSERT OR IGNORE INTO radar_items (id, source_id, run_id, url_hash, url, title, summary, title_ko, summary_ko, relevance_score, status, collected_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          radarItemId,
          item.sourceId,
          runId,
          urlHash,
          item.url,
          item.title,
          item.summary,
          item.titleKo,
          item.summaryKo,
          item.relevanceScore,
          status,
          now
        )
        .run();
    } catch {
      // URL hash conflict = already recorded, skip
    }
  }
}
