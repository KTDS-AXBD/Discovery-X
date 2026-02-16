// === Scope 관련 ===
export type ScopeType = "user" | "topic" | "org";

export interface ScopeFilter {
  scopeType: ScopeType;
  scopeId: string;
}

// === JSON-LD 관련 ===
export interface JsonLdNode {
  "@id": string;
  "@type": string;
  [key: string]: unknown;
}

export interface JsonLdGraph {
  "@context": Record<string, unknown>;
  "@graph": JsonLdNode[];
}

// === Graph 엔티티 ===
export interface GraphRecord {
  id: string;
  scopeType: ScopeType;
  scopeId: string;
  jsonld: JsonLdGraph;
  version: number;
  contentHash: string;
  createdAt: Date;
  updatedAt: Date;
}

// === Graph Event (감사) ===
export type ActorType = "user" | "agent" | "system";
export type GraphAction =
  | "create"
  | "update"
  | "delete"
  | "rollback"
  | "suggest";

export interface GraphEvent {
  id: number;
  graphId: string;
  actorId: string;
  actorType: ActorType;
  action: GraphAction;
  diffJson?: string;
  reason?: string;
  prevVersion?: number;
  newVersion?: number;
  createdAt: Date;
}

// === Projection ===
export type ProjectionType =
  | "USER.md"
  | "TOPIC.md"
  | "BRIEFING.md"
  | "SOUL.md";

export interface Projection {
  id: string;
  scopeType: ScopeType;
  scopeId: string;
  projType: ProjectionType;
  content: string;
  sourceHash: string;
  graphVersion: number;
  generatedAt: Date;
}

// === Query ===
export interface SearchResult {
  node: JsonLdNode;
  score: number;
  source: ScopeFilter;
}

// === Enrichment 제안 ===
export interface EnrichmentSuggestion {
  nodes?: JsonLdNode[];
  reason: string;
}

export interface PendingSuggestion {
  id: number;
  enrichment: EnrichmentSuggestion;
  actorId: string;
  createdAt: Date;
}

// === 감사 컨텍스트 ===
export interface AuditContext {
  actorId?: string;
  actorType?: ActorType;
}

// === Graph Store 인터페이스 ===
export interface GraphStoreInterface {
  get(id: string): Promise<GraphRecord | null>;
  getByScopeId(
    scopeType: ScopeType,
    scopeId: string,
  ): Promise<GraphRecord | null>;
  create(
    record: Omit<GraphRecord, "id" | "version" | "createdAt" | "updatedAt">,
    audit?: AuditContext,
  ): Promise<GraphRecord>;
  update(
    id: string,
    jsonld: JsonLdGraph,
    reason?: string,
    audit?: AuditContext,
  ): Promise<GraphRecord>;
  delete(id: string, audit?: AuditContext): Promise<void>;
  suggest(
    graphId: string,
    enrichment: EnrichmentSuggestion,
    audit?: AuditContext,
  ): Promise<void>;
  getPendingSuggestions(graphId: string): Promise<PendingSuggestion[]>;
}

// === Query Engine 인터페이스 ===
export interface GraphQueryEngineInterface {
  get(graphId: string, nodeId: string): Promise<JsonLdNode | null>;
  traverse(
    startId: string,
    relation: string,
    depth?: number,
  ): Promise<JsonLdNode[]>;
  findByType(
    scopeType: ScopeType,
    scopeId: string,
    type: string,
  ): Promise<JsonLdNode[]>;
  extractPath(graphId: string, path: string): Promise<unknown>;
  semanticSearch(
    query: string,
    scopeFilter?: ScopeFilter,
  ): Promise<SearchResult[]>;
}
