/**
 * PPTX Renderer — Slide[] → .pptx 파일 생성 (Node.js 환경)
 * Discovery-X proposals/ui/export-pptx.ts에서 추출
 * 디자인: KPMG/McKinsey 참조 — 헤더 밴드, 번호 콜아웃, 표 레이아웃
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
// ============================================================================
// Design Tokens (defaults)
// ============================================================================
const DEFAULT_COLORS = {
    // Primary
    navy: "0C2340",
    navyLight: "1B3A5C",
    // Accent
    blue: "0066CC",
    blueLight: "E8F0FE",
    teal: "007B83",
    tealLight: "E6F3F4",
    // Neutral
    white: "FFFFFF",
    offWhite: "F7F8FA",
    warmGray: "F0EFED",
    text: "2D2D2D",
    textSec: "5A5A5A",
    textLight: "8C8C8C",
    border: "D4D4D4",
    borderLight: "E8E8E8",
    // Highlight
    amber: "D97706",
    amberLight: "FEF3C7",
};
const DEFAULT_FONT = "Malgun Gothic";
// 슬라이드 치수 (인치, LAYOUT_WIDE 13.33 x 7.5)
const W = 13.33;
const H = 7.5;
const MARGIN = 0.7;
const CONTENT_W = W - MARGIN * 2;
// ============================================================================
// Common Elements
// ============================================================================
function addHeaderBand(s, title, slideNum, total, colors, font) {
    s.addShape("rect", {
        x: 0, y: 0, w: W, h: 0.85,
        fill: { color: colors.navy },
    });
    s.addShape("rect", {
        x: 0, y: 0, w: 0.06, h: 0.85,
        fill: { color: colors.blue },
    });
    s.addText(title, {
        x: MARGIN + 0.1, y: 0.12, w: 9.5, h: 0.6,
        fontSize: 18, fontFace: font, bold: true, color: colors.white,
    });
    s.addText(`${slideNum} / ${total}`, {
        x: 11.0, y: 0.18, w: 1.8, h: 0.5,
        fontSize: 9, fontFace: font, color: colors.textLight, align: "right",
    });
}
function addFooter(s, colors, font) {
    s.addShape("rect", {
        x: MARGIN, y: H - 0.45, w: CONTENT_W, h: 0.008,
        fill: { color: colors.borderLight },
    });
    s.addText("slides-mcp  |  CONFIDENTIAL", {
        x: MARGIN, y: H - 0.4, w: 4, h: 0.3,
        fontSize: 7, fontFace: font, color: colors.textLight,
    });
}
// ============================================================================
// Cover Slide
// ============================================================================
function renderCover(pptx, slide, colors, font) {
    const s = pptx.addSlide();
    s.background = { color: colors.navy };
    s.addShape("rect", { x: 0, y: 0, w: W, h: 0.06, fill: { color: colors.blue } });
    s.addShape("rect", { x: 0, y: 1.5, w: 0.12, h: 4.0, fill: { color: colors.blue } });
    if (slide.subtitle) {
        s.addText(slide.subtitle, {
            x: 1.2, y: 1.8, w: 10.0, h: 0.4,
            fontSize: 11, fontFace: font, color: colors.blue, bold: true,
            charSpacing: 2,
        });
    }
    s.addText(slide.title, {
        x: 1.2, y: 2.4, w: 10.5, h: 2.0,
        fontSize: 34, fontFace: font, bold: true, color: colors.white,
        lineSpacingMultiple: 1.25,
    });
    s.addShape("rect", { x: 1.2, y: 4.6, w: 3.0, h: 0.04, fill: { color: colors.blue } });
    if (slide.keyInsight) {
        s.addText(slide.keyInsight, {
            x: 1.2, y: 4.9, w: 10.0, h: 0.4,
            fontSize: 13, fontFace: font, color: colors.textLight,
        });
    }
    s.addText("Powered by slides-mcp", {
        x: 1.2, y: 6.6, w: 4.0, h: 0.3,
        fontSize: 8, fontFace: font, color: colors.textLight, charSpacing: 1,
    });
    s.addText("CONFIDENTIAL", {
        x: 9.5, y: 6.6, w: 3.0, h: 0.3,
        fontSize: 8, fontFace: font, color: colors.textLight, align: "right", charSpacing: 2,
    });
    if (slide.notes)
        s.addNotes(slide.notes);
}
// ============================================================================
// Agenda Slide
// ============================================================================
function renderAgenda(pptx, slide, total, colors, font) {
    const s = pptx.addSlide();
    s.background = { color: colors.offWhite };
    addHeaderBand(s, slide.title, slide.order, total, colors, font);
    if (!slide.bullets)
        return;
    const cardH = 0.65;
    const gap = 0.12;
    const startY = 1.2;
    for (let i = 0; i < slide.bullets.length && i < 8; i++) {
        const y = startY + i * (cardH + gap);
        const isEven = i % 2 === 0;
        s.addShape("rect", {
            x: MARGIN, y, w: CONTENT_W, h: cardH,
            fill: { color: isEven ? colors.white : colors.warmGray },
            rectRadius: 0.04,
        });
        s.addShape("rect", {
            x: MARGIN + 0.2, y: y + 0.12, w: 0.42, h: 0.42,
            fill: { color: colors.blue }, rectRadius: 0.21,
        });
        s.addText(`${i + 1}`, {
            x: MARGIN + 0.2, y: y + 0.12, w: 0.42, h: 0.42,
            fontSize: 14, fontFace: font, bold: true, color: colors.white,
            align: "center", valign: "middle",
        });
        s.addText(slide.bullets[i], {
            x: MARGIN + 0.85, y: y + 0.1, w: CONTENT_W - 1.2, h: 0.45,
            fontSize: 14, fontFace: font, color: colors.text, valign: "middle",
        });
    }
    addFooter(s, colors, font);
}
// ============================================================================
// Section Header Slide
// ============================================================================
function renderSectionHeader(pptx, slide, total, colors, font) {
    const s = pptx.addSlide();
    s.background = { color: colors.navy };
    s.addShape("rect", { x: 0, y: 0, w: 0.06, h: H, fill: { color: colors.blue } });
    s.addText("SECTION", {
        x: 1.2, y: 2.2, w: 3.0, h: 0.4,
        fontSize: 10, fontFace: font, color: colors.blue, bold: true, charSpacing: 3,
    });
    s.addText(slide.title, {
        x: 1.2, y: 2.8, w: 10.0, h: 1.2,
        fontSize: 30, fontFace: font, bold: true, color: colors.white,
    });
    s.addShape("rect", { x: 1.2, y: 4.2, w: 2.5, h: 0.04, fill: { color: colors.blue } });
    if (slide.subtitle) {
        s.addText(slide.subtitle, {
            x: 1.2, y: 4.5, w: 10.0, h: 0.4,
            fontSize: 12, fontFace: font, color: colors.textLight,
        });
    }
    s.addText(`${slide.order} / ${total}`, {
        x: 11.0, y: 6.8, w: 1.8, h: 0.4,
        fontSize: 9, fontFace: font, color: colors.textLight, align: "right",
    });
}
// ============================================================================
// Key Insight Slide
// ============================================================================
function renderKeyInsight(pptx, slide, total, colors, font) {
    const s = pptx.addSlide();
    s.background = { color: colors.offWhite };
    addHeaderBand(s, slide.title, slide.order, total, colors, font);
    s.addText("KEY INSIGHT", {
        x: MARGIN, y: 1.3, w: 3.0, h: 0.4,
        fontSize: 9, fontFace: font, color: colors.teal, bold: true, charSpacing: 3,
    });
    s.addShape("rect", {
        x: MARGIN, y: 1.9, w: CONTENT_W, h: 3.2,
        fill: { color: colors.tealLight },
        line: { color: colors.teal, width: 1.5 },
        rectRadius: 0.06,
    });
    s.addShape("rect", {
        x: MARGIN, y: 1.9, w: 0.08, h: 3.2,
        fill: { color: colors.teal },
    });
    s.addText("\u201C", {
        x: MARGIN + 0.4, y: 1.9, w: 0.8, h: 0.8,
        fontSize: 42, fontFace: "Georgia", color: colors.teal, bold: true,
    });
    if (slide.keyInsight) {
        s.addText(slide.keyInsight, {
            x: MARGIN + 0.5, y: 2.7, w: CONTENT_W - 1.2, h: 2.0,
            fontSize: 18, fontFace: font, color: colors.text,
            lineSpacingMultiple: 1.5, valign: "top",
        });
    }
    addFooter(s, colors, font);
}
// ============================================================================
// Content Slide — 본문 (번호 불릿 + 하위 항목)
// ============================================================================
function renderContent(pptx, slide, total, colors, font) {
    const s = pptx.addSlide();
    s.background = { color: colors.offWhite };
    addHeaderBand(s, slide.title, slide.order, total, colors, font);
    let curY = 1.15;
    if (slide.subtitle) {
        s.addShape("rect", {
            x: MARGIN, y: curY, w: CONTENT_W, h: 0.45,
            fill: { color: colors.blueLight }, rectRadius: 0.03,
        });
        s.addText(slide.subtitle, {
            x: MARGIN + 0.2, y: curY + 0.02, w: CONTENT_W - 0.4, h: 0.4,
            fontSize: 11, fontFace: font, color: colors.blue, bold: true,
        });
        curY += 0.6;
    }
    if (slide.bullets && slide.bullets.length > 0) {
        const subMap = (slide.subBullets || {});
        const items = [];
        for (let i = 0; i < slide.bullets.length; i++) {
            items.push({
                text: slide.bullets[i],
                options: {
                    fontSize: 12.5,
                    fontFace: font,
                    color: colors.text,
                    bullet: { type: "number", numberStartAt: i + 1 },
                    paraSpaceBefore: i === 0 ? 2 : 4,
                    paraSpaceAfter: subMap[i] ? 1 : 4,
                    indentLevel: 0,
                    lineSpacingMultiple: 1.3,
                },
            });
            if (subMap[i]) {
                for (const sub of subMap[i]) {
                    items.push({
                        text: sub,
                        options: {
                            fontSize: 10.5,
                            fontFace: font,
                            color: colors.textSec,
                            bullet: { code: "2013" },
                            paraSpaceAfter: 2,
                            indentLevel: 1,
                            lineSpacingMultiple: 1.2,
                        },
                    });
                }
            }
        }
        s.addText(items, {
            x: MARGIN, y: curY, w: CONTENT_W, h: H - curY - 0.6,
            valign: "top",
        });
    }
    addFooter(s, colors, font);
    if (slide.notes)
        s.addNotes(slide.notes);
}
// ============================================================================
// Two Column / Metrics Slide — 카드 + 라벨/값 분리
// ============================================================================
function renderTwoColumn(pptx, slide, total, colors, font) {
    const s = pptx.addSlide();
    s.background = { color: colors.offWhite };
    addHeaderBand(s, slide.title, slide.order, total, colors, font);
    if (!slide.bullets)
        return;
    const cols = Math.min(slide.bullets.length, 4);
    const cardW = (CONTENT_W - (cols - 1) * 0.2) / cols;
    const cardH = 2.8;
    const startY = 1.6;
    s.addText("핵심 지표 요약", {
        x: MARGIN, y: 1.1, w: 4.0, h: 0.35,
        fontSize: 9, fontFace: font, color: colors.textLight, bold: true, charSpacing: 1,
    });
    const accents = [colors.blue, colors.teal, colors.amber, colors.navyLight];
    for (let i = 0; i < cols; i++) {
        const x = MARGIN + i * (cardW + 0.2);
        const parts = slide.bullets[i].split(/[:：]\s*/);
        const label = parts[0] || "";
        const value = parts.slice(1).join(": ") || parts[0] || "";
        const accent = accents[i % accents.length];
        s.addShape("rect", {
            x, y: startY, w: cardW, h: cardH,
            fill: { color: colors.white },
            line: { color: colors.borderLight, width: 0.5 },
            shadow: { type: "outer", blur: 6, opacity: 0.06, offset: 2, color: "000000" },
            rectRadius: 0.06,
        });
        s.addShape("rect", {
            x, y: startY, w: cardW, h: 0.06,
            fill: { color: accent },
        });
        s.addText(label, {
            x: x + 0.25, y: startY + 0.35, w: cardW - 0.5, h: 0.5,
            fontSize: 10, fontFace: font, color: colors.textLight, bold: true,
        });
        s.addText(value, {
            x: x + 0.25, y: startY + 0.9, w: cardW - 0.5, h: 1.2,
            fontSize: 20, fontFace: font, bold: true, color: colors.text,
            valign: "top",
        });
    }
    addFooter(s, colors, font);
}
// ============================================================================
// Table Slide — 스타일 테이블 (교차 행 색상, 헤더 네이비)
// ============================================================================
function renderTable(pptx, slide, total, colors, font) {
    const s = pptx.addSlide();
    s.background = { color: colors.offWhite };
    addHeaderBand(s, slide.title, slide.order, total, colors, font);
    if (!slide.tableData)
        return;
    const { headers, rows } = slide.tableData;
    const tableRows = [
        headers.map((h) => ({ text: h, options: { bold: true, color: colors.white, fill: { color: colors.navy }, fontSize: 11, fontFace: font } })),
        ...rows.map((row, ri) => row.map((cell) => ({
            text: cell,
            options: { fontSize: 10, fontFace: font, color: colors.text, fill: { color: ri % 2 === 0 ? colors.white : colors.warmGray } },
        }))),
    ];
    const colW = Math.min((CONTENT_W - 0.2) / headers.length, 3.5);
    s.addTable(tableRows, {
        x: MARGIN,
        y: 1.2,
        w: CONTENT_W,
        colW: Array(headers.length).fill(colW),
        border: { type: "solid", pt: 0.5, color: colors.borderLight },
        rowH: 0.4,
        autoPage: false,
    });
    addFooter(s, colors, font);
    if (slide.notes)
        s.addNotes(slide.notes);
}
// ============================================================================
// Process Flow Slide — 수평 화살표 프로세스
// ============================================================================
function renderProcess(pptx, slide, total, colors, font) {
    const s = pptx.addSlide();
    s.background = { color: colors.offWhite };
    addHeaderBand(s, slide.title, slide.order, total, colors, font);
    if (!slide.processSteps)
        return;
    const steps = slide.processSteps;
    const count = Math.min(steps.length, 6);
    const stepW = 1.6;
    const gap = 0.35;
    const totalW = count * stepW + (count - 1) * gap;
    const startX = (W - totalW) / 2;
    const centerY = 3.2;
    const stepColors = [colors.blue, colors.navyLight, colors.teal, colors.blue, colors.navyLight, colors.teal];
    for (let i = 0; i < count; i++) {
        const x = startX + i * (stepW + gap);
        const color = stepColors[i % stepColors.length];
        s.addShape("rect", {
            x: x + stepW / 2 - 0.25, y: centerY - 0.8, w: 0.5, h: 0.5,
            fill: { color }, rectRadius: 0.25,
        });
        s.addText(`${i + 1}`, {
            x: x + stepW / 2 - 0.25, y: centerY - 0.8, w: 0.5, h: 0.5,
            fontSize: 14, fontFace: font, bold: true, color: colors.white,
            align: "center", valign: "middle",
        });
        s.addShape("rect", {
            x, y: centerY, w: stepW, h: 1.8,
            fill: { color: colors.white },
            line: { color: colors.borderLight, width: 0.5 },
            shadow: { type: "outer", blur: 4, opacity: 0.06, offset: 2, color: "000000" },
            rectRadius: 0.06,
        });
        s.addShape("rect", { x, y: centerY, w: stepW, h: 0.05, fill: { color } });
        s.addText(steps[i].label, {
            x: x + 0.1, y: centerY + 0.2, w: stepW - 0.2, h: 0.6,
            fontSize: 10, fontFace: font, bold: true, color: colors.text,
            align: "center", valign: "top",
        });
        if (steps[i].description) {
            s.addText(steps[i].description, {
                x: x + 0.1, y: centerY + 0.8, w: stepW - 0.2, h: 0.8,
                fontSize: 8, fontFace: font, color: colors.textSec,
                align: "center", valign: "top",
            });
        }
        if (i < count - 1) {
            const arrowX = x + stepW + 0.05;
            s.addText("\u25B6", {
                x: arrowX, y: centerY + 0.7, w: gap - 0.1, h: 0.4,
                fontSize: 14, color: colors.textLight, align: "center", valign: "middle",
            });
        }
    }
    addFooter(s, colors, font);
}
// ============================================================================
// Timeline Slide — 세로 타임라인 (마일스톤)
// ============================================================================
function renderTimeline(pptx, slide, total, colors, font) {
    const s = pptx.addSlide();
    s.background = { color: colors.offWhite };
    addHeaderBand(s, slide.title, slide.order, total, colors, font);
    if (!slide.processSteps)
        return;
    const steps = slide.processSteps;
    const count = Math.min(steps.length, 8);
    const lineX = 2.0;
    const startY = 1.4;
    const stepH = 0.7;
    s.addShape("rect", {
        x: lineX - 0.015, y: startY, w: 0.03, h: count * stepH,
        fill: { color: colors.blue },
    });
    const statusColors = { "완료": colors.teal, "진행중": colors.blue, "예정": colors.textLight };
    for (let i = 0; i < count; i++) {
        const y = startY + i * stepH;
        const status = steps[i].description || "예정";
        const dotColor = statusColors[status] || colors.textLight;
        s.addShape("rect", {
            x: lineX - 0.1, y: y + 0.15, w: 0.2, h: 0.2,
            fill: { color: dotColor }, rectRadius: 0.1,
        });
        s.addText(steps[i].label, {
            x: lineX + 0.4, y: y + 0.05, w: 8.0, h: 0.35,
            fontSize: 12, fontFace: font, color: colors.text, bold: true,
        });
        s.addText(status, {
            x: lineX + 0.4, y: y + 0.35, w: 2.0, h: 0.25,
            fontSize: 9, fontFace: font, color: dotColor, bold: true,
        });
    }
    // 범례
    const legendY = startY + count * stepH + 0.3;
    const legendItems = [
        { label: "완료", color: colors.teal },
        { label: "진행중", color: colors.blue },
        { label: "예정", color: colors.textLight },
    ];
    for (let i = 0; i < legendItems.length; i++) {
        const lx = lineX + 0.4 + i * 1.5;
        s.addShape("rect", { x: lx, y: legendY + 0.05, w: 0.15, h: 0.15, fill: { color: legendItems[i].color }, rectRadius: 0.075 });
        s.addText(legendItems[i].label, { x: lx + 0.25, y: legendY, w: 1.0, h: 0.25, fontSize: 8, fontFace: font, color: colors.textSec });
    }
    addFooter(s, colors, font);
}
// ============================================================================
// Closing Slide
// ============================================================================
function renderClosing(pptx, slide, colors, font) {
    const s = pptx.addSlide();
    s.background = { color: colors.navy };
    s.addShape("rect", { x: 0, y: 0, w: W, h: 0.06, fill: { color: colors.blue } });
    s.addText(slide.title, {
        x: 1.5, y: 2.2, w: 10.0, h: 1.0,
        fontSize: 32, fontFace: font, bold: true, color: colors.white, align: "center",
    });
    s.addShape("rect", { x: 5.5, y: 3.4, w: 2.33, h: 0.04, fill: { color: colors.blue } });
    if (slide.subtitle) {
        s.addText(slide.subtitle, {
            x: 1.5, y: 3.7, w: 10.0, h: 0.6,
            fontSize: 15, fontFace: font, color: colors.textLight, align: "center",
        });
    }
    if (slide.keyInsight) {
        s.addText(slide.keyInsight, {
            x: 1.5, y: 4.4, w: 10.0, h: 0.5,
            fontSize: 11, fontFace: font, color: colors.textLight, align: "center",
        });
    }
    s.addText("Powered by slides-mcp", {
        x: 1.5, y: 6.5, w: 10.0, h: 0.4,
        fontSize: 9, fontFace: font, color: colors.textLight, align: "center", charSpacing: 1,
    });
}
// ============================================================================
// Main Export
// ============================================================================
export async function renderToPptx(slides, title, options) {
    const mod = await import("pptxgenjs");
    const PptxGenJS = mod.default ?? mod;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pptx = new PptxGenJS();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "slides-mcp";
    pptx.title = title;
    // 커스텀 디자인 토큰 적용
    const colors = { ...DEFAULT_COLORS };
    if (options?.design?.primaryColor)
        colors.navy = options.design.primaryColor.replace("#", "");
    if (options?.design?.accentColor)
        colors.blue = options.design.accentColor.replace("#", "");
    const font = options?.design?.fontFamily || DEFAULT_FONT;
    const total = slides.length;
    for (const slide of slides) {
        switch (slide.layout) {
            case "cover":
                renderCover(pptx, slide, colors, font);
                break;
            case "agenda":
                renderAgenda(pptx, slide, total, colors, font);
                break;
            case "section_header":
                renderSectionHeader(pptx, slide, total, colors, font);
                break;
            case "key_insight":
                renderKeyInsight(pptx, slide, total, colors, font);
                break;
            case "two_column":
                renderTwoColumn(pptx, slide, total, colors, font);
                break;
            case "table":
                renderTable(pptx, slide, total, colors, font);
                break;
            case "process":
                renderProcess(pptx, slide, total, colors, font);
                break;
            case "timeline":
                renderTimeline(pptx, slide, total, colors, font);
                break;
            case "closing":
                renderClosing(pptx, slide, colors, font);
                break;
            default:
                renderContent(pptx, slide, total, colors, font);
                break;
        }
    }
    // Node.js: Buffer로 생성 후 파일 저장
    const fileName = title.replace(/[^\w가-힣\s-]/g, "").trim().replace(/\s+/g, "_");
    const outputPath = options?.outputPath || join(tmpdir(), `${fileName}_${Date.now()}.pptx`);
    const data = await pptx.write({ outputType: "nodebuffer" });
    writeFileSync(outputPath, data);
    return { filePath: outputPath, fileSize: data.length };
}
//# sourceMappingURL=pptx-renderer.js.map