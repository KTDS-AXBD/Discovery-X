import { eq, desc, and, or, isNull, sql } from "drizzle-orm";
import type { DB } from "~/db";
import {
  radarSources,
  radarRuns,
  radarItems,
  radarItemUserStatus,
} from "~/db/schema";

// ============================================================================
// Types
// ============================================================================

interface ListSourcesParams {
  /** true면 userId 소유 + 공용(userId=null)만 반환 */
  userOnly?: boolean;
  userId?: string;
}

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
  id: string;
  name?: string;
  url?: string;
  enabled?: number;
  config?: Record<string, unknown>;
}

interface UpsertItemStatusInput {
  userId: string;
  itemId: string;
  status: "new" | "viewed" | "archived";
}

interface UpsertItemReactionInput {
  userId: string;
  itemId: string;
  reaction: "like" | "dislike" | null;
}

interface RadarDataParams {
  tenantId: string;
}

interface UpdateItemKeyPointsInput {
  itemId: string;
  keyPoints: string[];
}

// ============================================================================
// Service
// ============================================================================

export class RadarService {
  constructor(private db: DB) {}

  // ---------- Sources ----------

  /** 소스 목록 조회 */
  async listSources(params: ListSourcesParams = {}) {
    if (params.userOnly && params.userId) {
      return this.db
        .select()
        .from(radarSources)
        .where(
          or(
            eq(radarSources.userId, params.userId),
            isNull(radarSources.userId),
          ),
        );
    }
    return this.db.select().from(radarSources);
  }

  /** 테넌트별 소스 목록 조회 */
  async listSourcesByTenant(tenantId: string) {
    return this.db
      .select()
      .from(radarSources)
      .where(eq(radarSources.tenantId, tenantId));
  }

  /** 소스 생성 */
  async createSource(input: CreateSourceInput): Promise<string> {
    const id = crypto.randomUUID();
    await this.db.insert(radarSources).values({
      id,
      name: input.name,
      sourceType: input.sourceType,
      url: input.url,
      config: input.config ?? null,
      userId: input.userId,
      tenantId: input.tenantId,
      keywords: input.keywords ?? [],
      radarTags: input.radarTags ?? [],
    });
    return id;
  }

  /** 소스 수정 */
  async updateSource(input: UpdateSourceInput) {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name) updates.name = input.name;
    if (input.url) updates.url = input.url;
    if (input.enabled !== undefined) updates.enabled = input.enabled;
    if (input.config) updates.config = input.config;

