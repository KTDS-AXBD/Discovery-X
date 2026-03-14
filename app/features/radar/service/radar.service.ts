import { eq, desc, and, or, isNull, sql, gte, lt, lte, inArray } from "drizzle-orm";
import type { DB } from "~/db";
import {
  radarSources,
  radarRuns,
  radarItems,
  radarItemUserStatus,
  ideas,
  ideaSources,
} from "~/db";
import {
  radarDomains,
  radarSourceDomains,
  radarFolders,
  radarSourceFolders,
  radarCrawlQueue,
  CrawlQueueStatus,
  ParserType,
  RadarSourceType,
  SourceStatus,
} from "~/features/radar/db/schema";
import {
  validateSourceTransition,
  REVIEW_THRESHOLDS,
} from "~/features/radar/constants/source-lifecycle";
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

interface UpdateSourceFullInput {
  id: string;
  name?: string;
  url?: string;
  sourceType?: string;
  keywords?: string[];
  radarTags?: string[];
  crawlInterval?: number;
  domainIds?: string[];
  folderIds?: string[];
}

interface CreateDomainInput {
  name: string;
  description?: string;
  color?: string;
  tenantId: string;
}

interface SourceWithDomains {
  source: typeof radarSources.$inferSelect;
  domains: (typeof radarDomains.$inferSelect)[];
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

interface CollectFromFileInput {
  title: string;
  content: string;
  fileName: string;
  fileType: string;
  fileSize: number;
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

  /** 소스 토글 (활성/비활성) — deprecated: updateSourceStatus(id, 'PAUSED'|'ACTIVE') 사용 권장 */
  async toggleSource(id: string, currentEnabled: boolean) {
    await this.db
      .update(radarSources)
      .set({ enabled: currentEnabled ? 0 : 1, updatedAt: new Date() })
      .where(eq(radarSources.id, id));
  }

  /**
   * 소스 상태 변경 (lifecycle 전환) [R2]
   * FAILED→ACTIVE 시 consecutiveFailures 리셋
   */
  async updateSourceStatus(id: string, newStatus: string): Promise<void> {
    const rows = await this.db
      .select({ status: radarSources.status })
      .from(radarSources)
      .where(eq(radarSources.id, id))
      .limit(1);

    if (rows.length === 0) {
      throw new Error(`소스를 찾을 수 없어요: ${id}`);
    }

    const currentStatus = rows[0].status ?? "ACTIVE";
    const error = validateSourceTransition(currentStatus, newStatus);
    if (error) {
      throw new Error(error);
    }

    // enabled 파생: ACTIVE만 1, 나머지 0
    const enabled = newStatus === "ACTIVE" ? 1 : 0;

    const updates: Record<string, unknown> = {
      status: newStatus,
      enabled,
      updatedAt: new Date(),
    };

    // [R2] FAILED→ACTIVE 시 consecutiveFailures 리셋
    if (currentStatus === "FAILED" && newStatus === "ACTIVE") {
      updates.consecutiveFailures = 0;
    }

    await this.db
      .update(radarSources)
      .set(updates)
      .where(eq(radarSources.id, id));
  }

  /** 소스 상세 조회 (도메인 포함) */
  async getSourceWithDomains(id: string): Promise<SourceWithDomains | null> {
    const sourceRows = await this.db
      .select()
      .from(radarSources)
      .where(eq(radarSources.id, id))
      .limit(1);

    if (sourceRows.length === 0) return null;

    const domainRows = await this.db
      .select({ domain: radarDomains })
      .from(radarSourceDomains)
      .innerJoin(radarDomains, eq(radarSourceDomains.domainId, radarDomains.id))
      .where(eq(radarSourceDomains.sourceId, id));

    return {
      source: sourceRows[0],
      domains: domainRows.map((r) => r.domain),
    };
  }

  /** 테넌트별 소스 목록 + 도메인 조회 */
  async listSourcesWithDomains(tenantId: string): Promise<SourceWithDomains[]> {
    const sources = await this.listSourcesByTenant(tenantId);
    if (sources.length === 0) return [];

    const sourceIds = sources.map((s) => s.id);

    // 소스-도메인 조인
    const allDomainRows = await this.db
      .select({ sourceId: radarSourceDomains.sourceId, domain: radarDomains })
      .from(radarSourceDomains)
      .innerJoin(radarDomains, eq(radarSourceDomains.domainId, radarDomains.id))
      .where(
        sql`${radarSourceDomains.sourceId} IN ${sourceIds.length > 0 ? sql`(${sql.join(sourceIds.map((id) => sql`${id}`), sql`, `)})` : sql`('')`}`,
      );

    // sourceId → domains 매핑
    const domainMap = new Map<string, (typeof radarDomains.$inferSelect)[]>();
    for (const row of allDomainRows) {
      const existing = domainMap.get(row.sourceId) ?? [];
      existing.push(row.domain);
      domainMap.set(row.sourceId, existing);
    }

    return sources.map((source) => ({
      source,
      domains: domainMap.get(source.id) ?? [],
    }));
  }

