/**
 * PPTX Renderer — Slide[] → .pptx 파일 생성 (Node.js 환경)
 * Discovery-X proposals/ui/export-pptx.ts에서 추출
 * 디자인: KPMG/McKinsey 참조 — 헤더 밴드, 번호 콜아웃, 표 레이아웃
 */
import type { Slide, DesignTokens } from "../types.js";
export declare function renderToPptx(slides: Slide[], title: string, options?: {
    outputPath?: string;
    design?: DesignTokens;
}): Promise<{
    filePath: string;
    fileSize: number;
}>;
//# sourceMappingURL=pptx-renderer.d.ts.map