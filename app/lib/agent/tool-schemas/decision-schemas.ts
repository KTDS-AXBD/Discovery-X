/**
 * Decision tool schemas
 * Gate/Hold/Drop 의사결정 및 연장 요청 도구
 */
import type { ClaudeTool } from "~/lib/ai";

export const DECISION_TOOLS: ClaudeTool[] = [
  // === Decision Tools ===
  {
    name: "decide_gate",
    description: "Discovery를 Gate 단계(GATE1/GATE2)로 전환합니다. 호출 전 validate_evidence로 근거 품질을 확인하세요. A/B급 증거 2개 미만이면 경고합니다.",
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
    description: "Discovery를 HOLD(보류) 상태로 전환합니다. notNowTriggerType, notNowTriggerCondition, revisitDate 모두 필수입니다.",
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
    description: "Discovery를 DROP(종료) 상태로 전환합니다. deadEndFailurePattern 1-3개 필수. 되돌릴 수 없으므로 신중하게 사용하세요.",
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
];
