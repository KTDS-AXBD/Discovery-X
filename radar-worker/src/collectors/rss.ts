import type { CollectedItem, RadarSource } from "../types";

interface RssEntry {
  title: string;
  link: string;
  description: string | null;
}

function parseRssXml(xml: string): RssEntry[] {
  const entries: RssEntry[] = [];

  // Parse RSS 2.0 <item> elements
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const itemXml = match[1];
    const title = extractTag(itemXml, "title");
    const link = extractTag(itemXml, "link");
    const description = extractTag(itemXml, "description");

    if (title && link) {
      entries.push({ title: decodeEntities(title), link, description });
    }
  }

  // Parse Atom <entry> elements if no RSS items found
  if (entries.length === 0) {
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/gi;
    while ((match = entryRegex.exec(xml)) !== null) {
      const entryXml = match[1];
      const title = extractTag(entryXml, "title");
      const link =
        extractAttr(entryXml, "link", "href") ||
        extractTag(entryXml, "link");
      const summary =
        extractTag(entryXml, "summary") || extractTag(entryXml, "content");

      if (title && link) {
        entries.push({ title: decodeEntities(title), link, description: summary });
      }
    }
  }

  return entries;
}

function extractTag(xml: string, tag: string): string | null {
  // Handle CDATA sections
  const cdataRegex = new RegExp(
    `<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*</${tag}>`,
    "i"
  );
  const cdataMatch = cdataRegex.exec(xml);
  if (cdataMatch) return cdataMatch[1].trim();

  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = regex.exec(xml);
  return match ? match[1].trim() : null;
}

function extractAttr(xml: string, tag: string, attr: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, "i");
  const match = regex.exec(xml);
  return match ? match[1] : null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<[^>]+>/g, ""); // Strip HTML tags
}

export async function collectRss(source: RadarSource): Promise<CollectedItem[]> {
  const response = await fetch(source.url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Radar-Worker/1.0; +https://dx.minu.best)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
    },
  });

  if (!response.ok) {
    throw new Error(`RSS fetch failed: ${response.status} ${response.statusText}`);
  }

  const xml = await response.text();
  const entries = parseRssXml(xml);

  // Take most recent 20 entries
  return entries.slice(0, 20).map((entry) => ({
    sourceId: source.id,
    url: entry.link,
    title: entry.title,
    summary: entry.description
      ? entry.description.substring(0, 500)
      : null,
  }));
}
