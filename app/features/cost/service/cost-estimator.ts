import { eq, and, lte, or, isNull, desc, sql } from "drizzle-orm";
import type { DB } from "~/db";
import {
  usageEvents,
  costEstimates,
  priceCatalog,
  budgetPolicies,
  budgetUsageCache,
  modelCatalog,
} from "../db/schema";
import type { BudgetTier } from "../types";
import type { PriceCatalogEntry } from "../db/schema";

export class CostEstimator {
  constructor(private db: DB) {}

  /**
   * usage_event의 토큰 수 × 해당 시점 단가 → cost_estimates INSERT + budget_usage_cache 갱신.
   * @param usageEventId - 이미 INSERT된 usage_events.id
   * @returns totalCostUsd
   */
  async estimate(usageEventId: string): Promise<{ totalCostUsd: number }> {
    // 1. usage_events 조회
    const [event] = await this.db
      .select()
      .from(usageEvents)
      .where(eq(usageEvents.id, usageEventId))
      .limit(1);

    if (!event) {
      throw new Error(`Usage event not found: ${usageEventId}`);
    }

    // 2. modelCatalogId 결정: {provider}:{model} 정확 매칭 → provider fallback
    const exactId = `${event.provider}:${event.model}`;
    let modelCatalogId = exactId;

    const [exactMatch] = await this.db
      .select({ id: modelCatalog.id })
      .from(modelCatalog)
      .where(eq(modelCatalog.id, exactId))
      .limit(1);

    if (!exactMatch) {
      const [fallback] = await this.db
        .select({ id: modelCatalog.id })
        .from(modelCatalog)
        .where(eq(modelCatalog.provider, event.provider))
        .limit(1);

      if (fallback) {
        modelCatalogId = fallback.id;
      }
    }

    // 3. 가격 조회
    const price = await this.getCurrentPrice(modelCatalogId);
    if (!price) {
      throw new Error(`No active price found for model: ${modelCatalogId}`);
    }

    // 4. 비용 계산
    const inputCostUsd =
      (event.inputTokens / 1_000_000) * price.inputPricePerMToken;
    const outputCostUsd =
      (event.outputTokens / 1_000_000) * price.outputPricePerMToken;
    const cacheCostUsd =
      (event.cacheReadTokens / 1_000_000) *
        (price.cacheReadPricePerMToken || 0) +
      (event.cacheWriteTokens / 1_000_000) *
        (price.cacheWritePricePerMToken || 0);
    const totalCostUsd = inputCostUsd + outputCostUsd + cacheCostUsd;

    // 5. cost_estimates INSERT
    const estimateId = crypto.randomUUID();
    await this.db.insert(costEstimates).values({
      id: estimateId,
      usageEventId,
      priceVersionId: price.id,
      inputCostUsd,
      outputCostUsd,
      cacheCostUsd,
      totalCostUsd,
    });

    // 6. budget_usage_cache 갱신
    await this.updateBudgetCache(event, totalCostUsd, usageEventId);

    return { totalCostUsd };
  }

  /**
   * 특정 모델의 현행 가격을 조회한다.
   * effectiveTo가 null이거나 현재 시점 이후인 가격 중 effectiveFrom이 가장 최근인 것을 선택.
   */
  async getCurrentPrice(
    modelCatalogId: string
  ): Promise<PriceCatalogEntry | null> {
    const now = new Date();

    const [price] = await this.db
      .select()
      .from(priceCatalog)
      .where(
        and(
          eq(priceCatalog.modelCatalogId, modelCatalogId),
          lte(priceCatalog.effectiveFrom, now),
          or(isNull(priceCatalog.effectiveTo), sql`${priceCatalog.effectiveTo} > ${now}`)
        )
      )
      .orderBy(desc(priceCatalog.effectiveFrom))
      .limit(1);

    return price ?? null;
  }

  /**
   * budget_usage_cache를 갱신한다.
   * 가장 구체적인 budget_policy를 찾아 해당 cache를 incremental update.
   */
  private async updateBudgetCache(
    event: { tenantId: string; userId: string; purpose: string },
    totalCostUsd: number,
    usageEventId: string
  ): Promise<void> {
    const now = new Date();

    // 적용 가능한 budget_policies 검색 (isActive + tenantId + 기간 내)
    const policies = await this.db
      .select()
      .from(budgetPolicies)
      .where(
        and(
          eq(budgetPolicies.tenantId, event.tenantId),
          eq(budgetPolicies.isActive, true),
          lte(budgetPolicies.periodStart, now),
          sql`${budgetPolicies.periodEnd} > ${now}`
        )
      );

    if (policies.length === 0) return;

    // 우선순위: userId+purpose > userId > tenantId+purpose > tenantId
    const bestPolicy =
      policies.find(
        (p) => p.userId === event.userId && p.purpose === event.purpose
      ) ??
      policies.find((p) => p.userId === event.userId && p.purpose === null) ??
      policies.find(
        (p) => p.userId === null && p.purpose === event.purpose
      ) ??
      policies.find((p) => p.userId === null && p.purpose === null);

    if (!bestPolicy) return;

    // 기존 cache 조회
    const [existingCache] = await this.db
      .select()
      .from(budgetUsageCache)
      .where(eq(budgetUsageCache.budgetPolicyId, bestPolicy.id))
      .limit(1);

    const newUsageUsd =
      (existingCache?.currentUsageUsd ?? 0) + totalCostUsd;
    const usagePct = (newUsageUsd / bestPolicy.budgetUsd) * 100;
    const budgetTier = this.computeBudgetTier(
      usagePct,
      bestPolicy.thresholdWarnPct,
      bestPolicy.thresholdDegradePct,
      bestPolicy.thresholdBlockPct
    );

    if (existingCache) {
      await this.db
        .update(budgetUsageCache)
        .set({
          currentUsageUsd: newUsageUsd,
          usagePct,
          budgetTier,
          lastEventId: usageEventId,
          updatedAt: now,
        })
        .where(eq(budgetUsageCache.id, existingCache.id));
    } else {
      await this.db.insert(budgetUsageCache).values({
        id: crypto.randomUUID(),
        budgetPolicyId: bestPolicy.id,
        currentUsageUsd: newUsageUsd,
        usagePct,
        budgetTier,
        lastEventId: usageEventId,
      });
    }
  }

  private computeBudgetTier(
    usagePct: number,
    warnPct: number,
    degradePct: number,
    blockPct: number
  ): BudgetTier {
    if (usagePct >= blockPct) return "block";
    if (usagePct >= degradePct) return "degrade";
    if (usagePct >= warnPct) return "warn";
    return "normal";
  }
}
