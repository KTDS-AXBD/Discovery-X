import { eq, desc, and, sql } from "drizzle-orm";
import type { DB } from "~/db";
import { radarItems } from "~/db/schema";
import { ideas, ideaSources } from "~/features/ideas/db/schema";

// ============================================================================
// Types
// ============================================================================

type Idea = typeof ideas.$inferSelect;

// ============================================================================
// Service
// ============================================================================

export class IdeaService {
  constructor(private db: DB) {}

  // ────────────── Ideas CRUD ──────────────

  /** 테넌트별 아이디어 목록 조회 */
  async list(tenantId: string, limit = 50) {
    return this.db
      .select({
        id: ideas.id,
        title: ideas.title,
        status: ideas.status,
        ownerId: ideas.ownerId,
        analysisData: ideas.analysisData,
        createdAt: ideas.createdAt,
      })
      .from(ideas)
      .where(eq(ideas.tenantId, tenantId))
      .orderBy(desc(ideas.createdAt))
      .limit(limit);
  }

  /** 아이디어 단건 조회 */
  async getById(ideaId: string): Promise<Idea | null> {
    return (
      (await this.db.select().from(ideas).where(eq(ideas.id, ideaId)).get()) ??
      null
    );
  }

  /** 아이디어 생성 — 생성된 ID 반환 */
  async create(
    tenantId: string,
    ownerId: string,
    title: string,
  ): Promise<string> {
    const id = crypto.randomUUID();
    await this.db.insert(ideas).values({ id, tenantId, ownerId, title });
    return id;
  }

  /** 아이디어 제목 수정 */
  async updateTitle(id: string, title: string) {
    await this.db
      .update(ideas)
      .set({ title, updatedAt: sql`(unixepoch())` })
      .where(eq(ideas.id, id));
  }

  /** 아이디어 삭제 */
  async delete(id: string) {
    await this.db.delete(ideas).where(eq(ideas.id, id));
  }

  /** 분석 데이터 조회 (title + analysisData) */
  async getAnalysisData(ideaId: string) {
    return (
      (await this.db
        .select({ title: ideas.title, analysisData: ideas.analysisData })
        .from(ideas)
        .where(eq(ideas.id, ideaId))
        .get()) ?? null
    );
  }

  // ────────────── 소스 링크 ──────────────

  /** 아이디어에 연결된 소스 목록 (api.ideas.$id.sources loader용) */
  async getLinkedSources(ideaId: string) {
    return this.db
      .select({
        id: ideaSources.id,
        radarItemId: ideaSources.radarItemId,
        addedAt: ideaSources.addedAt,
        title: radarItems.title,
        titleKo: radarItems.titleKo,
        summaryKo: radarItems.summaryKo,
        url: radarItems.url,
        status: radarItems.status,
        memo: radarItems.memo,
      })
      .from(ideaSources)
      .innerJoin(radarItems, eq(ideaSources.radarItemId, radarItems.id))
      .where(eq(ideaSources.ideaId, ideaId));
  }

  /** 아이디어에 연결된 소스 상세 (ideas.$id.tsx loader용) */
  async getLinkedSourcesDetail(ideaId: string) {
    return this.db
      .select({
        id: radarItems.id,
        title: radarItems.title,
        titleKo: radarItems.titleKo,
        summaryKo: radarItems.summaryKo,
        url: radarItems.url,
        keyPoints: radarItems.keyPoints,
        memo: radarItems.memo,
      })
      .from(ideaSources)
      .innerJoin(radarItems, eq(ideaSources.radarItemId, radarItems.id))
      .where(eq(ideaSources.ideaId, ideaId));
  }

  /** 제목 추천용 소스 컨텍스트 (suggest-title용) */
  async getLinkedSourcesForContext(ideaId: string, limit = 10) {
    return this.db
      .select({
        title: radarItems.title,
        titleKo: radarItems.titleKo,
        summaryKo: radarItems.summaryKo,
        memo: radarItems.memo,
      })
      .from(ideaSources)
      .innerJoin(radarItems, eq(ideaSources.radarItemId, radarItems.id))
      .where(eq(ideaSources.ideaId, ideaId))
      .limit(limit);
  }

  /** 소스 링크 추가 — 이미 존재하면 false */
  async linkSource(ideaId: string, radarItemId: string): Promise<boolean> {
    try {
      await this.db.insert(ideaSources).values({
        id: crypto.randomUUID(),
        ideaId,
        radarItemId,
      });
      return true;
    } catch {
      // unique constraint violation — already linked
      return false;
    }
  }

  /** 소스 링크 제거 */
  async unlinkSource(ideaId: string, radarItemId: string) {
    await this.db
      .delete(ideaSources)
      .where(
        and(
          eq(ideaSources.ideaId, ideaId),
          eq(ideaSources.radarItemId, radarItemId),
        ),
      );
  }
}
