/**
 * 클라이언트 사이드 PPTX 생성 + 다운로드 — v2 Corporate Editorial Design
 * pptxgenjs를 동적 import하여 서버 번들에 포함되지 않도록 함
 *
 * 디자인: 네이비 기조 + 블루 악센트 + 화이트 본문 — 컨설팅 펌 레벨
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
}

// ============================================================================
// Color Palette — Corporate Navy
// ============================================================================

const C = {
  navy: "0F172A",        // 표지/구분 배경
  navyMid: "1E293B",     // 어두운 서브
  accent: "2563EB",      // 블루 악센트
  accentLight: "3B82F6", // 밝은 블루
  teal: "0D9488",        // 보조 악센트
  white: "FFFFFF",
  offWhite: "F8FAFC",    // 본문 배경
  text: "1E293B",        // 본문 텍스트
  textSec: "475569",     // 보조 텍스트
  textLight: "94A3B8",   // 연한 텍스트
  divider: "E2E8F0",     // 구분선
  insightBg: "EFF6FF",   // Key Insight 배경
} as const;

const FONT_TITLE = "Pretendard";
const FONT_BODY = "Pretendard";

// ============================================================================
// Slide Renderers
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PptxInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PptxSlide = any;

function addFooter(s: PptxSlide, slideNum: number, totalSlides: number) {
  // 좌측 로고 텍스트
  s.addText("Discovery-X", {
    x: 0.5,
    y: 7.1,
    w: 2,
    h: 0.3,
    fontSize: 8,
    fontFace: FONT_BODY,
    color: C.textLight,
    bold: true,
  });
  // 우측 페이지 번호
  s.addText(`${slideNum} / ${totalSlides}`, {
    x: 11.0,
    y: 7.1,
    w: 1.8,
    h: 0.3,
    fontSize: 8,
    fontFace: FONT_BODY,
    color: C.textLight,
    align: "right",
  });
  // 구분선
  s.addShape("rect" as never, {
    x: 0.5,
    y: 7.05,
    w: 12.33,
    h: 0.01,
    fill: { color: C.divider },
  });
}

function renderCover(pptx: PptxInstance, slide: Slide) {
  const s = pptx.addSlide();
  s.background = { color: C.navy };

  // 상단 악센트 바
  s.addShape("rect" as never, {
    x: 0,
    y: 0,
    w: 13.33,
    h: 0.08,
    fill: { color: C.accent },
  });

  // 좌측 기하학적 장식 — 대각 블록
  s.addShape("rect" as never, {
    x: -0.3,
    y: 2.0,
    w: 0.6,
    h: 3.5,
    fill: { color: C.accent },
    rotate: 0,
  });

  // 메인 타이틀
  s.addText(slide.title, {
    x: 1.5,
    y: 2.2,
    w: 10.0,
    h: 1.8,
    fontSize: 36,
    fontFace: FONT_TITLE,
    bold: true,
    color: C.white,
    lineSpacingMultiple: 1.2,
  });

  // 카테고리/날짜
  if (slide.subtitle) {
    s.addText(slide.subtitle.toUpperCase(), {
      x: 1.5,
      y: 4.2,
      w: 10.0,
      h: 0.5,
      fontSize: 12,
      fontFace: FONT_BODY,
      color: C.accentLight,
      charSpacing: 3,
    });
  }

  // 구분선
  s.addShape("rect" as never, {
    x: 1.5,
    y: 4.9,
    w: 2.5,
    h: 0.03,
    fill: { color: C.accent },
  });

  // 발표자 이름
  if (slide.keyInsight) {
    s.addText(slide.keyInsight, {
      x: 1.5,
      y: 5.2,
      w: 10.0,
      h: 0.4,
      fontSize: 14,
      fontFace: FONT_BODY,
      color: C.textLight,
    });
  }

  // 하단 CONFIDENTIAL
  s.addText("CONFIDENTIAL", {
    x: 10.0,
    y: 6.9,
    w: 2.8,
    h: 0.3,
    fontSize: 8,
    fontFace: FONT_BODY,
    color: C.textLight,
    align: "right",
    charSpacing: 2,
  });

  if (slide.notes) s.addNotes(slide.notes);
}

function renderAgenda(pptx: PptxInstance, slide: Slide, totalSlides: number) {
  const s = pptx.addSlide();
  s.background = { color: C.offWhite };

  // 좌측 악센트 바
  s.addShape("rect" as never, {
    x: 0,
    y: 0,
    w: 0.08,
    h: 7.5,
    fill: { color: C.accent },
  });

  s.addText(slide.title, {
    x: 0.8,
    y: 0.5,
    w: 4.0,
    h: 0.7,
    fontSize: 24,
    fontFace: FONT_TITLE,
    bold: true,
    color: C.text,
  });

  // 번호 매긴 아젠다 아이템
  if (slide.bullets) {
    const items = slide.bullets.map((b, i) => ([
      {
        text: `${String(i + 1).padStart(2, "0")}`,
        options: {
          fontSize: 20,
          fontFace: FONT_TITLE,
          bold: true,
          color: C.accent,
        },
      },
      {
        text: `   ${b}`,
        options: {
          fontSize: 16,
          fontFace: FONT_BODY,
          color: C.text,
          breakType: "none" as const,
        },
      },
      {
        text: "",
        options: { fontSize: 8, paraSpaceAfter: 16 },
      },
    ])).flat();

    s.addText(items, {
      x: 0.8,
      y: 1.6,
      w: 11.0,
      h: 5.0,
      valign: "top",
    });
  }

  addFooter(s, slide.order, totalSlides);
}

function renderSectionHeader(pptx: PptxInstance, slide: Slide, totalSlides: number) {
  const s = pptx.addSlide();
  s.background = { color: C.navy };

  // 좌측 악센트
  s.addShape("rect" as never, {
    x: 0,
    y: 0,
    w: 0.08,
    h: 7.5,
    fill: { color: C.accent },
  });

  // 섹션 번호 느낌 장식
  s.addText(slide.title, {
    x: 1.5,
    y: 2.5,
    w: 10.0,
    h: 1.2,
    fontSize: 32,
    fontFace: FONT_TITLE,
    bold: true,
    color: C.white,
  });

  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 1.5,
      y: 3.9,
      w: 10.0,
      h: 0.5,
      fontSize: 14,
      fontFace: FONT_BODY,
      color: C.textLight,
    });
  }

  // 하단 구분선
  s.addShape("rect" as never, {
    x: 1.5,
    y: 4.7,
    w: 3.0,
    h: 0.04,
    fill: { color: C.accent },
  });

  addFooter(s, slide.order, totalSlides);
}

function renderKeyInsight(pptx: PptxInstance, slide: Slide, totalSlides: number) {
  const s = pptx.addSlide();
  s.background = { color: C.offWhite };

  // 좌측 악센트 바
  s.addShape("rect" as never, {
    x: 0,
    y: 0,
    w: 0.08,
    h: 7.5,
    fill: { color: C.teal },
  });

  // 라벨
  s.addText(`KEY INSIGHT  —  ${slide.title}`, {
    x: 0.8,
    y: 1.0,
    w: 11.0,
    h: 0.5,
    fontSize: 10,
    fontFace: FONT_BODY,
    color: C.teal,
    bold: true,
    charSpacing: 2,
  });

  // 인용 배경 박스
  s.addShape("rect" as never, {
    x: 0.8,
    y: 2.0,
    w: 11.5,
    h: 3.0,
    fill: { color: C.insightBg },
    rectRadius: 0.1,
  });

  // 큰 따옴표 장식
  s.addText("\u201C", {
    x: 1.2,
    y: 1.8,
    w: 1.0,
    h: 1.0,
    fontSize: 48,
    fontFace: "Georgia",
    color: C.accent,
    bold: true,
  });

  // 핵심 메시지
  if (slide.keyInsight) {
    s.addText(slide.keyInsight, {
      x: 1.5,
      y: 2.6,
      w: 10.0,
      h: 2.0,
      fontSize: 20,
      fontFace: FONT_BODY,
      color: C.text,
      lineSpacingMultiple: 1.4,
      valign: "middle",
    });
  }

  addFooter(s, slide.order, totalSlides);
}

function renderContent(pptx: PptxInstance, slide: Slide, totalSlides: number) {
  const s = pptx.addSlide();
  s.background = { color: C.offWhite };

  // 좌측 악센트 바
  s.addShape("rect" as never, {
    x: 0,
    y: 0,
    w: 0.08,
    h: 7.5,
    fill: { color: C.accent },
  });

  // 타이틀
  s.addText(slide.title, {
    x: 0.8,
    y: 0.4,
    w: 11.5,
    h: 0.7,
    fontSize: 22,
    fontFace: FONT_TITLE,
    bold: true,
    color: C.text,
  });

  // 서브타이틀 (블록 헤딩)
  let bulletY = 1.3;
  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 0.8,
      y: 1.15,
      w: 11.5,
      h: 0.4,
      fontSize: 12,
      fontFace: FONT_BODY,
      color: C.accent,
      bold: true,
    });
    bulletY = 1.6;
  }

  // 타이틀 하단 구분선
  s.addShape("rect" as never, {
    x: 0.8,
    y: bulletY - 0.05,
    w: 11.5,
    h: 0.015,
    fill: { color: C.divider },
  });

  // 불릿 포인트 + 하위 불릿
  if (slide.bullets && slide.bullets.length > 0) {
    const textItems: Array<{ text: string; options: Record<string, unknown> }> = [];
    const subMap = (slide.subBullets || {}) as Record<number, string[]>;

    for (let i = 0; i < slide.bullets.length; i++) {
      textItems.push({
        text: slide.bullets[i],
        options: {
          fontSize: 13,
          fontFace: FONT_BODY,
          color: C.text,
          bullet: { code: "2022", indent: 16 },
          paraSpaceBefore: i === 0 ? 4 : 2,
          paraSpaceAfter: subMap[i] ? 2 : 6,
          indentLevel: 0,
        },
      });

      // 하위 불릿
      if (subMap[i]) {
        for (const sub of subMap[i]) {
          textItems.push({
            text: sub,
            options: {
              fontSize: 11,
              fontFace: FONT_BODY,
              color: C.textSec,
              bullet: { code: "2013", indent: 12 },
              paraSpaceAfter: 3,
              indentLevel: 1,
            },
          });
        }
      }
    }

    s.addText(textItems, {
      x: 0.8,
      y: bulletY + 0.1,
      w: 11.5,
      h: 7.5 - bulletY - 0.8,
      valign: "top",
    });
  }

  addFooter(s, slide.order, totalSlides);
  if (slide.notes) s.addNotes(slide.notes);
}

function renderTwoColumn(pptx: PptxInstance, slide: Slide, totalSlides: number) {
  const s = pptx.addSlide();
  s.background = { color: C.offWhite };

  // 좌측 악센트 바
  s.addShape("rect" as never, {
    x: 0,
    y: 0,
    w: 0.08,
    h: 7.5,
    fill: { color: C.accent },
  });

  s.addText(slide.title, {
    x: 0.8,
    y: 0.4,
    w: 11.5,
    h: 0.7,
    fontSize: 22,
    fontFace: FONT_TITLE,
    bold: true,
    color: C.text,
  });

  // 구분선
  s.addShape("rect" as never, {
    x: 0.8,
    y: 1.2,
    w: 11.5,
    h: 0.015,
    fill: { color: C.divider },
  });

  // 메트릭 카드 형태로 렌더링
  if (slide.bullets) {
    const cols = Math.min(slide.bullets.length, 4);
    const cardW = 11.0 / cols - 0.3;

    for (let i = 0; i < slide.bullets.length && i < 4; i++) {
      const x = 0.8 + i * (cardW + 0.3);
      const parts = slide.bullets[i].split(/[:：]\s*/);
      const label = parts[0] || "";
      const value = parts[1] || parts[0] || "";

      // 카드 배경
      s.addShape("rect" as never, {
        x,
        y: 1.8,
        w: cardW,
        h: 2.5,
        fill: { color: C.white },
        shadow: { type: "outer", blur: 4, opacity: 0.08, offset: 2, color: "000000" },
        rectRadius: 0.08,
      });

      // 상단 악센트
      s.addShape("rect" as never, {
        x,
        y: 1.8,
        w: cardW,
        h: 0.06,
        fill: { color: i % 2 === 0 ? C.accent : C.teal },
      });

      // 라벨
      s.addText(label, {
        x: x + 0.3,
        y: 2.2,
        w: cardW - 0.6,
        h: 0.4,
        fontSize: 10,
        fontFace: FONT_BODY,
        color: C.textLight,
        bold: true,
      });

      // 값
      s.addText(value, {
        x: x + 0.3,
        y: 2.7,
        w: cardW - 0.6,
        h: 1.0,
        fontSize: 22,
        fontFace: FONT_TITLE,
        bold: true,
        color: C.text,
      });
    }
  }

  addFooter(s, slide.order, totalSlides);
}

