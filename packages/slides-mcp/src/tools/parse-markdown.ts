/**
 * parse_markdown MCP Tool
 * 마크다운을 구조화 블록으로 파싱 (디버깅/커스터마이징용)
 */

import type { ParsedContent } from "../types.js";
import { parseMarkdown } from "../engine/markdown-parser.js";

export const PARSE_MARKDOWN_SCHEMA = {
  name: "parse_markdown",
  description:
    "마크다운 텍스트를 구조화된 블록(헤딩, 불릿, 테이블, Key Insight)으로 파싱합니다. " +
    "슬라이드 생성 전 콘텐츠 구조를 확인하거나 디버깅할 때 유용합니다.",
  inputSchema: {
    type: "object" as const,
    properties: {
      markdown: {
        type: "string",
        description: "파싱할 마크다운 텍스트",
      },
    },
    required: ["markdown"],
  },
} as const;

export function executeParseMarkdown(args: { markdown: string }): ParsedContent {
  if (args.markdown == null) {
    throw new Error("markdown 필드가 필수입니다.");
  }
  return parseMarkdown(args.markdown);
}