    await this.db
      .update(radarSources)
      .set(updates)
      .where(eq(radarSources.id, input.id));
  }

  /** 소스 토글 (활성/비활성) */
  async toggleSource(id: string, currentEnabled: boolean) {
    await this.db
      .update(radarSources)
      .set({ enabled: currentEnabled ? 0 : 1, updatedAt: new Date() })
      .where(eq(radarSources.id, id));
  }

  /** 소스 삭제 */
  async deleteSource(id: string) {
    await this.db.delete(radarSources).where(eq(radarSources.id, id));
  }

  // ---------- Runs ----------

  /** 실행 이력 조회 */
  async listRuns(params: { limit?: number } = {}) {
    const limit = Math.min(params.limit ?? 20, 50);
    return this.db
      .select()
      .from(radarRuns)
      .orderBy(desc(radarRuns.startedAt))
      .limit(limit);
  }

  /** 테넌트별 실행 이력 조회 */
  async listRunsByTenant(tenantId: string, limit = 20) {
    return this.db
      .select()
      .from(radarRuns)
      .where(eq(radarRuns.tenantId, tenantId))
      .orderBy(desc(radarRuns.startedAt))
      .limit(limit);
  }

  // ---------- Items ----------

  /** 테넌트별 최근 아이템 조회 */
  async listRecentItemsByTenant(tenantId: string, limit = 50) {
    return this.db
      .select()
      .from(radarItems)
      .where(
        sql`${radarItems.runId} IN (SELECT id FROM radar_runs WHERE tenant_id = ${tenantId})`,
      )
      .orderBy(desc(radarItems.collectedAt))
      .limit(limit);
  }

  /** 아이템 단건 조회 */
  async getItem(itemId: string) {
    const rows = await this.db
      .select()
      .from(radarItems)
      .where(eq(radarItems.id, itemId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** 아이템 존재 확인 */
  async itemExists(itemId: string): Promise<boolean> {
    const rows = await this.db
      .select({ id: radarItems.id })
      .from(radarItems)
      .where(eq(radarItems.id, itemId))
      .limit(1);
    return rows.length > 0;
  }

  /** 아이템 memo 조회 */
  async getItemMemo(itemId: string) {
    const rows = await this.db
      .select({ id: radarItems.id, memo: radarItems.memo })
      .from(radarItems)
      .where(eq(radarItems.id, itemId))
      .limit(1);
    return rows[0] ?? null;
  }

  /** 아이템 memo 업데이트 */
  async updateItemMemo(itemId: string, memo: string | null) {
    await this.db
      .update(radarItems)
      .set({ memo })
      .where(eq(radarItems.id, itemId));
  }

  /** 아이템 keyPoints 업데이트 */
  async updateItemKeyPoints(input: UpdateItemKeyPointsInput) {
    await this.db
      .update(radarItems)
      .set({ keyPoints: input.keyPoints })
      .where(eq(radarItems.id, input.itemId));
  }

  // ---------- Item User Status ----------

  /** 사용자별 아이템 상태 UPSERT */
  async upsertItemStatus(input: UpsertItemStatusInput) {
    const existing = await this.db
      .select()
      .from(radarItemUserStatus)
      .where(
        and(
          eq(radarItemUserStatus.userId, input.userId),
          eq(radarItemUserStatus.itemId, input.itemId),
        ),
      )
      .limit(1);

    const now = new Date();

    if (existing[0]) {
      const updates: Record<string, unknown> = { status: input.status };
      if (input.status === "viewed") updates.viewedAt = now;
      if (input.status === "archived") updates.archivedAt = now;

      await this.db
        .update(radarItemUserStatus)
        .set(updates)
        .where(eq(radarItemUserStatus.id, existing[0].id));
    } else {
      await this.db.insert(radarItemUserStatus).values({
        id: crypto.randomUUID(),
        userId: input.userId,
        itemId: input.itemId,
        status: input.status,
        viewedAt: input.status === "viewed" ? now : null,
        archivedAt: input.status === "archived" ? now : null,
      });
    }

    return {
      itemId: input.itemId,
      status: input.status,
      viewedAt: input.status === "viewed" ? now.toISOString() : null,
    };
  }

  /** 사용자별 아이템 반응 UPSERT */
  async upsertItemReaction(input: UpsertItemReactionInput) {
    const existing = await this.db
      .select()
      .from(radarItemUserStatus)
      .where(
        and(
          eq(radarItemUserStatus.userId, input.userId),
          eq(radarItemUserStatus.itemId, input.itemId),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await this.db
        .update(radarItemUserStatus)
        .set({ reaction: input.reaction })
        .where(eq(radarItemUserStatus.id, existing[0].id));
    } else {
      await this.db.insert(radarItemUserStatus).values({
        id: crypto.randomUUID(),
        userId: input.userId,
        itemId: input.itemId,
        status: "new",
        reaction: input.reaction,
      });
    }

    return { itemId: input.itemId, reaction: input.reaction };
  }

  // ---------- Radar 페이지 통합 데이터 ----------

  /** radar.tsx loader용 통합 데이터 */
  async getRadarData(params: RadarDataParams) {
    const [sources, runs, recentItems] = await Promise.all([
      this.listSourcesByTenant(params.tenantId),
      this.listRunsByTenant(params.tenantId),
      this.listRecentItemsByTenant(params.tenantId),
    ]);
    return { sources, runs, recentItems };
  }
}
