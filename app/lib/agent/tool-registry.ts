/**
 * Tool registry: defines all tools available to the Agent as Claude function calling schemas.
 * v3: 11-stage pipeline + 2 new tools (get_stage_info, validate_evidence)
 */

import type { ClaudeTool } from "./claude-client";
import { ALL_STATUSES } from "~/lib/constants/status";

// Minimum autonomy level required to use each tool
export const TOOL_MIN_AUTONOMY: Record<string, number> = {
  // Level 1: read-only queries
  list_discoveries: 1,
  get_discovery_detail: 1,
  search_similar: 1,
  get_metrics: 1,
  get_radar_items: 1,
  get_weekly_review: 1,
  get_recall_queue: 1,
  list_users: 1,
  get_stage_info: 1,
  validate_evidence: 1,
  list_method_packs: 1,
  get_gate_package: 1,
  // Level 2: create + promote
  recommend_methods: 2,
  draft_gate_package: 2,
  create_discovery: 2,
  update_discovery: 2,
  promote_discovery: 2,
  transition_stage: 2,
  // Level 3: full autonomy
  add_experiment: 3,
  complete_experiment: 3,
  add_evidence: 3,
  decide_gate: 3,
  decide_hold: 3,
  decide_drop: 3,
  request_extension: 3,
  start_method_run: 3,
  complete_method_run: 3,
};

export function getToolsForAutonomyLevel(level: number): ClaudeTool[] {
  if (level <= 0) return [];
  return AGENT_TOOLS.filter((tool) => {
    const minLevel = TOOL_MIN_AUTONOMY[tool.name] ?? 3;
    return minLevel <= level;
  });
}

