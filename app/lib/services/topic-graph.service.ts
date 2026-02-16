import type { DB } from "~/db";
import { GraphStore } from "~/lib/graph/store";
import { ProjectionBuilder } from "~/lib/graph/projection";
import type {
  JsonLdGraph,
  JsonLdNode,
  GraphEvent as GraphEventType,
  ScopeType,
} from "~/lib/graph/types";
import { ActorType } from "~/lib/types/enums";

// ============================================================================
// Types
// ============================================================================

interface DecisionInput {
  summary: string;
  date?: string; // YYYY-MM-DD, 기본값 오늘
  context?: string;
  decidedBy?: string;
}

interface GlossaryInput {
  term: string;
  definition: string;
}

const TOPIC_SCOPE: ScopeType = "topic";

// ============================================================================
// TopicGraphService — Topic Graph JSON-LD 노드 CRUD
// ============================================================================

export class TopicGraphService {
  private store: GraphStore;
  private projBuilder: ProjectionBuilder;

  constructor(db: DB) {
    this.store = new GraphStore(db);
    this.projBuilder = new ProjectionBuilder(db);
  }

  // ─── Topic Graph 조회 또는 초기화 ──────────────────────────────────

  private async getOrCreateTopicGraph(
    topicId: string,
    actorId?: string,
  ): Promise<{ graphId: string; jsonld: JsonLdGraph }> {
    const existing = await this.store.getByScopeId(TOPIC_SCOPE, topicId);
    if (existing) {
      return { graphId: existing.id, jsonld: existing.jsonld };
    }

    // 빈 Topic Graph 생성
    const jsonld: JsonLdGraph = {
      "@context": {
        dx: "https://discovery-x.app/ns/",
        schema: "https://schema.org/",
      },
      "@graph": [
        {
          "@id": `dx:topic/${topicId}`,
          "@type": "dx:Topic",
          "dx:name": "",
        },
      ],
    };

    const created = await this.store.create(
      {
        scopeType: TOPIC_SCOPE,
        scopeId: topicId,
        jsonld,
        contentHash: "", // computeContentHash가 create 내부에서 처리
      },
      { actorId: actorId ?? "system", actorType: actorId ? ActorType.USER : ActorType.SYSTEM },
    );

    return { graphId: created.id, jsonld: created.jsonld };
  }

  // ─── Decision CRUD ─────────────────────────────────────────────────

  /** Decision 노드 추가 */
  async addDecision(
    topicId: string,
    input: DecisionInput,
    actorId: string,
  ): Promise<JsonLdNode> {
    const { graphId, jsonld } = await this.getOrCreateTopicGraph(topicId, actorId);

    const decisionId = crypto.randomUUID();
    const newNode: JsonLdNode = {
      "@id": `dx:topic/${topicId}/decision/${decisionId}`,
      "@type": "dx:Decision",
      "dx:summary": input.summary,
      "dx:date": input.date ?? new Date().toISOString().slice(0, 10),
      ...(input.decidedBy && { "dx:decidedBy": input.decidedBy }),
      ...(input.context && { "dx:context": input.context }),
    };

    jsonld["@graph"].push(newNode);

    await this.store.update(graphId, jsonld, "결정 추가", {
      actorId,
      actorType: ActorType.USER,
    });
    await this.projBuilder.syncProjection(TOPIC_SCOPE, topicId);

    return newNode;
  }

  /** Decision 노드 목록 조회 */
  async getDecisions(topicId: string): Promise<JsonLdNode[]> {
    const existing = await this.store.getByScopeId(TOPIC_SCOPE, topicId);
    if (!existing) return [];

    return existing.jsonld["@graph"].filter(
      (n) => n["@type"] === "dx:Decision",
    );
  }

  /** Decision 노드 수정 */
  async updateDecision(
    topicId: string,
    decisionId: string,
    input: Partial<DecisionInput>,
    actorId: string,
  ): Promise<JsonLdNode> {
    const { graphId, jsonld } = await this.getOrCreateTopicGraph(topicId, actorId);

    const nodeIndex = jsonld["@graph"].findIndex(
      (n) => n["@id"] === decisionId && n["@type"] === "dx:Decision",
    );
    if (nodeIndex === -1) {
      throw new Error(`Decision 노드를 찾을 수 없습니다: ${decisionId}`);
    }

    const node = jsonld["@graph"][nodeIndex];
    if (input.summary !== undefined) node["dx:summary"] = input.summary;
    if (input.date !== undefined) node["dx:date"] = input.date;
    if (input.decidedBy !== undefined) node["dx:decidedBy"] = input.decidedBy;
    if (input.context !== undefined) node["dx:context"] = input.context;

    await this.store.update(graphId, jsonld, "결정 수정", {
      actorId,
      actorType: ActorType.USER,
    });
    await this.projBuilder.syncProjection(TOPIC_SCOPE, topicId);

    return node;
  }

