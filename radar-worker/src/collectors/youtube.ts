import type { CollectedItem, RadarSource } from "../types";
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
  if (url.includes("youtube.com/@") || url.includes("youtube.com/channel/")) {
    // If it's a channel page, try to extract channel ID or use the channel RSS
    const channelIdMatch = url.match(/channel\/(UC[\w-]+)/);
    if (channelIdMatch) {
      url = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelIdMatch[1]}`;
    }
    // For @handle URLs, the user should provide the RSS URL directly
  }

  // Use the RSS collector with the YouTube feed URL
  const rssSource: RadarSource = { ...source, url };
  return collectRss(rssSource);
}