function renderClosing(pptx: PptxInstance, slide: Slide) {
  const s = pptx.addSlide();
  s.background = { color: C.navy };

  // 상단 악센트 바
  s.addShape("rect" as never, {
    x: 0,
    y: 0,
    w: 13.33,
    h: 0.08,
    fill: { color: C.accent },
  });

  s.addText(slide.title, {
    x: 1.5,
    y: 2.4,
    w: 10.0,
    h: 1.0,
    fontSize: 32,
    fontFace: FONT_TITLE,
    bold: true,
    color: C.white,
    align: "center",
  });

  // 구분선
  s.addShape("rect" as never, {
    x: 5.5,
    y: 3.6,
    w: 2.33,
    h: 0.03,
    fill: { color: C.accent },
  });

  if (slide.subtitle) {
    s.addText(slide.subtitle, {
      x: 1.5,
      y: 3.9,
      w: 10.0,
      h: 0.6,
      fontSize: 16,
      fontFace: FONT_BODY,
      color: C.textLight,
      align: "center",
    });
  }

  if (slide.keyInsight) {
    s.addText(slide.keyInsight, {
      x: 1.5,
      y: 4.6,
      w: 10.0,
      h: 0.5,
      fontSize: 12,
      fontFace: FONT_BODY,
      color: C.textLight,
      align: "center",
    });
  }

  // Discovery-X 브랜딩
  s.addText("Powered by Discovery-X", {
    x: 1.5,
    y: 6.5,
    w: 10.0,
    h: 0.4,
    fontSize: 10,
    fontFace: FONT_BODY,
    color: C.textLight,
    align: "center",
    charSpacing: 1,
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

  const totalSlides = slides.length;

  for (const slide of slides) {
    switch (slide.layout) {
      case "cover":
        renderCover(pptx, slide);
        break;
      case "agenda":
        renderAgenda(pptx, slide, totalSlides);
        break;
      case "section_header":
        renderSectionHeader(pptx, slide, totalSlides);
        break;
      case "key_insight":
        renderKeyInsight(pptx, slide, totalSlides);
        break;
      case "two_column":
        renderTwoColumn(pptx, slide, totalSlides);
        break;
      case "closing":
        renderClosing(pptx, slide);
        break;
      default:
        renderContent(pptx, slide, totalSlides);
        break;
    }
  }

  const fileName = title.replace(/[^\w가-힣\s-]/g, "").trim().replace(/\s+/g, "_");
  await pptx.writeFile({ fileName: `${fileName}.pptx` });
}
