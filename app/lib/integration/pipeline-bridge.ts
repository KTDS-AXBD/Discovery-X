// PipelineBridge — PRD §9.1 양방향 인터페이스 (Pipeline ↔ Agent)
import { eq, and, desc } from "drizzle-orm";
import type { DB } from "~/db";
import { discoveries, ideas } from "~/db";
import {
  sharedSignals,
  graphs,
  topicMembers,
  type SharedSignal,
} from "~/db/schema-v2";
import { BriefingBuilder } from "./briefing-builder";
import type { JsonLdGraph, JsonLdNode } from "~/lib/graph/types";

// ============================================================================
// Types
// ============================================================================

/** 시그널 요약 (Pipeline → Agent 읽기 전용) */
export interface Signal {
  id: number;
  contentSummary: string;
  score: number;
  topicId: string | null;
  opportunityId: string | null;
  status: string;
  createdAt: Date;
}

/** Opportunity(Discovery) 상태 */
export interface OpportunityStatus {
  id: string;
  title: string;
  status: string;
  ownerId: string | null;
  updatedAt: Date;
}

/** 브리핑 데이터 */
export interface BriefingData {
  markdown: string;
  generatedAt: Date;
}

/** 엔티티 추천 */
export interface EntitySuggestion {
  nodeId: string;
  label: string;
  type: string;
  importance: number;
}

/** 아이디어 입력 (Agent → Pipeline) */
export interface IdeaInput {
  title: string;
  tenantId: string;
}

/** 아이디어 생성 결과 */
export interface IdeaResult {
  id: string;
  createdAt: Date;
}

// ============================================================================
// 인터페이스 정의
// ============================================================================

/** Pipeline → Agent (읽기 전용) */
interface PipelineToAgent {
  getRelevantSignals(userId: string, limit?: number): Promise<Signal[]>;
  getOpportunityStatus(
    opportunityId: string,
  ): Promise<OpportunityStatus | null>;
  getBriefingMaterial(userId: string): Promise<BriefingData>;
  getEntitySuggestions(userId: string): Promise<EntitySuggestion[]>;
}

/** Agent → Pipeline (제한적 쓰기) */
interface AgentToPipeline {
  submitIdea(userId: string, idea: IdeaInput): Promise<IdeaResult>;
  annotateSignal(signalId: number, annotation: string): Promise<void>;
  getExpertiseScore(userId: string, domain: string): Promise<number>;
}

// ============================================================================
// PipelineBridge 구현
// ============================================================================

export class PipelineBridge implements PipelineToAgent, AgentToPipeline {
  private briefingBuilder: BriefingBuilder;

  constructor(private db: DB) {
    this.briefingBuilder = new BriefingBuilder(db);
  }

  // ─── Pipeline → Agent ─────────────────────────────────────────────

  /** 사용자 팀 기준 관련 시그널 조회 (score 내림차순) */
  async getRelevantSignals(
    userId: string,
    limit: number = 20,
  ): Promise<Signal[]> {
    // 사용자가 속한 Topic의 teamId 조회
    const memberships = await this.db
      .select({ topicId: topicMembers.topicId })
      .from(topicMembers)
      .where(eq(topicMembers.userId, userId));

    if (memberships.length === 0) return [];

    // 각 Topic의 시그널 수집 (topicId 기반 조회 후 score 정렬)
    const allSignals: SharedSignal[] = [];
    for (const { topicId } of memberships) {
      const signals = await this.db
        .select()
        .from(sharedSignals)
        .where(eq(sharedSignals.topicId, topicId))
        .orderBy(desc(sharedSignals.score))
        .limit(limit);
      allSignals.push(...signals);
    }

    // score 내림차순 정렬 후 limit 적용
    allSignals.sort((a, b) => b.score - a.score);
    return allSignals.slice(0, limit).map(toSignal);
  }

  /** Discovery(Opportunity) 상태 조회 */
  async getOpportunityStatus(
    opportunityId: string,
  ): Promise<OpportunityStatus | null> {
    const row = await this.db
      .select({
        id: discoveries.id,
        title: discoveries.title,
        status: discoveries.status,
        ownerId: discoveries.ownerId,
        updatedAt: discoveries.updatedAt,
      })
      .from(discoveries)
      .where(eq(discoveries.id, opportunityId))
      .get();

    if (!row) return null;
    return row;
  }

  /** 사용자별 브리핑 자료 생성 (BriefingBuilder 위임) */
  async getBriefingMaterial(userId: string): Promise<BriefingData> {
    const markdown = await this.briefingBuilder.buildBriefing(userId);
    return {
      markdown,
      generatedAt: new Date(),
    };
  }

