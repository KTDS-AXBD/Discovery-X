/**
 * Proposal Slide Deck Service
 * 사업제안 PPT 슬라이드 자동 생성/조회/삭제
 * v2: 콘텐츠 밀도 강화 + 구조 슬라이드 + Key Insight 추출
 */

import { eq, and, desc } from "drizzle-orm";
import type { DB } from "~/db";
import {
  proposals,
  proposalSections,
  proposalMilestones,
  proposalSlideDecks,
} from "~/features/proposals/db/schema";
import { users } from "~/db";
import { SECTION_LABELS } from "~/features/proposals/constants";

// ============================================================================
// Types
// ============================================================================

export interface Slide {
  order: number;
  layout: "cover" | "section_header" | "content" | "two_column" | "agenda" | "key_insight" | "closing";
  title: string;
  subtitle?: string;
  bullets?: string[];
  subBullets?: Record<number, string[]>;
  keyInsight?: string;
  notes?: string;
}

export type SlideFormat = "executive" | "pitch" | "internal";

export interface SlideDeck {
  id: string;
  proposalId: string;
  tenantId: string;
  format: SlideFormat;
  title: string;
  slides: Slide[];
  createdAt: Date | null;
  updatedAt: Date | null;
}

// ============================================================================
// Section Groups — logical grouping for section dividers
// ============================================================================

const SECTION_GROUPS: Array<{ groupTitle: string; types: string[] }> = [
  { groupTitle: "사업 개요", types: ["overview", "content", "hypothesis"] },
  { groupTitle: "시장 & 고객", types: ["target_market", "target_customer"] },
  { groupTitle: "전략 & 차별화", types: ["value_proposition"] },
  { groupTitle: "비즈니스 모델", types: ["revenue_model", "scenario"] },
  { groupTitle: "실행 계획", types: ["mvp", "execution_plan"] },
];

const SLIDE_TEMPLATES: Record<SlideFormat, string[]> = {
  executive: [
    "overview",
    "target_market",
    "value_proposition",
    "revenue_model",
    "mvp",
    "execution_plan",
  ],
  pitch: [
    "overview",
    "content",
    "hypothesis",
    "target_market",
    "target_customer",
    "value_proposition",
    "revenue_model",
    "scenario",
    "mvp",
    "execution_plan",
  ],
  internal: [
    "overview",
    "content",
    "hypothesis",
    "target_market",
    "target_customer",
    "value_proposition",
    "revenue_model",
    "scenario",
    "mvp",
    "execution_plan",
  ],
};

// ============================================================================
// Content Extraction — v2: deep markdown parsing
// ============================================================================

interface ParsedContent {
  keyInsight: string;
  blocks: ContentBlock[];
}

interface ContentBlock {
  heading?: string;
  bullets: string[];
  subBullets: Record<number, string[]>;
}

/** 마크다운을 구조화된 블록으로 파싱 */
function parseMarkdown(markdown: string): ParsedContent {
  if (!markdown?.trim()) return { keyInsight: "", blocks: [] };

  const lines = markdown.split("\n");
  const blocks: ContentBlock[] = [];
  let currentBlock: ContentBlock = { bullets: [], subBullets: {} };
  let firstParagraph = "";

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (!trimmed) continue;

    // 헤딩 → 새 블록 시작
    const headingMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      if (currentBlock.bullets.length > 0 || currentBlock.heading) {
        blocks.push(currentBlock);
      }
      currentBlock = {
        heading: headingMatch[1].replace(/\*\*/g, "").trim(),
        bullets: [],
        subBullets: {},
      };
      continue;
    }

    // 하위 리스트 (들여쓰기된 - 또는 *)
    const subListMatch = rawLine.match(/^(\s{2,})[-*]\s+(.+)$/);
    if (subListMatch) {
      const parentIdx = currentBlock.bullets.length - 1;
      if (parentIdx >= 0) {
        if (!currentBlock.subBullets[parentIdx]) {
          currentBlock.subBullets[parentIdx] = [];
        }
        currentBlock.subBullets[parentIdx].push(
          subListMatch[2].replace(/\*\*/g, "").trim(),
        );
      }
      continue;
    }

    // 리스트 아이템
    const listMatch = trimmed.match(/^[-*]\s+(.+)$/) || trimmed.match(/^\d+\.\s+(.+)$/);
    if (listMatch) {
      currentBlock.bullets.push(listMatch[1].replace(/\*\*/g, "").trim());
      continue;
    }

    // 산문 텍스트 → 문장 단위로 분리하여 불릿화
    if (trimmed.length > 10 && !trimmed.startsWith("|") && !trimmed.startsWith("```")) {
      if (!firstParagraph) firstParagraph = trimmed;
      const sentences = trimmed
        .split(/(?<=[.!?])\s+/)
        .filter((s) => s.length > 10);
      for (const sentence of sentences) {
        const cleaned = sentence.replace(/\*\*/g, "").trim();
        currentBlock.bullets.push(
          cleaned.length > 120 ? cleaned.slice(0, 117) + "..." : cleaned,
        );
      }
    }
  }

  if (currentBlock.bullets.length > 0 || currentBlock.heading) {
    blocks.push(currentBlock);
  }

  // Key Insight: 첫 문단의 첫 문장 또는 첫 블릿
  const keyInsight =
    firstParagraph?.split(/[.!?]\s/)?.[0]?.replace(/\*\*/g, "").trim() ||
    blocks[0]?.bullets[0] ||
    "";

  return { keyInsight, blocks };
}

