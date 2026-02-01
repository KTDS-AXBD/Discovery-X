/**
 * Tool registry: defines all tools available to the Agent as Claude function calling schemas.
 */

import type { ClaudeTool } from "./claude-client";

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
  // Level 2: create + promote
  create_discovery: 2,
  update_discovery: 2,
  promote_discovery: 2,
  // Level 3: full autonomy
  add_experiment: 3,
  complete_experiment: 3,
  add_evidence: 3,
  decide_next: 3,
  decide_not_now: 3,
  decide_dead_end: 3,
  request_extension: 3,
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
    description: "새 Discovery를 INBOX 상태로 생성합니다.",
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
    description: "기존 Discovery의 제목, 요약, 링크, Reviewer를 수정합니다. INBOX/OPEN 상태만 가능.",
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
    description: "INBOX Discovery를 OPEN 상태로 승격합니다. Owner 지정 + 첫 실험 설계 필수.",
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
    name: "add_experiment",
    description: "OPEN Discovery에 실험을 추가합니다 (최대 2개).",
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
    description: "Discovery에 근거를 추가합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "type", "strength", "content"],
      properties: {
        discoveryId: { type: "string" },
        type: { type: "string", enum: ["DATA", "USER", "ARTIFACT", "REF", "ASSUMPTION"] },
        strength: { type: "string", enum: ["A", "B", "C", "D"] },
        content: { type: "string", maxLength: 400 },
        linkOrAttachment: { type: "string", description: "URL (선택)" },
        experimentId: { type: "string", description: "연결할 실험 ID (선택)" },
      },
    },
  },

  // === Decision Tools ===
  {
    name: "decide_next",
    description: "Discovery를 NEXT(전진) 상태로 전환합니다. A/B급 증거 2개 이상 권장.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "decisionRationale"],
      properties: {
        discoveryId: { type: "string" },
        decisionRationale: { type: "string", description: "결정 근거 (400자 이내)", maxLength: 400 },
      },
    },
  },
  {
    name: "decide_not_now",
    description: "Discovery를 NOT_NOW(보류) 상태로 전환합니다. 트리거 조건 필수.",
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
    name: "decide_dead_end",
    description: "Discovery를 DEAD_END(종료) 상태로 전환합니다. 실패 패턴 필수.",
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
          enum: ["INBOX", "OPEN", "NEXT", "NOT_NOW", "DEAD_END", "EXTENSION_REQUESTED"],
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
    description: "주간 리뷰 데이터를 조회합니다. OPEN 상태 전체의 경과일, 기한, 실험 상태, 초과 여부를 포함.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "get_recall_queue",
    description: "재검토 큐를 조회합니다. NOT_NOW 중 revisitDate가 도래한 항목과 14일 이내 도래 항목.",
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
];
