import { desc, eq, and, gte, sql } from "drizzle-orm";
import type { DB } from "~/db";
import { radarItems, discoveries, tenantMembers } from "~/db/schema";
import { topicMembers, graphs, projections, sharedSignals } from "~/db/schema-v2";
import {
  matrixCells,
  industries,
  functions,
  cellTopicMap,
  consensusScores,
} from "~/features/matrix/db/schema";
import type { JsonLdGraph, JsonLdNode } from "~/lib/graph/types";

// ============================================================================
// Matrix 섹션 내부 인터페이스
// ============================================================================

interface MatrixScoreChange {
  industryName: string;
  functionName: string;
  compositeScore: number;
  delta: number;
}

interface CellSignalCount {
  industryName: string;
  functionName: string;
  signalCount: number;
}

interface StageAdvance {
  industryName: string;
  functionName: string;
  stage: string;
}

interface TopCellBrief {
  industryName: string;
  functionName: string;
  compositeScore: number;
  stage: string;
}

// ============================================================================
// BriefingBuilder — 사용자별 일간 브리핑 생성
// ============================================================================

export class BriefingBuilder {
  constructor(private db: DB) {}

  /** 사용자별 일간 브리핑 Markdown 생성 */
  async buildBriefing(userId: string): Promise<string> {
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // 1. 최근 Radar 시그널 (relevanceScore >= 7, 24시간)
    const recentSignals = await this.db
      .select({
        id: radarItems.id,
        title: radarItems.title,
        summary: radarItems.summary,
        score: radarItems.relevanceScore,
      })
      .from(radarItems)
      .where(
        and(
          gte(radarItems.relevanceScore, 7),
          gte(radarItems.collectedAt, oneDayAgo),
        ),
      )
      .orderBy(desc(radarItems.relevanceScore))
      .limit(10);

    // 2. 최근 파이프라인 변경 (24시간)
    const recentDiscoveries = await this.db
      .select({
        id: discoveries.id,
        title: discoveries.title,
        status: discoveries.status,
      })
      .from(discoveries)
      .where(gte(discoveries.updatedAt, oneDayAgo))
      .orderBy(desc(discoveries.updatedAt))
      .limit(10);

    // 3. 사용자 Topic의 최근 Decision (7일)
    const userTopics = await this.db
      .select({ topicId: topicMembers.topicId })
      .from(topicMembers)
      .where(eq(topicMembers.userId, userId));

    const recentDecisions: {
      topicName: string;
      summary: string;
      date: string;
    }[] = [];

    for (const { topicId } of userTopics) {
      const graph = await this.db
        .select({ jsonld: graphs.jsonld })
        .from(graphs)
        .where(
          and(eq(graphs.scopeType, "topic"), eq(graphs.scopeId, topicId)),
        )
        .get();

      if (!graph) continue;

      const parsed: JsonLdGraph = JSON.parse(graph.jsonld);
      const topicNode = parsed["@graph"].find(
        (n: JsonLdNode) => n["@type"] === "dx:Topic",
      );
      const topicName = topicNode
        ? String(topicNode["dx:name"] || topicId)
        : topicId;

      const decisions = parsed["@graph"].filter(
        (n: JsonLdNode) => n["@type"] === "dx:Decision",
      );

      for (const d of decisions) {
        const dateStr = String(d["dx:date"] || "");
        if (dateStr && new Date(dateStr) >= sevenDaysAgo) {
          recentDecisions.push({
            topicName,
            summary: String(d["dx:summary"] || ""),
            date: dateStr,
          });
        }
      }
    }

    // 4. Markdown 브리핑 생성
    const lines: string[] = [];
    lines.push("## 일간 브리핑");
    lines.push(
      `> 생성: ${now.toISOString().slice(0, 16).replace("T", " ")}`,
    );
    lines.push("");

    lines.push("### 주요 시그널");
    if (recentSignals.length === 0) {
      lines.push("- (새로운 시그널 없음)");
    } else {
      for (const s of recentSignals) {
        const summaryText = s.summary?.slice(0, 100) || "";
        const scoreText = s.score ? ` [점수: ${s.score}]` : "";
        lines.push(`- **${s.title}** — ${summaryText}${scoreText}`);
      }
    }
    lines.push("");

    lines.push("### 파이프라인 변경");
    if (recentDiscoveries.length === 0) {
      lines.push("- (변경 없음)");
    } else {
      for (const d of recentDiscoveries) {
        lines.push(`- ${d.title} → \`${d.status}\``);
      }
    }
    lines.push("");

    lines.push("### 최근 결정");
    if (recentDecisions.length === 0) {
      lines.push("- (최근 결정 없음)");
    } else {
      for (const d of recentDecisions) {
        lines.push(`- [${d.topicName}] ${d.summary} (${d.date})`);
      }
    }

    // 5. Matrix 현황 섹션
    const membership = await this.db
      .select({ tenantId: tenantMembers.tenantId })
      .from(tenantMembers)
      .where(eq(tenantMembers.userId, userId))
      .limit(1)
      .get();

    if (membership) {
      const teamId = membership.tenantId;
      const [scoreChanges, cellSignals, stageAdvances, topCells] =
        await Promise.all([
          this.getMatrixScoreChanges(teamId),
          this.getNewSignalsByCell(teamId),
          this.getStageAdvances(teamId),
          this.getTopCellsBrief(teamId, 5),
        ]);

      lines.push("");
      lines.push("### 매트릭스 현황");
      lines.push("");

      lines.push("**스코어 변동** (24시간)");
      if (scoreChanges.length === 0) {
        lines.push("- (변동 없음)");
      } else {
        for (const s of scoreChanges) {
          const sign = s.delta >= 0 ? "+" : "";
          lines.push(
            `- ${s.industryName} × ${s.functionName}: ${s.compositeScore} (${sign}${s.delta})`,
          );
        }
      }
      lines.push("");

      lines.push("**신규 시그널**");
      if (cellSignals.length === 0) {
        lines.push("- (신규 시그널 없음)");
      } else {
        for (const s of cellSignals) {
          lines.push(
            `- ${s.industryName} × ${s.functionName}: ${s.signalCount}건`,
          );
        }
      }
      lines.push("");

      lines.push("**파이프라인 진행**");
      if (stageAdvances.length === 0) {
        lines.push("- (변경 없음)");
      } else {
        for (const s of stageAdvances) {
          lines.push(
            `- ${s.industryName} × ${s.functionName} → ${s.stage}`,
          );
        }
      }
      lines.push("");

      lines.push("**상위 기회 (Top 5)**");
      if (topCells.length === 0) {
        lines.push("- (데이터 없음)");
      } else {
        topCells.forEach((c, i) => {
          lines.push(
            `${i + 1}. ${c.industryName} × ${c.functionName}: ${c.compositeScore} (${c.stage})`,
          );
        });
      }
    }

    return lines.join("\n");
  }