  /** Decision 노드 삭제 */
  async removeDecision(
    topicId: string,
    decisionId: string,
    actorId: string,
  ): Promise<void> {
    const { graphId, jsonld } = await this.getOrCreateTopicGraph(topicId, actorId);

    const before = jsonld["@graph"].length;
    jsonld["@graph"] = jsonld["@graph"].filter(
      (n) => !(n["@id"] === decisionId && n["@type"] === "dx:Decision"),
    );

    if (jsonld["@graph"].length === before) {
      throw new Error(`Decision 노드를 찾을 수 없습니다: ${decisionId}`);
    }

    await this.store.update(graphId, jsonld, "결정 삭제", {
      actorId,
      actorType: ActorType.USER,
    });
    await this.projBuilder.syncProjection(TOPIC_SCOPE, topicId);
  }

  // ─── Glossary CRUD ─────────────────────────────────────────────────

  /** Glossary 노드 추가 */
  async addGlossaryTerm(
    topicId: string,
    input: GlossaryInput,
    actorId: string,
  ): Promise<JsonLdNode> {
    const { graphId, jsonld } = await this.getOrCreateTopicGraph(topicId, actorId);

    const termId = crypto.randomUUID();
    const newNode: JsonLdNode = {
      "@id": `dx:topic/${topicId}/glossary/${termId}`,
      "@type": "dx:Glossary",
      "dx:term": input.term,
      "dx:definition": input.definition,
    };

    jsonld["@graph"].push(newNode);

    await this.store.update(graphId, jsonld, "용어 추가", {
      actorId,
      actorType: ActorType.USER,
    });
    await this.projBuilder.syncProjection(TOPIC_SCOPE, topicId);

    return newNode;
  }

  /** Glossary 노드 목록 조회 */
  async getGlossary(topicId: string): Promise<JsonLdNode[]> {
    const existing = await this.store.getByScopeId(TOPIC_SCOPE, topicId);
    if (!existing) return [];

    return existing.jsonld["@graph"].filter(
      (n) => n["@type"] === "dx:Glossary",
    );
  }

  /** Glossary 노드 수정 */
  async updateGlossaryTerm(
    topicId: string,
    termId: string,
    input: Partial<GlossaryInput>,
    actorId: string,
  ): Promise<JsonLdNode> {
    const { graphId, jsonld } = await this.getOrCreateTopicGraph(topicId, actorId);

    const nodeIndex = jsonld["@graph"].findIndex(
      (n) => n["@id"] === termId && n["@type"] === "dx:Glossary",
    );
    if (nodeIndex === -1) {
      throw new Error(`Glossary 노드를 찾을 수 없습니다: ${termId}`);
    }

    const node = jsonld["@graph"][nodeIndex];
    if (input.term !== undefined) node["dx:term"] = input.term;
    if (input.definition !== undefined) node["dx:definition"] = input.definition;

    await this.store.update(graphId, jsonld, "용어 수정", {
      actorId,
      actorType: ActorType.USER,
    });
    await this.projBuilder.syncProjection(TOPIC_SCOPE, topicId);

    return node;
  }

  /** Glossary 노드 삭제 */
  async removeGlossaryTerm(
    topicId: string,
    termId: string,
    actorId: string,
  ): Promise<void> {
    const { graphId, jsonld } = await this.getOrCreateTopicGraph(topicId, actorId);

    const before = jsonld["@graph"].length;
    jsonld["@graph"] = jsonld["@graph"].filter(
      (n) => !(n["@id"] === termId && n["@type"] === "dx:Glossary"),
    );

    if (jsonld["@graph"].length === before) {
      throw new Error(`Glossary 노드를 찾을 수 없습니다: ${termId}`);
    }

    await this.store.update(graphId, jsonld, "용어 삭제", {
      actorId,
      actorType: ActorType.USER,
    });
    await this.projBuilder.syncProjection(TOPIC_SCOPE, topicId);
  }

  // ─── Graph Events 조회 (감사 로그) ─────────────────────────────────

  /** Topic에 연결된 Graph의 감사 이벤트 조회 */
  async getGraphEvents(
    topicId: string,
    limit?: number,
  ): Promise<GraphEventType[]> {
    const existing = await this.store.getByScopeId(TOPIC_SCOPE, topicId);
    if (!existing) return [];

    return this.store.getHistory(existing.id, limit);
  }
}
