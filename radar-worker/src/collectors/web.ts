import type { CollectedItem, RadarSource } from "../types";
import { fetchWithRetry } from "../lib/fetch-retry";

interface WebConfig {
  selector?: string;
  titleSelector?: string;
  linkSelector?: string;
  descSelector?: string;
}

interface LinkEntry {
  href: string;
  text: string;
}

export async function collectWeb(source: RadarSource): Promise<CollectedItem[]> {
  const config: WebConfig = source.config ? JSON.parse(source.config) : {};

  const response = await fetchWithRetry(source.url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; Radar-Worker/1.0; +https://dx.minu.best)",
      Accept: "text/html",
    },
  });

  if (!response.ok) {
    throw new Error(`Web fetch failed: ${response.status} ${response.statusText}`);
  }

  const links = await extractLinks(response, source.url);
  const items: CollectedItem[] = [];
  const seen = new Set<string>();

  for (const link of links) {
    if (items.length >= 20) break;

    const { href, text } = link;
    if (!text || text.length < 5) continue;
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

async function extractLinks(response: Response, baseUrl: string): Promise<LinkEntry[]> {
  const links: LinkEntry[] = [];
  let currentText = "";
  let currentHref: string | null = null;

  const rewriter = new HTMLRewriter()
    .on("a[href]", {
      element(el) {
        const href = el.getAttribute("href");
        if (!href || href.startsWith("#") || href.startsWith("javascript:")) {
          currentHref = null;
          return;
        }

        // Resolve relative URLs
        let resolved = href;
        if (href.startsWith("/")) {
          const base = new URL(baseUrl);
          resolved = `${base.origin}${href}`;
        } else if (!href.startsWith("http")) {
          try {
            resolved = new URL(href, baseUrl).href;
          } catch {
            currentHref = null;
            return;
          }
        }

        currentHref = resolved;
        currentText = "";
      },
      text(chunk) {
        if (currentHref !== null) {
          currentText += chunk.text;
          if (chunk.lastInTextNode) {
            const trimmed = currentText.trim();
            if (trimmed) {
              links.push({ href: currentHref, text: trimmed });
            }
            currentHref = null;
            currentText = "";
          }
        }
      },
    });

  // HTMLRewriter consumes the response stream
  const transformed = rewriter.transform(response);
  await transformed.text();

  return links;
}