  /** 소스 수정 (확장: keywords, radarTags, crawlInterval, 도메인) */
  async updateSourceFull(input: UpdateSourceFullInput): Promise<void> {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.url !== undefined) updates.url = input.url;
    if (input.sourceType !== undefined) updates.sourceType = input.sourceType;
    if (input.keywords !== undefined) updates.keywords = input.keywords;
    if (input.radarTags !== undefined) updates.radarTags = input.radarTags;
    if (input.crawlInterval !== undefined) updates.crawlInterval = input.crawlInterval;

    await this.db
      .update(radarSources)
      .set(updates)
      .where(eq(radarSources.id, input.id));

    // 도메인 동기화: 기존 삭제 + 새로 INSERT
    if (input.domainIds !== undefined) {
      await this.setSourceDomains(input.id, input.domainIds);
    }

    // 폴더 동기화
    if (input.folderIds !== undefined) {
      await this.setSourceFolders(input.id, input.folderIds);
    }
  }

  /**
   * 소스 삭제 [F1] — 앱 레벨 cascade
   * D1은 FK CASCADE 미지원 → 관련 레코드 직접 삭제
   */
  async deleteSource(id: string) {
    // 1. radar_source_domains 삭제
    await this.db
      .delete(radarSourceDomains)
      .where(eq(radarSourceDomains.sourceId, id));
    // 2. radar_crawl_queue 삭제 [F1]
    await this.db
      .delete(radarCrawlQueue)
      .where(eq(radarCrawlQueue.sourceId, id));
    // 3. radar_sources 삭제
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

  /**
   * 오늘의 radar_run 카운트 갱신 (cron 완료 후 호출)
   * sourcesChecked, itemsCollected를 누적 합산한다.
   */
  async updateDailyRunCounts(
    tenantId: string,
    counts: { sourcesChecked: number; itemsCollected: number },
  ): Promise<void> {
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

    if (existing.length === 0) return;

    await this.db
      .update(radarRuns)
      .set({
        sourcesChecked: sql`${radarRuns.sourcesChecked} + ${counts.sourcesChecked}`,
        itemsCollected: sql`${radarRuns.itemsCollected} + ${counts.itemsCollected}`,
      })
      .where(eq(radarRuns.id, existing[0].id));
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

  /** 테넌트별 최근 아이템 조회 (소스 이름 포함) */
  async listRecentItemsByTenant(tenantId: string, limit = 50) {
    return this.db
      .select({
        id: radarItems.id,
        title: radarItems.title,
        titleKo: radarItems.titleKo,
        summary: radarItems.summary,
        summaryKo: radarItems.summaryKo,
        url: radarItems.url,
        status: radarItems.status,
        collectedAt: radarItems.collectedAt,
        relevanceScore: radarItems.relevanceScore,
        keyPoints: radarItems.keyPoints,
        sourceId: radarItems.sourceId,
        memo: radarItems.memo,
        sourceName: radarSources.name,
      })
      .from(radarItems)
      .innerJoin(radarSources, eq(radarItems.sourceId, radarSources.id))
      .where(eq(radarSources.tenantId, tenantId))
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
    const [sourcesWithDomains, domains, folders, runs, recentItems] = await Promise.all([
      this.listSourcesWithDomains(params.tenantId),
      this.listDomains(params.tenantId),
      this.listFolders(params.tenantId),
      this.listRunsByTenant(params.tenantId),
      this.listRecentItemsByTenant(params.tenantId),
    ]);

    // 폴더-소스 매핑 조회
    const allSourceIds = sourcesWithDomains.map((s) => s.source.id);
    const folderLinks = allSourceIds.length > 0
      ? await this.db.select().from(radarSourceFolders).where(inArray(radarSourceFolders.sourceId, allSourceIds))
      : [];
    const folderMap = new Map(folders.map((f) => [f.id, f]));
    const sourceFoldersMap = new Map<string, (typeof radarFolders.$inferSelect)[]>();
    for (const link of folderLinks) {
      const f = folderMap.get(link.folderId);
      if (!f) continue;
      const arr = sourceFoldersMap.get(link.sourceId) ?? [];
      arr.push(f);
      sourceFoldersMap.set(link.sourceId, arr);
    }

    const sourcesWithAll = sourcesWithDomains.map((s) => ({
      ...s,
      folders: sourceFoldersMap.get(s.source.id) ?? [],
    }));

    // 하위 호환: sources 필드 유지
    const sources = sourcesWithDomains.map((s) => s.source);
    return { sources, sourcesWithDomains: sourcesWithAll, domains, folders, runs, recentItems };
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

  /** 파일 수동 수집 (클라이언트에서 추출된 텍스트 수신) */
  async collectFromFile(input: CollectFromFileInput) {
    const dedupeKey = await generateDedupeKey(input.title);

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
    const manualUrl = `file://${itemId}/${input.fileName}`;

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
      contentType: "document",
      rawContent: input.content,
      parsedContent: input.content,
      excerpt: input.content.slice(0, 200),
      itemMetadata: {
        fileName: input.fileName,
        fileType: input.fileType,
        fileSize: input.fileSize,
      },
      dedupeKey,
    });

    const item = await this.getItem(itemId);
    return { item, isDuplicate: false };
  }

  // ---------- Domain CRUD ----------

  /** 도메인 목록 조회 */
  async listDomains(tenantId: string): Promise<(typeof radarDomains.$inferSelect)[]> {
    return this.db
      .select()
      .from(radarDomains)
      .where(eq(radarDomains.tenantId, tenantId));
  }

  /** 도메인 생성 */
  async createDomain(input: CreateDomainInput): Promise<string> {
    const id = crypto.randomUUID();
    await this.db.insert(radarDomains).values({
      id,
      name: input.name,
      description: input.description ?? null,
      color: input.color ?? null,
      tenantId: input.tenantId,
    });
    return id;
  }

  /**
   * 도메인 삭제 [F1] — 앱 레벨 cascade
   * D1은 FK CASCADE 미지원 → radar_source_domains 먼저 삭제
   */
  async deleteDomain(id: string): Promise<void> {
    // 1. radar_source_domains에서 관련 레코드 삭제
    await this.db
      .delete(radarSourceDomains)
      .where(eq(radarSourceDomains.domainId, id));
    // 2. 도메인 삭제
    await this.db.delete(radarDomains).where(eq(radarDomains.id, id));
  }

  /** 소스-도메인 연결 동기화 (기존 삭제 + 새로 INSERT) */
  async setSourceDomains(sourceId: string, domainIds: string[]): Promise<void> {
    // 기존 연결 삭제
    await this.db
      .delete(radarSourceDomains)
      .where(eq(radarSourceDomains.sourceId, sourceId));

    // 새 연결 INSERT
    if (domainIds.length > 0) {
      await this.db.insert(radarSourceDomains).values(
        domainIds.map((domainId) => ({
          id: crypto.randomUUID(),
          sourceId,
          domainId,
        })),
      );
    }
  }

  // ---------- 폴더 CRUD (F41 Phase 2) ----------

  async listFolders(tenantId: string) {
    return this.db
      .select()
      .from(radarFolders)
      .where(eq(radarFolders.tenantId, tenantId))
      .orderBy(radarFolders.sortOrder, radarFolders.name);
  }

  async createFolder(input: { name: string; description?: string; color?: string; tenantId: string }) {
    const id = crypto.randomUUID();
    await this.db.insert(radarFolders).values({
      id,
      name: input.name,
      description: input.description ?? null,
      color: input.color ?? null,
      tenantId: input.tenantId,
    });
    return id;
  }

  async updateFolder(id: string, input: { name?: string; description?: string; color?: string; sortOrder?: number }) {
    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.color !== undefined) updates.color = input.color;
    if (input.sortOrder !== undefined) updates.sort_order = input.sortOrder;

    if (Object.keys(updates).length > 0) {
      await this.db.update(radarFolders).set(updates).where(eq(radarFolders.id, id));
    }
  }

