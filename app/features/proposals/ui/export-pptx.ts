/**
 * 클라이언트 사이드 PPTX 생성 + 다운로드 — v3 Consulting Firm Grade
 * 폰트: Malgun Gothic (맑은 고딕, Windows 내장) — 한글 인코딩 완벽 지원
 * 디자인: KPMG/McKinsey 참조 — 헤더 밴드, 번호 콜아웃, 표 레이아웃, 소스 라인
 */

interface Slide {
  order: number;
  layout: string;
  title: string;
  subtitle?: string;
  bullets?: string[];
  subBullets?: Record<number, string[]>;
  keyInsight?: string;
  notes?: string;
  tableData?: { headers: string[]; rows: string[][] };
  processSteps?: Array<{ label: string; description?: string }>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Pptx = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PptxSlide = any;

// ============================================================================
// Design Tokens
// ============================================================================

const C = {
  // Primary
  navy: "0C2340",          // KPMG-style deep navy
  navyLight: "1B3A5C",    // lighter navy for gradients
  // Accent
  blue: "0066CC",          // primary accent
  blueLight: "E8F0FE",    // light blue bg
  teal: "007B83",          // secondary accent
  tealLight: "E6F3F4",    // light teal bg
  // Neutral
  white: "FFFFFF",
  offWhite: "F7F8FA",
  warmGray: "F0EFED",     // KPMG warm tone
  text: "2D2D2D",
  textSec: "5A5A5A",
  textLight: "8C8C8C",
  border: "D4D4D4",
  borderLight: "E8E8E8",
  // Highlight
  amber: "D97706",
  amberLight: "FEF3C7",
} as const;

// 한글 호환 폰트 — Windows/Mac 모두 지원
const FONT = "Malgun Gothic";

// 슬라이드 치수 (인치, LAYOUT_WIDE 13.33 x 7.5)
const W = 13.33;
const H = 7.5;
const MARGIN = 0.7;
const CONTENT_W = W - MARGIN * 2;

// ============================================================================
// Common Elements
// ============================================================================

function addHeaderBand(s: PptxSlide, title: string, slideNum: number, total: number) {
  // 네이비 헤더 밴드
  s.addShape("rect", {
    x: 0, y: 0, w: W, h: 0.85,
    fill: { color: C.navy },
  });
  // 헤더 좌측 악센트 라인
  s.addShape("rect", {
    x: 0, y: 0, w: 0.06, h: 0.85,
    fill: { color: C.blue },
  });
  // 제목
  s.addText(title, {
    x: MARGIN + 0.1, y: 0.12, w: 9.5, h: 0.6,
    fontSize: 18, fontFace: FONT, bold: true, color: C.white,
  });
  // 페이지 번호
  s.addText(`${slideNum} / ${total}`, {
    x: 11.0, y: 0.18, w: 1.8, h: 0.5,
    fontSize: 9, fontFace: FONT, color: C.textLight, align: "right",
  });
}

function addFooter(s: PptxSlide) {
  // 하단 구분선
  s.addShape("rect", {
    x: MARGIN, y: H - 0.45, w: CONTENT_W, h: 0.008,
    fill: { color: C.borderLight },
  });
  // 좌측 브랜딩
  s.addText("Discovery-X  |  CONFIDENTIAL", {
    x: MARGIN, y: H - 0.4, w: 4, h: 0.3,
    fontSize: 7, fontFace: FONT, color: C.textLight,
  });
}

// ============================================================================
// Cover Slide
// ============================================================================

function renderCover(pptx: Pptx, slide: Slide) {
  const s = pptx.addSlide();
  s.background = { color: C.navy };

  // 상단 블루 악센트 바
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.06, fill: { color: C.blue } });

  // 좌측 세로 악센트 블록
  s.addShape("rect", { x: 0, y: 1.5, w: 0.12, h: 4.0, fill: { color: C.blue } });

  // 카테고리 / 날짜 라벨
  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 1.2, y: 1.8, w: 10.0, h: 0.4,
      fontSize: 11, fontFace: FONT, color: C.blue, bold: true,
      charSpacing: 2,
    });
  }

  // 메인 제목
  s.addText(slide.title, {
    x: 1.2, y: 2.4, w: 10.5, h: 2.0,
    fontSize: 34, fontFace: FONT, bold: true, color: C.white,
    lineSpacingMultiple: 1.25,
  });

  // 구분선
  s.addShape("rect", { x: 1.2, y: 4.6, w: 3.0, h: 0.04, fill: { color: C.blue } });

  // 발표자
  if (slide.keyInsight) {
    s.addText(slide.keyInsight, {
      x: 1.2, y: 4.9, w: 10.0, h: 0.4,
      fontSize: 13, fontFace: FONT, color: C.textLight,
    });
  }

  // 하단 브랜딩
  s.addText("Powered by Discovery-X", {
    x: 1.2, y: 6.6, w: 4.0, h: 0.3,
    fontSize: 8, fontFace: FONT, color: C.textLight, charSpacing: 1,
  });
  s.addText("CONFIDENTIAL", {
    x: 9.5, y: 6.6, w: 3.0, h: 0.3,
    fontSize: 8, fontFace: FONT, color: C.textLight, align: "right", charSpacing: 2,
  });

  if (slide.notes) s.addNotes(slide.notes);
}

