import type { CollectedItem, RadarSource } from "../types";
import { fetchWithRetry } from "@discovery-x/worker-utils";
import { collectRss } from "./rss";

/**
 * YouTube channels have an RSS feed at:
 * https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
 *
 * We reuse the RSS collector since YouTube RSS is standard Atom.
 */
export async function collectYoutube(source: RadarSource): Promise<CollectedItem[]> {
  let url = source.url;

  // Auto-convert channel URL to RSS feed URL
  if (url.includes("youtube.com/channel/")) {
    const channelIdMatch = url.match(/channel\/(UC[\w-]+)/);
    if (channelIdMatch) {
      url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelIdMatch[1]}`;
    }
  } else if (url.includes("youtube.com/@")) {
    const resolved = await resolveHandleToChannelId(url);
    if (resolved) {
      url = `https://www.youtube.com/feeds/videos.xml?channel_id=${resolved}`;
    }
    // If resolution fails, fall through with original URL (existing behavior)
  }

  // Use the RSS collector with the YouTube feed URL
  const rssSource: RadarSource = { ...source, url };
  return collectRss(rssSource);
}

/**
 * Fetch a YouTube @handle page and extract channel_id from HTML meta tags.
 */
async function resolveHandleToChannelId(handleUrl: string): Promise<string | null> {
  try {
    const response = await fetchWithRetry(handleUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Radar-Worker/1.0; +https://dx.minu.best)",
        Accept: "text/html",
      },
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Pattern 1: <meta itemprop="channelId" content="UCxxxxxx">
    const metaMatch = html.match(/itemprop="channelId"\s+content="(UC[\w-]+)"/);
    if (metaMatch) return metaMatch[1];

    // Pattern 2: "externalId":"UCxxxxxx" (JSON-LD / ytInitialData)
    const jsonMatch = html.match(/"externalId"\s*:\s*"(UC[\w-]+)"/);
    if (jsonMatch) return jsonMatch[1];

    return null;
  } catch {
    return null;
  }
}