  async deleteFolder(id: string) {
    await this.db.delete(radarSourceFolders).where(eq(radarSourceFolders.folderId, id));
    await this.db.delete(radarFolders).where(eq(radarFolders.id, id));
  }

  async reorderFolders(orderedIds: string[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await this.db
        .update(radarFolders)
        .set({ sortOrder: i })
        .where(eq(radarFolders.id, orderedIds[i]));
    }
  }

  async setSourceFolders(sourceId: string, folderIds: string[]) {
    await this.db.delete(radarSourceFolders).where(eq(radarSourceFolders.sourceId, sourceId));
    if (folderIds.length > 0) {
      await this.db.insert(radarSourceFolders).values(
        folderIds.map((folderId) => ({ id: crypto.randomUUID(), sourceId, folderId })),
      );
    }
  }

  async listSourcesWithFolders(tenantId: string) {
    const sources = await this.listSourcesByTenant(tenantId);
    if (sources.length === 0) return [];

    const sourceIds = sources.map((s) => s.id);
    const links = await this.db
      .select()
      .from(radarSourceFolders)
      .where(inArray(radarSourceFolders.sourceId, sourceIds));

    const folderIds = [...new Set(links.map((l) => l.folderId))];
    const folders = folderIds.length > 0
      ? await this.db.select().from(radarFolders).where(inArray(radarFolders.id, folderIds))
      : [];

    const folderMap = new Map(folders.map((f) => [f.id, f]));

    return sources.map((source) => ({
      source,
      folders: links
        .filter((l) => l.sourceId === source.id)
        .map((l) => folderMap.get(l.folderId))
        .filter(Boolean) as (typeof radarFolders.$inferSelect)[],
    }));
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

  // ---------- Crawl Queue (F41 Phase 2B) ----------

  /**
   * 소스를 큐에 등록 [F2]
   * 1소스 = 1큐 아이템. crawlInterval 미경과 시 스킵.
   * @returns 생성된 큐 아이템 수 (0 또는 1)
   */
  async enqueueSource(sourceId: string, tenantId: string): Promise<number> {
    const rows = await this.db
      .select({
        url: radarSources.url,
        sourceType: radarSources.sourceType,
        crawlInterval: radarSources.crawlInterval,
        lastCollectedAt: radarSources.lastCollectedAt,
        status: radarSources.status,
      })
      .from(radarSources)
      .where(eq(radarSources.id, sourceId))
      .limit(1);

    if (rows.length === 0) return 0;

    const source = rows[0];

    // ACTIVE 상태만 큐에 등록
    if (source.status !== SourceStatus.ACTIVE) return 0;

    // crawlInterval 경과 체크
    if (source.lastCollectedAt) {
      const interval = source.crawlInterval ?? 86400;
      const elapsed = Math.floor(
        (Date.now() - source.lastCollectedAt.getTime()) / 1000,
      );
      if (elapsed < interval) return 0;
    }

    // 이미 PENDING/PROCESSING 상태인 큐 아이템이 있으면 스킵
    const pendingRows = await this.db
      .select({ id: radarCrawlQueue.id })
      .from(radarCrawlQueue)
      .where(
        and(
          eq(radarCrawlQueue.sourceId, sourceId),
          inArray(radarCrawlQueue.status, [
            CrawlQueueStatus.PENDING,
            CrawlQueueStatus.PROCESSING,
          ]),
        ),
      )
      .limit(1);

    if (pendingRows.length > 0) return 0;

    // sourceType → parserType 매핑
    const parserMap: Record<string, string> = {
      [RadarSourceType.RSS]: ParserType.RSS,
      [RadarSourceType.SITE]: ParserType.HTML,
      [RadarSourceType.WEB]: ParserType.HTML,
      [RadarSourceType.YOUTUBE]: ParserType.YOUTUBE,
      [RadarSourceType.SNS]: ParserType.HTML,
    };
    const parserType = parserMap[source.sourceType] ?? ParserType.HTML;

    await this.db.insert(radarCrawlQueue).values({
      id: crypto.randomUUID(),
      sourceId,
      url: source.url,
      parserType,
      tenantId,
    });

    return 1;
  }

  /**
   * PENDING 큐 아이템 배치 가져오기 [F3]
   * stale PROCESSING 아이템 자동 복구 (10분 초과)
   */
  async dequeueBatch(
    tenantId: string,
    limit: number,
  ): Promise<(typeof radarCrawlQueue.$inferSelect)[]> {
    const now = new Date();
    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000); // 10분 전

    // stale PROCESSING 아이템 → PENDING 리셋
    await this.db
      .update(radarCrawlQueue)
      .set({
        status: CrawlQueueStatus.PENDING,
        startedAt: null,
      })
      .where(
        and(
          eq(radarCrawlQueue.tenantId, tenantId),
          eq(radarCrawlQueue.status, CrawlQueueStatus.PROCESSING),
          lt(radarCrawlQueue.startedAt, staleThreshold),
        ),
      );

    // PENDING + scheduled_at <= now + (next_retry_at IS NULL or <= now)
    const candidates = await this.db
      .select()
      .from(radarCrawlQueue)
      .where(
        and(
          eq(radarCrawlQueue.tenantId, tenantId),
          eq(radarCrawlQueue.status, CrawlQueueStatus.PENDING),
          lte(radarCrawlQueue.scheduledAt, now),
          or(
            isNull(radarCrawlQueue.nextRetryAt),
            lte(radarCrawlQueue.nextRetryAt, now),
          ),
        ),
      )
      .orderBy(desc(radarCrawlQueue.priority), radarCrawlQueue.scheduledAt)
      .limit(limit);

    if (candidates.length === 0) return [];

    // PROCESSING 으로 일괄 변경
    const ids = candidates.map((c) => c.id);
    await this.db
      .update(radarCrawlQueue)
      .set({
        status: CrawlQueueStatus.PROCESSING,
        startedAt: now,
      })
      .where(inArray(radarCrawlQueue.id, ids));

    // 변경된 상태로 반환
    return candidates.map((c) => ({
      ...c,
      status: CrawlQueueStatus.PROCESSING,
      startedAt: now,
    }));
  }

