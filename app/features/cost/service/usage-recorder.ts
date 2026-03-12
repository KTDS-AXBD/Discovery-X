import { eq, and } from "drizzle-orm";
import type { DB } from "~/db";
import { usageEvents, dailyUsageAggregates } from "../db/schema";
import type { UsageEventInput } from "../types";
import { CostEstimator } from "./cost-estimator";

export class UsageRecorder {
  constructor(private db: DB) {}

  /**
   * usage_events INSERT + daily_usage_aggregates UPSERT + cost_estimates 자동 생성.
   * @returns usageEventId, totalCostUsd
   */
  async record(
    event: UsageEventInput
  ): Promise<{ usageEventId: string; totalCostUsd: number }> {
    const id = crypto.randomUUID();
    const totalTokens =
      event.inputTokens +
      event.outputTokens +
      (event.cacheReadTokens ?? 0) +
      (event.cacheWriteTokens ?? 0);

    // 1) usage_events INSERT (핵심 — 실패 시 throw)
    await this.db.insert(usageEvents).values({
      id,
      userId: event.userId,
      tenantId: event.tenantId,
      conversationId: event.conversationId ?? null,
      provider: event.provider,
      model: event.model,
      purpose: event.purpose,
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      cacheReadTokens: event.cacheReadTokens ?? 0,
      cacheWriteTokens: event.cacheWriteTokens ?? 0,
      totalTokens,
      latencyMs: event.latencyMs ?? null,
      toolRounds: event.toolRounds ?? 0,
      retryOf: event.retryOf ?? null,
      routingDecisionId: event.routingDecisionId ?? null,
    });

    // 2) daily_usage_aggregates UPSERT (보조 집계 — 실패 시 warn)
    try {
      await this.upsertDailyAggregate(event, totalTokens);
    } catch (err) {
      console.warn("[UsageRecorder] daily aggregate upsert failed:", err);
    }

    // 3) cost_estimates 자동 생성 (보조 — 실패 시 warn, totalCostUsd=0 반환)
    let totalCostUsd = 0;
    try {
      const estimator = new CostEstimator(this.db);
      const result = await estimator.estimate(id);
      totalCostUsd = result.totalCostUsd;
    } catch (err) {
      console.warn("[UsageRecorder] cost estimation failed:", err);
    }

    return { usageEventId: id, totalCostUsd };
  }

  private async upsertDailyAggregate(
    event: UsageEventInput,
    totalTokens: number
  ): Promise<void> {
    const date = new Date().toISOString().slice(0, 10);

    const existing = await this.db
      .select()
      .from(dailyUsageAggregates)
      .where(
        and(
          eq(dailyUsageAggregates.tenantId, event.tenantId),
          eq(dailyUsageAggregates.userId, event.userId),
          eq(dailyUsageAggregates.provider, event.provider),
          eq(dailyUsageAggregates.model, event.model),
          eq(dailyUsageAggregates.purpose, event.purpose),
          eq(dailyUsageAggregates.date, date)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      const row = existing[0];
      await this.db
        .update(dailyUsageAggregates)
        .set({
          requestCount: row.requestCount + 1,
          totalInputTokens: row.totalInputTokens + event.inputTokens,
          totalOutputTokens: row.totalOutputTokens + event.outputTokens,
          totalTokens: row.totalTokens + totalTokens,
        })
        .where(eq(dailyUsageAggregates.id, row.id));
    } else {
      await this.db.insert(dailyUsageAggregates).values({
        id: crypto.randomUUID(),
        tenantId: event.tenantId,
        userId: event.userId,
        provider: event.provider,
        model: event.model,
        purpose: event.purpose,
        date,
        requestCount: 1,
        totalInputTokens: event.inputTokens,
        totalOutputTokens: event.outputTokens,
        totalTokens,
      });
    }
  }
}
