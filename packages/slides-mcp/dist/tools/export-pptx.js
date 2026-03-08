/**
 * export_pptx MCP Tool
 * Slide[] JSON → .pptx 파일 생성
 */
import { renderToPptx } from "../engine/pptx-renderer.js";
export const EXPORT_PPTX_SCHEMA = {
    name: "export_pptx",
    description: "슬라이드 JSON 배열을 .pptx 파일로 렌더링합니다. " +
        "generate_slides의 결과를 입력으로 받아 PowerPoint 파일을 생성합니다.",
    inputSchema: {
        type: "object",
        properties: {
            slides: {
                type: "array",
                items: { type: "object" },
                description: "generate_slides에서 반환된 슬라이드 배열",
            },
            title: { type: "string", description: "파일 제목" },
            outputPath: {
                type: "string",
                description: "저장 경로 (기본: /tmp/에 자동 생성)",
            },
            design: {
                type: "object",
                properties: {
                    primaryColor: { type: "string", description: "주 색상 (hex, 기본: #0C2340)" },
                    accentColor: { type: "string", description: "강조 색상 (hex, 기본: #0066CC)" },
                    fontFamily: { type: "string", description: "폰트 (기본: Malgun Gothic)" },
                },
                description: "커스텀 디자인 토큰 (선택)",
            },
        },
        required: ["slides", "title"],
    },
};
export async function executeExportPptx(args) {
    return renderToPptx(args.slides, args.title, {
        outputPath: args.outputPath,
        design: args.design,
    });
}
//# sourceMappingURL=export-pptx.js.map