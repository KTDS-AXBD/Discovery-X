import { eq, desc, and, or, isNull, sql, gte } from "drizzle-orm";
import type { DB } from "~/db";
import {
  radarSources,
  radarRuns,
  radarItems,
  radarItemUserStatus,
  ideas,
  ideaSources,
} from "~/db";
import { canonicalizeUrl, generateDedupeKey, parseUrl } from "./url-parser";

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

interface CollectFromUrlInput {
  url: string;
  userId: string;
  tenantId: string;
}

interface CollectFromTextInput {
  title: string;
  content: string;
  userId: string;
  tenantId: string;
}

interface SendToIdeaInput {
  itemId: string;
  userId: string;
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

  /**
   * 오늘의 COMPLETED radar_run을 찾거나 새로 생성한다.
   * 아이디어 소스 추가 / 샘플 데이터 시드 등에서 공통 사용.
   */
  async findOrCreateDailyRun(tenantId: string): Promise<string> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const existing = await this.db
      .select({ id: radarRuns.id })
      .from(radarRuns)
      .where(
        and(
          eq(radarRuns.tenantId, tenantId),
          eq(radarRuns.status, "COMPLETED"),
          gte(radarRuns.startedAt, todayStart),
        ),
      )
      .limit(1);

    if (existing.length > 0) return existing[0].id;

