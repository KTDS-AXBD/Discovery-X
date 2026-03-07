/**
 * 요구사항 검토 Agent 도구 스키마 (3개)
 * classify: 읽기 전용 분류 / review: 분류+저장 / plan: 작업계획 생성
 */

import type { ClaudeTool } from "~/lib/ai";

export const REQUIREMENTS_TOOLS: ClaudeTool[] = [
  {
    name: "classify_feature_request",
    description:
      "요구사항을 AI로 분류합니다 (읽기 전용, DB 미저장). ALREADY_DONE / IN_PLAN / NEW_VALUABLE / OUT_OF_SCOPE 중 하나로 분류하고 점수와 근거를 반환합니다.",
    input_schema: {
      type: "object" as const,
      required: ["requestId"],
      properties: {
        requestId: {
          type: "string",
          description: "분류할 요구사항 ID",
        },
      },
    },
  },
  {
    name: "review_feature_request",
    description:
      "요구사항을 AI로 분석하고 결과를 DB에 저장합니다. 분류 + Impact×Feasibility 점수 + 근거를 생성하며, 상태를 CLASSIFIED로 전환합니다.",
    input_schema: {
      type: "object" as const,
      required: ["requestId"],
      properties: {
        requestId: {
          type: "string",
          description: "분석할 요구사항 ID",
        },
      },
    },
  },
  {
    name: "plan_feature_request",
    description:
      "NEW_VALUABLE로 분류된 요구사항에 대해 작업계획을 생성합니다. AI 리뷰가 완료된 상태에서만 사용 가능합니다.",
    input_schema: {
      type: "object" as const,
      required: ["requestId"],
      properties: {
        requestId: {
          type: "string",
          description: "작업계획을 생성할 요구사항 ID",
        },
        title: {
          type: "string",
          description: "작업계획 제목 (생략 시 요구사항 제목 사용)",
        },
      },
    },
  },
];
