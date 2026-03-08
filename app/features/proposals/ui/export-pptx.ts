/**
 * 클라이언트 사이드 PPTX 생성 + 다운로드
 * pptxgenjs를 동적 import하여 서버 번들에 포함되지 않도록 함
 */

interface Slide {
  order: number;
  layout: string;
  title: string;
  subtitle?: string;
  bullets?: string[];
  notes?: string;
}

const BRAND_COLOR = "2563EB"; // blue-600
const BG_COLOR = "FFFFFF";
const TEXT_COLOR = "1F2937"; // gray-800
const TEXT_LIGHT = "6B7280"; // gray-500

export async function exportToPptx(
  slides: Slide[],
  title: string,
): Promise<void> {
  // 동적 import — 서버 번들 제외
  const PptxGenJS = (await import("pptxgenjs")).default;
  const pptx = new PptxGenJS();

  pptx.layout = "LAYOUT_WIDE"; // 16:9
  pptx.author = "Discovery-X";
  pptx.title = title;

  for (const slide of slides) {
    const pptSlide = pptx.addSlide();

    if (slide.layout === "cover") {
      // 표지: 브랜드 배경 + 중앙 제목
      pptSlide.background = { color: BRAND_COLOR };
      pptSlide.addText(slide.title, {
        x: 0.8,
        y: 2.0,
        w: 11.5,
        h: 1.5,
        fontSize: 32,
        bold: true,
        color: "FFFFFF",
        align: "center",
        valign: "middle",
      });
      if (slide.subtitle) {
        pptSlide.addText(slide.subtitle, {
          x: 0.8,
          y: 3.6,
          w: 11.5,
          h: 0.8,
          fontSize: 16,
          color: "FFFFFFB3",
          align: "center",
        });
      }
    } else if (slide.layout === "closing") {
      // 마무리: 브랜드 배경 + 감사
      pptSlide.background = { color: BRAND_COLOR };
      pptSlide.addText(slide.title, {
        x: 0.8,
        y: 2.5,
        w: 11.5,
        h: 1.2,
        fontSize: 28,
        bold: true,
        color: "FFFFFF",
        align: "center",
      });
      if (slide.subtitle) {
        pptSlide.addText(slide.subtitle, {
          x: 0.8,
          y: 3.8,
          w: 11.5,
          h: 0.6,
          fontSize: 14,
          color: "FFFFFFB3",
          align: "center",
        });
      }
    } else {
      // 본문 슬라이드
      pptSlide.background = { color: BG_COLOR };

      // 상단 브랜드 라인
      pptSlide.addShape("rect" as never, {
        x: 0,
        y: 0,
        w: 13.33,
        h: 0.06,
        fill: { color: BRAND_COLOR },
      });

      // 제목
      pptSlide.addText(slide.title, {
        x: 0.8,
        y: 0.4,
        w: 11.5,
        h: 0.7,
        fontSize: 22,
        bold: true,
        color: TEXT_COLOR,
      });

      // 불릿 포인트
      if (slide.bullets && slide.bullets.length > 0) {
        const bulletTexts = slide.bullets.map((b) => ({
          text: b,
          options: {
            fontSize: 14,
            color: TEXT_COLOR,
            bullet: { code: "2022" as const }, // bullet dot
            paraSpaceAfter: 8,
          },
        }));
        pptSlide.addText(bulletTexts, {
          x: 0.8,
          y: 1.3,
          w: 11.5,
          h: 5.0,
          valign: "top",
        });
      }

      // 슬라이드 번호
      pptSlide.addText(`${slide.order}`, {
        x: 12.0,
        y: 7.0,
        w: 0.8,
        h: 0.4,
        fontSize: 10,
        color: TEXT_LIGHT,
        align: "right",
      });
    }

    // 발표자 노트
    if (slide.notes) {
      pptSlide.addNotes(slide.notes);
    }
  }

  // 다운로드
  const fileName = title.replace(/[^\w가-힣\s-]/g, "").trim().replace(/\s+/g, "_");
  await pptx.writeFile({ fileName: `${fileName}.pptx` });
}
