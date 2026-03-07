// SignalRouter — pending 시그널 자동 라우팅
import { eq, and, sql } from "drizzle-orm";
import type { DB } from "~/db";
import { graphs, graphEvents } from "~/db/schema-v2";
import { sharedSignals, topicMembers } from "~/db";
import { SignalService } from "~/features/topic/service/signal.service";

// ============================================================================
// Types
// ============================================================================

interface RoutedSignal {
  signalId: number;
  topicId: string;
  routedTo: string;
  expertiseScore: number;
}

export interface RoutingResult {
  processed: number;
  routed: number;
  skipped: number;
  errors: string[];
  details: RoutedSignal[];
}

export interface RoutingStats {
  pending: number;
  reviewed: number;
  actioned: number;
  dismissed: number;
  total: number;
}

// ============================================================================
// SignalRouter
// ============================================================================

export class SignalRouter {
  private signalService: SignalService;

  constructor(private db: DB) {
    this.signalService = new SignalService(db);
  }

  // ─── pending 시그널 일괄 라우팅 ──────────────────────────────────────
  async routePendingSignals(): Promise<RoutingResult> {
    // status='pending'인 시그널 조회
    const pending = await this.db
      .select()
      .from(sharedSignals)
      .where(eq(sharedSignals.status, "pending"))
      .limit(100);

    const result: RoutingResult = {
      processed: pending.length,
      routed: 0,
      skipped: 0,
      errors: [],
      details: [],
    };

    for (const signal of pending) {
      try {
        const routed = await this.routeOneSignal(
          signal.id,
          signal.topicId,
        );
        if (routed) {
          result.routed++;
          result.details.push(routed);
        } else {
          result.skipped++;
        }
      } catch (e) {
        result.errors.push(
          `signal ${signal.id}: ${e instanceof Error ? e.message : "Unknown error"}`,
        );
      }
    }

    return result;
  }

  // ─── 라우팅 통계 ────────────────────────────────────────────────────
  async getRoutingStats(): Promise<RoutingStats> {
    const rows = await this.db
      .select({
        status: sharedSignals.status,
        count: sql<number>`count(*)`,
      })
      .from(sharedSignals)
      .groupBy(sharedSignals.status);

    const stats: RoutingStats = {
      pending: 0,
      reviewed: 0,
      actioned: 0,
      dismissed: 0,
      total: 0,
    };

    for (const row of rows) {
      const count = Number(row.count);
      stats.total += count;

      switch (row.status) {
        case "pending":
          stats.pending = count;
          break;
        case "reviewed":
          stats.reviewed = count;
          break;
        case "actioned":
          stats.actioned = count;
          break;
        case "dismissed":
          stats.dismissed = count;
          break;
      }
    }

    return stats;
  }

  // ─── 개별 시그널 라우팅 ──────────────────────────────────────────────
  private async routeOneSignal(
    signalId: number,
    topicId: string | null,
  ): Promise<RoutedSignal | null> {
    // 1. topicId가 없으면 라우팅 불가 → skip
    if (!topicId) return null;

    // 2. 해당 topic의 멤버 조회
    const members = await this.db
      .select({ userId: topicMembers.userId })
      .from(topicMembers)
      .where(eq(topicMembers.topicId, topicId));

    if (members.length === 0) return null;

    // 3. 각 멤버의 expertise score 산출 (user graph 존재 여부 기반)
    let bestUserId = members[0].userId;
    let bestScore = 0;

    for (const member of members) {
      // expertise score: topic graph 내 userId 노드의 속성 기반 점수
      const memberGraph = await this.db
        .select({ id: graphs.id })
        .from(graphs)
        .where(
          and(
            eq(graphs.scopeType, "user"),
            eq(graphs.scopeId, member.userId),
          ),
        )
        .get();
      const score = memberGraph ? 1 : 0;
      if (score > bestScore) {
        bestScore = score;
        bestUserId = member.userId;
      }
    }

    // 4. 시그널 상태를 'reviewed'로 업데이트 (CHECK: pending/reviewed/actioned/dismissed)
    await this.signalService.updateStatus(signalId, "reviewed", bestUserId);

    // 5. graph_events 감사 로그 기록
    await this.recordRoutingEvent(signalId, topicId, bestUserId);

    return {
      signalId,
      topicId,
      routedTo: bestUserId,
      expertiseScore: bestScore,
    };
  }

  // ─── 라우팅 이벤트 감사 로그 ─────────────────────────────────────────
  private async recordRoutingEvent(
    signalId: number,
    topicId: string,
    routedTo: string,
  ): Promise<void> {
    // topic scope graph를 찾아 graphId로 사용
    const graph = await this.db
      .select({ id: graphs.id })
      .from(graphs)
      .where(
        and(eq(graphs.scopeType, "topic"), eq(graphs.scopeId, topicId)),
      )
      .get();

    // graph가 없으면 감사 로그 생략 (topic graph 미생성 상태)
    if (!graph) return;

    await this.db.insert(graphEvents).values({
      graphId: graph.id,
      actorId: "system:signal-router",
      actorType: "system",
      action: "update",
      reason: `시그널 ${signalId}을 ${routedTo}에게 라우팅`,
      diffJson: JSON.stringify({
        signalId,
        topicId,
        routedTo,
      }),
    });
  }
}