  /** 큐 아이템 완료 처리 */
  async completeQueueItem(id: string, itemsCreated: number): Promise<void> {
    const now = new Date();

    // 큐 아이템 완료
    await this.db
      .update(radarCrawlQueue)
      .set({
        status: CrawlQueueStatus.COMPLETED,
        completedAt: now,
        itemsCreated,
      })
      .where(eq(radarCrawlQueue.id, id));

    // 소스 성공 상태 갱신: consecutiveFailures 리셋 + lastCollectedAt
    const queueItem = await this.db
      .select({ sourceId: radarCrawlQueue.sourceId })
      .from(radarCrawlQueue)
      .where(eq(radarCrawlQueue.id, id))
      .limit(1);

    if (queueItem.length > 0) {
      await this.db
        .update(radarSources)
        .set({
          consecutiveFailures: 0,
          lastCollectedAt: now,
          updatedAt: now,
        })
        .where(eq(radarSources.id, queueItem[0].sourceId));
    }
  }

  /** 큐 아이템 실패 처리 — 재시도 또는 DEAD 전환 */
  async failQueueItem(
    id: string,
    failureCode: string,
    error: string,
  ): Promise<void> {
    const rows = await this.db
      .select()
      .from(radarCrawlQueue)
      .where(eq(radarCrawlQueue.id, id))
      .limit(1);

    if (rows.length === 0) return;

    const item = rows[0];
    const retryCount = (item.retryCount ?? 0) + 1;
    const maxRetries = item.maxRetries ?? 3;

    if (retryCount >= maxRetries) {
      // 최대 재시도 도달 → DEAD
      await this.db
        .update(radarCrawlQueue)
        .set({
          status: CrawlQueueStatus.DEAD,
          retryCount,
          failureCode,
          error,
          completedAt: new Date(),
        })
        .where(eq(radarCrawlQueue.id, id));

      // Source consecutiveFailures 증가 + 상태 전환
      await this.incrementSourceFailures(item.sourceId);
    } else {
      // 재시도 스케줄링 (지수 백오프)
      const nextRetryAt = calculateNextRetry(retryCount);
      await this.db
        .update(radarCrawlQueue)
        .set({
          status: CrawlQueueStatus.FAILED,
          retryCount,
          failureCode,
          error,
          nextRetryAt,
        })
        .where(eq(radarCrawlQueue.id, id));
    }
  }

