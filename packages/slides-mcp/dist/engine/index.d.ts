/**
 * Slides Engine — Public API
 * 마크다운/섹션 → 슬라이드 JSON → PPTX 파일 변환 엔진
 */
export { parseMarkdown, flattenBlocks, splitIntoSentences, splitByHeadings } from "./markdown-parser.js";
export { buildSlides } from "./slide-builder.js";
export type { ProposalData } from "./slide-builder.js";
export { renderToPptx } from "./pptx-renderer.js";
export { SECTION_GROUPS, SLIDE_TEMPLATES, SECTION_LABELS, HEADING_TYPE_MAP } from "./section-groups.js";
//# sourceMappingURL=index.d.ts.map