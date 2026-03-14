/**
 * ItemEvaluator — LLM 기반 아이템 품질 평가 서비스 (#17 + #18)
 *
 * Cron(api.cron.radar-eval)에서 호출하여:
 * 1. 미평가 아이템 조회
 * 2. LLM에 품질/관련도/신규성 평가 요청
 * 3. radar_item_metrics UPSERT
 * 4. 비용 추적 (UsageRecorder)
 *
 * @see DX-PLAN-009 #17, #18
 */

import { eq, sql, isNull } from "drizzle-orm";
import type { DB } from "~/db";
import { radarItems, radarSources } from "~/db";
import { radarItemMetrics } from "~/features/radar/db/schema";
import { calculateCompositeScore } from "./health-score";
import { callLLM, BudgetBlockedError } from "~/lib/ai";
import type { FallbackContext, ClaudeResponse } from "~/lib/ai";
import { UsageRecorder } from "~/features/cost/service/usage-recorder";
import type { ProviderId } from "~/features/cost/types";

// ============================================================================
// Types
// ============================================================================

export interface UnevaluatedItem {
  id: string;
  title: string;
  titleKo: string | null;
  summary: string | null;
  summaryKo: string | null;
  sourceName: string;
  tenantId: string;
}

export interface EvalScores {
  topicRelevance: number;
  novelty: number;
  quality: number;
  titleKo?: string | null;
  summaryKo?: string | null;
}

export interface EvalBatchResult {
  evaluated: number;
  skipped: number;
  errors: string[];
  budgetBlocked: boolean;
}

// ============================================================================
// Prompt
// ============================================================================

const EVAL_SYSTEM_PROMPT = `당신은 기술/비즈니스 트렌드 분석 전문가입니다.
주어진 레이더 아이템(기사/리포트)을 평가하고 한국어 제목/요약을 생성해주세요.

## 평가 기준 (0.0~1.0, 소수점 2자리)
- topicRelevance: 주제 관련도 — 비즈니스 혁신, 기술 트렌드, 시장 변화와의 관련성
- novelty: 신규성 — 기존에 널리 알려진 정보인지, 새로운 관점/발견인지
- quality: 품질 — 정보의 깊이, 근거 수준, 실행 가능성

## 한국어 생성
- titleKo: 한국어 제목 (30자 이내, 핵심 내용 반영. 원문이 한국어면 그대로 사용)
- summaryKo: 핵심 내용 한국어 요약 (2-3문장, 100자 이내)

JSON만 반환하세요:
{"topicRelevance":0.00,"novelty":0.00,"quality":0.00,"titleKo":"한국어 제목","summaryKo":"한국어 요약"}`;

// ============================================================================
// Service
// ============================================================================

export class ItemEvaluator {
  constructor(private db: DB) {}

  /**
   * 미평가 아이템 조회 — evaluatedAt이 NULL인 아이템
   */
  async getUnevaluatedItems(
    tenantId: string,
    limit: number,
  ): Promise<UnevaluatedItem[]> {
    const rows = await this.db
      .select({
        id: radarItems.id,
        title: radarItems.title,
        titleKo: radarItems.titleKo,
        summary: radarItems.summary,
        summaryKo: radarItems.summaryKo,
        sourceName: radarSources.name,
        tenantId: radarSources.tenantId,
      })
      .from(radarItems)
      .innerJoin(radarSources, eq(radarItems.sourceId, radarSources.id))
      .leftJoin(radarItemMetrics, eq(radarItems.id, radarItemMetrics.itemId))
      .where(
        sql`${radarSources.tenantId} = ${tenantId} AND (${radarItemMetrics.evaluatedAt} IS NULL OR ${radarItemMetrics.id} IS NULL)`,
      )
      .limit(limit);

    return rows.map((r) => ({
      ...r,
      tenantId: r.tenantId ?? tenantId,
    }));
  }

  /**
   * LLM 응답 텍스트 → EvalScores 파싱 + 검증
   */
  parseEvalResponse(text: string): EvalScores | null {
    // markdown 코드블록 래핑 제거
    const cleaned = text
      .replace(/```json\s*/gi, "")
      .replace(/```\s*/g, "")
      .trim();

    try {
      const parsed = JSON.parse(cleaned);

      if (
        typeof parsed.topicRelevance !== "number" ||
        typeof parsed.novelty !== "number" ||
        typeof parsed.quality !== "number"
      ) {
        return null;
      }

      // 0~1 범위 clamp
      return {
        topicRelevance: clamp(parsed.topicRelevance),
        novelty: clamp(parsed.novelty),
        quality: clamp(parsed.quality),
        titleKo: typeof parsed.titleKo === "string" ? parsed.titleKo : null,
        summaryKo: typeof parsed.summaryKo === "string" ? parsed.summaryKo : null,
      };
    } catch {
      return null;
    }
  }