// ============================================================================
// Agenda Slide
// ============================================================================

function renderAgenda(pptx: Pptx, slide: Slide, total: number) {
  const s = pptx.addSlide();
  s.background = { color: C.offWhite };
  addHeaderBand(s, slide.title, slide.order, total);

  if (!slide.bullets) return;

  // 번호 매긴 아젠다 — 카드 형태
  const cardH = 0.65;
  const gap = 0.12;
  const startY = 1.2;

  for (let i = 0; i < slide.bullets.length && i < 8; i++) {
    const y = startY + i * (cardH + gap);
    const isEven = i % 2 === 0;

    // 카드 배경
    s.addShape("rect", {
      x: MARGIN, y, w: CONTENT_W, h: cardH,
      fill: { color: isEven ? C.white : C.warmGray },
      rectRadius: 0.04,
    });

    // 번호 원형 배지
    s.addShape("rect", {
      x: MARGIN + 0.2, y: y + 0.12, w: 0.42, h: 0.42,
      fill: { color: C.blue }, rectRadius: 0.21,
    });
    s.addText(`${i + 1}`, {
      x: MARGIN + 0.2, y: y + 0.12, w: 0.42, h: 0.42,
      fontSize: 14, fontFace: FONT, bold: true, color: C.white,
      align: "center", valign: "middle",
    });

    // 아젠다 텍스트
    s.addText(slide.bullets[i], {
      x: MARGIN + 0.85, y: y + 0.1, w: CONTENT_W - 1.2, h: 0.45,
      fontSize: 14, fontFace: FONT, color: C.text, valign: "middle",
    });
  }

  addFooter(s);
}

// ============================================================================
// Section Header Slide
// ============================================================================

function renderSectionHeader(pptx: Pptx, slide: Slide, total: number) {
  const s = pptx.addSlide();
  s.background = { color: C.navy };

  // 좌측 악센트
  s.addShape("rect", { x: 0, y: 0, w: 0.06, h: H, fill: { color: C.blue } });

  // 섹션 번호 라벨
  s.addText("SECTION", {
    x: 1.2, y: 2.2, w: 3.0, h: 0.4,
    fontSize: 10, fontFace: FONT, color: C.blue, bold: true, charSpacing: 3,
  });

  // 제목
  s.addText(slide.title, {
    x: 1.2, y: 2.8, w: 10.0, h: 1.2,
    fontSize: 30, fontFace: FONT, bold: true, color: C.white,
  });

  // 구분선
  s.addShape("rect", { x: 1.2, y: 4.2, w: 2.5, h: 0.04, fill: { color: C.blue } });

  // 포함 섹션 라벨
  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 1.2, y: 4.5, w: 10.0, h: 0.4,
      fontSize: 12, fontFace: FONT, color: C.textLight,
    });
  }

  // 페이지 번호
  s.addText(`${slide.order} / ${total}`, {
    x: 11.0, y: 6.8, w: 1.8, h: 0.4,
    fontSize: 9, fontFace: FONT, color: C.textLight, align: "right",
  });
}

