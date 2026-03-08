/**
 * Slide Builder — 구조화된 ProposalData → Slide[] 변환
 * Discovery-X proposals/service/slides.ts에서 추출, DB 의존성 제거
 */

import type { Slide, SlideFormat } from "../types.js";
import { SECTION_GROUPS, SLIDE_TEMPLATES, SECTION_LABELS } from "./section-groups.js";
import { parseMarkdown, flattenBlocks, splitIntoSentences } from "./markdown-parser.js";

export interface ProposalData {
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  budget: string | null;
  teamSize: number | null;
  startDate: string | null;
  ownerName: string | null;
  sections: Record<string, string>;
  milestones: Array<{ title: string; status: string }>;
}

export function buildSlides(data: ProposalData, format: SlideFormat): Slide[] {
  const slides: Slide[] = [];
  let order = 1;
  const template = SLIDE_TEMPLATES[format];

  // --- Cover ---
  const dateLine = new Date().toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
  });
  slides.push({
    order: order++,
    layout: "cover",
    title: data.title,
    subtitle: [data.category, dateLine].filter(Boolean).join("  |  "),
    notes: data.description || undefined,
    keyInsight: data.ownerName || undefined,
  });

  // --- Agenda ---
  const agendaItems: string[] = [];
  const includedGroups: string[] = [];
  for (const group of SECTION_GROUPS) {
    const hasContent = group.types.some(
      (t) => template.includes(t) && data.sections[t]?.trim(),
    );
    if (hasContent) {
      agendaItems.push(group.groupTitle);
      includedGroups.push(group.groupTitle);
    }
  }
  if (data.milestones.length > 0) agendaItems.push("주요 마일스톤");

  if (agendaItems.length >= 3) {
    slides.push({
      order: order++,
      layout: "agenda",
      title: "목차",
      bullets: agendaItems,
    });
  }

  // --- 사업 개요 요약표 (Agenda 바로 뒤) ---
  const summaryRows: string[][] = [];
  const summaryMap: Record<string, string> = {
    overview: "사업 개요",
    target_market: "타겟 시장",
    target_customer: "타겟 고객",
    value_proposition: "가치 제안",
    revenue_model: "수익 구조",
    mvp: "MVP",
  };
  for (const [key, label] of Object.entries(summaryMap)) {
    const text = data.sections[key]?.trim();
    if (text) {
      const summary = text.length > 100 ? text.slice(0, 97) + "..." : text;
      summaryRows.push([label, summary.replace(/\*\*/g, "")]);
    }
  }
  if (summaryRows.length >= 3) {
    slides.push({
      order: order++,
      layout: "table",
      title: "사업 개요 — 한눈에 보기",
      tableData: { headers: ["항목", "내용"], rows: summaryRows },
    });
  }

  // --- Section slides ---
  let lastGroupTitle = "";
  const pairTablesAdded = new Set<string>();

  for (const sectionType of template) {
    const content = data.sections[sectionType];
    if (!content?.trim()) continue;

    const label = SECTION_LABELS[sectionType] || sectionType;
    const parsed = parseMarkdown(content);

    // 그룹 구분 슬라이드 (executive는 생략)
    if (format !== "executive") {
      const group = SECTION_GROUPS.find((g) => g.types.includes(sectionType));
      if (group && group.groupTitle !== lastGroupTitle) {
        lastGroupTitle = group.groupTitle;
        slides.push({
          order: order++,
          layout: "section_header",
          title: group.groupTitle,
          subtitle: group.types
            .filter((t) => template.includes(t) && data.sections[t]?.trim())
            .map((t) => SECTION_LABELS[t] || t)
            .join("  ·  "),
        });
      }
    }

    // Key Insight 슬라이드 — 조건 완화 (산문 20자 이상이면 표시)
    if (format !== "executive" && parsed.keyInsight.length > 20) {
      slides.push({
        order: order++,
        layout: "key_insight",
        title: label,
        keyInsight: parsed.keyInsight.length > 150
          ? parsed.keyInsight.slice(0, 147) + "..."
          : parsed.keyInsight,
      });
    }

    // 콘텐츠 슬라이드 (자동 분할)
    const pages = flattenBlocks(parsed.blocks);
    for (let pi = 0; pi < pages.length; pi++) {
      const page = pages[pi];
      const pageTitle = pages.length > 1
        ? `${label} ${pi > 0 ? `(${pi + 1}/${pages.length})` : ""}`
        : label;

      slides.push({
        order: order++,
        layout: "content",
        title: pageTitle.trim(),
        subtitle: page.heading || undefined,
        bullets: page.bullets,
        subBullets: Object.keys(page.subBullets).length > 0 ? page.subBullets : undefined,
        notes: pi === 0 ? content.slice(0, 800) : undefined,
      });
    }

    // 마크다운 테이블 → 표 슬라이드
    for (const table of parsed.tables) {
      slides.push({
        order: order++,
        layout: "table",
        title: table.heading || `${label} — 상세`,
        tableData: { headers: table.headers, rows: table.rows },
      });
    }

    // --- 섹션 쌍 비교표 자동 생성 ---
    const PAIR_TABLES: Array<{ trigger: string; pair: string; title: string; headers: [string, string] }> = [
      { trigger: "target_market", pair: "target_customer", title: "시장 & 고객 비교 분석", headers: ["타겟 시장", "타겟 고객"] },
      { trigger: "revenue_model", pair: "scenario", title: "수익 구조 & 재무 시나리오", headers: ["수익 구조", "시나리오"] },
      { trigger: "hypothesis", pair: "value_proposition", title: "핵심 가설 & 가치 제안", headers: ["핵심 가설", "가치 제안"] },
    ];
    for (const pt of PAIR_TABLES) {
      if (sectionType === pt.trigger && !pairTablesAdded.has(pt.trigger)) {
        const pairContent = data.sections[pt.pair]?.trim();
        if (pairContent) {
          pairTablesAdded.add(pt.trigger);
          // 각 섹션 내용을 문장 단위로 분리하여 표 행 생성
          const leftSentences = splitIntoSentences(content);
          const rightSentences = splitIntoSentences(pairContent);
          const maxRows = Math.max(leftSentences.length, rightSentences.length, 1);
          const rows: string[][] = [];
          for (let ri = 0; ri < Math.min(maxRows, 5); ri++) {
            rows.push([
              leftSentences[ri] || "",
              rightSentences[ri] || "",
            ]);
          }
          slides.push({
            order: order++,
            layout: "table",
            title: pt.title,
            tableData: { headers: [pt.headers[0], pt.headers[1]], rows },
          });
        }
      }
    }

    // execution_plan → 프로세스 플로우
    if (sectionType === "execution_plan") {
      const allBullets = parsed.blocks.flatMap((b) => b.bullets);
      // 불릿이 3개 이상이면 그대로 사용, 아니면 산문에서 문장 분리
      const steps = allBullets.length >= 3
        ? allBullets.slice(0, 6)
        : splitIntoSentences(content).slice(0, 6);
      if (steps.length >= 2) {
        slides.push({
          order: order++,
          layout: "process",
          title: "실행 로드맵",
          processSteps: steps.map((s) => {
            const parts = s.split(/[:：]\s*/);
            return { label: parts[0], description: parts.slice(1).join(": ") || undefined };
          }),
        });
      }
    }
  }

  // --- Milestones ---
  if (data.milestones.length > 0) {
    if (format !== "executive") {
      slides.push({
        order: order++,
        layout: "section_header",
        title: "주요 마일스톤",
        subtitle: `${data.milestones.length}개 마일스톤`,
      });
    }

    // 타임라인 슬라이드 (3~8개 마일스톤일 때)
    if (data.milestones.length >= 3 && data.milestones.length <= 8) {
      slides.push({
        order: order++,
        layout: "timeline",
        title: "마일스톤 타임라인",
        processSteps: data.milestones.slice(0, 8).map((m) => ({
          label: m.title,
          description: m.status === "COMPLETED" ? "완료" : m.status === "ACTIVE" ? "진행중" : "예정",
        })),
      });
    } else {
      // 불릿 폴백
      slides.push({
        order: order++,
        layout: "content",
        title: "주요 마일스톤",
        bullets: data.milestones.slice(0, 8).map((m) => {
          const statusLabel = m.status === "COMPLETED" ? "완료" : m.status === "ACTIVE" ? "진행중" : "예정";
          return `[${statusLabel}] ${m.title}`;
        }),
      });
    }
  }

  // --- Key Metrics ---
  const metricBullets: string[] = [];
  if (data.budget) metricBullets.push(`예산 규모: ${data.budget}`);
  if (data.teamSize) metricBullets.push(`투입 인력: ${data.teamSize}명`);
  if (data.startDate) metricBullets.push(`시작 시점: ${data.startDate}`);
  if (data.milestones.length > 0) {
    const done = data.milestones.filter((m) => m.status === "COMPLETED").length;
    metricBullets.push(`마일스톤 진행률: ${done}/${data.milestones.length}`);
  }
  if (metricBullets.length > 0) {
    slides.push({
      order: order++,
      layout: "two_column",
      title: "핵심 수치",
      bullets: metricBullets,
    });
  }

  // --- Closing ---
  slides.push({
    order: order++,
    layout: "closing",
    title: "감사합니다",
    subtitle: data.title,
    keyInsight: [data.ownerName, data.category].filter(Boolean).join("  |  ") || undefined,
  });

  return slides;
}
