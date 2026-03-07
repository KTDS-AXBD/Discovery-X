import { eq, and, gte, lte, sql, count } from "drizzle-orm";
import type { DB } from "~/db";
import { eventLogs, discoveries } from "~/db/schema";

// ============================================================================
// Types
// ============================================================================

interface HoldDecisionParams {
  discoveryId: string;
  actorId: string;
  triggerType: string;
  triggerCondition: string;
  revisitDate: string;
}

interface DropDecisionParams {
  discoveryId: string;
  actorId: string;
  failurePatterns: string[];
  evidenceReason: string;
}

interface RecallTriggeredParams {
  discoveryId: string;
  actorId: string;
  triggerType: "revisit_date" | "similar_search" | "monthly_replay";
}

interface RecallReviewedParams {
  discoveryId: string;
  actorId: string;
  fromStatus: string;
  toStatus: string;
}

interface FailurePatternReusedParams {
  discoveryId: string;
  actorId: string;
  referencedDiscoveryId: string;
  patterns: string[];
}

interface RecallStatsParams {
  fromDate?: Date;
  toDate?: Date;
}

export interface MonthlyBreakdown {
  month: string;
  recallTriggered: number;
  recallReviewed: number;
  holdDecisions: number;
  dropDecisions: number;
}

export interface RecallStats {
  totalRecallTriggered: number;
  totalRecallReviewed: number;
  totalHoldDecisions: number;
  totalDropDecisions: number;
  totalPatternReuses: number;
  monthlyBreakdown: MonthlyBreakdown[];
}

// 재호출 관련 이벤트 타입
type RecallEventType =
  | "HOLD_DECIDED"
  | "DROP_DECIDED"
  | "RECALL_TRIGGERED"
  | "RECALL_REVIEWED"
  | "FAILURE_PATTERN_REUSED";

// ============================================================================
// Service
// ============================================================================

export class RecallTrackingService {
  constructor(private db: DB) {}

  /**
   * HOLD 결정 이벤트 기록
   */
  async logHoldDecision(params: HoldDecisionParams): Promise<void> {
    await this.insertEvent("HOLD_DECIDED", params.discoveryId, params.actorId, {
      triggerType: params.triggerType,
      triggerCondition: params.triggerCondition,
      revisitDate: params.revisitDate,
    });
  }

  /**
   * DROP 결정 이벤트 기록
   */
  async logDropDecision(params: DropDecisionParams): Promise<void> {
    await this.insertEvent("DROP_DECIDED", params.discoveryId, params.actorId, {
      failurePatterns: params.failurePatterns,
      evidenceReason: params.evidenceReason,
    });
  }

  /**
   * Recall Queue 조회 이벤트 (재검토 시작)
   */
  async logRecallTriggered(params: RecallTriggeredParams): Promise<void> {
    await this.insertEvent("RECALL_TRIGGERED", params.discoveryId, params.actorId, {
      triggerType: params.triggerType,
    });
  }

  /**
   * Recall 재결정 이벤트 (HOLD→다른 상태로 전환)
   */
  async logRecallReviewed(params: RecallReviewedParams): Promise<void> {
    await this.insertEvent("RECALL_REVIEWED", params.discoveryId, params.actorId, {
      fromStatus: params.fromStatus,
      toStatus: params.toStatus,
    });
  }

  /**
   * Failure Pattern 재사용 이벤트
   */
  async logFailurePatternReused(params: FailurePatternReusedParams): Promise<void> {
    await this.insertEvent("FAILURE_PATTERN_REUSED", params.discoveryId, params.actorId, {
      referencedDiscoveryId: params.referencedDiscoveryId,
      patterns: params.patterns,
    });
  }

  /**
   * 재호출 이벤트 통계 조회
   * tenantId 스코핑: discoveries 조인으로 tenant 필터
   */
  async getRecallStats(tenantId: string, params?: RecallStatsParams): Promise<RecallStats> {
    // 날짜 필터 조건 구성
    const conditions = [
      eq(discoveries.tenantId, tenantId),
      sql`${eventLogs.eventType} IN ('HOLD_DECIDED', 'DROP_DECIDED', 'RECALL_TRIGGERED', 'RECALL_REVIEWED', 'FAILURE_PATTERN_REUSED')`,
    ];

    if (params?.fromDate) {
      conditions.push(gte(eventLogs.timestamp, params.fromDate));
    }
    if (params?.toDate) {
      conditions.push(lte(eventLogs.timestamp, params.toDate));
    }

    const whereClause = and(...conditions);

    // 이벤트 타입별 총 건수 집계
    const typeCounts = await this.db
      .select({
        eventType: eventLogs.eventType,
        cnt: count(),
      })
      .from(eventLogs)
      .innerJoin(discoveries, eq(eventLogs.discoveryId, discoveries.id))
      .where(whereClause)
      .groupBy(eventLogs.eventType);

    const countMap = new Map<string, number>();
    for (const row of typeCounts) {
      countMap.set(row.eventType, row.cnt);
    }

    // 월별 breakdown 집계
    const monthlyRows = await this.db
      .select({
        month: sql<string>`strftime('%Y-%m', ${eventLogs.timestamp}, 'unixepoch')`.as("month"),
        eventType: eventLogs.eventType,
        cnt: count(),
      })
      .from(eventLogs)
      .innerJoin(discoveries, eq(eventLogs.discoveryId, discoveries.id))
      .where(whereClause)
      .groupBy(
        sql`strftime('%Y-%m', ${eventLogs.timestamp}, 'unixepoch')`,
        eventLogs.eventType,
      );

    // 월별로 그룹핑
    const monthMap = new Map<string, MonthlyBreakdown>();
    for (const row of monthlyRows) {
      const month = row.month;
      if (!monthMap.has(month)) {
        monthMap.set(month, {
          month,
          recallTriggered: 0,
          recallReviewed: 0,
          holdDecisions: 0,
          dropDecisions: 0,
        });
      }
      const entry = monthMap.get(month)!;
      switch (row.eventType) {
        case "RECALL_TRIGGERED":
          entry.recallTriggered = row.cnt;
          break;
        case "RECALL_REVIEWED":
          entry.recallReviewed = row.cnt;
          break;
        case "HOLD_DECIDED":
          entry.holdDecisions = row.cnt;
          break;
        case "DROP_DECIDED":
          entry.dropDecisions = row.cnt;
          break;
      }
    }

    // 월 정렬
    const monthlyBreakdown = Array.from(monthMap.values()).sort((a, b) =>
      a.month.localeCompare(b.month),
    );

    return {
      totalRecallTriggered: countMap.get("RECALL_TRIGGERED") ?? 0,
      totalRecallReviewed: countMap.get("RECALL_REVIEWED") ?? 0,
      totalHoldDecisions: countMap.get("HOLD_DECIDED") ?? 0,
      totalDropDecisions: countMap.get("DROP_DECIDED") ?? 0,
      totalPatternReuses: countMap.get("FAILURE_PATTERN_REUSED") ?? 0,
      monthlyBreakdown,
    };
  }

  // --------------------------------------------------------------------------
  // Private
  // --------------------------------------------------------------------------

  private async insertEvent(
    eventType: RecallEventType,
    discoveryId: string,
    actorId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId,
      discoveryId,
      eventType,
      metadata,
    });
  }
}
