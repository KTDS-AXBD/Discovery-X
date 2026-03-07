/**
 * Ontology Graph tool schemas
 * 엔티티 추출/연결, 그래프 조회, 중복 검토, 패턴/모순/클러스터/중심성 분석, 시나리오 시뮬레이션
 */
import type { ClaudeTool } from "~/lib/ai";

export const ONTOLOGY_TOOLS: ClaudeTool[] = [
  // === Ontology Graph Tools (v3 R2) ===
  {
    name: "extract_entities",
    description: "Discovery의 Evidence에서 엔티티를 추출하여 맥락 그래프 노드를 생성합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "entities"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        entities: {
          type: "array",
          items: {
            type: "object",
            required: ["label", "ontologyTypeId"],
            properties: {
              label: { type: "string", description: "엔티티 이름" },
              ontologyTypeId: { type: "string", description: "온톨로지 타입 ID (ONT-01~ONT-10)" },
              sourceEvidenceId: { type: "string", description: "출처 Evidence ID (선택)" },
              metadata: { type: "object", description: "추가 속성 (선택)" },
            },
          },
          description: "추출된 엔티티 목록",
        },
      },
    },
  },
  {
    name: "link_entities",
    description: "맥락 그래프에서 두 노드를 관계로 연결합니다. 동일 Discovery 소속만 가능.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "fromNodeId", "toNodeId", "relationType"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        fromNodeId: { type: "string", description: "출발 노드 ID" },
        toNodeId: { type: "string", description: "도착 노드 ID" },
        relationType: {
          type: "string",
          enum: ["supports", "contradicts", "causes", "relates_to", "depends_on"],
          description: "관계 타입",
        },
        strength: { type: "number", description: "관계 강도 0~1 (기본 1.0)" },
        sourceEvidenceId: { type: "string", description: "출처 Evidence ID (선택)" },
      },
    },
  },
  {
    name: "query_graph",
    description: "Discovery의 맥락 그래프(노드+엣지+통계)를 조회합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        ontologyTypeId: { type: "string", description: "온톨로지 타입 필터 (선택)" },
      },
    },
  },
  {
    name: "get_duplicate_queue",
    description: "미검토 근거 중복 후보 목록을 조회합니다 (유사도순 정렬).",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "최대 결과 수 (기본 20)" },
      },
    },
  },
  {
    name: "review_duplicate",
    description: "근거 중복 후보를 검토합니다 (병합 또는 무시).",
    input_schema: {
      type: "object",
      required: ["candidateId", "decision"],
      properties: {
        candidateId: { type: "string", description: "중복 후보 ID" },
        decision: {
          type: "string",
          enum: ["merge", "ignore"],
          description: "검토 결정",
        },
        mergeTargetId: { type: "string", description: "병합 시 유지할 Evidence ID (선택)" },
      },
    },
  },
  {
    name: "analyze_patterns",
    description: "글로벌 온톨로지 그래프에서 반복되는 관계 패턴을 감지합니다.",
    input_schema: {
      type: "object",
      required: ["tenantId"],
      properties: {
        tenantId: { type: "string", description: "테넌트 ID" },
      },
    },
  },
  {
    name: "analyze_contradictions",
    description: "온톨로지 그래프에서 모순되는 관계(supports vs contradicts)를 감지합니다.",
    input_schema: {
      type: "object",
      required: ["tenantId"],
      properties: {
        tenantId: { type: "string", description: "테넌트 ID" },
      },
    },
  },
  {
    name: "analyze_clusters",
    description: "온톨로지 그래프의 노드 클러스터(밀집 연결 그룹)를 분석합니다.",
    input_schema: {
      type: "object",
      required: ["tenantId"],
      properties: {
        tenantId: { type: "string", description: "테넌트 ID" },
      },
    },
  },
  {
    name: "analyze_centrality",
    description: "온톨로지 그래프에서 중심성이 높은 핵심 노드를 분석합니다.",
    input_schema: {
      type: "object",
      required: ["tenantId"],
      properties: {
        tenantId: { type: "string", description: "테넌트 ID" },
      },
    },
  },
  {
    name: "simulate_scenario",
    description: "특정 엔티티의 변화가 온톨로지 그래프에 미치는 영향을 시뮬레이션합니다. 영향도 전파 + LLM 시나리오 생성.",
    input_schema: {
      type: "object",
      required: ["tenantId", "sourceNodeId", "question"],
      properties: {
        tenantId: { type: "string", description: "테넌트 ID" },
        sourceNodeId: { type: "string", description: "변화의 시작점이 되는 엔티티 노드 ID" },
        magnitude: { type: "number", description: "변화 강도 (0.0~1.0, 기본 1.0)" },
        question: { type: "string", description: "시뮬레이션 질문 (예: 'ESG 시장이 30% 성장하면?')" },
      },
    },
  },
];
