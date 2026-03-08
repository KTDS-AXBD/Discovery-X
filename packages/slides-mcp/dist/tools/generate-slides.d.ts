/**
 * generate_slides MCP Tool
 * 마크다운 또는 섹션 구조를 슬라이드 JSON으로 변환
 */
import type { GenerateOptions, GenerateResult } from "../types.js";
export declare const GENERATE_SLIDES_SCHEMA: {
    readonly name: "generate_slides";
    readonly description: string;
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: {
            readonly mode: {
                readonly type: "string";
                readonly enum: readonly ["markdown", "sections"];
                readonly description: "입력 모드: markdown(범용) 또는 sections(사업제안 특화)";
            };
            readonly markdown: {
                readonly type: "string";
                readonly description: "범용 마크다운 문서 (mode=markdown일 때 필수)";
            };
            readonly sections: {
                readonly type: "array";
                readonly items: {
                    readonly type: "object";
                    readonly properties: {
                        readonly type: {
                            readonly type: "string";
                            readonly description: "섹션 타입 (overview, target_market, ...)";
                        };
                        readonly title: {
                            readonly type: "string";
                        };
                        readonly content: {
                            readonly type: "string";
                            readonly description: "마크다운 콘텐츠";
                        };
                    };
                    readonly required: readonly ["type", "title", "content"];
                };
                readonly description: "섹션 배열 (mode=sections일 때 필수)";
            };
            readonly title: {
                readonly type: "string";
                readonly description: "슬라이드 덱 제목";
            };
            readonly author: {
                readonly type: "string";
                readonly description: "작성자 이름 (선택)";
            };
            readonly format: {
                readonly type: "string";
                readonly enum: readonly ["executive", "pitch", "internal"];
                readonly description: "슬라이드 포맷 (기본: pitch)";
            };
        };
        readonly required: readonly ["mode", "title"];
    };
};
export declare function executeGenerateSlides(args: GenerateOptions): GenerateResult;
//# sourceMappingURL=generate-slides.d.ts.map