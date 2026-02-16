import { eq, desc, and, sql } from "drizzle-orm";
import type { DB } from "~/db";
import {
  ideas,
  ideaSources,
  type Idea,
  type IdeaSource,
} from "~/features/ideas/db/schema";
import { radarItems } from "~/db/schema";

// ============================================================================
// Types
// ============================================================================

interface IdeaListItem {
  id: string;
  title: string;
  status: string;
  createdAt: Date;
}

interface IdeaSourceWithItem extends IdeaSource {
  title: string | null;
  titleKo: string | null;
  summaryKo: string | null;
  url: string;
  status: string;
  memo: string | null;
}

// ============================================================================
// Service
// ============================================================================

export class IdeaService {
  constructor(private db: DB) {}

  /**
   * 목록 조회
   * routes/api.ideas.ts loader 패턴 추출
   */
  async list(tenantId: string): Promise<IdeaListItem[]> {
    return this.db
      .select({
        id: ideas.id,
        title: ideas.title,
        status: ideas.status,
        createdAt: ideas.createdAt,
      })
      .from(ideas)
      .where(eq(ideas.tenantId, tenantId))
      .orderBy(desc(ideas.createdAt))
      .limit(50);
  }

  /**
   * 상세 조회
   */
  async getById(id: string): Promise<Idea | null> {
    const results = await this.db
      .select()
      .from(ideas)
      .where(eq(ideas.id, id))
      .limit(1);
    return results[0] ?? null;
  }

  /**
   * 생성
   * routes/api.ideas.ts POST action 패턴 추출
   */
  async create(data: {
    title: string;
    ownerId: string;
    tenantId: string;
  }): Promise<string> {
    const id = crypto.randomUUID();
    await this.db.insert(ideas).values({
      id,
      tenantId: data.tenantId,
      ownerId: data.ownerId,
      title: data.title,
    });
    return id;
  }

  /**
   * 제목 수정
   * routes/api.ideas.ts PATCH action 패턴 추출
   */
  async updateTitle(id: string, title: string): Promise<void> {
    await this.db
      .update(ideas)
      .set({ title, updatedAt: sql`(unixepoch())` })
      .where(eq(ideas.id, id));
  }

  /**
   * 삭제
   * routes/api.ideas.ts DELETE action 패턴 추출
   */
  async delete(id: string): Promise<void> {
    await this.db.delete(ideas).where(eq(ideas.id, id));
  }

  /**
   * 소스 목록 조회
   * routes/api.ideas.$id.sources.ts loader 패턴 추출
   */
  async getSources(ideaId: string): Promise<IdeaSourceWithItem[]> {
    const sources = await this.db
      .select({
        id: ideaSources.id,
        ideaId: ideaSources.ideaId,
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
    return sources;
  }

  /**
   * 소스 연결 추가
   */
  async addSource(ideaId: string, radarItemId: string): Promise<void> {
    await this.db.insert(ideaSources).values({
      id: crypto.randomUUID(),
      ideaId,
      radarItemId,
    });
  }

  /**
   * 소스 연결 제거
   * routes/api.ideas.$id.sources.ts DELETE action 패턴 추출
   */
  async removeSource(ideaId: string, radarItemId: string): Promise<void> {
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
