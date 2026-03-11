/**
 * Crawl Worker — 큐 기반 수집 처리 (F41 Phase 2B)
 *
 * Cron 라우트(api.cron.radar-collect)에서 호출.
 * 큐 아이템을 배치로 처리하여 RSS/HTML 소스에서 radar_items를 생성한다.
 */

import type { DB } from "~/db";
import { radarItems } from "~/db";
import { eq } from "drizzle-orm";
import { RadarService } from "./radar.service";
import {
  canonicalizeUrl,
  generateDedupeKey,
  parseUrl,
  type ParsedPage,
} from "./url-parser";
import type { RadarCrawlQueueItem } from "~/features/radar/db/schema";

// ============================================================================
// Types
// ============================================================================

export interface CrawlResult {
  processed: number;
  succeeded: number;
  failed: number;
  itemsCreated: number;
  batchSize: number;
}

interface FetchResult {
  itemsCreated: number;
}

// ============================================================================
// CrawlError — 구조화된 에러 분류 [F5]
// ============================================================================

export class CrawlError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "CrawlError";
  }
}

// ============================================================================
// Main Worker
// ============================================================================

/**
 * 큐 배치 처리 — Cron에서 호출
 *
 * 1. dequeueBatch()로 PENDING 큐 아이템 가져오기
 * 2. 각 아이템에 대해 parserType 기반 fetch + parse
 * 3. 성공/실패에 따라 completeQueueItem()/failQueueItem() 호출
 */
export async function processCrawlQueue(
  db: DB,
  tenantId: string,
  options: { batchSize?: number; timeoutMs?: number } = {},
): Promise<CrawlResult> {
  const service = new RadarService(db);
  const batchSize = options.batchSize ?? 10;
  const timeoutMs = options.timeoutMs ?? 25_000; // CF 30s 타임아웃 - 5s 여유

  const startTime = Date.now();
  const batch = await service.dequeueBatch(tenantId, batchSize);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let totalItemsCreated = 0;

  for (const item of batch) {
    // 타임아웃 가드
    if (Date.now() - startTime > timeoutMs) break;

    try {
      const result = await fetchAndParse(db, item, tenantId);
      await service.completeQueueItem(item.id, result.itemsCreated);
      totalItemsCreated += result.itemsCreated;
      succeeded++;
    } catch (err) {
      const code = classifyError(err);
      await service.failQueueItem(item.id, code, String(err));
      failed++;
    }
    processed++;
  }

  return {
    processed,
    succeeded,
    failed,
    itemsCreated: totalItemsCreated,
    batchSize: batch.length,
  };
}

// ============================================================================
// Parser Dispatch
// ============================================================================

/**
 * parserType 기반 fetch + parse [F2]
 *
 * RSS 소스: 피드 fetch → XML 파싱 → N개 아이템 추출 → 각각 dedupe + INSERT
 * HTML 소스: 페이지 fetch → HTML 파싱 → 1개 아이템 추출 → dedupe + INSERT
 */
async function fetchAndParse(
  db: DB,
  item: RadarCrawlQueueItem,
  tenantId: string,
): Promise<FetchResult> {
  const service = new RadarService(db);
  const runId = await service.findOrCreateDailyRun(tenantId);

  switch (item.parserType) {
    case "rss":
      return fetchRss(db, item, runId);
    case "html":
    default:
      return fetchHtml(db, item, runId);
    // youtube, pdf → Phase 3+
  }
}

// ============================================================================
// RSS Parser
// ============================================================================

interface RssItem {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
}

/**
 * RSS 피드 fetch → XML 파싱 → N개 radar_items 생성
 */
async function fetchRss(
  db: DB,
  queueItem: RadarCrawlQueueItem,
  runId: string,
): Promise<FetchResult> {
  const response = await fetchWithTimeout(queueItem.url, 15_000);

  const contentType = response.headers.get("content-type") || "";
  if (
    !contentType.includes("xml") &&
    !contentType.includes("rss") &&
    !contentType.includes("atom") &&
    !contentType.includes("text/")
  ) {
    throw new CrawlError(
      `RSS 호환 콘텐츠 타입이 아닙니다: ${contentType}`,
      "PARSE_ERROR",
    );
  }

  const xml = await response.text();
  const items = parseRssXml(xml);

  let itemsCreated = 0;

  for (const rssItem of items) {
    if (!rssItem.link || !rssItem.title) continue;

    const canonical = canonicalizeUrl(rssItem.link);

    // urlHash 중복 체크
    const urlHashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonical),
    );
    const urlHash = Array.from(new Uint8Array(urlHashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const existing = await db
      .select({ id: radarItems.id })
      .from(radarItems)
      .where(eq(radarItems.urlHash, urlHash))
      .limit(1);

    if (existing.length > 0) continue;

    // dedupeKey 2차 체크
    const dedupeKey = await generateDedupeKey(rssItem.title, rssItem.pubDate);
    const dedupeHit = await db
      .select({ id: radarItems.id })
      .from(radarItems)
      .where(eq(radarItems.dedupeKey, dedupeKey))
      .limit(1);

    if (dedupeHit.length > 0) continue;

    // 신규 아이템 INSERT
    await db.insert(radarItems).values({
      id: crypto.randomUUID(),
      sourceId: queueItem.sourceId,
      runId,
      urlHash,
      url: canonical,
      title: rssItem.title,
      summary: rssItem.description?.slice(0, 500) || null,
      status: "COLLECTED",
      contentType: "article",
      excerpt: rssItem.description?.slice(0, 200) || null,
      dedupeKey,
      itemMetadata: rssItem.pubDate ? { publishedAt: rssItem.pubDate } : null,
    });

    itemsCreated++;
  }

  return { itemsCreated };
}

