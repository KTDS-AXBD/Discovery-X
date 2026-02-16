// Projection 자동 동기화 — Graph 변경 시 hash 비교로 stale Projection 갱신
import type { DB } from "~/db";
import { graphs } from "~/db/schema-v2";
import { ProjectionBuilder } from "./projection";
import type { ScopeType } from "./types";

// ============================================================================
// 단건 동기화
// ============================================================================

/**
 * 특정 scope의 Graph contentHash와 Projection sourceHash를 비교하여
 * 불일치(stale) 시 Projection을 재생성한다.
 *
 * @returns true면 갱신됨, false면 이미 최신 또는 Graph 없음
 */
export async function syncIfStale(
  db: DB,
  scopeType: string,
  scopeId: string,
): Promise<boolean> {
  const builder = new ProjectionBuilder(db);
  return builder.syncProjection(scopeType as ScopeType, scopeId);
}

// ============================================================================
// 전체 scope 순회 동기화 (Cron용)
// ============================================================================

/** 모든 Graph를 순회하며 stale Projection을 갱신한다 */
export async function syncAllStale(db: DB): Promise<SyncAllResult> {
  const allGraphs = await db
    .select({
      scopeType: graphs.scopeType,
      scopeId: graphs.scopeId,
      contentHash: graphs.contentHash,
    })
    .from(graphs);

  const builder = new ProjectionBuilder(db);
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const graph of allGraphs) {
    try {
      const didUpdate = await builder.syncProjection(
        graph.scopeType as ScopeType,
        graph.scopeId,
      );
      if (didUpdate) {
        updated++;
      } else {
        skipped++;
      }
    } catch {
      errors++;
    }
  }

  return { total: allGraphs.length, updated, skipped, errors };
}

// ============================================================================
// Types
// ============================================================================

export interface SyncAllResult {
  total: number;
  updated: number;
  skipped: number;
  errors: number;
}
