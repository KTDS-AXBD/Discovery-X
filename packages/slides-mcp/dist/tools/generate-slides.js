/**
 * generate_slides MCP Tool
 * 마크다운 또는 섹션 구조를 슬라이드 JSON으로 변환
 */
import { buildSlides } from "../engine/slide-builder.js";
import { splitByHeadings } from "../engine/markdown-parser.js";
import { SECTION_LABELS } from "../engine/section-groups.js";
export const GENERATE_SLIDES_SCHEMA = {
    name: "generate_slides",
    description: "마크다운 문서 또는 섹션 구조를 슬라이드 덱으로 변환합니다. " +
        "markdown 모드는 아무 마크다운 문서를, sections 모드는 사업제안 섹션을 입력받습니다.",
    inputSchema: {
        type: "object",
        properties: {
            mode: {
                type: "string",
                enum: ["markdown", "sections"],
                description: "입력 모드: markdown(범용) 또는 sections(사업제안 특화)",
            },
            markdown: {
                type: "string",
                description: "범용 마크다운 문서 (mode=markdown일 때 필수)",
            },
            sections: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        type: { type: "string", description: "섹션 타입 (overview, target_market, ...)" },
                        title: { type: "string" },
                        content: { type: "string", description: "마크다운 콘텐츠" },
                    },
                    required: ["type", "title", "content"],
                },
                description: "섹션 배열 (mode=sections일 때 필수)",
            },
            title: { type: "string", description: "슬라이드 덱 제목" },
            author: { type: "string", description: "작성자 이름 (선택)" },
            format: {
                type: "string",
                enum: ["executive", "pitch", "internal"],
                description: "슬라이드 포맷 (기본: pitch)",
            },
        },
        required: ["mode", "title"],
    },
};
export function executeGenerateSlides(args) {
    const format = args.format || "pitch";
    let sections;
    if (args.mode === "markdown") {
        if (!args.markdown) {
            throw new Error("markdown 모드에서는 markdown 필드가 필수입니다.");
        }
        sections = splitByHeadings(args.markdown);
    }
    else {
        if (!args.sections || args.sections.length === 0) {
            throw new Error("sections 모드에서는 sections 배열이 필수입니다.");
        }
        sections = args.sections;
    }
    // sections → Record<string, string> 변환
    const sectionMap = {};
    for (const s of sections) {
        if (s.content?.trim()) {
            sectionMap[s.type] = s.content;
        }
    }
    // SECTION_LABELS에 없는 타입의 라벨 추가 (markdown 모드에서 자동 추론된 타입)
    const labelsCopy = { ...SECTION_LABELS };
    for (const s of sections) {
        if (!labelsCopy[s.type]) {
            labelsCopy[s.type] = s.title;
        }
    }
    const slides = buildSlides({
        title: args.title,
        description: null,
        category: null,
        status: "ACTIVE",
        budget: null,
        teamSize: null,
        startDate: null,
        ownerName: args.author || null,
        sections: sectionMap,
        milestones: [],
    }, format);
    return {
        slides,
        metadata: {
            slideCount: slides.length,
            format,
            generatedAt: new Date().toISOString(),
        },
    };
}
//# sourceMappingURL=generate-slides.js.map