    const runId = crypto.randomUUID();
    await this.db.insert(radarRuns).values({
      id: runId,
      tenantId,
      status: "COMPLETED",
      sourcesChecked: 0,
      itemsCollected: 0,
    });
    return runId;
  }

  /**
   * urlHash 기준으로 radarItem을 찾거나 radarSource+radarItem을 새로 생성한다.
   * 이미 존재하면 isNew=false로 기존 itemId를 반환한다.
   */
  async findOrCreateItemFromUrl(params: {
    urlHash: string;
    url: string;
    title: string;
    userId: string;
    tenantId: string;
    runId: string;
    type?: "web" | "site" | "youtube" | "text";
    titleKo?: string;
    summaryKo?: string;
    memo?: string | null;
  }): Promise<{ itemId: string; isNew: boolean }> {
    const existing = await this.db
      .select({ id: radarItems.id })
      .from(radarItems)
      .where(eq(radarItems.urlHash, params.urlHash))
      .limit(1);

    if (existing.length > 0) {
      return { itemId: existing[0].id, isNew: false };
    }

    const sourceId = crypto.randomUUID();
    const itemId = crypto.randomUUID();

    await this.db.insert(radarSources).values({
      id: sourceId,
      name: params.titleKo ?? params.title,
      sourceType: params.type === "web" ? "site" : (params.type ?? "site"),
      url: params.url,
      userId: params.userId,
      tenantId: params.tenantId,
    });

    await this.db.insert(radarItems).values({
      id: itemId,
      sourceId,
      runId: params.runId,
      urlHash: params.urlHash,
      url: params.url,
      title: params.title,
      titleKo: params.titleKo,
      summaryKo: params.summaryKo,
      status: "COLLECTED",
      memo: params.memo ?? null,
    });

    return { itemId, isNew: true };
  }

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

  // ---------- 수동 수집 (F41 Phase 1A) ----------

  /** 시스템 소스 조회/생성 (__manual__ per tenant) */
  async getOrCreateManualSource(tenantId: string): Promise<string> {
    const existing = await this.db
      .select({ id: radarSources.id })
      .from(radarSources)
      .where(
        and(
          eq(radarSources.name, "__manual__"),
          eq(radarSources.tenantId, tenantId),
          eq(radarSources.collectionType, "manual"),
        ),
      )
      .limit(1);

    if (existing.length > 0) return existing[0].id;

    const id = crypto.randomUUID();
    await this.db.insert(radarSources).values({
      id,
      name: "__manual__",
      sourceType: "site",
      url: "manual://system",
      collectionType: "manual",
      tenantId,
      enabled: 1,
    });
    return id;
  }

  /** URL 수동 수집 */
  async collectFromUrl(input: CollectFromUrlInput) {
    const canonical = canonicalizeUrl(input.url);

    // urlHash 기반 중복 체크
    const urlHashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(canonical),
    );
    const urlHash = Array.from(new Uint8Array(urlHashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const duplicate = await this.db
      .select({ id: radarItems.id })
      .from(radarItems)
      .where(eq(radarItems.urlHash, urlHash))
      .limit(1);

    if (duplicate.length > 0) {
      return { item: duplicate[0], isDuplicate: true };
    }

    // URL fetch + 파싱
    const parsed = await parseUrl(canonical);
    const dedupeKey = await generateDedupeKey(
      parsed.title,
      parsed.metadata.publishedAt,
    );

    // dedupe_key 기반 2차 중복 체크
    const dedupeHit = await this.db
      .select({ id: radarItems.id })
      .from(radarItems)
      .where(eq(radarItems.dedupeKey, dedupeKey))
      .limit(1);

    if (dedupeHit.length > 0) {
      return { item: dedupeHit[0], isDuplicate: true };
    }

    const sourceId = await this.getOrCreateManualSource(input.tenantId);
    const runId = await this.findOrCreateDailyRun(input.tenantId);
    const itemId = crypto.randomUUID();

    await this.db.insert(radarItems).values({
      id: itemId,
      sourceId,
      runId,
      urlHash,
      url: canonical,
      title: parsed.title,
      summary: parsed.summary,
      status: "COLLECTED",
      contentType: "article",
      rawContent: parsed.rawContent,
      parsedContent: parsed.parsedContent,
      excerpt: parsed.excerpt,
      itemMetadata: parsed.metadata,
      dedupeKey,
    });

    const item = await this.getItem(itemId);
    return { item, isDuplicate: false };
  }

  /** 텍스트 수동 수집 */
  async collectFromText(input: CollectFromTextInput) {
    const dedupeKey = await generateDedupeKey(input.title);

    // dedupe_key 중복 체크
    const dedupeHit = await this.db
      .select({ id: radarItems.id })
      .from(radarItems)
      .where(eq(radarItems.dedupeKey, dedupeKey))
      .limit(1);

    if (dedupeHit.length > 0) {
      return { item: dedupeHit[0], isDuplicate: true };
    }

    const sourceId = await this.getOrCreateManualSource(input.tenantId);
    const runId = await this.findOrCreateDailyRun(input.tenantId);
    const itemId = crypto.randomUUID();
    const manualUrl = `manual://${itemId}`;

    const urlHashBuffer = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(manualUrl),
    );
    const urlHash = Array.from(new Uint8Array(urlHashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    await this.db.insert(radarItems).values({
      id: itemId,
      sourceId,
      runId,
      urlHash,
      url: manualUrl,
      title: input.title,
      summary: input.content.slice(0, 200),
      status: "COLLECTED",
      contentType: "memo",
      rawContent: input.content,
      parsedContent: input.content,
      excerpt: input.content.slice(0, 200),
      dedupeKey,
    });

    const item = await this.getItem(itemId);
    return { item, isDuplicate: false };
  }

  /** Signal → Idea 전환 */
  async sendToIdea(input: SendToIdeaInput): Promise<{ ideaId: string }> {
    const item = await this.getItem(input.itemId);
    if (!item) {
      throw new Error("아이템을 찾을 수 없습니다.");
    }

    const ideaId = crypto.randomUUID();
    await this.db.insert(ideas).values({
      id: ideaId,
      tenantId: input.tenantId,
      ownerId: input.userId,
      title: item.titleKo || item.title,
      status: "ACTIVE",
      createdByAgent: 0,
    });

    await this.db.insert(ideaSources).values({
      id: crypto.randomUUID(),
      ideaId,
      radarItemId: input.itemId,
      linkType: "primary",
      createdBy: "user",
    });

    return { ideaId };
  }
}
