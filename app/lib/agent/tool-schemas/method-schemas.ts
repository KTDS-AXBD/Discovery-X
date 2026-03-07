/**
 * Method Pack tool schemas
 * 방법론 팩 목록/추천/실행/완료 및 Gate 패키지 도구
 */
import type { ClaudeTool } from "~/lib/ai";
import { ALL_STATUSES } from "~/lib/constants/status";

export const METHOD_TOOLS: ClaudeTool[] = [
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
