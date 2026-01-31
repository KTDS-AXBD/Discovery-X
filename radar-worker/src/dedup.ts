import type { CollectedItem } from "./types";

/**
 * SHA-256 hash of a URL for deduplication.
 */
export async function hashUrl(url: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(url.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Layer 1: Remove items whose URL hash already exists in radar_items.
 */
export async function deduplicateByUrl(
  db: D1Database,
  items: CollectedItem[]
): Promise<{ unique: CollectedItem[]; duplicateCount: number }> {
  if (items.length === 0) return { unique: [], duplicateCount: 0 };

  const itemsWithHash = await Promise.all(
    items.map(async (item) => ({
      ...item,
      urlHash: await hashUrl(item.url),
    }))
  );

  // Check existing hashes in batch
  const hashes = itemsWithHash.map((i) => i.urlHash);
  const placeholders = hashes.map(() => "?").join(",");
  const result = await db
    .prepare(`SELECT url_hash FROM radar_items WHERE url_hash IN (${placeholders})`)
    .bind(...hashes)
    .all();

  const existingHashes = new Set(
    (result.results || []).map((r: Record<string, unknown>) => r.url_hash as string)
  );

  const unique = itemsWithHash.filter((item) => !existingHashes.has(item.urlHash));
  const duplicateCount = items.length - unique.length;

  return { unique, duplicateCount };
}

/**
 * Layer 2: Check if similar titles already exist in discoveries via FTS5.
 * Returns items that do NOT have a close match.
 */
export async function deduplicateByFts(
  db: D1Database,
  items: CollectedItem[]
): Promise<{ unique: CollectedItem[]; duplicateCount: number }> {
  if (items.length === 0) return { unique: [], duplicateCount: 0 };

  const unique: CollectedItem[] = [];
  let duplicateCount = 0;

  for (const item of items) {
    // Escape FTS5 special characters
    const escaped = item.title.replace(/['"*(){}[\]^~\\]/g, "").trim();
    if (!escaped || escaped.length < 3) {
      unique.push(item);
      continue;
    }

    try {
      const ftsQuery = `"${escaped.substring(0, 50)}"`;
      const result = await db
        .prepare(
          `SELECT COUNT(*) as cnt FROM discoveries_fts WHERE discoveries_fts MATCH ?`
        )
        .bind(ftsQuery)
        .first<{ cnt: number }>();

      if (result && result.cnt > 0) {
        duplicateCount++;
      } else {
        unique.push(item);
      }
    } catch {
      // FTS query failed (possibly bad characters) — keep the item
      unique.push(item);
    }
  }

  return { unique, duplicateCount };
}