export const AGENT_TOOLS: ClaudeTool[] = [
  // === Discovery Management ===
  {
    name: "create_discovery",
    description: "새 Discovery를 DISCOVERY 상태로 생성합니다.",
    input_schema: {
      type: "object",
      required: ["title", "seedSummary", "sourceType"],
      properties: {
        title: { type: "string", description: "Discovery 제목 (80자 이내)", maxLength: 80 },
        seedSummary: { type: "string", description: "Seed 요약 (400자 이내)", maxLength: 400 },
        seedLinks: { type: "array", items: { type: "string" }, description: "관련 링크 목록" },
        sourceType: {
          type: "string",
          enum: ["article", "issue", "internal_pain", "meeting_note", "other"],
          description: "소스 유형",
        },
      },
    },
  },
  {
    name: "update_discovery",
    description: "기존 Discovery의 제목, 요약, 링크, Reviewer를 수정합니다. DISCOVERY/IDEA_CARD 상태만 가능.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        title: { type: "string", description: "새 제목 (80자 이내)", maxLength: 80 },
        seedSummary: { type: "string", description: "새 Seed 요약 (400자 이내)", maxLength: 400 },
        seedLinks: { type: "array", items: { type: "string" }, description: "새 관련 링크 목록" },
        reviewerId: { type: "string", description: "Reviewer 사용자 ID" },
      },
    },
  },
  {
    name: "promote_discovery",
    description: "DISCOVERY를 IDEA_CARD 상태로 승격합니다. Owner 지정 + 첫 실험 설계 필수.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "ownerId", "hypothesis", "minimalAction", "deadline", "expectedEvidence"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        ownerId: { type: "string", description: "Owner 사용자 ID" },
        hypothesis: { type: "string", description: "가설 (200자 이내)", maxLength: 200 },
        minimalAction: { type: "string", description: "최소 행동 (200자 이내)", maxLength: 200 },
        deadline: { type: "string", description: "실험 기한 (ISO 8601 날짜)" },
        expectedEvidence: { type: "string", description: "예상 근거 (200자 이내)", maxLength: 200 },
      },
    },
  },
  {
    name: "transition_stage",
    description: "Discovery를 11단계 파이프라인 내 다른 단계로 전환합니다. 허용된 전환만 가능.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "toStatus"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        toStatus: {
          type: "string",
          enum: ALL_STATUSES,
          description: "전환할 목표 단계",
        },
        rationale: { type: "string", description: "전환 사유" },
      },
    },
  },
  {
    name: "add_experiment",
    description: "Discovery에 실험을 추가합니다 (최대 2개).",
    input_schema: {
      type: "object",
      required: ["discoveryId", "hypothesis", "minimalAction", "deadline", "expectedEvidence"],
      properties: {
        discoveryId: { type: "string" },
        hypothesis: { type: "string", maxLength: 200 },
        minimalAction: { type: "string", maxLength: 200 },
        deadline: { type: "string", description: "ISO 8601 날짜" },
        expectedEvidence: { type: "string", maxLength: 200 },
      },
    },
  },
  {
    name: "complete_experiment",
    description: "실험을 완료하고 결과를 기록합니다.",
    input_schema: {
      type: "object",
      required: ["experimentId", "resultSummary"],
      properties: {
        experimentId: { type: "string" },
        resultSummary: { type: "string", description: "결과 요약 (400자 이내)", maxLength: 400 },
      },
    },
  },
  {
    name: "add_evidence",
    description: "Discovery에 근거를 추가합니다. reliabilityLabel과 출처(sourceUrl 또는 linkOrAttachment) 필수.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "type", "strength", "content", "reliabilityLabel"],
      properties: {
        discoveryId: { type: "string" },
        type: { type: "string", enum: ["DATA", "USER", "ARTIFACT", "REF", "ASSUMPTION"] },
        strength: { type: "string", enum: ["A", "B", "C", "D"] },
        content: { type: "string", maxLength: 400 },
        reliabilityLabel: { type: "string", enum: ["confirmed", "reported", "hypothesis"], description: "신뢰도 라벨" },
        linkOrAttachment: { type: "string", description: "URL (선택)" },
        sourceUrl: { type: "string", description: "출처 URL (선택, linkOrAttachment와 중 하나 필수)" },
        publishedOrObservedDate: { type: "string", description: "발행/관측일 (YYYY-MM-DD, Gate 통과에 필요)" },
        experimentId: { type: "string", description: "연결할 실험 ID (선택)" },
      },
    },
  },

  // === Decision Tools ===
  {
    name: "decide_gate",
    description: "Discovery를 Gate 단계(GATE1/GATE2)로 전환합니다. A/B급 증거 2개 이상 권장.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "decisionRationale"],
      properties: {
        discoveryId: { type: "string" },
        decisionRationale: { type: "string", description: "결정 근거 (400자 이내)", maxLength: 400 },
        gateType: { type: "string", enum: ["GATE1", "GATE2"], description: "Gate 유형 (자동 판단 또는 지정)" },
      },
    },
  },
  {
    name: "decide_hold",
    description: "Discovery를 HOLD(보류) 상태로 전환합니다. 트리거 조건 필수.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "decisionRationale", "notNowTriggerType", "notNowTriggerCondition", "revisitDate"],
      properties: {
        discoveryId: { type: "string" },
        decisionRationale: { type: "string", maxLength: 400 },
        notNowTriggerType: {
          type: "string",
          enum: ["Technology_Maturity", "Policy_Regulation", "Customer_Behavior", "Internal_Capability"],
        },
        notNowTriggerCondition: { type: "string", maxLength: 200 },
        revisitDate: { type: "string", description: "재검토 날짜 (ISO 8601, 미래)" },
      },
    },
  },
  {
    name: "decide_drop",
    description: "Discovery를 DROP(종료) 상태로 전환합니다. 실패 패턴 필수.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "decisionRationale", "deadEndFailurePattern", "deadEndEvidenceReason"],
      properties: {
        discoveryId: { type: "string" },
        decisionRationale: { type: "string", maxLength: 400 },
        deadEndFailurePattern: {
          type: "array",
          items: { type: "string" },
          description: "실패 패턴 (1~3개): assumption_invalidated, no_user_demand, technical_infeasible, resource_unavailable, regulation_blocked, market_timing_wrong, competitive_moat_insufficient, unit_economics_broken, scope_too_large, dependency_failed, time_constraint",
        },
        deadEndEvidenceReason: { type: "string", maxLength: 200 },
      },
    },
  },
  {
    name: "request_extension",
    description: "실험 2개 소진 후 3번째 실험을 위한 연장을 요청합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "extensionRationale"],
      properties: {
        discoveryId: { type: "string" },
        extensionRationale: { type: "string", maxLength: 400 },
      },
    },
  },

  // === Query Tools ===
  {
    name: "list_discoveries",
    description: "Discovery 목록을 조회합니다. 상태별 필터 가능.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ALL_STATUSES,
          description: "상태 필터 (선택)",
        },
        limit: { type: "number", description: "최대 결과 수 (기본 20)" },
        offset: { type: "number", description: "페이지네이션 오프셋 (기본 0)" },
      },
    },
  },
  {
    name: "get_discovery_detail",
    description: "Discovery 상세 정보(실험, 근거 포함)를 조회합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string" },
      },
    },
  },
  {
    name: "search_similar",
    description: "기존 Discovery 중 유사한 것을 검색합니다 (FTS5).",
    input_schema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "검색어" },
      },
    },
  },
  {
    name: "get_metrics",
    description: "시스템 지표를 조회합니다 (상태별 건수, 평균 소요 시간 등). 기간 필터 가능.",
    input_schema: {
      type: "object",
      properties: {
        fromDate: { type: "string", description: "시작 날짜 (ISO 8601, 선택)" },
        toDate: { type: "string", description: "종료 날짜 (ISO 8601, 선택)" },
      },
    },
  },
  {
    name: "get_radar_items",
    description: "Radar에서 수집된 외부 아이템을 조회합니다.",
    input_schema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["COLLECTED", "SCORED", "SEEDED", "SKIPPED"],
          description: "상태 필터 (선택)",
        },
        limit: { type: "number", description: "최대 결과 수 (기본 20)" },
        offset: { type: "number", description: "페이지네이션 오프셋 (기본 0)" },
      },
    },
  },
  {
    name: "get_weekly_review",
    description: "주간 리뷰 데이터를 조회합니다. 활성 상태 전체의 경과일, 기한, 실험 상태, 초과 여부를 포함.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_recall_queue",
    description: "재검토 큐를 조회합니다. HOLD 중 revisitDate가 도래한 항목과 14일 이내 도래 항목.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_users",
    description: "시스템 사용자 목록을 조회합니다. Owner/Reviewer 지정에 사용.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },

  // === v3 Stage Tools ===
  {
    name: "get_stage_info",
    description: "11단계 파이프라인의 단계 정의와 허용 전환을 조회합니다.",
    input_schema: {
      type: "object",
      properties: {
        stageId: {
          type: "string",
          enum: ALL_STATUSES,
          description: "조회할 단계 ID (생략 시 전체 목록)",
        },
      },
    },
  },
  {
    name: "validate_evidence",
    description: "Discovery의 근거 품질을 검증합니다 (신뢰도 라벨, 출처, 발행일 등).",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string" },
        evidenceId: { type: "string", description: "특정 근거 ID (생략 시 전체 검증)" },
      },
    },
  },

  // === Method Pack Tools (v3 R1) ===
  {
    name: "list_method_packs",
    description: "방법론 팩 목록을 조회합니다. 현재 단계(stage)나 티어(tier)로 필터 가능.",
    input_schema: {
      type: "object",
      properties: {
        stage: {
          type: "string",
          enum: ALL_STATUSES,
          description: "적용 가능한 단계 필터 (선택)",
        },
        tier: {
          type: "string",
          enum: ["Tier-0", "Tier-1", "Tier-2"],
          description: "티어 필터 (선택)",
        },
      },
    },
  },
  {
    name: "recommend_methods",
    description: "Discovery의 현재 단계에 맞는 방법론 2-3개를 추천합니다. Tier-0 우선.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string" },
      },
    },
  },
  {
    name: "start_method_run",
    description: "방법론 팩 실행을 시작합니다. template_prompt를 반환하여 대화 기반 실행을 유도합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "methodPackId"],
      properties: {
        discoveryId: { type: "string" },
        methodPackId: { type: "string", description: "Method Pack ID (예: MP-01)" },
        conversationId: { type: "string", description: "연결할 대화 ID (선택)" },
      },
    },
  },
  {
    name: "complete_method_run",
    description: "방법론 실행을 완료하고 structured output을 저장합니다.",
    input_schema: {
      type: "object",
      required: ["runId", "structuredOutput"],
      properties: {
        runId: { type: "string" },
        structuredOutput: { type: "object", description: "실행 결과 (JSON)" },
        evidenceIds: {
          type: "array",
          items: { type: "string" },
          description: "연결할 근거 ID 목록 (선택)",
        },
      },
    },
  },
  {
    name: "draft_gate_package",
    description: "Gate1/2 의사결정 패키지를 자동 초안합니다. 근거, 방법론 실행, 가정을 종합합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "gateType"],
      properties: {
        discoveryId: { type: "string" },
        gateType: {
          type: "string",
          enum: ["GATE1", "GATE2"],
          description: "Gate 유형",
        },
      },
    },
  },
  {
    name: "get_gate_package",
    description: "Gate 의사결정 패키지를 조회합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string" },
        gateType: {
          type: "string",
          enum: ["GATE1", "GATE2"],
          description: "Gate 유형 필터 (선택)",
        },
      },
    },
  },
];
