/**
 * Proposal tool schemas — 사업제안 PPT 슬라이드 자동 생성 Agent 도구
 */
import type { ClaudeTool } from "~/lib/ai";

export const PROPOSAL_TOOLS: ClaudeTool[] = [
  {
    name: "generate_proposal_slides",
    description:
      "사업제안의 섹션 데이터를 기반으로 PPT 슬라이드 덱을 자동 생성합니다. 10개 섹션(개요~실행방안)에서 핵심 불릿을 추출하여 구조화된 슬라이드를 만듭니다. 생성된 슬라이드는 DB에 저장되며 결과가 반환됩니다.",
    input_schema: {
      type: "object",
      required: ["proposalId"],
      properties: {
        proposalId: {
          type: "string",
          description: "슬라이드를 생성할 사업제안 ID",
        },
        format: {
          type: "string",
          enum: ["executive", "pitch", "internal"],
          description:
            "슬라이드 포맷: executive(경영진 요약, 7장), pitch(투자/제안 피치, 12장), internal(내부 검토, 13장+). 기본값: pitch",
        },
      },
    },
  },
  {
    name: "list_proposal_slides",
    description:
      "사업제안에 생성된 슬라이드 덱 목록을 조회합니다. 각 덱의 ID, 포맷, 슬라이드 수를 반환합니다.",
    input_schema: {
      type: "object",
      required: ["proposalId"],
      properties: {
        proposalId: {
          type: "string",
          description: "사업제안 ID",
        },
      },
    },
  },
  {
    name: "get_slide_deck_detail",
    description:
      "특정 슬라이드 덱의 전체 내용(슬라이드별 제목/불릿/레이아웃)을 조회합니다.",
    input_schema: {
      type: "object",
      required: ["slideDeckId"],
      properties: {
        slideDeckId: {
          type: "string",
          description: "슬라이드 덱 ID",
        },
      },
    },
  },
];
