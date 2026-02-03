/**
 * COLLECT_SIGNALS Executor
 *
 * Sprint Scope 키워드를 기반으로 radar_items에서 신호를 수집하고
 * AI 스코어링을 수행합니다.
 */

import { eq, and, desc, gte, isNull } from "drizzle-orm";
import type { ExecutorContext } from "../executor/task-executor";
import { radarItems, radarSources } from "~/db/schema";
import { vdSprintScopes } from "../../db/schema";
import { createSignal } from "../../repositories/signal.repository";
import { generateJson } from "../ai/openai-client";
import { SCORE_SIGNAL_RELEVANCE_SYSTEM, SCORE_SIGNAL_RELEVANCE_USER } from "../ai/prompts";
import type { VdSignalTypeValue } from "../../types";

// ============================================================================
// TYPES
// ============================================================================

export interface CollectSignalsInput {
  sprintId: string;
  scopeIds?: string[];
  sources?: string[];
  maxItems?: number;
  minRelevance?: number;
}

export interface CollectSignalsOutput {
  signalIds: string[];
  processed: number;
  filtered: number;
}

interface RelevanceScoreResponse {
  relevanceScore: number;
  rationale: string;
}

// ============================================================================
// EXECUTOR
// ============================================================================

export async function executeCollectSignals(
  ctx: ExecutorContext,
  input: CollectSignalsInput
): Promise<CollectSignalsOutput> {
  const { db, openaiApiKey, sprintId } = ctx;
  const maxItems = input.maxItems || 50;
  const minRelevance = input.minRelevance || 60;

  // 1. Sprint Scope 조회
  let scopes = await db
    .select()
    .from(vdSprintScopes)
    .where(
      and(
        eq(vdSprintScopes.sprintId, sprintId),
        eq(vdSprintScopes.selected, 1)
      )
    );

  // scopeIds가 지정된 경우 필터링
  if (input.scopeIds && input.scopeIds.length > 0) {
    const scopeIdSet = new Set(input.scopeIds);
    scopes = scopes.filter((s) => scopeIdSet.has(s.id));
  }

  if (scopes.length === 0) {
    throw new Error("No selected scopes found for sprint");
  }

  // 2. 키워드 수집
  const keywords = new Set<string>();
  for (const scope of scopes) {
    keywords.add(scope.industry.toLowerCase());
    if (scope.technology) keywords.add(scope.technology.toLowerCase());
    if (scope.keywords) {
      for (const kw of scope.keywords) {
        keywords.add(kw.toLowerCase());
      }
    }
  }

  // 3. Radar Items 조회 (최근 7일, 아직 Discovery에 연결되지 않은 것)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // 키워드로 필터링된 radar items 조회
  const keywordArray = Array.from(keywords);
  const radarItemsQuery = await db
    .select({
      item: radarItems,
      source: radarSources,
    })
    .from(radarItems)
    .leftJoin(radarSources, eq(radarItems.sourceId, radarSources.id))
    .where(
      and(
        isNull(radarItems.discoveryId),
        gte(radarItems.collectedAt, sevenDaysAgo)
      )
    )
    .orderBy(desc(radarItems.collectedAt))
    .limit(maxItems * 3); // 필터링을 위해 여유있게 조회

  // 4. 키워드 매칭으로 1차 필터링
  const filteredItems = radarItemsQuery.filter((row) => {
    const title = (row.item.title || "").toLowerCase();
    const summary = (row.item.summary || "").toLowerCase();
    const titleKo = (row.item.titleKo || "").toLowerCase();
    const summaryKo = (row.item.summaryKo || "").toLowerCase();
    const combined = `${title} ${summary} ${titleKo} ${summaryKo}`;

    return keywordArray.some((kw) => combined.includes(kw));
  });

  // 5. AI 스코어링 및 Signal 생성
  const signalIds: string[] = [];
  let processed = 0;
  let filtered = 0;

  // 대표 scope를 스코어링 기준으로 사용
  const primaryScope = scopes[0];

  for (const row of filteredItems.slice(0, maxItems)) {
    processed++;

    // AI 관련도 스코어링
    let relevanceScore: number;
    try {
      const scoreResult = await generateJson<RelevanceScoreResponse>(
        openaiApiKey,
        SCORE_SIGNAL_RELEVANCE_SYSTEM,
        SCORE_SIGNAL_RELEVANCE_USER(
          { title: row.item.title, summary: row.item.summary },
          { industry: primaryScope.industry, technology: primaryScope.technology, keywords: primaryScope.keywords }
        ),
        { temperature: 0.3 }
      );
      relevanceScore = scoreResult.relevanceScore;
    } catch (error) {
      // AI 스코어링 실패 시 기본값 사용
      console.warn(`AI scoring failed for ${row.item.id}:`, error);
      relevanceScore = 50;
    }

    // 최소 관련도 미달 시 스킵
    if (relevanceScore < minRelevance) {
      filtered++;
      continue;
    }

    // Signal 생성
    const signalType = mapSourceTypeToSignalType(row.source?.sourceType || "other");
    const signal = await createSignal(db, sprintId, {
      signalType,
      title: row.item.titleKo || row.item.title,
      summary: row.item.summaryKo || row.item.summary || undefined,
      sourceUrl: row.item.url,
      sourceTitle: row.source?.name,
      publishedAt: row.item.collectedAt,
      relevanceScore,
      metadata: {
        radarItemId: row.item.id,
        originalTitle: row.item.title,
        originalSummary: row.item.summary,
      },
    });

    signalIds.push(signal.id);
  }

  return {
    signalIds,
    processed,
    filtered,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function mapSourceTypeToSignalType(sourceType: string): VdSignalTypeValue {
  const mapping: Record<string, VdSignalTypeValue> = {
    rss: "NEWS",
    news: "NEWS",
    blog: "RESEARCH",
    research: "RESEARCH",
    twitter: "TREND",
    reddit: "TREND",
    competitor: "COMPETITOR",
    internal: "INTERNAL",
  };

  return mapping[sourceType.toLowerCase()] || "NEWS";
}
