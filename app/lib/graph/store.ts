import { eq, and, desc } from "drizzle-orm";
import { graphs, graphEvents } from "~/db/schema-v2";
import type { DB } from "~/db/index";
import type { Graph } from "~/db/schema-v2";
import type {
  GraphStoreInterface,
  GraphRecord,
  JsonLdGraph,
  GraphEvent as GraphEventType,
  ScopeType,
} from "./types";
import { GraphAction, ActorType } from "~/lib/types/enums";

// ─── 유틸리티 ────────────────────────────────────────────────────────

/**
 * JSON-LD 객체의 SHA-256 content hash 계산 (Web Crypto API, Cloudflare 호환)
 */
export async function computeContentHash(jsonld: JsonLdGraph): Promise<string> {
  const raw = JSON.stringify(jsonld);
  const encoded = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * DB row → GraphRecord 변환 (jsonld 파싱, Date 변환)
 */
export function toGraphRecord(row: Graph): GraphRecord {
  return {
    id: row.id,
    scopeType: row.scopeType as ScopeType,
    scopeId: row.scopeId,
    jsonld: JSON.parse(row.jsonld) as JsonLdGraph,
    version: row.version,
    contentHash: row.contentHash,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── GraphStore ──────────────────────────────────────────────────────

export class GraphStore implements GraphStoreInterface {
  constructor(private db: DB) {}

  /** ID로 Graph 조회 */
  async get(id: string): Promise<GraphRecord | null> {
    const rows = await this.db
      .select()
      .from(graphs)
      .where(eq(graphs.id, id))
      .limit(1);

    if (rows.length === 0) return null;
    return toGraphRecord(rows[0]);
  }

  /** scope_type + scope_id 유니크 조회 */
  async getByScopeId(
    scopeType: ScopeType,
    scopeId: string,
  ): Promise<GraphRecord | null> {
    const rows = await this.db
      .select()
      .from(graphs)
      .where(and(eq(graphs.scopeType, scopeType), eq(graphs.scopeId, scopeId)))
      .limit(1);

    if (rows.length === 0) return null;
    return toGraphRecord(rows[0]);
  }

  /** 새 Graph 생성 + create 이벤트 기록 */
  async create(
    record: Omit<GraphRecord, "id" | "version" | "createdAt" | "updatedAt">,
  ): Promise<GraphRecord> {
    const id = crypto.randomUUID();
    const contentHash = await computeContentHash(record.jsonld);
    const now = new Date();

    await this.db.insert(graphs).values({
      id,
      scopeType: record.scopeType,
      scopeId: record.scopeId,
      jsonld: JSON.stringify(record.jsonld),
      version: 1,
      contentHash,
      createdAt: now,
      updatedAt: now,
    });

    // 감사 이벤트 기록
    await this.db.insert(graphEvents).values({
      graphId: id,
      actorId: "system",
      actorType: ActorType.SYSTEM,
      action: GraphAction.CREATE,
      newVersion: 1,
      createdAt: now,
    });

    return {
      id,
      scopeType: record.scopeType,
      scopeId: record.scopeId,
      jsonld: record.jsonld,
      version: 1,
      contentHash,
      createdAt: now,
      updatedAt: now,
    };
  }

  /** Graph 업데이트 + update 이벤트 기록 (diff 포함) */
  async update(
    id: string,
    jsonld: JsonLdGraph,
    reason?: string,
  ): Promise<GraphRecord> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Graph not found: ${id}`);
    }

    const contentHash = await computeContentHash(jsonld);
    const newVersion = existing.version + 1;
    const now = new Date();

    await this.db
      .update(graphs)
      .set({
        jsonld: JSON.stringify(jsonld),
        version: newVersion,
        contentHash,
        updatedAt: now,
      })
      .where(eq(graphs.id, id));

    // diff: 이전 vs 새 jsonld
    const diffJson = JSON.stringify({
      prev: existing.jsonld,
      next: jsonld,
    });

    await this.db.insert(graphEvents).values({
      graphId: id,
      actorId: "system",
      actorType: ActorType.SYSTEM,
      action: GraphAction.UPDATE,
      diffJson,
      reason,
      prevVersion: existing.version,
      newVersion,
      createdAt: now,
    });

    return {
      ...existing,
      jsonld,
      version: newVersion,
      contentHash,
      updatedAt: now,
    };
  }

  /**
   * Graph 삭제 — 감사 이벤트 기록 후 Graph만 삭제.
   * D1 FK는 기본 PRAGMA foreign_keys=OFF이므로 이벤트 로그는 보존된다.
   */
  async delete(id: string): Promise<void> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Graph not found: ${id}`);
    }

    const now = new Date();

    // 감사 이벤트 기록 (삭제 이력 보존)
    await this.db.insert(graphEvents).values({
      graphId: id,
      actorId: "system",
      actorType: ActorType.SYSTEM,
      action: GraphAction.DELETE,
      prevVersion: existing.version,
      createdAt: now,
    });

    // Graph만 삭제 — 감사 이벤트는 의도적으로 보존 (고아 레코드 허용)
    await this.db.delete(graphs).where(eq(graphs.id, id));
  }

  /** 감사 로그 조회 (최신 순) */
  async getHistory(
    graphId: string,
    limit: number = 50,
  ): Promise<GraphEventType[]> {
    const rows = await this.db
      .select()
      .from(graphEvents)
      .where(eq(graphEvents.graphId, graphId))
      .orderBy(desc(graphEvents.createdAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      graphId: row.graphId,
      actorId: row.actorId,
      actorType: row.actorType as GraphEventType["actorType"],
      action: row.action as GraphEventType["action"],
      diffJson: row.diffJson ?? undefined,
      reason: row.reason ?? undefined,
      prevVersion: row.prevVersion ?? undefined,
      newVersion: row.newVersion ?? undefined,
      createdAt: row.createdAt,
    }));
  }
}
