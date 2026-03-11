/**
 * Crawl Worker 단위 테스트
 *
 * 대상: crawl-worker.ts — parseRssXml, classifyError, CrawlError
 * 외부 fetch 의존 함수(processCrawlQueue, fetchRss, fetchHtml)는 통합 테스트 대상.
 * 여기서는 순수 함수 + 에러 분류 로직을 검증한다.
 */
import { describe, it, expect } from "vitest";
import {
  CrawlError,
  classifyError,
  parseRssXml,
} from "~/features/radar/service/crawl-worker";

// ─── CrawlError ─────────────────────────────────────────────────────────

describe("CrawlError", () => {
  it("code와 statusCode를 포함", () => {
    const err = new CrawlError("timeout", "TIMEOUT", 408);
    expect(err.message).toBe("timeout");
    expect(err.code).toBe("TIMEOUT");
    expect(err.statusCode).toBe(408);
    expect(err.name).toBe("CrawlError");
    expect(err instanceof Error).toBe(true);
  });

  it("statusCode 없이 생성 가능", () => {
    const err = new CrawlError("parse failed", "PARSE_ERROR");
    expect(err.code).toBe("PARSE_ERROR");
    expect(err.statusCode).toBeUndefined();
  });
});

// ─── classifyError ──────────────────────────────────────────────────────

describe("classifyError", () => {
  it("CrawlError → 코드 직접 반환", () => {
    expect(classifyError(new CrawlError("x", "TIMEOUT"))).toBe("TIMEOUT");
    expect(classifyError(new CrawlError("x", "PARSE_ERROR"))).toBe("PARSE_ERROR");
    expect(classifyError(new CrawlError("x", "AUTH_REQUIRED"))).toBe("AUTH_REQUIRED");
    expect(classifyError(new CrawlError("x", "RATE_LIMITED"))).toBe("RATE_LIMITED");
  });

  it("status 속성이 있는 객체 → HTTP 상태 기반 분류", () => {
    expect(classifyError({ status: 401 })).toBe("AUTH_REQUIRED");
    expect(classifyError({ status: 403 })).toBe("AUTH_REQUIRED");
    expect(classifyError({ status: 429 })).toBe("RATE_LIMITED");
    expect(classifyError({ status: 500 })).toBe("NETWORK_ERROR");
    expect(classifyError({ status: 502 })).toBe("NETWORK_ERROR");
  });

  it("문자열 메시지 기반 fallback", () => {
    expect(classifyError(new Error("Request timeout"))).toBe("TIMEOUT");
    expect(classifyError(new Error("Connection aborted"))).toBe("TIMEOUT");
    expect(classifyError(new Error("Failed to parse response"))).toBe("PARSE_ERROR");
    expect(classifyError(new Error("Unknown error"))).toBe("NETWORK_ERROR");
  });

  it("null/undefined → NETWORK_ERROR", () => {
    expect(classifyError(null)).toBe("NETWORK_ERROR");
    expect(classifyError(undefined)).toBe("NETWORK_ERROR");
  });
});

// ─── parseRssXml ────────────────────────────────────────────────────────

describe("parseRssXml", () => {
  it("RSS 2.0 피드에서 아이템 추출", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Test Feed</title>
        <item>
          <title>Article 1</title>
          <link>https://example.com/1</link>
          <description>First article summary</description>
          <pubDate>Mon, 10 Mar 2026 09:00:00 GMT</pubDate>
        </item>
        <item>
          <title>Article 2</title>
          <link>https://example.com/2</link>
          <description>Second article</description>
        </item>
      </channel>
    </rss>`;

    const items = parseRssXml(xml);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Article 1");
    expect(items[0].link).toBe("https://example.com/1");
    expect(items[0].description).toBe("First article summary");
    expect(items[0].pubDate).toBe("Mon, 10 Mar 2026 09:00:00 GMT");
    expect(items[1].title).toBe("Article 2");
    expect(items[1].pubDate).toBeUndefined();
  });

  it("CDATA 래핑된 콘텐츠 처리", () => {
    const xml = `<rss>
      <channel>
        <item>
          <title><![CDATA[Title with <special> chars]]></title>
          <link><![CDATA[https://example.com/cdata]]></link>
          <description><![CDATA[<p>HTML content</p>]]></description>
        </item>
      </channel>
    </rss>`;

    const items = parseRssXml(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Title with <special> chars");
    expect(items[0].link).toBe("https://example.com/cdata");
    expect(items[0].description).toBe("<p>HTML content</p>");
  });

  it("Atom 피드에서 entry 추출 (fallback)", () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>Atom Feed</title>
      <entry>
        <title>Atom Entry 1</title>
        <link href="https://example.com/atom/1" />
        <summary>Atom summary</summary>
        <published>2026-03-10T09:00:00Z</published>
      </entry>
      <entry>
        <title>Atom Entry 2</title>
        <link href="https://example.com/atom/2" rel="alternate" />
        <content>Atom content</content>
        <updated>2026-03-10T10:00:00Z</updated>
      </entry>
    </feed>`;

    const items = parseRssXml(xml);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("Atom Entry 1");
    expect(items[0].link).toBe("https://example.com/atom/1");
    expect(items[0].description).toBe("Atom summary");
    expect(items[0].pubDate).toBe("2026-03-10T09:00:00Z");
    expect(items[1].title).toBe("Atom Entry 2");
    expect(items[1].link).toBe("https://example.com/atom/2");
    expect(items[1].description).toBe("Atom content");
    expect(items[1].pubDate).toBe("2026-03-10T10:00:00Z");
  });

  it("RSS가 있으면 Atom fallback하지 않음", () => {
    const xml = `<rss>
      <channel>
        <item>
          <title>RSS Item</title>
          <link>https://example.com/rss</link>
          <description>desc</description>
        </item>
      </channel>
    </rss>`;

    // RSS 형식으로 처리, Atom fallback 안 함
    const items = parseRssXml(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("RSS Item");
  });

  it("빈 XML → 빈 배열", () => {
    const items = parseRssXml("");
    expect(items).toHaveLength(0);
  });

  it("잘못된 XML → 빈 배열 (파싱 가능한 것만 추출)", () => {
    const xml = "<not-rss>garbage</not-rss>";
    const items = parseRssXml(xml);
    expect(items).toHaveLength(0);
  });

  it("HTML 엔티티 디코딩", () => {
    const xml = `<rss>
      <channel>
        <item>
          <title>AI &amp; Machine Learning</title>
          <link>https://example.com/ai</link>
          <description>It&apos;s &lt;great&gt;</description>
        </item>
      </channel>
    </rss>`;

    const items = parseRssXml(xml);
    expect(items[0].title).toBe("AI & Machine Learning");
    expect(items[0].description).toBe("It's <great>");
  });

  it("여러 개의 item 정확히 파싱", () => {
    const items = [];
    for (let i = 0; i < 20; i++) {
      items.push(`<item><title>Item ${i}</title><link>https://ex.com/${i}</link><description>d${i}</description></item>`);
    }
    const xml = `<rss><channel>${items.join("")}</channel></rss>`;

    const result = parseRssXml(xml);
    expect(result).toHaveLength(20);
    expect(result[0].title).toBe("Item 0");
    expect(result[19].title).toBe("Item 19");
  });
});