  // ==========================================================================
  // Matrix 섹션 — private 헬퍼
  // ==========================================================================

  /** 전일(24h) 대비 consensusScores 변동 조회 */
  private async getMatrixScoreChanges(
    teamId: string,
  ): Promise<MatrixScoreChange[]> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const rows = await this.db
      .select({
        industryName: industries.name,
        functionName: functions.name,
        compositeScore: consensusScores.compositeScore,
        prevComposite: consensusScores.prevComposite,
      })
      .from(consensusScores)
      .innerJoin(matrixCells, eq(consensusScores.cellId, matrixCells.id))
      .innerJoin(industries, eq(matrixCells.industryId, industries.id))
      .innerJoin(functions, eq(matrixCells.functionId, functions.id))
      .where(
        and(
          eq(matrixCells.teamId, teamId),
          gte(consensusScores.updatedAt, oneDayAgo),
        ),
      );

    return rows
      .filter((r) => r.prevComposite != null)
      .map((r) => ({
        industryName: r.industryName,
        functionName: r.functionName,
        compositeScore: r.compositeScore,
        delta: +(r.compositeScore - (r.prevComposite ?? 0)).toFixed(2),
      }));
  }

  /** 지난 24시간 셀별 신규 시그널 수 */
  private async getNewSignalsByCell(
    teamId: string,
  ): Promise<CellSignalCount[]> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const rows = await this.db
      .select({
        industryName: industries.name,
        functionName: functions.name,
        signalCount: sql<number>`count(${sharedSignals.id})`.as("signal_count"),
      })
      .from(cellTopicMap)
      .innerJoin(matrixCells, eq(cellTopicMap.cellId, matrixCells.id))
      .innerJoin(industries, eq(matrixCells.industryId, industries.id))
      .innerJoin(functions, eq(matrixCells.functionId, functions.id))
      .innerJoin(sharedSignals, eq(cellTopicMap.topicId, sharedSignals.topicId))
      .where(
        and(
          eq(matrixCells.teamId, teamId),
          gte(sharedSignals.createdAt, oneDayAgo),
        ),
      )
      .groupBy(matrixCells.id, industries.name, functions.name);

    return rows.filter((r) => r.signalCount > 0);
  }

  /** 지난 24시간 pipelineStage 변경된 Cell */
  private async getStageAdvances(teamId: string): Promise<StageAdvance[]> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    return this.db
      .select({
        industryName: industries.name,
        functionName: functions.name,
        stage: matrixCells.pipelineStage,
      })
      .from(matrixCells)
      .innerJoin(industries, eq(matrixCells.industryId, industries.id))
      .innerJoin(functions, eq(matrixCells.functionId, functions.id))
      .where(
        and(eq(matrixCells.teamId, teamId), gte(matrixCells.updatedAt, oneDayAgo)),
      );
  }

  /** compositeScore 기준 상위 N개 Cell */
  private async getTopCellsBrief(
    teamId: string,
    limit: number,
  ): Promise<TopCellBrief[]> {
    // 가장 최근 scorePeriod 조회
    const latestPeriod = await this.db
      .select({ period: consensusScores.scorePeriod })
      .from(consensusScores)
      .innerJoin(matrixCells, eq(consensusScores.cellId, matrixCells.id))
      .where(eq(matrixCells.teamId, teamId))
      .orderBy(desc(consensusScores.scorePeriod))
      .limit(1)
      .get();

    if (!latestPeriod) return [];

    return this.db
      .select({
        industryName: industries.name,
        functionName: functions.name,
        compositeScore: consensusScores.compositeScore,
        stage: matrixCells.pipelineStage,
      })
      .from(consensusScores)
      .innerJoin(matrixCells, eq(consensusScores.cellId, matrixCells.id))
      .innerJoin(industries, eq(matrixCells.industryId, industries.id))
      .innerJoin(functions, eq(matrixCells.functionId, functions.id))
      .where(
        and(
          eq(matrixCells.teamId, teamId),
          eq(consensusScores.scorePeriod, latestPeriod.period),
        ),
      )
      .orderBy(desc(consensusScores.compositeScore))
      .limit(limit);
  }

  /** BRIEFING.md Projection 갱신 — user scope로 저장 */
  async refreshBriefingProjection(userId: string): Promise<void> {
    const content = await this.buildBriefing(userId);

    await this.db
      .insert(projections)
      .values({
        id: crypto.randomUUID(),
        scopeType: "user",
        scopeId: userId,
        projType: "BRIEFING.md",
        content,
        sourceHash: "briefing-" + new Date().toISOString().slice(0, 10),
        graphVersion: 0, // 브리핑은 Graph 기반이 아닌 집계 데이터
      })
      .onConflictDoUpdate({
        target: [projections.scopeType, projections.scopeId, projections.projType],
        set: {
          content,
          sourceHash: "briefing-" + new Date().toISOString().slice(0, 10),
          graphVersion: 0,
        },
      });
  }
}
