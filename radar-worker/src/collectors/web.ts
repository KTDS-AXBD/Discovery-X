import type { CollectedItem, RadarSource } from "../types";

interface WebConfig {
  selector?: string;
  titleSelector?: string;
  linkSelector?: string;
  descSelector?: string;
}

export async function collectWeb(source: RadarSource): Promise<CollectedItem[]> {
  const config: WebConfig = source.config ? JSON.parse(source.config) : {};

  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Radar-Worker/1.0; +https://dx.minu.best)",
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`Web fetch failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const items: CollectedItem[] = [];

  // Simple link extraction — for more sophisticated scraping,
  // use HTMLRewriter in a streaming fashion
  const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let match;
  const seen = new Set<string>();

  while ((match = linkRegex.exec(html)) !== null && items.length < 20) {
    let href = match[1];
    const text = match[2].trim();

    if (!text || text.length < 5) continue;
    if (href.startsWith("#") || href.startsWith("javascript:")) continue;

    // Resolve relative URLs
    if (href.startsWith("/")) {
      const base = new URL(source.url);
      href = `${base.origin}${href}`;
    }

    if (seen.has(href)) continue;
    seen.add(href);

    // Filter by keywords if configured
    if (config.selector) {
      const keywords = config.selector.split(",").map((k) => k.trim().toLowerCase());
      const matchesKeyword = keywords.some(
        (kw) => text.toLowerCase().includes(kw) || href.toLowerCase().includes(kw)
      );
      if (!matchesKeyword) continue;
    }

    items.push({
      sourceId: source.id,
      url: href,
      title: text.substring(0, 200),
      summary: null,
    });
  }

  return items;
}
