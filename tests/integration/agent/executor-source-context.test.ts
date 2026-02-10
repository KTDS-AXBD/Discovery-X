import { describe, it, expect, beforeEach } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb, type TestDB } from "../../helpers/db";
import { makeUser, resetFixtureCounter } from "../../helpers/fixtures";
import {
  users,
  radarSources,
  radarItems,
  conversations,
} from "~/db/schema";

/**
 * executor.ts의 sourceContext 조회 로직을 직접 재현하여 테스트합니다.
 * (executor 전체 호출은 Claude API 모킹 필요 — 여기서는 DB 로직만 검증)
 * better-sqlite3는 동기 드라이버이므로 async 사용하지 않음.
 */
function getSourceContext(
  db: TestDB,
  conversationId: string
): { title?: string; summaryKo?: string; url?: string; keyPoints?: string[] } | null {
  try {
    const conv = db
      .select({ sourceItemId: conversations.sourceItemId })
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1)
      .all();

    if (conv[0]?.sourceItemId) {
      const item = db
        .select({
          title: radarItems.title,
          titleKo: radarItems.titleKo,
          summaryKo: radarItems.summaryKo,
          url: radarItems.url,
          keyPoints: radarItems.keyPoints,
        })
        .from(radarItems)
        .where(eq(radarItems.id, conv[0].sourceItemId))
        .limit(1)
        .all();

      if (item[0]) {
        return {
          title: item[0].titleKo || item[0].title || undefined,
          summaryKo: item[0].summaryKo || undefined,
          url: item[0].url || undefined,
          keyPoints: (item[0].keyPoints as string[]) || undefined,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

describe("Executor sourceContext lookup", () => {
  let db: TestDB;

  beforeEach(() => {
    resetFixtureCounter();
    db = createTestDb();
  });

  // I-25: 소스 연결된 대화 → sourceContext 반환
  it("returns sourceContext when conversation has linked radarItem", () => {
    const user = makeUser();
    db.insert(users).values(user).run();

    db.insert(radarSources).values({
      id: "src-1",
      name: "TechCrunch",
      sourceType: "rss",
      url: "https://techcrunch.com/feed",
    }).run();

    db.insert(radarItems).values({
      id: "item-1",
      sourceId: "src-1",
      urlHash: "hash-1",
      url: "https://techcrunch.com/ai-article",
      title: "AI Manufacturing Quality",
      titleKo: "AI 제조업 품질 검사",
      summaryKo: "AI 기반 품질 검사 시장이 급성장 중",
      keyPoints: ["비전 AI 정확도 99.5%", "도입 비용 30% 감소"],
    }).run();

    db.insert(conversations).values({
      id: "conv-1",
      userId: user.id,
      title: "AI 분석 대화",
      sourceItemId: "item-1",
    }).run();

    const ctx = getSourceContext(db, "conv-1");
    expect(ctx).not.toBeNull();
    expect(ctx).toMatchObject({
      title: "AI 제조업 품질 검사",
      summaryKo: "AI 기반 품질 검사 시장이 급성장 중",
      url: "https://techcrunch.com/ai-article",
    });
  });

  // I-26: 소스 없는 대화 → null 반환
  it("returns null when conversation has no sourceItemId", () => {
    const user = makeUser();
    db.insert(users).values(user).run();

    db.insert(conversations).values({
      id: "conv-no-source",
      userId: user.id,
      title: "일반 대화",
    }).run();

    const ctx = getSourceContext(db, "conv-no-source");
    expect(ctx).toBeNull();
  });

  // I-27: sourceItemId가 가리키는 radarItem이 없는 경우 → null 반환 (에러 없이)
  it("returns null when linked radarItem no longer exists", () => {
    const user = makeUser();
    db.insert(users).values(user).run();

    // FK constraint를 일시 비활성화하여 orphan 상태를 시뮬레이션
    db.run(sql`PRAGMA foreign_keys = OFF`);

    db.insert(conversations).values({
      id: "conv-orphan",
      userId: user.id,
      title: "고아 대화",
      sourceItemId: "item-that-does-not-exist",
    }).run();

    db.run(sql`PRAGMA foreign_keys = ON`);

    const ctx = getSourceContext(db, "conv-orphan");
    expect(ctx).toBeNull();
  });
});
