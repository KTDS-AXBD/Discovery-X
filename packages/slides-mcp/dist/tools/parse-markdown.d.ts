/**
 * parse_markdown MCP Tool
 * 마크다운을 구조화 블록으로 파싱 (디버깅/커스터마이징용)
 */
import type { ParsedContent } from "../types.js";
export declare const PARSE_MARKDOWN_SCHEMA: {
    readonly name: "parse_markdown";
    readonly description: string;
    readonly inputSchema: {
        readonly type: "object";
        readonly properties: {
            readonly markdown: {
                readonly type: "string";
                readonly description: "파싱할 마크다운 텍스트";
            };
        };
        readonly required: readonly ["markdown"];
    };
};
export declare function executeParseMarkdown(args: {
    markdown: string;
}): ParsedContent;
//# sourceMappingURL=parse-markdown.d.ts.map