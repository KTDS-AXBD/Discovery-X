import type { ParsedContent, ContentBlock, SectionInput } from "../types.js";
/** 산문 텍스트를 문장 단위로 분리 (한국어/영어 지원) */
export declare function splitIntoSentences(text: string): string[];
/** 마크다운을 구조화된 블록으로 파싱 (테이블 감지 포함) */
export declare function parseMarkdown(markdown: string): ParsedContent;
/** 파싱된 블록을 슬라이드용 불릿 목록으로 변환 (최대 maxPerSlide개) */
export declare function flattenBlocks(blocks: ContentBlock[], maxPerSlide?: number): Array<{
    bullets: string[];
    subBullets: Record<number, string[]>;
    heading?: string;
}>;
/** markdown 모드에서 H2 헤딩 기반 섹션 분할 */
export declare function splitByHeadings(markdown: string): SectionInput[];
//# sourceMappingURL=markdown-parser.d.ts.map