// ============================================================================
// Key Insight Slide
// ============================================================================

function renderKeyInsight(pptx: Pptx, slide: Slide, total: number) {
  const s = pptx.addSlide();
  s.background = { color: C.offWhite };
  addHeaderBand(s, slide.title, slide.order, total);

  // 라벨
  s.addText("KEY INSIGHT", {
    x: MARGIN, y: 1.3, w: 3.0, h: 0.4,
    fontSize: 9, fontFace: FONT, color: C.teal, bold: true, charSpacing: 3,
  });

  // 인사이트 카드
  s.addShape("rect", {
    x: MARGIN, y: 1.9, w: CONTENT_W, h: 3.2,
    fill: { color: C.tealLight },
    line: { color: C.teal, width: 1.5 },
    rectRadius: 0.06,
  });

  // 좌측 틸 악센트 바 (카드 내부)
  s.addShape("rect", {
    x: MARGIN, y: 1.9, w: 0.08, h: 3.2,
    fill: { color: C.teal },
  });

  // 큰 따옴표
  s.addText("\u201C", {
    x: MARGIN + 0.4, y: 1.9, w: 0.8, h: 0.8,
    fontSize: 42, fontFace: "Georgia", color: C.teal, bold: true,
  });

  // 핵심 메시지
  if (slide.keyInsight) {
    s.addText(slide.keyInsight, {
      x: MARGIN + 0.5, y: 2.7, w: CONTENT_W - 1.2, h: 2.0,
      fontSize: 18, fontFace: FONT, color: C.text,
      lineSpacingMultiple: 1.5, valign: "top",
    });
  }

  addFooter(s);
}

// ============================================================================
// Content Slide — 본문 (번호 불릿 + 하위 항목)
// ============================================================================

