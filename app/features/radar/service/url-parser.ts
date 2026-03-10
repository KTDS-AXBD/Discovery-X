/**
 * URL 파싱 유틸리티 — 순수 함수, DB/외부 서비스 의존 없음
 * DX-REQ-012 Phase 1A: 수집 고도화
 */

// ─── Types ───────────────────────────────────────────────────

export interface ParsedPage {
  title: string;
  summary: string;
  rawContent: string;
  parsedContent: string;
  excerpt: string;
  metadata: {
    author?: string;
    publishedAt?: string;
    wordCount: number;
    language?: string;
    siteName?: string;
  };
}

// ─── Internal Helpers ────────────────────────────────────────

const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
];

function extractMeta(html: string, name: string): string | undefined {
  const re = new RegExp(
    `<meta\\s+[^>]*name=["']${name}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const match = html.match(re);
  if (match) return decodeHtmlEntities(match[1].trim());

  // content가 name보다 앞에 오는 경우
  const reAlt = new RegExp(
    `<meta\\s+[^>]*content=["']([^"']*)["'][^>]*name=["']${name}["']`,
    "i",
  );
  const matchAlt = html.match(reAlt);
  if (matchAlt) return decodeHtmlEntities(matchAlt[1].trim());

  return undefined;
}

function extractOgMeta(html: string, property: string): string | undefined {
  const re = new RegExp(
    `<meta\\s+[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`,
    "i",
  );
  const match = html.match(re);
  if (match) return decodeHtmlEntities(match[1].trim());

  const reAlt = new RegExp(
    `<meta\\s+[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`,
    "i",
  );
  const matchAlt = html.match(reAlt);
  if (matchAlt) return decodeHtmlEntities(matchAlt[1].trim());

  return undefined;
}

function extractTextContent(html: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = html.match(re);
  return match ? match[1] : undefined;
}

function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function extractTitle(html: string): string {
  return (
    extractOgMeta(html, "og:title") ||
    extractTextContent(html, "title") ||
    ""
  );
}

function extractBody(html: string): string {
  // <article> > <main> > <body> 우선순위
  const article = extractTextContent(html, "article");
  if (article) return article;

  const main = extractTextContent(html, "main");
  if (main) return main;

  const body = extractTextContent(html, "body");
  return body || html;
}

function extractLanguage(html: string): string | undefined {
  const match = html.match(/<html[^>]*\slang=["']([^"']*)["']/i);
  return match ? match[1].trim() : undefined;
}

// ─── Public Functions ────────────────────────────────────────

export function canonicalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);

    // http → https
    if (parsed.protocol === "http:") {
      parsed.protocol = "https:";
    }

    // 트래킹 파라미터 제거
    for (const param of TRACKING_PARAMS) {
      parsed.searchParams.delete(param);
    }

    // hostname 소문자 + www. 제거
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, "");

    // trailing slash 제거 (루트 패스 "/" 제외)
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }

    return parsed.toString();
  } catch {
    return url;
  }
}

export async function generateDedupeKey(
  title: string,
  publishedAt?: string,
): Promise<string> {
  const normalized = title.toLowerCase().replace(/\s+/g, " ").trim();
  const input = `${normalized}|${publishedAt || ""}`;

  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function parseUrl(url: string): Promise<ParsedPage> {
  const response = await fetch(url, {
    headers: { "User-Agent": "Discovery-X/0.7.0" },
    redirect: "follow",
  });

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    throw new Error(
      `지원하지 않는 콘텐츠 타입: ${contentType} (text/html만 지원)`,
    );
  }

  const rawContent = await response.text();

  const title = stripHtmlTags(extractTitle(rawContent));
  const summary =
    extractMeta(rawContent, "description") ||
    extractOgMeta(rawContent, "og:description") ||
    "";

  const bodyHtml = extractBody(rawContent);
  const parsedContent = stripHtmlTags(bodyHtml);
  const excerpt = parsedContent.slice(0, 200);

  const words = parsedContent.split(/\s+/).filter(Boolean);

  return {
    title,
    summary,
    rawContent,
    parsedContent,
    excerpt,
    metadata: {
      author: extractMeta(rawContent, "author"),
      publishedAt: extractOgMeta(rawContent, "article:published_time"),
      wordCount: words.length,
      language: extractLanguage(rawContent),
      siteName: extractOgMeta(rawContent, "og:site_name"),
    },
  };
}