  /**
   * 배치 평가 실행
   */
  async evaluateBatch(params: {
    tenantId: string;
    limit: number;
    env: Record<string, string | undefined>;
  }): Promise<EvalBatchResult> {
    const { tenantId, limit, env } = params;
    const items = await this.getUnevaluatedItems(tenantId, limit);

    const result: EvalBatchResult = {
      evaluated: 0,
      skipped: 0,
      errors: [],
      budgetBlocked: false,
    };

    if (items.length === 0) return result;

    const apiKey = env.ANTHROPIC_API_KEY ?? "";

    for (const item of items) {
      try {
        const content = [
          `제목: ${item.titleKo || item.title}`,
          item.summaryKo || item.summary
            ? `요약: ${item.summaryKo || item.summary}`
            : null,
          `소스: ${item.sourceName}`,
        ]
          .filter(Boolean)
          .join("\n");

        const ctx: FallbackContext = {
          env,
          db: this.db,
          userId: "system",
          tenantId,
          purpose: "eval",
        };

        const response = await callLLM(
          apiKey,
          {
            model: "claude-haiku-4-5-20251001",
            max_tokens: 256,
            system: EVAL_SYSTEM_PROMPT,
            messages: [{ role: "user", content }],
          },
          ctx,
        );

        // 비용 추적
        await this.recordUsage(response, tenantId, env);

        // 응답 파싱
        const firstBlock = response.content?.[0];
        const responseText =
          firstBlock?.type === "text" ? (firstBlock.text ?? "") : "";
        const scores = this.parseEvalResponse(responseText);

        if (!scores) {
          result.skipped++;
          result.errors.push(`${item.id}: JSON 파싱 실패`);
          continue;
        }

        // UPSERT metrics
        await this.upsertMetrics(item.id, tenantId, scores, response.model);

        // titleKo/summaryKo가 아직 없는 아이템에 한국어 제목/요약 업데이트
        if (!item.titleKo && scores.titleKo) {
          await this.db
            .update(radarItems)
            .set({
              titleKo: scores.titleKo,
              ...(scores.summaryKo && !item.summaryKo
                ? { summaryKo: scores.summaryKo }
                : {}),
            })
            .where(eq(radarItems.id, item.id));
        }

        result.evaluated++;
      } catch (err) {
        if (err instanceof BudgetBlockedError) {
          result.budgetBlocked = true;
          result.errors.push(`예산 초과 — 배치 중단`);
          break;
        }

        result.skipped++;
        result.errors.push(
          `${item.id}: ${err instanceof Error ? err.message : "unknown"}`,
        );
      }
    }

    return result;
  }

  // ===========================================================================
  // Private
  // ===========================================================================

  private async upsertMetrics(
    itemId: string,
    tenantId: string,
    scores: EvalScores,
    modelVersion: string | undefined,
  ): Promise<void> {
    const compositeScore = calculateCompositeScore(scores);

    await this.db
      .insert(radarItemMetrics)
      .values({
        id: `rim-${crypto.randomUUID()}`,
        itemId,
        tenantId,
        topicRelevance: scores.topicRelevance,
        novelty: scores.novelty,
        quality: scores.quality,
        compositeScore,
        modelVersion: modelVersion ?? "unknown",
        evaluatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: radarItemMetrics.itemId,
        set: {
          topicRelevance: scores.topicRelevance,
          novelty: scores.novelty,
          quality: scores.quality,
          compositeScore,
          modelVersion: modelVersion ?? "unknown",
          evaluatedAt: new Date(),
        },
      });
  }

  private async recordUsage(
    response: ClaudeResponse,
    tenantId: string,
    env: Record<string, string | undefined>,
  ): Promise<void> {
    try {
      const provider =
        ((response as unknown as Record<string, unknown>)._provider as ProviderId) ??
        "anthropic";

      await new UsageRecorder(this.db).record({
        userId: "system",
        tenantId,
        provider,
        model: response.model ?? "claude-haiku-4-5-20251001",
        purpose: "eval" as const,
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      });
    } catch (err) {
      console.warn("[ItemEvaluator] usage recording failed:", err);
    }
  }
}

// ============================================================================
// Helpers
// ============================================================================

function clamp(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}