function renderContent(pptx: Pptx, slide: Slide, total: number) {
  const s = pptx.addSlide();
  s.background = { color: C.offWhite };
  addHeaderBand(s, slide.title, slide.order, total);

  let curY = 1.15;

  // 서브타이틀 (블록 헤딩)
  if (slide.subtitle) {
    s.addShape("rect", {
      x: MARGIN, y: curY, w: CONTENT_W, h: 0.45,
      fill: { color: C.blueLight }, rectRadius: 0.03,
    });
    s.addText(slide.subtitle, {
      x: MARGIN + 0.2, y: curY + 0.02, w: CONTENT_W - 0.4, h: 0.4,
      fontSize: 11, fontFace: FONT, color: C.blue, bold: true,
    });
    curY += 0.6;
  }

  // 불릿 포인트
  if (slide.bullets && slide.bullets.length > 0) {
    const subMap = (slide.subBullets || {}) as Record<number, string[]>;
    const items: Array<{ text: string; options: Record<string, unknown> }> = [];

    for (let i = 0; i < slide.bullets.length; i++) {
      // 메인 불릿 — 번호 스타일
      items.push({
        text: slide.bullets[i],
        options: {
          fontSize: 12.5,
          fontFace: FONT,
          color: C.text,
          bullet: { type: "number", numberStartAt: i + 1 },
          paraSpaceBefore: i === 0 ? 2 : 4,
          paraSpaceAfter: subMap[i] ? 1 : 4,
          indentLevel: 0,
          lineSpacingMultiple: 1.3,
        },
      });

      // 하위 불릿
      if (subMap[i]) {
        for (const sub of subMap[i]) {
          items.push({
            text: sub,
            options: {
              fontSize: 10.5,
              fontFace: FONT,
              color: C.textSec,
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

  addFooter(s);
  if (slide.notes) s.addNotes(slide.notes);
}

// ============================================================================
// Two Column / Metrics Slide — 카드 + 라벨/값 분리
// ============================================================================

function renderTwoColumn(pptx: Pptx, slide: Slide, total: number) {
  const s = pptx.addSlide();
  s.background = { color: C.offWhite };
  addHeaderBand(s, slide.title, slide.order, total);

  if (!slide.bullets) return;

  const cols = Math.min(slide.bullets.length, 4);
  const cardW = (CONTENT_W - (cols - 1) * 0.2) / cols;
  const cardH = 2.8;
  const startY = 1.6;

  // 라벨
  s.addText("핵심 지표 요약", {
    x: MARGIN, y: 1.1, w: 4.0, h: 0.35,
    fontSize: 9, fontFace: FONT, color: C.textLight, bold: true, charSpacing: 1,
  });

  const accents = [C.blue, C.teal, C.amber, C.navyLight];

  for (let i = 0; i < cols; i++) {
    const x = MARGIN + i * (cardW + 0.2);
    const parts = slide.bullets[i].split(/[:：]\s*/);
    const label = parts[0] || "";
    const value = parts.slice(1).join(": ") || parts[0] || "";
    const accent = accents[i % accents.length];

    // 카드
    s.addShape("rect", {
      x, y: startY, w: cardW, h: cardH,
      fill: { color: C.white },
      line: { color: C.borderLight, width: 0.5 },
      shadow: { type: "outer", blur: 6, opacity: 0.06, offset: 2, color: "000000" },
      rectRadius: 0.06,
    });

    // 상단 악센트 바
    s.addShape("rect", {
      x, y: startY, w: cardW, h: 0.06,
      fill: { color: accent },
    });

    // 라벨
    s.addText(label, {
      x: x + 0.25, y: startY + 0.35, w: cardW - 0.5, h: 0.5,
      fontSize: 10, fontFace: FONT, color: C.textLight, bold: true,
    });

    // 값 — 큰 숫자 스타일
    s.addText(value, {
      x: x + 0.25, y: startY + 0.9, w: cardW - 0.5, h: 1.2,
      fontSize: 20, fontFace: FONT, bold: true, color: C.text,
      valign: "top",
    });
  }

  addFooter(s);
}

// ============================================================================
// Closing Slide
// ============================================================================

// ============================================================================
// Table Slide — 스타일 테이블 (교차 행 색상, 헤더 네이비)
// ============================================================================

function renderTable(pptx: Pptx, slide: Slide, total: number) {
  const s = pptx.addSlide();
  s.background = { color: C.offWhite };
  addHeaderBand(s, slide.title, slide.order, total);

  if (!slide.tableData) return;
  const { headers, rows } = slide.tableData;

  const tableRows = [
    headers.map((h) => ({ text: h, options: { bold: true, color: C.white, fill: { color: C.navy }, fontSize: 11, fontFace: FONT } })),
    ...rows.map((row, ri) =>
      row.map((cell) => ({
        text: cell,
        options: { fontSize: 10, fontFace: FONT, color: C.text, fill: { color: ri % 2 === 0 ? C.white : C.warmGray } },
      })),
    ),
  ];

  const colW = Math.min((CONTENT_W - 0.2) / headers.length, 3.5);

  s.addTable(tableRows, {
    x: MARGIN,
    y: 1.2,
    w: CONTENT_W,
    colW: Array(headers.length).fill(colW),
    border: { type: "solid", pt: 0.5, color: C.borderLight },
    rowH: 0.4,
    autoPage: false,
  });

  addFooter(s);
  if (slide.notes) s.addNotes(slide.notes);
}

// ============================================================================
// Process Flow Slide — 수평 화살표 프로세스
// ============================================================================

function renderProcess(pptx: Pptx, slide: Slide, total: number) {
  const s = pptx.addSlide();
  s.background = { color: C.offWhite };
  addHeaderBand(s, slide.title, slide.order, total);

  if (!slide.processSteps) return;
  const steps = slide.processSteps;
  const count = Math.min(steps.length, 6);
  const stepW = 1.6;
  const gap = 0.35;
  const totalW = count * stepW + (count - 1) * gap;
  const startX = (W - totalW) / 2;
  const centerY = 3.2;

  const stepColors = [C.blue, C.navyLight, C.teal, C.blue, C.navyLight, C.teal];

  for (let i = 0; i < count; i++) {
    const x = startX + i * (stepW + gap);
    const color = stepColors[i % stepColors.length];

    // 원형 번호
    s.addShape("rect", {
      x: x + stepW / 2 - 0.25, y: centerY - 0.8, w: 0.5, h: 0.5,
      fill: { color }, rectRadius: 0.25,
    });
    s.addText(`${i + 1}`, {
      x: x + stepW / 2 - 0.25, y: centerY - 0.8, w: 0.5, h: 0.5,
      fontSize: 14, fontFace: FONT, bold: true, color: C.white,
      align: "center", valign: "middle",
    });

    // 단계 카드
    s.addShape("rect", {
      x, y: centerY, w: stepW, h: 1.8,
      fill: { color: C.white },
      line: { color: C.borderLight, width: 0.5 },
      shadow: { type: "outer", blur: 4, opacity: 0.06, offset: 2, color: "000000" },
      rectRadius: 0.06,
    });

    // 상단 색상 바
    s.addShape("rect", { x, y: centerY, w: stepW, h: 0.05, fill: { color } });

    // 단계명
    s.addText(steps[i].label, {
      x: x + 0.1, y: centerY + 0.2, w: stepW - 0.2, h: 0.6,
      fontSize: 10, fontFace: FONT, bold: true, color: C.text,
      align: "center", valign: "top",
    });

    // 설명
    if (steps[i].description) {
      s.addText(steps[i].description!, {
        x: x + 0.1, y: centerY + 0.8, w: stepW - 0.2, h: 0.8,
        fontSize: 8, fontFace: FONT, color: C.textSec,
        align: "center", valign: "top",
      });
    }

    // 화살표 (마지막 제외)
    if (i < count - 1) {
      const arrowX = x + stepW + 0.05;
      s.addText("\u25B6", {
        x: arrowX, y: centerY + 0.7, w: gap - 0.1, h: 0.4,
        fontSize: 14, color: C.textLight, align: "center", valign: "middle",
      });
    }
  }

  addFooter(s);
}

// ============================================================================
// Timeline Slide — 세로 타임라인 (마일스톤)
// ============================================================================

function renderTimeline(pptx: Pptx, slide: Slide, total: number) {
  const s = pptx.addSlide();
  s.background = { color: C.offWhite };
  addHeaderBand(s, slide.title, slide.order, total);

  if (!slide.processSteps) return;
  const steps = slide.processSteps;
  const count = Math.min(steps.length, 8);
  const lineX = 2.0;
  const startY = 1.4;
  const stepH = 0.7;

  // 세로 메인 라인
  s.addShape("rect", {
    x: lineX - 0.015, y: startY, w: 0.03, h: count * stepH,
    fill: { color: C.blue },
  });

  const statusColors: Record<string, string> = { "완료": C.teal, "진행중": C.blue, "예정": C.textLight };

  for (let i = 0; i < count; i++) {
    const y = startY + i * stepH;
    const status = steps[i].description || "예정";
    const dotColor = statusColors[status] || C.textLight;

    // 도트
    s.addShape("rect", {
      x: lineX - 0.1, y: y + 0.15, w: 0.2, h: 0.2,
      fill: { color: dotColor }, rectRadius: 0.1,
    });

    // 라벨
    s.addText(steps[i].label, {
      x: lineX + 0.4, y: y + 0.05, w: 8.0, h: 0.35,
      fontSize: 12, fontFace: FONT, color: C.text, bold: true,
    });

    // 상태 배지
    s.addText(status, {
      x: lineX + 0.4, y: y + 0.35, w: 2.0, h: 0.25,
      fontSize: 9, fontFace: FONT, color: dotColor, bold: true,
    });
  }

  // 범례
  const legendY = startY + count * stepH + 0.3;
  const legendItems = [
    { label: "완료", color: C.teal },
    { label: "진행중", color: C.blue },
    { label: "예정", color: C.textLight },
  ];
  for (let i = 0; i < legendItems.length; i++) {
    const lx = lineX + 0.4 + i * 1.5;
    s.addShape("rect", { x: lx, y: legendY + 0.05, w: 0.15, h: 0.15, fill: { color: legendItems[i].color }, rectRadius: 0.075 });
    s.addText(legendItems[i].label, { x: lx + 0.25, y: legendY, w: 1.0, h: 0.25, fontSize: 8, fontFace: FONT, color: C.textSec });
  }

  addFooter(s);
}

// ============================================================================
// Closing Slide
// ============================================================================

function renderClosing(pptx: Pptx, slide: Slide) {
  const s = pptx.addSlide();
  s.background = { color: C.navy };

  // 상단 악센트
  s.addShape("rect", { x: 0, y: 0, w: W, h: 0.06, fill: { color: C.blue } });

  // 감사합니다
  s.addText(slide.title, {
    x: 1.5, y: 2.2, w: 10.0, h: 1.0,
    fontSize: 32, fontFace: FONT, bold: true, color: C.white, align: "center",
  });

  // 구분선
  s.addShape("rect", { x: 5.5, y: 3.4, w: 2.33, h: 0.04, fill: { color: C.blue } });

  // 제안 제목
  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 1.5, y: 3.7, w: 10.0, h: 0.6,
      fontSize: 15, fontFace: FONT, color: C.textLight, align: "center",
    });
  }

  // 발표자 / 카테고리
  if (slide.keyInsight) {
    s.addText(slide.keyInsight, {
      x: 1.5, y: 4.4, w: 10.0, h: 0.5,
      fontSize: 11, fontFace: FONT, color: C.textLight, align: "center",
    });
  }

  // 하단 브랜딩
  s.addText("Powered by Discovery-X", {
    x: 1.5, y: 6.5, w: 10.0, h: 0.4,
    fontSize: 9, fontFace: FONT, color: C.textLight, align: "center", charSpacing: 1,
  });
}

// ============================================================================
// Main Export
// ============================================================================

export async function exportToPptx(
  slides: Slide[],
  title: string,
): Promise<void> {
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();

  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "Discovery-X";
  pptx.title = title;

  const total = slides.length;

  for (const slide of slides) {
    switch (slide.layout) {
      case "cover":
        renderCover(pptx, slide);
        break;
      case "agenda":
        renderAgenda(pptx, slide, total);
        break;
      case "section_header":
        renderSectionHeader(pptx, slide, total);
        break;
      case "key_insight":
        renderKeyInsight(pptx, slide, total);
        break;
      case "two_column":
        renderTwoColumn(pptx, slide, total);
        break;
      case "table":
        renderTable(pptx, slide, total);
        break;
      case "process":
        renderProcess(pptx, slide, total);
        break;
      case "timeline":
        renderTimeline(pptx, slide, total);
        break;
      case "closing":
        renderClosing(pptx, slide);
        break;
      default:
        renderContent(pptx, slide, total);
        break;
    }
  }

  const fileName = title.replace(/[^\w가-힣\s-]/g, "").trim().replace(/\s+/g, "_");
  await pptx.writeFile({ fileName: `${fileName}.pptx` });
}