/** 간이 RSS/Atom XML 파서 — 외부 라이브러리 없이 regex 기반 */
export function parseRssXml(xml: string): RssItem[] {
  const items: RssItem[] = [];

  // RSS 2.0: <item> ... </item>
  const rssItemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = rssItemRegex.exec(xml)) !== null) {
    const content = match[1];
    items.push({
      title: extractCdataOrText(content, "title"),
      link: extractCdataOrText(content, "link"),
      description: extractCdataOrText(content, "description"),
      pubDate: extractCdataOrText(content, "pubDate") || undefined,
    });
  }

  // Atom: <entry> ... </entry> (fallback)
  if (items.length === 0) {
    const atomEntryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;

    while ((match = atomEntryRegex.exec(xml)) !== null) {
      const content = match[1];
      const linkMatch = content.match(
        /<link[^>]*href=["']([^"']*)["'][^>]*\/?>/i,
      );
      items.push({
        title: extractCdataOrText(content, "title"),
        link: linkMatch ? linkMatch[1] : "",
        description:
          extractCdataOrText(content, "summary") ||
          extractCdataOrText(content, "content"),
        pubDate:
          extractCdataOrText(content, "published") ||
          extractCdataOrText(content, "updated") ||
          undefined,
      });
    }
  }

  return items;
}

/** XML 태그 내용 추출 (CDATA 지원) */
function extractCdataOrText(xml: string, tag: string): string {
  const re = new RegExp(
    `<${tag}[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*</${tag}>`,
    "i",
  );
  const match = xml.match(re);
  if (!match) return "";
  const value = (match[1] ?? match[2] ?? "").trim();
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

// ============================================================================
// HTML Parser
// ============================================================================

/**
 * HTML 페이지 fetch → 파싱 → 1개 radar_item 생성
 * 기존 url-parser.ts의 parseUrl() 재사용
 */
async function fetchHtml(
  db: DB,
  queueItem: RadarCrawlQueueItem,
  runId: string,
): Promise<FetchResult> {
  const canonical = canonicalizeUrl(queueItem.url);

  // urlHash 중복 체크
  const urlHashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  const urlHash = Array.from(new Uint8Array(urlHashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const existing = await db
    .select({ id: radarItems.id })
    .from(radarItems)
    .where(eq(radarItems.urlHash, urlHash))
    .limit(1);

  if (existing.length > 0) return { itemsCreated: 0 };

  // fetch + parse (parseUrl은 내부에서 fetch 수행)
  let parsed: ParsedPage;
  try {
    parsed = await parseUrl(canonical);
  } catch (err) {
    const msg = String(err);
    if (msg.includes("콘텐츠 타입")) {
      throw new CrawlError(msg, "PARSE_ERROR");
    }
    throw new CrawlError(msg, "NETWORK_ERROR");
  }

  // dedupeKey 2차 체크
  const dedupeKey = await generateDedupeKey(
    parsed.title,
    parsed.metadata.publishedAt,
  );

  const dedupeHit = await db
    .select({ id: radarItems.id })
    .from(radarItems)
    .where(eq(radarItems.dedupeKey, dedupeKey))
    .limit(1);

  if (dedupeHit.length > 0) return { itemsCreated: 0 };

  // 신규 아이템 INSERT
  await db.insert(radarItems).values({
    id: crypto.randomUUID(),
    sourceId: queueItem.sourceId,
    runId,
    urlHash,
    url: canonical,
    title: parsed.title,
    summary: parsed.summary,
    status: "COLLECTED",
    contentType: "article",
    rawContent: parsed.rawContent,
    parsedContent: parsed.parsedContent,
    excerpt: parsed.excerpt,
    itemMetadata: parsed.metadata,
    dedupeKey,
  });

  return { itemsCreated: 1 };
}

// ============================================================================
// Helpers
// ============================================================================

/** AbortController 기반 타임아웃 fetch */
async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Discovery-X/0.7.0" },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new CrawlError(
        `HTTP ${response.status}: ${response.statusText}`,
        response.status === 401 || response.status === 403
          ? "AUTH_REQUIRED"
          : response.status === 429
            ? "RATE_LIMITED"
            : "NETWORK_ERROR",
        response.status,
      );
    }

    return response;
  } catch (err) {
    if (err instanceof CrawlError) throw err;
    if (
      err instanceof DOMException ||
      (err instanceof Error && err.name === "AbortError")
    ) {
      throw new CrawlError("요청 타임아웃", "TIMEOUT");
    }
    throw new CrawlError(String(err), "NETWORK_ERROR");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 에러 분류 [F5]
 * CrawlError → 코드 직접 반환, 그 외 → 메시지 기반 fallback
 */
export function classifyError(err: unknown): string {
  if (err instanceof CrawlError) return err.code;

  if (
    err instanceof Response ||
    (err && typeof err === "object" && "status" in err)
  ) {
    const status = (err as { status: number }).status;
    if (status === 401 || status === 403) return "AUTH_REQUIRED";
    if (status === 429) return "RATE_LIMITED";
    if (status >= 500) return "NETWORK_ERROR";
  }

  const msg = String(err).toLowerCase();
  if (msg.includes("timeout") || msg.includes("aborted")) return "TIMEOUT";
  if (msg.includes("parse")) return "PARSE_ERROR";
  return "NETWORK_ERROR";
}
