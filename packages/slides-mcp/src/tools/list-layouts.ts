/**
 * list_layouts MCP Tool
 * 사용 가능한 레이아웃, 포맷, 섹션 타입 정보 조회
 */

import { SECTION_GROUPS, SLIDE_TEMPLATES, SECTION_LABELS } from "../engine/section-groups.js";

export const LIST_LAYOUTS_SCHEMA = {
  name: "list_layouts",
  description:
    "사용 가능한 슬라이드 레이아웃, 포맷, 섹션 타입 정보를 조회합니다. " +
    "generate_slides에서 사용할 수 있는 옵션을 확인할 때 유용합니다.",
  inputSchema: {
    type: "object" as const,
    properties: {},
  },
} as const;

export function executeListLayouts() {
  return {
    layouts: [
      { name: "cover", description: "표지 슬라이드 (제목, 부제, 발표자)" },
      { name: "agenda", description: "목차 슬라이드 (번호 카드 형태)" },
      { name: "section_header", description: "섹션 구분 슬라이드 (네이비 배경)" },
      { name: "key_insight", description: "핵심 인사이트 (따옴표 + 틸 배경)" },
      { name: "content", description: "본문 슬라이드 (번호 불릿 + 하위항목)" },
      { name: "two_column", description: "핵심 수치 카드 (최대 4개 메트릭)" },
      { name: "table", description: "표 슬라이드 (교차 행 색상, 네이비 헤더)" },
      { name: "process", description: "프로세스 플로우 (수평 화살표)" },
      { name: "timeline", description: "타임라인 (세로 마일스톤)" },
      { name: "closing", description: "마무리 슬라이드" },
    ],
    formats: [
      { name: "executive", description: "경영진 요약 (핵심 섹션만, ~7장)", sections: SLIDE_TEMPLATES.executive },
      { name: "pitch", description: "투자/제안 피치 (전체 섹션, ~12장)", sections: SLIDE_TEMPLATES.pitch },
      { name: "internal", description: "내부 검토용 (전체 섹션, 13장+)", sections: SLIDE_TEMPLATES.internal },
    ],
    sectionTypes: Object.entries(SECTION_LABELS).map(([type, label]) => ({ type, label })),
    sectionGroups: SECTION_GROUPS.map((g) => ({
      groupTitle: g.groupTitle,
      types: g.types,
    })),
  };
}
