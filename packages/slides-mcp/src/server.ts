#!/usr/bin/env node
/**
 * slides-mcp — MCP Server for Slide Generation
 * 마크다운/섹션 → 슬라이드 JSON → PPTX 파일 변환
 * Transport: stdio
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { GENERATE_SLIDES_SCHEMA, executeGenerateSlides } from "./tools/generate-slides.js";
import { EXPORT_PPTX_SCHEMA, executeExportPptx } from "./tools/export-pptx.js";
import { PARSE_MARKDOWN_SCHEMA, executeParseMarkdown } from "./tools/parse-markdown.js";
import { LIST_LAYOUTS_SCHEMA, executeListLayouts } from "./tools/list-layouts.js";

const server = new Server(
  {
    name: "slides-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    GENERATE_SLIDES_SCHEMA,
    EXPORT_PPTX_SCHEMA,
    PARSE_MARKDOWN_SCHEMA,
    LIST_LAYOUTS_SCHEMA,
  ],
}));

// Call tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "generate_slides": {
        const result = executeGenerateSlides(args as unknown as Parameters<typeof executeGenerateSlides>[0]);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "export_pptx": {
        const result = await executeExportPptx(args as unknown as Parameters<typeof executeExportPptx>[0]);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                message: `PPTX 파일이 생성되었습니다.`,
                filePath: result.filePath,
                fileSize: `${(result.fileSize / 1024).toFixed(1)} KB`,
              }),
            },
          ],
        };
      }

      case "parse_markdown": {
        const result = executeParseMarkdown(args as unknown as Parameters<typeof executeParseMarkdown>[0]);
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      case "list_layouts": {
        const result = executeListLayouts();
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      default:
        return {
          content: [{ type: "text", text: `알 수 없는 도구: ${name}` }],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: "text", text: `오류: ${message}` }],
      isError: true,
    };
  }
});

// Start
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("slides-mcp server started (stdio)");
}

main().catch((error) => {
  console.error("Server failed to start:", error);
  process.exit(1);
});
