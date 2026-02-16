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
  AuditContext,
  EnrichmentSuggestion,
  PendingSuggestion,
} from "./types";
import { GraphAction, ActorType } from "~/lib/types/enums";
import { DX_CONTEXT } from "./dx-context";

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
    audit?: AuditContext,
  ): Promise<GraphRecord> {
    const id = crypto.randomUUID();
    const now = new Date();

    // @context가 비어있으면 기본 DX_CONTEXT로 채움
    const jsonld: JsonLdGraph =
      Object.keys(record.jsonld["@context"]).length === 0
        ? { ...record.jsonld, "@context": { ...DX_CONTEXT } }
        : record.jsonld;

    const contentHash = await computeContentHash(jsonld);

    await this.db.insert(graphs).values({
      id,
      scopeType: record.scopeType,
      scopeId: record.scopeId,
      jsonld: JSON.stringify(jsonld),
      version: 1,
      contentHash,
      createdAt: now,
      updatedAt: now,
    });

    // 감사 이벤트 기록
    await this.db.insert(graphEvents).values({
      graphId: id,
      actorId: audit?.actorId ?? "system",
      actorType: audit?.actorType ?? ActorType.SYSTEM,
      action: GraphAction.CREATE,
      newVersion: 1,
      createdAt: now,
    });

    return {
      id,
      scopeType: record.scopeType,
      scopeId: record.scopeId,
      jsonld,
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
    audit?: AuditContext,
  ): Promise<GraphRecord> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Graph not found: ${id}`);
    }

    // Agent는 learned_pref (dx:Preference) 노드만 수정 가능
    if (audit?.actorType === ActorType.AGENT) {
      const changedNodes = jsonld["@graph"].filter((node) => {
        const prev = existing.jsonld["@graph"].find(
          (n) => n["@id"] === node["@id"],
        );
        return !prev || JSON.stringify(prev) !== JSON.stringify(node);
      });
      const nonPrefNodes = changedNodes.filter(
        (n) => n["@type"] !== "dx:Preference",
      );
      if (nonPrefNodes.length > 0) {
        throw new Error(
          "Agent는 dx:Preference 노드만 수정할 수 있습니다. 다른 노드 변경은 suggest()를 사용하세요.",
        );
      }
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
      actorId: audit?.actorId ?? "system",
      actorType: audit?.actorType ?? ActorType.SYSTEM,
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
   * Agent는 삭제 불가 — suggest()로 삭제 제안만 가능.
   */
  async delete(id: string, audit?: AuditContext): Promise<void> {
    if (audit?.actorType === ActorType.AGENT) {
      throw new Error(
        "Agent는 Graph를 삭제할 수 없습니다. suggest()로 삭제 제안을 남겨주세요.",
      );
    }

    const existing = await this.get(id);
    if (!existing) {
      throw new Error(`Graph not found: ${id}`);
    }

    const now = new Date();

    // 감사 이벤트 기록 (삭제 이력 보존)
    await this.db.insert(graphEvents).values({
      graphId: id,
      actorId: audit?.actorId ?? "system",
      actorType: audit?.actorType ?? ActorType.SYSTEM,
      action: GraphAction.DELETE,
      prevVersion: existing.version,
      createdAt: now,
    });

    // Graph만 삭제 — 감사 이벤트는 의도적으로 보존 (고아 레코드 허용)
    await this.db.delete(graphs).where(eq(graphs.id, id));
  }

  /** Graph를 특정 버전의 상태로 롤백 */
  async rollback(
    graphId: string,
    targetVersion: number,
    audit?: AuditContext,
  ): Promise<GraphRecord> {
    const existing = await this.get(graphId);
    if (!existing) {
      throw new Error(`Graph not found: ${graphId}`);
    }

    if (targetVersion < 1 || targetVersion >= existing.version) {
      throw new Error(
        `Invalid target version: ${targetVersion} (current: ${existing.version})`,
      );
    }

    // targetVersion 시점의 jsonld를 복원
    // newVersion === targetVersion 인 이벤트의 diff_json.next 가 해당 시점 상태
    const events = await this.db
      .select()
      .from(graphEvents)
      .where(
        and(
          eq(graphEvents.graphId, graphId),
          eq(graphEvents.newVersion, targetVersion),
        ),
      )
      .limit(1);

    if (events.length === 0) {
      throw new Error(`Event for version ${targetVersion} not found`);
    }

    const event = events[0];
    let targetJsonld: JsonLdGraph;

    if (event.action === "create") {
      // create 이벤트에는 diffJson이 없으므로, 현재 version=1 시점의 상태를
      // events chain에서 복원해야 하는데, create 이벤트 다음 update의 diff.prev가 v1 상태
      // 가장 안전한 방법: newVersion=2 이벤트의 diffJson.prev 사용
      const nextEvents = await this.db
        .select()
        .from(graphEvents)
        .where(
          and(
            eq(graphEvents.graphId, graphId),
            eq(graphEvents.prevVersion, 1),
          ),
        )
        .limit(1);

      if (nextEvents.length === 0 || !nextEvents[0].diffJson) {
        throw new Error("Cannot restore version 1: no diff data available");
      }

      const diff = JSON.parse(nextEvents[0].diffJson) as {
        prev: JsonLdGraph;
        next: JsonLdGraph;
      };
      targetJsonld = diff.prev;
    } else {
      if (!event.diffJson) {
        throw new Error(`No diff data for version ${targetVersion}`);
      }
      const diff = JSON.parse(event.diffJson) as {
        prev: JsonLdGraph;
        next: JsonLdGraph;
      };
      targetJsonld = diff.next;
    }

    // 새 버전으로 업데이트 + rollback 이벤트 기록
    const contentHash = await computeContentHash(targetJsonld);
    const newVersion = existing.version + 1;
    const now = new Date();

    await this.db
      .update(graphs)
      .set({
        jsonld: JSON.stringify(targetJsonld),
        version: newVersion,
        contentHash,
        updatedAt: now,
      })
      .where(eq(graphs.id, graphId));

    const diffJson = JSON.stringify({
      prev: existing.jsonld,
      next: targetJsonld,
    });

    await this.db.insert(graphEvents).values({
      graphId,
      actorId: audit?.actorId ?? "system",
      actorType: audit?.actorType ?? ActorType.SYSTEM,
      action: GraphAction.ROLLBACK,
      diffJson,
      reason: `v${targetVersion} 상태로 롤백`,
      prevVersion: existing.version,
      newVersion,
      createdAt: now,
    });

    return {
      ...existing,
      jsonld: targetJsonld,
      version: newVersion,
      contentHash,
      updatedAt: now,
    };
  }

  /**
   * Graph enrichment 제안 — 실제 Graph를 수정하지 않고 suggest 이벤트만 기록.
   * Agent가 중요 노드 발견 시 사용자에게 enrichment를 제안하는 데 사용.
   */
  async suggest(
    graphId: string,
    enrichment: EnrichmentSuggestion,
    audit?: AuditContext,
  ): Promise<void> {
    const existing = await this.get(graphId);
    if (!existing) {
      throw new Error(`Graph not found: ${graphId}`);
    }

    await this.db.insert(graphEvents).values({
      graphId,
      actorId: audit?.actorId ?? "system",
      actorType: audit?.actorType ?? ActorType.AGENT,
      action: GraphAction.SUGGEST,
      diffJson: JSON.stringify(enrichment),
      reason: enrichment.reason,
      prevVersion: existing.version,
      createdAt: new Date(),
    });
  }

  /**
   * 특정 Graph의 미적용 suggest 이벤트 목록 조회 (최신 순, 최대 20건).
   */
  async getPendingSuggestions(
    graphId: string,
  ): Promise<PendingSuggestion[]> {
    const rows = await this.db
      .select()
      .from(graphEvents)
      .where(
        and(
          eq(graphEvents.graphId, graphId),
          eq(graphEvents.action, GraphAction.SUGGEST),
        ),
      )
      .orderBy(desc(graphEvents.createdAt))
      .limit(20);

    return rows.map((row) => ({
      id: row.id,
      enrichment: row.diffJson
        ? (JSON.parse(row.diffJson) as EnrichmentSuggestion)
        : { reason: "" },
      actorId: row.actorId,
      createdAt: row.createdAt,
    }));
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