  /** 사용자 scope Graph에서 importance 높은 엔티티 추출 */
  async getEntitySuggestions(userId: string): Promise<EntitySuggestion[]> {
    const graph = await this.db
      .select({ jsonld: graphs.jsonld })
      .from(graphs)
      .where(and(eq(graphs.scopeType, "user"), eq(graphs.scopeId, userId)))
      .get();

    if (!graph) return [];

    const parsed: JsonLdGraph = JSON.parse(graph.jsonld);
    const suggestions: EntitySuggestion[] = [];

    for (const node of parsed["@graph"]) {
      const importance = typeof node["dx:importance"] === "number"
        ? (node["dx:importance"] as number)
        : 0;

      // importance > 0인 노드만 추천 대상
      if (importance > 0) {
        suggestions.push({
          nodeId: node["@id"],
          label: extractLabel(node),
          type: node["@type"],
          importance,
        });
      }
    }

    // importance 내림차순 정렬
    suggestions.sort((a, b) => b.importance - a.importance);
    return suggestions.slice(0, 20);
  }

  // ─── Agent → Pipeline ─────────────────────────────────────────────

  /** 아이디어 제출 (ideas 테이블 INSERT) */
  async submitIdea(userId: string, idea: IdeaInput): Promise<IdeaResult> {
    const id = crypto.randomUUID();
    const now = new Date();

    await this.db.insert(ideas).values({
      id,
      tenantId: idea.tenantId,
      ownerId: userId,
      title: idea.title,
    });

    return { id, createdAt: now };
  }

  /** 시그널에 주석 추가 (contentSummary에 annotation 부착) */
  async annotateSignal(
    signalId: number,
    annotation: string,
  ): Promise<void> {
    const existing = await this.db
      .select({ contentSummary: sharedSignals.contentSummary })
      .from(sharedSignals)
      .where(eq(sharedSignals.id, signalId))
      .get();

    if (!existing) {
      throw new Error(`시그널을 찾을 수 없습니다: ${signalId}`);
    }

    const updated = `${existing.contentSummary}\n[주석] ${annotation}`;
    await this.db
      .update(sharedSignals)
      .set({ contentSummary: updated })
      .where(eq(sharedSignals.id, signalId));
  }

  /** 사용자 Graph에서 domain 관련 노드 기반 전문성 점수 계산 (0~100) */
  async getExpertiseScore(userId: string, domain: string): Promise<number> {
    const graph = await this.db
      .select({ jsonld: graphs.jsonld })
      .from(graphs)
      .where(and(eq(graphs.scopeType, "user"), eq(graphs.scopeId, userId)))
      .get();

    if (!graph) return 0;

    const parsed: JsonLdGraph = JSON.parse(graph.jsonld);
    const domainLower = domain.toLowerCase();

    let totalImportance = 0;
    let matchCount = 0;

    for (const node of parsed["@graph"]) {
      const label = extractLabel(node).toLowerCase();
      const type = node["@type"].toLowerCase();
      const importance = typeof node["dx:importance"] === "number"
        ? (node["dx:importance"] as number)
        : 0;

      // domain 키워드가 label 또는 type에 포함되면 관련 노드로 판단
      if (label.includes(domainLower) || type.includes(domainLower)) {
        totalImportance += importance;
        matchCount++;
      }
    }

    if (matchCount === 0) return 0;

    // 노드 수(최대 10개 기준)와 평균 importance(0~1 스케일)를 결합하여 0~100 산출
    const countFactor = Math.min(matchCount / 10, 1);
    const avgImportance = totalImportance / matchCount;
    return Math.round(countFactor * 50 + avgImportance * 50);
  }
}

// ============================================================================
// 헬퍼
// ============================================================================

/** SharedSignal DB row → Signal DTO 변환 */
function toSignal(row: SharedSignal): Signal {
  return {
    id: row.id,
    contentSummary: row.contentSummary,
    score: row.score,
    topicId: row.topicId,
    opportunityId: row.opportunityId,
    status: row.status,
    createdAt: row.createdAt,
  };
}

/** JsonLdNode에서 label 추출 (dx:label → dx:name → @id 순) */
function extractLabel(node: JsonLdNode): string {
  if (typeof node["dx:label"] === "string") return node["dx:label"];
  if (typeof node["dx:name"] === "string") return node["dx:name"];
  return node["@id"];
}
