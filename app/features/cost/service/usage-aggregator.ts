import { sql, and, gte, lte } from "drizzle-orm";
import type { DB } from "~/db";
import { dailyUsageAggregates } from "../db/schema";

export interface AggregationResult {
  daysProcessed: number;
  rowsDeleted: number;
  rowsInserted: number;
  dateRange: { from: string; to: string };
}

interface AggRow {
  tenant_id: string;
  user_id: string;
  provider: string;
  model: string;
  purpose: string;
  date_str: string;
  req_count: number;
  sum_input: number;
  sum_output: number;
  sum_total: number;
  avg_latency: number | null;
}

/**
 * daily_usage_aggregates 백필 집계 서비스.
 *
 * usage_events를 SSOT로 삼아 지정 기간의 집계를 전체 교체한다.
 * 전략: 해당 날짜 범위의 기존 집계 DELETE → usage_events GROUP BY → INSERT.
 */
export class UsageAggregator {
  constructor(private db: DB) {}

  /**
   * 최근 N일간 daily_usage_aggregates 재집계.
   * @param days 백필 범위 (기본 7일)
   */
  async backfill(days = 7): Promise<AggregationResult> {
    const today = new Date();
    const fromDate = new Date(today);
    fromDate.setDate(fromDate.getDate() - (days - 1));

    const from = toDateStr(fromDate);
    const to = toDateStr(today);

    // 1) 해당 날짜 범위의 기존 집계 삭제
    const deleted = await this.db
      .delete(dailyUsageAggregates)
      .where(
        and(
          gte(dailyUsageAggregates.date, from),
          lte(dailyUsageAggregates.date, to)
        )
      )
      .returning({ id: dailyUsageAggregates.id });

    // 2) usage_events에서 GROUP BY 집계 (raw SQL — D1 date() 함수 사용)
    const fromUnix = Math.floor(
      new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()).getTime() / 1000
    );
    const toUnix = Math.floor(
      new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59).getTime() / 1000
    );

    const result = await this.db.all(
      sql`SELECT
        tenant_id,
        user_id,
        provider,
        model,
        purpose,
        date(created_at, 'unixepoch') AS date_str,
        COUNT(*) AS req_count,
        COALESCE(SUM(input_tokens), 0) AS sum_input,
        COALESCE(SUM(output_tokens), 0) AS sum_output,
        COALESCE(SUM(total_tokens), 0) AS sum_total,
        AVG(latency_ms) AS avg_latency
      FROM usage_events
      WHERE created_at >= ${fromUnix} AND created_at <= ${toUnix}
      GROUP BY tenant_id, user_id, provider, model, purpose, date_str`
    );

    const rows = result as unknown as AggRow[];

    // 3) INSERT
    if (rows.length > 0) {
      await this.db.insert(dailyUsageAggregates).values(
        rows.map((r) => ({
          id: crypto.randomUUID(),
          tenantId: r.tenant_id,
          userId: r.user_id,
          provider: r.provider,
          model: r.model,
          purpose: r.purpose,
          date: r.date_str,
          requestCount: r.req_count,
          totalInputTokens: r.sum_input,
          totalOutputTokens: r.sum_output,
          totalTokens: r.sum_total,
          avgLatencyMs: r.avg_latency != null ? Math.round(r.avg_latency) : null,
        }))
      );
    }

    const uniqueDates = new Set(rows.map((r) => r.date_str));

    return {
      daysProcessed: uniqueDates.size,
      rowsDeleted: deleted.length,
      rowsInserted: rows.length,
      dateRange: { from, to },
    };
  }
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
