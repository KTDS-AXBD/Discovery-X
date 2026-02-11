/**
 * Global Entity Matcher — 교차 Discovery 엔티티 매칭
 *
 * Phase 1 MVP: 정규화 레이블 매칭 (외부 API 호출 없음)
 * Phase 2: Embedding 유사도 매칭 추가 예정
 */

import { eq, and, isNotNull } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { contextNodes } from "~/db/schema";

/** 레이블 정규화 — 대소문자, 공백, 특수문자 통일 */
export function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "") // 문자/숫자/공백만 유지
    .replace(/\s+/g, " ")
    .trim();
}

interface MatchCandidate {
  globalEntityId: string;
  label: string;
  discoveryId: string;
}

interface MatchResult {
  globalEntityId: string;
  isNew: boolean;
  matchedLabel?: string;
}

/**
 * 글로벌 엔티티 매칭
 *
 * 1단계: 정규화 레이블 + 같은 ontologyTypeId로 정확 매칭
 * 2단계: (Phase 2) Embedding 유사도 매칭
 * 3단계: 매칭 실패 시 새 globalEntityId 생성
 */
export async function matchGlobalEntity(
  db: DrizzleD1Database<Record<string, unknown>>,
  label: string,
  ontologyTypeId: string,
): Promise<MatchResult> {
  const normalized = normalizeLabel(label);

  // 1. 기존 글로벌 엔티티 중 같은 타입 + globalEntityId 보유 노드 조회
  const candidates = await db
    .select({
      globalEntityId: contextNodes.globalEntityId,
      label: contextNodes.label,
      discoveryId: contextNodes.discoveryId,
    })
    .from(contextNodes)
    .where(
      and(
        eq(contextNodes.ontologyTypeId, ontologyTypeId),
        isNotNull(contextNodes.globalEntityId),
      ),
    ) as MatchCandidate[];

  // 2. 정규화 레이블 매칭
  for (const candidate of candidates) {
    if (normalizeLabel(candidate.label) === normalized) {
      return {
        globalEntityId: candidate.globalEntityId,
        isNew: false,
        matchedLabel: candidate.label,
      };
    }
  }

  // 3. 매칭 실패 → 신규 글로벌 엔티티
  return {
    globalEntityId: crypto.randomUUID(),
    isNew: true,
  };
}

/**
 * 배치 매칭 — 여러 엔티티를 한 번에 매칭
 * DB 조회를 1회로 최적화
 */
export async function matchGlobalEntitiesBatch(
  db: DrizzleD1Database<Record<string, unknown>>,
  entities: Array<{ label: string; ontologyTypeId: string }>,
): Promise<Map<string, MatchResult>> {
  // 모든 기존 글로벌 엔티티 조회 (1회)
  const allCandidates = await db
    .select({
      globalEntityId: contextNodes.globalEntityId,
      label: contextNodes.label,
      ontologyTypeId: contextNodes.ontologyTypeId,
      discoveryId: contextNodes.discoveryId,
    })
    .from(contextNodes)
    .where(isNotNull(contextNodes.globalEntityId)) as Array<
    MatchCandidate & { ontologyTypeId: string | null }
  >;

  const results = new Map<string, MatchResult>();

  for (const entity of entities) {
    const normalized = normalizeLabel(entity.label);
    const key = `${entity.label}::${entity.ontologyTypeId}`;

    // 같은 타입의 후보에서 레이블 매칭
    const match = allCandidates.find(
      (c) =>
        c.ontologyTypeId === entity.ontologyTypeId &&
        normalizeLabel(c.label) === normalized,
    );

    if (match) {
      results.set(key, {
        globalEntityId: match.globalEntityId,
        isNew: false,
        matchedLabel: match.label,
      });
    } else {
      results.set(key, {
        globalEntityId: crypto.randomUUID(),
        isNew: true,
      });
    }
  }

  return results;
}
