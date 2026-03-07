/**
 * Idea tool schemas
 * BD팀 PoC 아이디어 후보 생성/선택/템플릿 + 아이디어 분석 도구
 */
import type { ClaudeTool } from "~/lib/ai";

export const IDEA_SCHEMA_TOOLS: ClaudeTool[] = [
  // === BD팀 PoC: 아이디어 후보 & 템플릿 도구 ===
  {
    name: "generate_idea_candidates",
    description: "현재 대화 맥락(소스, 분석 결과)을 바탕으로 사업 아이디어 후보를 최대 3개 생성합니다. 반환된 candidateGroupId로 create_discovery를 N회 호출하세요.",
    input_schema: {
      type: "object",
      required: ["count"],
      properties: {
        count: {
          type: "number",
          description: "생성할 후보 수 (1~3)",
          minimum: 1,
          maximum: 3,
        },
        sourceContext: {
          type: "string",
          description: "참고할 소스/대화 요약 (선택)",
        },
        industryCode: {
          type: "string",
          enum: ["manufacturing", "finance", "healthcare", "public", "energy", "other"],
          description: "산업 분류 코드 (선택)",
        },
      },
    },
  },
  {
    name: "select_idea_candidate",
    description: "아이디어 후보 그룹에서 1개를 선택합니다. 선택된 후보는 IDEA_CARD로 승격되고, 나머지는 DROP됩니다.",
    input_schema: {
      type: "object",
      required: ["candidateGroupId", "selectedDiscoveryId"],
      properties: {
        candidateGroupId: { type: "string", description: "후보 그룹 ID" },
        selectedDiscoveryId: { type: "string", description: "선택할 Discovery ID" },
        reason: { type: "string", description: "선택 이유 (200자 이내)" },
      },
    },
  },
  {
    name: "auto_fill_template",
    description: "IDEA_CARD 상태의 Discovery에 BD 아이디어 템플릿 4개 필드(가설, 근거, 타겟, 가치 제안)를 자동 채웁니다.",
    input_schema: {
      type: "object",
      required: ["discoveryId"],
      properties: {
        discoveryId: { type: "string", description: "대상 Discovery ID" },
        hypothesis: { type: "string", description: "가설 (직접 지정 시)" },
        targetSegment: { type: "string", description: "타겟 고객/시장 (직접 지정 시)" },
        valueProposition: { type: "string", description: "가치 제안 (직접 지정 시)" },
      },
    },
  },

  // === Idea Analysis Tools ===
  {
    name: "update_idea_analysis",
    description: "아이디어의 분석 데이터를 방법론 카테고리별로 업데이트합니다. 요청된 방법론에 맞춰 분석 결과를 저장합니다.",
    input_schema: {
      type: "object",
      required: ["ideaId", "category", "title", "content"],
      properties: {
        ideaId: { type: "string", description: "아이디어 ID" },
        category: {
          type: "string",
          enum: ["market_research", "customer_research", "critical_thinking", "bmc", "swot", "regulation", "feasibility", "differentiation", "industry_example", "value_chain", "lean_canvas", "pestel"],
          description: "방법론 카테고리",
        },
        title: { type: "string", description: "카테고리 제목" },
        content: { type: "string", description: "분석 결과 내용 (마크다운)" },
        sources: {
          type: "array",
          items: { type: "string" },
          description: "참조 소스 URL 목록 (선택)",
        },
      },
    },
  },
];
