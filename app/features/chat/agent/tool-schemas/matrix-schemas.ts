/**
 * Matrix Agent 도구 스키마 (P2)
 * 3개 도구: query_matrix_heatmap, get_cell_signals, get_top_cells
 */
import type { ClaudeTool } from "~/lib/ai";

export const MATRIX_TOOLS: ClaudeTool[] = [
  {
    name: "query_matrix_heatmap",
    description:
      "팀 전체 Matrix Heatmap 데이터를 조회합니다. 산업×기능 교차 스코어 현황, Cell 목록, 시간 지평 필터를 제공합니다.",
    input_schema: {
      type: "object",
      properties: {
        teamId: { type: "string", description: "팀(테넌트) ID" },
        horizonFilter: {
          type: "string",
          enum: ["short", "mid", "long"],
          description:
            "시간 지평 필터 (short=1년 이하, mid=1~3년, long=3년 이상)",
        },
      },
      required: ["teamId"],
    },
  },
  {
    name: "get_cell_signals",
    description:
      "Matrix Cell에 연결된 Signal 목록을 조회합니다. Cell의 linkedTopic을 통해 Graph 2-hop으로 관련 Signal을 탐색합니다.",
    input_schema: {
      type: "object",
      properties: {
        teamId: { type: "string", description: "팀(테넌트) ID" },
        cellNodeId: {
          type: "string",
          description:
            "Matrix Cell의 Graph @id (예: cell/manufacturing/operations)",
        },
      },
      required: ["teamId", "cellNodeId"],
    },
  },
  {
    name: "get_top_cells",
    description:
      "현재 기간 composite score 기준 상위 N개 Matrix Cell을 조회합니다.",
    input_schema: {
      type: "object",
      properties: {
        teamId: { type: "string", description: "팀(테넌트) ID" },
        limit: {
          type: "number",
          description: "조회할 Cell 수 (기본 10, 최대 20)",
        },
      },
      required: ["teamId"],
    },
  },
];