/** 파싱된 블록을 슬라이드용 불릿 목록으로 변환 (최대 maxPerSlide개) */
function flattenBlocks(
  blocks: ContentBlock[],
  maxPerSlide = 7,
): Array<{ bullets: string[]; subBullets: Record<number, string[]>; heading?: string }> {
  const pages: Array<{ bullets: string[]; subBullets: Record<number, string[]>; heading?: string }> = [];
  let current: { bullets: string[]; subBullets: Record<number, string[]>; heading?: string } = {
    bullets: [],
    subBullets: {},
    heading: undefined,
  };

  for (const block of blocks) {
    for (let i = 0; i < block.bullets.length; i++) {
      if (current.bullets.length >= maxPerSlide) {
        pages.push(current);
        current = { bullets: [], subBullets: {}, heading: block.heading };
      }

      if (i === 0 && block.heading && current.bullets.length === 0) {
        current.heading = block.heading;
      }

      const newIdx = current.bullets.length;
      current.bullets.push(block.bullets[i]);
      if (block.subBullets[i]) {
        current.subBullets[newIdx] = block.subBullets[i];
      }
    }
  }

  if (current.bullets.length > 0) {
    pages.push(current);
  }

  return pages;
}

// ============================================================================
// Slide Generation — v2
// ============================================================================

interface ProposalData {
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

function buildSlides(data: ProposalData, format: SlideFormat): Slide[] {
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

  // --- Section slides ---
  let lastGroupTitle = "";

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

    // Key Insight 슬라이드 (pitch/internal + 내용이 충분할 때)
    if (
      format !== "executive" &&
      parsed.keyInsight.length > 20 &&
      parsed.blocks.reduce((sum, b) => sum + b.bullets.length, 0) > 4
    ) {
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

// ============================================================================
// Service Class
// ============================================================================

export class ProposalSlideService {
  constructor(private db: DB) {}

  async generate(
    proposalId: string,
    tenantId: string,
    format: SlideFormat = "pitch",
  ): Promise<SlideDeck> {
    const proposal = await this.db
      .select()
      .from(proposals)
      .where(eq(proposals.id, proposalId))
      .get();

    if (!proposal || proposal.tenantId !== tenantId) {
      throw new Error("사업제안을 찾을 수 없습니다.");
    }

    const [sections, milestones, ownerRow] = await Promise.all([
      this.db
        .select()
        .from(proposalSections)
        .where(eq(proposalSections.proposalId, proposalId)),
      this.db
        .select()
        .from(proposalMilestones)
        .where(eq(proposalMilestones.proposalId, proposalId)),
      this.db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, proposal.ownerId))
        .get(),
    ]);

    const sectionMap: Record<string, string> = {};
    for (const s of sections) {
      if (s.content?.trim()) sectionMap[s.type] = s.content;
    }

    const slides = buildSlides(
      {
        title: proposal.title,
        description: proposal.description,
        category: proposal.category,
        status: proposal.status,
        budget: proposal.budget,
        teamSize: proposal.teamSize,
        startDate: proposal.startDate,
        ownerName: ownerRow?.name ?? null,
        sections: sectionMap,
        milestones: milestones.map((m) => ({ title: m.title, status: m.status })),
      },
      format,
    );

    const id = crypto.randomUUID();
    const formatLabels: Record<SlideFormat, string> = {
      executive: "경영진 요약",
      pitch: "투자/제안 피치",
      internal: "내부 검토용",
    };

    await this.db.insert(proposalSlideDecks).values({
      id,
      proposalId,
      tenantId,
      format,
      title: `${proposal.title} — ${formatLabels[format]}`,
      slides,
    });

    return {
      id,
      proposalId,
      tenantId,
      format,
      title: `${proposal.title} — ${formatLabels[format]}`,
      slides,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  async list(proposalId: string, tenantId: string): Promise<SlideDeck[]> {
    const rows = await this.db
      .select()
      .from(proposalSlideDecks)
      .where(
        and(
          eq(proposalSlideDecks.proposalId, proposalId),
          eq(proposalSlideDecks.tenantId, tenantId),
        ),
      )
      .orderBy(desc(proposalSlideDecks.createdAt));

    return rows.map((r) => ({
      ...r,
      format: r.format as SlideFormat,
      slides: r.slides as unknown as Slide[],
    }));
  }

  async getById(id: string, tenantId: string): Promise<SlideDeck | null> {
    const row = await this.db
      .select()
      .from(proposalSlideDecks)
      .where(
        and(
          eq(proposalSlideDecks.id, id),
          eq(proposalSlideDecks.tenantId, tenantId),
        ),
      )
      .get();

    if (!row) return null;
    return {
      ...row,
      format: row.format as SlideFormat,
      slides: row.slides as unknown as Slide[],
    };
  }

  async delete(id: string, tenantId: string): Promise<void> {
    await this.db
      .delete(proposalSlideDecks)
      .where(
        and(
          eq(proposalSlideDecks.id, id),
          eq(proposalSlideDecks.tenantId, tenantId),
        ),
      );
  }
}
