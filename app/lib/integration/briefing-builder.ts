import { desc, eq, and, gte } from "drizzle-orm";
import type { DB } from "~/db";
import { radarItems, discoveries } from "~/db/schema";
import { topicMembers, graphs, projections } from "~/db/schema-v2";
import type { JsonLdGraph, JsonLdNode } from "~/lib/graph/types";

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

    return lines.join("\n");
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
