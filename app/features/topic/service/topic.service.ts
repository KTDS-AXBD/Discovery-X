import { eq, and, like, sql } from "drizzle-orm";
import type { DB } from "~/db";
import { topics, topicMembers } from "~/features/topic/db/schema";
import type { Topic, TopicMember } from "~/features/topic/db/schema";
import { users } from "~/db";
import { GraphStore } from "~/lib/graph/store";
import { GraphQueryEngine } from "~/lib/graph/query";
import type { JsonLdNode, JsonLdGraph, PendingSuggestion } from "~/lib/graph/types";
import { NotFoundError } from "~/lib/errors";

// ============================================================================
// Types
// ============================================================================

interface CreateTopicInput {
  teamId: string;
  name: string;
  description?: string;
  createdBy: string;
}

interface UpdateTopicInput {
  name?: string;
  description?: string | null;
}

interface TopicMemberWithUser {
  userId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: Date;
}

interface TopicDetail {
  topic: Topic;
  members: TopicMemberWithUser[];
}

type TopicRole = "owner" | "editor" | "viewer";

interface CreateDecisionInput {
  summary: string;
  date?: string;
  context?: string;
  decidedBy?: string;
}

interface UpdateDecisionInput {
  summary?: string;
  date?: string;
  context?: string;
  decidedBy?: string;
}

interface CreateGlossaryInput {
  term: string;
  definition: string;
}

interface UpdateGlossaryInput {
  term?: string;
  definition?: string;
}

interface TopicListItem {
  id: string;
  name: string;
  status: string;
  memberCount: number;
}

interface UserSearchResult {
  id: string;
  name: string;
  email: string;
}

// ============================================================================
// Service
// ============================================================================

export class TopicService {
  constructor(private db: DB) {}

  /**
   * Topic 목록 조회
   */
  async list(
    teamId: string,
    opts?: { status?: string; limit?: number },
  ): Promise<Topic[]> {
    const conditions = [eq(topics.teamId, teamId)];
    if (opts?.status) {
      conditions.push(eq(topics.status, opts.status));
    }

    const result = await this.db
      .select()
      .from(topics)
      .where(and(...conditions))
      .limit(opts?.limit ?? 50);

    return result;
  }

  /**
   * Topic 상세 조회 (멤버 포함)
   */
  async getById(id: string): Promise<TopicDetail | null> {
    const topic = await this.db.query.topics.findFirst({
      where: eq(topics.id, id),
    });
    if (!topic) return null;

    const members = await this.getMembers(id);
    return { topic, members };
  }

  /**
   * Topic 생성 — 생성자를 owner로 자동 추가
   */
  async create(data: CreateTopicInput): Promise<Topic> {
    const id = crypto.randomUUID();

    await this.db.insert(topics).values({
      id,
      teamId: data.teamId,
      name: data.name,
      description: data.description ?? null,
      createdBy: data.createdBy,
    });

    // 생성자를 owner로 자동 추가
    await this.db.insert(topicMembers).values({
      topicId: id,
      userId: data.createdBy,
      role: "owner",
    });

    const created = await this.db.query.topics.findFirst({
      where: eq(topics.id, id),
    });
    return created!;
  }

  /**
   * Topic 수정 (name, description)
   */
  async update(id: string, data: UpdateTopicInput): Promise<Topic> {
    const existing = await this.db.query.topics.findFirst({
      where: eq(topics.id, id),
    });
    if (!existing) {
      throw new NotFoundError("Topic", id);
    }

    await this.db
      .update(topics)
      .set({
        ...(data.name !== undefined && { name: data.name }),
        ...(data.description !== undefined && { description: data.description }),
        updatedAt: new Date(),
      })
      .where(eq(topics.id, id));

    const updated = await this.db.query.topics.findFirst({
      where: eq(topics.id, id),
    });
    return updated!;
  }

