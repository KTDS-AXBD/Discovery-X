import type { Env, CollectedItem, RunStats, RadarSource } from "./types";
import { collectRss } from "./collectors/rss";
import { collectWeb } from "./collectors/web";
import { collectYoutube } from "./collectors/youtube";
import { deduplicateByUrl, deduplicateByFts } from "./dedup";
import { scoreItems } from "./scorer";
import { createSeeds, recordItems } from "./seed-creator";

const collectors: Record<string, (source: RadarSource) => Promise<CollectedItem[]>> = {
  rss: collectRss,
  web: collectWeb,
  youtube: collectYoutube,
};

export async function runPipeline(env: Env): Promise<RunStats> {
  const db = env.DB;
  const threshold = parseInt(env.RELEVANCE_THRESHOLD) || 60;
  const maxSeeds = parseInt(env.MAX_SEEDS_PER_RUN) || 5;

  const stats: RunStats = {
    sourcesChecked: 0,
    itemsCollected: 0,
    itemsDeduplicated: 0,
    seedsCreated: 0,
    errors: [],
  };

  // Create run record
  const runId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);

  try {
    // 1. Get enabled sources
    const sourcesResult = await db
      .prepare(`SELECT * FROM radar_sources WHERE enabled = 1`)
      .all();
    const sources = (sourcesResult.results || []) as unknown as RadarSource[];

    // tenant_id: 소스의 tenant에서 추출 (단일 테넌트 운영)
    const tenantId = sources[0]?.tenant_id ?? null;

    await db
      .prepare(
        `INSERT INTO radar_runs (id, started_at, status, tenant_id) VALUES (?, ?, 'RUNNING', ?)`
      )
      .bind(runId, now, tenantId)
      .run();

    if (sources.length === 0) {
      await completeRun(db, runId, stats, "COMPLETED");
      return stats;
    }

    // 2. Collect from all sources
    let allItems: CollectedItem[] = [];

    for (const source of sources) {
      stats.sourcesChecked++;
      const collector = collectors[source.source_type];
      if (!collector) {
        stats.errors.push(`Unknown source type: ${source.source_type}`);
        continue;
      }

      try {
        const items = await collector(source);
        allItems = allItems.concat(items);
        stats.itemsCollected += items.length;
      } catch (error) {
        const msg =
          error instanceof Error ? error.message : String(error);
        stats.errors.push(`${source.name}: ${msg}`);
      }
    }

    if (allItems.length === 0) {
      await completeRun(db, runId, stats, "COMPLETED");
      return stats;
    }

    // 3. Deduplicate — Layer 1: URL hash
    const { unique: urlUnique, duplicateCount: urlDups } =
      await deduplicateByUrl(db, allItems);
    stats.itemsDeduplicated += urlDups;

    // 4. Deduplicate — Layer 2: FTS5 title similarity
    const { unique: ftsUnique, duplicateCount: ftsDups } =
      await deduplicateByFts(db, urlUnique);
    stats.itemsDeduplicated += ftsDups;

    if (ftsUnique.length === 0) {
      await completeRun(db, runId, stats, "COMPLETED");
      return stats;
    }

    // 5. AI scoring (fallback chain: OpenAI → Anthropic → Workers AI)
    const scoreResult = await scoreItems(ftsUnique, {
      ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: env.OPENAI_API_KEY,
      GOOGLE_AI_API_KEY: env.GOOGLE_AI_API_KEY,
      AI: env.AI,
    });
    const scored = scoreResult.items;
    stats.errors.push(...scoreResult.errors);

    // 6. Create seeds from high-scoring items
    stats.seedsCreated = await createSeeds(db, scored, runId, threshold, maxSeeds);

    // 7. Record remaining items for audit trail
    // Only record items that weren't already turned into seeds
    const nonSeeded = scored.filter(
      (item) => item.relevanceScore < threshold || stats.seedsCreated >= maxSeeds
    );
    await recordItems(db, nonSeeded, runId, threshold);

    await completeRun(db, runId, stats, "COMPLETED");
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    stats.errors.push(`Pipeline error: ${msg}`);
    await completeRun(db, runId, stats, "FAILED");
  }

  return stats;
}

async function completeRun(
  db: D1Database,
  runId: string,
  stats: RunStats,
  status: string
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `UPDATE radar_runs SET
        completed_at = ?,
        sources_checked = ?,
        items_collected = ?,
        items_deduplicated = ?,
        seeds_created = ?,
        errors = ?,
        status = ?
       WHERE id = ?`
    )
    .bind(
      now,
      stats.sourcesChecked,
      stats.itemsCollected,
      stats.itemsDeduplicated,
      stats.seedsCreated,
      stats.errors.length > 0 ? JSON.stringify(stats.errors) : null,
      status,
      runId
    )
    .run();
}