  /** Source 연속 실패 횟수 증가 + 자동 상태 전환 */
  private async incrementSourceFailures(sourceId: string): Promise<void> {
    const sourceRows = await this.db
      .select({
        consecutiveFailures: radarSources.consecutiveFailures,
        status: radarSources.status,
      })
      .from(radarSources)
      .where(eq(radarSources.id, sourceId))
      .limit(1);

    if (sourceRows.length === 0) return;

    const current = sourceRows[0];
    const newFailures = (current.consecutiveFailures ?? 0) + 1;

    const updates: Record<string, unknown> = {
      consecutiveFailures: newFailures,
      updatedAt: new Date(),
    };

    // 자동 상태 전환 (ACTIVE 상태에서만)
    if (current.status === SourceStatus.ACTIVE) {
      if (newFailures >= REVIEW_THRESHOLDS.failedThreshold) {
        updates.status = SourceStatus.FAILED;
        updates.enabled = 0;
      } else if (newFailures >= REVIEW_THRESHOLDS.consecutiveFailures) {
        updates.status = SourceStatus.REVIEW;
        updates.enabled = 0;
      }
    }

    await this.db
      .update(radarSources)
      .set(updates)
      .where(eq(radarSources.id, sourceId));
  }

  /** 큐 상태 요약 */
  async getQueueStatus(
    tenantId: string,
  ): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    dead: number;
  }> {
    const rows = await this.db
      .select({
        status: radarCrawlQueue.status,
        count: sql<number>`COUNT(*)`,
      })
      .from(radarCrawlQueue)
      .where(eq(radarCrawlQueue.tenantId, tenantId))
      .groupBy(radarCrawlQueue.status);

    const result = { pending: 0, processing: 0, completed: 0, failed: 0, dead: 0 };
    for (const row of rows) {
      const key = row.status.toLowerCase() as keyof typeof result;
      if (key in result) result[key] = Number(row.count);
    }
    return result;
  }

  /**
   * 큐 정리 [R5]
   * COMPLETED 7일 이상, DEAD 30일 이상 된 아이템 삭제.
   * @returns 삭제된 행 수
   */
  async cleanupQueue(tenantId: string): Promise<number> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // 삭제 대상 수 먼저 카운트
    const countRows = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(radarCrawlQueue)
      .where(
        and(
          eq(radarCrawlQueue.tenantId, tenantId),
          or(
            and(
              eq(radarCrawlQueue.status, CrawlQueueStatus.COMPLETED),
              lt(radarCrawlQueue.completedAt, sevenDaysAgo),
            ),
            and(
              eq(radarCrawlQueue.status, CrawlQueueStatus.DEAD),
              lt(radarCrawlQueue.completedAt, thirtyDaysAgo),
            ),
          ),
        ),
      );

    const total = Number(countRows[0]?.count ?? 0);

    if (total > 0) {
      await this.db
        .delete(radarCrawlQueue)
        .where(
          and(
            eq(radarCrawlQueue.tenantId, tenantId),
            eq(radarCrawlQueue.status, CrawlQueueStatus.COMPLETED),
            lt(radarCrawlQueue.completedAt, sevenDaysAgo),
          ),
        );

      await this.db
        .delete(radarCrawlQueue)
        .where(
          and(
            eq(radarCrawlQueue.tenantId, tenantId),
            eq(radarCrawlQueue.status, CrawlQueueStatus.DEAD),
            lt(radarCrawlQueue.completedAt, thirtyDaysAgo),
          ),
        );
    }

    return total;
  }

  /** 최근 실패 큐 아이템 조회 (QueueStatusPanel용) */
  async getRecentFailedQueue(
    tenantId: string,
    limit = 5,
  ): Promise<
    {
      id: string;
      sourceId: string;
      sourceName: string;
      failureCode: string | null;
      retryCount: number | null;
      maxRetries: number | null;
      status: string;
      nextRetryAt: Date | null;
    }[]
  > {
    const rows = await this.db
      .select({
        id: radarCrawlQueue.id,
        sourceId: radarCrawlQueue.sourceId,
        sourceName: radarSources.name,
        failureCode: radarCrawlQueue.failureCode,
        retryCount: radarCrawlQueue.retryCount,
        maxRetries: radarCrawlQueue.maxRetries,
        status: radarCrawlQueue.status,
        nextRetryAt: radarCrawlQueue.nextRetryAt,
      })
      .from(radarCrawlQueue)
      .innerJoin(radarSources, eq(radarCrawlQueue.sourceId, radarSources.id))
      .where(
        and(
          eq(radarCrawlQueue.tenantId, tenantId),
          inArray(radarCrawlQueue.status, [
            CrawlQueueStatus.FAILED,
            CrawlQueueStatus.DEAD,
          ]),
        ),
      )
      .orderBy(desc(radarCrawlQueue.scheduledAt))
      .limit(limit);

    return rows;
  }
}

// ============================================================================
// Queue Helpers
// ============================================================================

/** 재시도 지연 계산 (지수 백오프) — 1시간, 6시간, 24시간 */
function calculateNextRetry(retryCount: number): Date {
  const delays = [3600, 21600, 86400]; // 초
  const delaySec = delays[Math.min(retryCount - 1, delays.length - 1)];
  return new Date(Date.now() + delaySec * 1000);
}