  /**
   * Topic 아카이브 (status → 'archived')
   */
  async archive(id: string): Promise<void> {
    const existing = await this.db.query.topics.findFirst({
      where: eq(topics.id, id),
    });
    if (!existing) {
      throw new NotFoundError("Topic", id);
    }

    await this.db
      .update(topics)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(topics.id, id));
  }

  // ============================================================================
  // 멤버 관리
  // ============================================================================

  /**
   * 멤버 추가
   */
  async addMember(
    topicId: string,
    userId: string,
    role: TopicRole = "editor",
  ): Promise<void> {
    await this.db.insert(topicMembers).values({
      topicId,
      userId,
      role,
    });
  }

  /**
   * 멤버 제거
   */
  async removeMember(topicId: string, userId: string): Promise<void> {
    await this.db
      .delete(topicMembers)
      .where(
        and(
          eq(topicMembers.topicId, topicId),
          eq(topicMembers.userId, userId),
        ),
      );
  }

  /**
   * 멤버 역할 변경
   */
  async updateMemberRole(
    topicId: string,
    userId: string,
    role: TopicRole,
  ): Promise<void> {
    await this.db
      .update(topicMembers)
      .set({ role })
      .where(
        and(
          eq(topicMembers.topicId, topicId),
          eq(topicMembers.userId, userId),
        ),
      );
  }

  /**
   * 멤버 목록 조회 (users JOIN)
   */
  async getMembers(topicId: string): Promise<TopicMemberWithUser[]> {
    const rows = await this.db
      .select({
        userId: topicMembers.userId,
        name: users.name,
        email: users.email,
        role: topicMembers.role,
        joinedAt: topicMembers.joinedAt,
      })
      .from(topicMembers)
      .innerJoin(users, eq(topicMembers.userId, users.id))
      .where(eq(topicMembers.topicId, topicId));

    return rows;
  }

  /**
   * 멤버 단건 조회
   */
  async getMember(
    topicId: string,
    userId: string,
  ): Promise<TopicMember | null> {
    const member = await this.db.query.topicMembers.findFirst({
      where: and(
        eq(topicMembers.topicId, topicId),
        eq(topicMembers.userId, userId),
      ),
    });
    return member ?? null;
  }

  // ============================================================================
  // Topic 목록 (사용자별)
  // ============================================================================

  /**
   * 사용자가 참여 중인 Topic 목록 (멤버 수 포함)
   */
  async listForUser(userId: string): Promise<TopicListItem[]> {
    return this.db
      .select({
        id: topics.id,
        name: topics.name,
        status: topics.status,
        memberCount: sql<number>`count(${topicMembers.userId})`.as(
          "member_count",
        ),
      })
      .from(topics)
      .innerJoin(topicMembers, eq(topicMembers.topicId, topics.id))
      .where(eq(topicMembers.userId, userId))
      .groupBy(topics.id)
      .orderBy(topics.name);
  }

  // ============================================================================
  // 사용자 검색
  // ============================================================================

  /**
   * 이메일로 사용자 검색
   */
  async searchUsers(
    query: string,
    limit = 5,
  ): Promise<UserSearchResult[]> {
    return this.db
      .select({ id: users.id, name: users.name, email: users.email })
      .from(users)
      .where(like(users.email, `%${query}%`))
      .limit(limit);
  }

  // ============================================================================
  // Decisions (Graph 기반)
  // ============================================================================

  /**
   * Decision 목록 조회
   */
  async listDecisions(topicId: string): Promise<JsonLdNode[]> {
    const query = new GraphQueryEngine(this.db);
    return query.findByType("topic", topicId, "dx:Decision");
  }

  /**
   * Decision 생성 — Graph가 없으면 자동 생성
   */
  async createDecision(
    topicId: string,
    data: CreateDecisionInput,
    actorId: string,
  ): Promise<JsonLdNode> {
    const store = new GraphStore(this.db);
    const audit = { actorId, actorType: "user" as const };
    const graph = await this.getOrCreateGraph(store, topicId, audit);

    const nodeId = `dx:decision-${crypto.randomUUID()}`;
    const newNode: JsonLdNode = {
      "@id": nodeId,
      "@type": "dx:Decision",
      "dx:summary": data.summary,
      ...(data.date && { "dx:date": data.date }),
      ...(data.context && { "dx:context": data.context }),
      ...(data.decidedBy && { "dx:decidedBy": data.decidedBy }),
      "dx:createdBy": actorId,
      "dx:createdAt": new Date().toISOString(),
    };

    const updatedJsonld: JsonLdGraph = {
      ...graph.jsonld,
      "@graph": [...graph.jsonld["@graph"], newNode],
    };

    await store.update(graph.id, updatedJsonld, "결정 추가", audit);
    return newNode;
  }

  /**
   * Decision 수정
   */
  async updateDecision(
    topicId: string,
    decisionId: string,
    data: UpdateDecisionInput,
    actorId: string,
  ): Promise<JsonLdNode> {
    const { store, graph, nodes, targetIdx } = await this.findGraphNode(
      topicId,
      decisionId,
      "dx:Decision",
      "Decision",
    );
    const audit = { actorId, actorType: "user" as const };

    const updated = { ...nodes[targetIdx] };
    if (data.summary !== undefined) updated["dx:summary"] = data.summary;
    if (data.date !== undefined) updated["dx:date"] = data.date;
    if (data.context !== undefined) updated["dx:context"] = data.context;
    if (data.decidedBy !== undefined) updated["dx:decidedBy"] = data.decidedBy;
    updated["dx:updatedAt"] = new Date().toISOString();

    const updatedNodes = [...nodes];
    updatedNodes[targetIdx] = updated;

    const updatedJsonld: JsonLdGraph = {
      ...graph.jsonld,
      "@graph": updatedNodes,
    };

    await store.update(graph.id, updatedJsonld, "결정 수정", audit);
    return updated;
  }

  /**
   * Decision 삭제
   */
  async deleteDecision(
    topicId: string,
    decisionId: string,
    actorId: string,
  ): Promise<void> {
    const { store, graph, nodes } = await this.findGraphNode(
      topicId,
      decisionId,
      "dx:Decision",
      "Decision",
    );
    const audit = { actorId, actorType: "user" as const };

    const filteredNodes = nodes.filter(
      (n) => !(n["@id"] === decisionId && n["@type"] === "dx:Decision"),
    );

    const updatedJsonld: JsonLdGraph = {
      ...graph.jsonld,
      "@graph": filteredNodes,
    };

    await store.update(graph.id, updatedJsonld, "결정 삭제", audit);
  }

  // ============================================================================
  // Glossary (Graph 기반)
  // ============================================================================

  /**
   * Glossary 목록 조회
   */
  async listGlossary(topicId: string): Promise<JsonLdNode[]> {
    const query = new GraphQueryEngine(this.db);
    return query.findByType("topic", topicId, "dx:Glossary");
  }

  /**
   * Glossary 용어 생성
   */
  async createGlossaryTerm(
    topicId: string,
    data: CreateGlossaryInput,
    actorId: string,
  ): Promise<JsonLdNode> {
    const store = new GraphStore(this.db);
    const audit = { actorId, actorType: "user" as const };
    const graph = await this.getOrCreateGraph(store, topicId, audit);

    const nodeId = `dx:glossary-${crypto.randomUUID()}`;
    const newNode: JsonLdNode = {
      "@id": nodeId,
      "@type": "dx:Glossary",
      "dx:term": data.term,
      "dx:definition": data.definition,
      "dx:createdBy": actorId,
      "dx:createdAt": new Date().toISOString(),
    };

    const updatedJsonld: JsonLdGraph = {
      ...graph.jsonld,
      "@graph": [...graph.jsonld["@graph"], newNode],
    };

    await store.update(graph.id, updatedJsonld, "용어 추가", audit);
    return newNode;
  }

  /**
   * Glossary 용어 수정
   */
  async updateGlossaryTerm(
    topicId: string,
    termId: string,
    data: UpdateGlossaryInput,
    actorId: string,
  ): Promise<JsonLdNode> {
    const { store, graph, nodes, targetIdx } = await this.findGraphNode(
      topicId,
      termId,
      "dx:Glossary",
      "용어",
    );
    const audit = { actorId, actorType: "user" as const };

    const updated = { ...nodes[targetIdx] };
    if (data.term !== undefined) updated["dx:term"] = data.term;
    if (data.definition !== undefined)
      updated["dx:definition"] = data.definition;
    updated["dx:updatedAt"] = new Date().toISOString();

    const updatedNodes = [...nodes];
    updatedNodes[targetIdx] = updated;

    const updatedJsonld: JsonLdGraph = {
      ...graph.jsonld,
      "@graph": updatedNodes,
    };

    await store.update(graph.id, updatedJsonld, "용어 수정", audit);
    return updated;
  }

  /**
   * Glossary 용어 삭제
   */
  async deleteGlossaryTerm(
    topicId: string,
    termId: string,
    actorId: string,
  ): Promise<void> {
    const { store, graph, nodes } = await this.findGraphNode(
      topicId,
      termId,
      "dx:Glossary",
      "용어",
    );
    const audit = { actorId, actorType: "user" as const };

    const filteredNodes = nodes.filter(
      (n) => !(n["@id"] === termId && n["@type"] === "dx:Glossary"),
    );

    const updatedJsonld: JsonLdGraph = {
      ...graph.jsonld,
      "@graph": filteredNodes,
    };

    await store.update(graph.id, updatedJsonld, "용어 삭제", audit);
  }

  // ============================================================================
  // Suggestions (Graph 기반)
  // ============================================================================

  /**
   * 미처리 제안 목록 조회
   */
  async listSuggestions(topicId: string): Promise<PendingSuggestion[]> {
    const store = new GraphStore(this.db);
    const graph = await store.getByScopeId("topic", topicId);
    if (!graph) return [];
    return store.getPendingSuggestions(graph.id);
  }

  /**
   * 제안 승인
   */
  async approveSuggestion(
    topicId: string,
    suggestionId: number,
    actorId: string,
  ): Promise<void> {
    const store = new GraphStore(this.db);
    const graph = await store.getByScopeId("topic", topicId);
    if (!graph) {
      throw new NotFoundError("Graph", topicId);
    }
    const audit = { actorId, actorType: "user" as const };
    await store.approveSuggestion(graph.id, suggestionId, audit);
  }

  /**
   * 제안 거절
   */
  async rejectSuggestion(
    topicId: string,
    suggestionId: number,
    reason: string | undefined,
    actorId: string,
  ): Promise<void> {
    const store = new GraphStore(this.db);
    const graph = await store.getByScopeId("topic", topicId);
    if (!graph) {
      throw new NotFoundError("Graph", topicId);
    }
    const audit = { actorId, actorType: "user" as const };
    await store.rejectSuggestion(graph.id, suggestionId, reason, audit);
  }

  // ============================================================================
  // Events (Graph 기반)
  // ============================================================================

  /**
   * Topic Graph 변경 이력 조회
   */
  async listEvents(topicId: string, limit = 50) {
    const store = new GraphStore(this.db);
    const graph = await store.getByScopeId("topic", topicId);
    if (!graph) return [];
    return store.getHistory(graph.id, limit);
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  /**
   * Topic Graph 조회 또는 생성
   */
  private async getOrCreateGraph(
    store: GraphStore,
    topicId: string,
    audit: { actorId: string; actorType: "user" },
  ) {
    let graph = await store.getByScopeId("topic", topicId);
    if (!graph) {
      graph = await store.create(
        {
          scopeType: "topic",
          scopeId: topicId,
          jsonld: {
            "@context": { dx: "https://discovery-x.dev/ns/" },
            "@graph": [],
          },
          contentHash: "",
        },
        audit,
      );
    }
    return graph;
  }

  /**
   * Graph 내 특정 노드 검색 (수정/삭제용)
   */
  private async findGraphNode(
    topicId: string,
    nodeId: string,
    nodeType: string,
    label: string,
  ) {
    const store = new GraphStore(this.db);
    const graph = await store.getByScopeId("topic", topicId);
    if (!graph) {
      throw new NotFoundError("Graph", topicId);
    }

    const nodes = graph.jsonld["@graph"];
    const targetIdx = nodes.findIndex(
      (n) => n["@id"] === nodeId && n["@type"] === nodeType,
    );

    if (targetIdx === -1) {
      throw new NotFoundError(label, nodeId);
    }

    return { store, graph, nodes, targetIdx };
  }
}
