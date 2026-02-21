/**
 * Query tool schemas
 * Discovery 조회, 검색, 지표, 비교, 태그 등 읽기/경량 쓰기 도구
 */
import type { ClaudeTool } from "../claude-client";
import { ALL_STATUSES } from "~/lib/constants/status";

export const QUERY_TOOLS: ClaudeTool[] = [
  // === Query Tools ===
  {
    name: "list_discoveries",
    description: "Discovery 목록을 조회합니다. 필터 없으면 전체 목록을 updatedAt 역순으로 반환합니다.",
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
    description: "Discovery 상세 정보(실험, 근거 포함)를 조회합니다. 상태 변경이나 근거 추가 전에 반드시 호출하여 현재 상태를 확인하세요.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string" },
      },
    },
  },
  {
    name: "get_experiment_context",
    description: "실험 설계를 위한 종합 컨텍스트 조회. Method Run 결과(structuredOutput), 미검증 assumptions, 기존 실험, 실험 슬롯 현황 포함. '실험 추가/추천/제안' 요청 시 먼저 호출하여 맥락을 파악하세요.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
      },
    },
  },
  {
    name: "search_similar",
    description: "기존 Discovery 중 유사한 것을 FTS5로 검색합니다. 새 Discovery 생성 전 중복 확인 용도로 사용하세요.",
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
    name: "generate_discovery_digest",
    description: "Discovery의 구조화된 요약 리포트를 마크다운으로 생성합니다. Seed, 실험, 근거, 방법론, 결정 정보를 종합합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
      },
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

  // === F8: Compare / F9: Tag ===
  {
    name: "compare_discoveries",
    description: "여러 Discovery를 나란히 비교 테이블로 보여줍니다. 2~5개 ID를 지정하세요.",
    input_schema: {
      type: "object",
      required: ["discoveryIds"],
      properties: {
        discoveryIds: {
          type: "array",
          items: { type: "string" },
          minItems: 2,
          maxItems: 5,
          description: "비교할 Discovery ID 배열 (2~5개)",
        },
      },
    },
  },
  {
    name: "tag_discovery",
    description: "Discovery에 태그를 추가합니다. 최대 10개, 소문자 하이픈 형식.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "tags"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        tags: {
          type: "array",
          items: { type: "string", maxLength: 20 },
          description: "추가할 태그 배열",
        },
      },
    },
  },
  {
    name: "remove_discovery_tag",
    description: "Discovery에서 태그를 제거합니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId", "tags"],
      properties: {
        discoveryId: { type: "string", description: "Discovery ID" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "제거할 태그 배열",
        },
      },
    },
  },
];
