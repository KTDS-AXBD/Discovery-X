/**
 * export_pptx MCP Tool
 * Slide[] JSON → .pptx 파일 생성
 */
import type { Slide, DesignTokens } from "../types.js";
export declare const EXPORT_PPTX_SCHEMA: {
    readonly name: "export_pptx";
    readonly description: string;
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: {
            readonly slides: {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                };
                readonly description: "generate_slides에서 반환된 슬라이드 배열";
            };
            readonly title: {
                readonly type: "string";
                readonly description: "파일 제목";
            };
            readonly outputPath: {
                readonly type: "string";
                readonly description: "저장 경로 (기본: /tmp/에 자동 생성)";
            };
            readonly design: {
                readonly type: "object";
                readonly properties: {
                    readonly primaryColor: {
                        readonly type: "string";
                        readonly description: "주 색상 (hex, 기본: #0C2340)";
                    };
                    readonly accentColor: {
                        readonly type: "string";
                        readonly description: "강조 색상 (hex, 기본: #0066CC)";
                    };
                    readonly fontFamily: {
                        readonly type: "string";
                        readonly description: "폰트 (기본: Malgun Gothic)";
                    };
                };
                readonly description: "커스텀 디자인 토큰 (선택)";
            };
        };
        readonly required: readonly ["slides", "title"];
    };
};
export declare function executeExportPptx(args: {
    slides: Slide[];
    title: string;
    outputPath?: string;
    design?: DesignTokens;
}): Promise<{
    filePath: string;
    fileSize: number;
}>;
//# sourceMappingURL=export-pptx.d.ts.map