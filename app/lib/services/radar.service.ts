import { eq, or, isNull } from "drizzle-orm";
import type { DB } from "~/db";
import { radarSources, radarItems } from "~/db/schema";

// ============================================================================
// Types
// ============================================================================

type RadarSource = typeof radarSources.$inferSelect;
type RadarItem = typeof radarItems.$inferSelect;

interface CreateSourceInput {
  name: string;
  sourceType: string;
  url: string;
  config?: Record<string, unknown> | null;
  userId: string;
  tenantId?: string;
  keywords?: string[];
  radarTags?: string[];
}

interface UpdateSourceInput {
  name?: string;
  url?: string;
  enabled?: number;
  config?: Record<string, unknown>;
}

// ============================================================================
// Service
// ============================================================================

export class RadarService {
  constructor(private db: DB) {}

  /**
   * 소스 목록 조회
   * routes/api.radar.sources.ts loader 패턴 추출
   */
  async getSources(options?: {
    userOnly?: boolean;
    userId?: string;
  }): Promise<RadarSource[]> {
    if (options?.userOnly && options.userId) {
      return this.db
        .select()
        .from(radarSources)
        .where(
          or(
            eq(radarSources.userId, options.userId),
            isNull(radarSources.userId),
          ),
        );
    }
    return this.db.select().from(radarSources);
  }

  /**
   * 소스 생성
   * routes/api.radar.sources.ts action (intent=create) 패턴 추출
   */
  async createSource(data: CreateSourceInput): Promise<string> {
    if (!["rss", "web", "youtube"].includes(data.sourceType)) {
      throw new Error(
        "sourceType은 rss, web, youtube 중 하나여야 합니다.",
      );
    }

    const id = crypto.randomUUID();
    await this.db.insert(radarSources).values({
      id,
      name: data.name,
      sourceType: data.sourceType,
      url: data.url,
      config: data.config ?? null,
      userId: data.userId,
      tenantId: data.tenantId,
      keywords: data.keywords ?? [],
      radarTags: data.radarTags ?? [],
    });

    return id;
  }

  /**
   * 소스 업데이트
   * routes/api.radar.sources.ts action (intent=update) 패턴 추출
   */
  async updateSource(id: string, input: UpdateSourceInput): Promise<void> {
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };
    if (input.name) updates.name = input.name;
    if (input.url) updates.url = input.url;
    if (input.enabled !== undefined) updates.enabled = input.enabled;
    if (input.config) updates.config = input.config;

    await this.db
      .update(radarSources)
      .set(updates)
      .where(eq(radarSources.id, id));
  }

  /**
   * 소스 삭제
   * routes/api.radar.sources.ts action (intent=delete) 패턴 추출
   */
  async deleteSource(id: string): Promise<void> {
    await this.db.delete(radarSources).where(eq(radarSources.id, id));
  }

  /**
   * 아이템 목록 조회
   */
  async getItems(params: {
    sourceId?: string;
    status?: string;
    limit?: number;
  }): Promise<RadarItem[]> {
    let query = this.db.select().from(radarItems);

    if (params.sourceId) {
      query = query.where(
        eq(radarItems.sourceId, params.sourceId),
      ) as typeof query;
    }

    if (params.status) {
      query = query.where(
        eq(radarItems.status, params.status),
      ) as typeof query;
    }

    if (params.limit) {
      query = query.limit(params.limit) as typeof query;
    }

    return query;
  }

  /**
   * 아이템 상태 업데이트
   */
  async updateItemStatus(itemId: string, status: string): Promise<void> {
    await this.db
      .update(radarItems)
      .set({ status })
      .where(eq(radarItems.id, itemId));
  }
}
