/**
 * Proposal Slide Deck Service
 * 사업제안 PPT 슬라이드 자동 생성/조회/삭제
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
  layout: "cover" | "section_header" | "content" | "two_column" | "closing";
  title: string;
  subtitle?: string;
  bullets?: string[];
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
// Slide Templates — section types per format
// ============================================================================

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
// Bullet Extraction
// ============================================================================

/** 마크다운 콘텐츠에서 핵심 불릿 포인트를 추출 (최대 5개) */
function extractBullets(markdown: string, maxBullets = 5): string[] {
  if (!markdown?.trim()) return [];

  const lines = markdown.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets: string[] = [];

  for (const line of lines) {
    if (bullets.length >= maxBullets) break;

    // 마크다운 리스트 아이템 (-, *, 1.)
    const listMatch = line.match(/^[-*]\s+(.+)$/) || line.match(/^\d+\.\s+(.+)$/);
    if (listMatch) {
      bullets.push(listMatch[1].replace(/\*\*/g, "").trim());
      continue;
    }

    // 헤딩 (## ~)
    const headingMatch = line.match(/^#{2,4}\s+(.+)$/);
    if (headingMatch) {
      bullets.push(headingMatch[1].replace(/\*\*/g, "").trim());
      continue;
    }
  }

  // 리스트가 부족하면 일반 텍스트에서 첫 문장들을 추출
  if (bullets.length < 2) {
    const prose = lines
      .filter((l) => !l.startsWith("#") && !l.startsWith("-") && !l.startsWith("*") && l.length > 15)
      .slice(0, maxBullets - bullets.length);
    for (const p of prose) {
      // 첫 문장만 추출 (마침표/느낌표 기준)
      const sentence = p.split(/[.!]\s/)[0];
      if (sentence && sentence.length > 10) {
        bullets.push(sentence.length > 80 ? sentence.slice(0, 77) + "..." : sentence);
      }
    }
  }

  return bullets.slice(0, maxBullets);
}

// ============================================================================
// Slide Generation
// ============================================================================

interface ProposalData {
  title: string;
  description: string | null;
  category: string | null;
  status: string;
  budget: string | null;
  teamSize: number | null;
  ownerName: string | null;
  sections: Record<string, string>;
  milestones: Array<{ title: string; status: string }>;
}

function buildSlides(data: ProposalData, format: SlideFormat): Slide[] {
  const slides: Slide[] = [];
  let order = 1;

  // Cover slide
  slides.push({
    order: order++,
    layout: "cover",
    title: data.title,
    subtitle: [data.category, data.ownerName].filter(Boolean).join(" | ") || "사업제안",
    notes: data.description || undefined,
  });

  // Section slides
  const template = SLIDE_TEMPLATES[format];
  for (const sectionType of template) {
    const content = data.sections[sectionType];
    if (!content?.trim()) continue;

    const label = SECTION_LABELS[sectionType] || sectionType;
    const bullets = extractBullets(content);

    if (bullets.length > 0) {
      slides.push({
        order: order++,
        layout: "content",
        title: label,
        bullets,
        notes: content.length > 200 ? content.slice(0, 500) : content,
      });
    }
  }

  // Milestones slide (internal format only, if milestones exist)
  if (format === "internal" && data.milestones.length > 0) {
    slides.push({
      order: order++,
      layout: "content",
      title: "주요 마일스톤",
      bullets: data.milestones.slice(0, 6).map(
        (m) => `${m.title} (${m.status === "COMPLETED" ? "완료" : m.status === "ACTIVE" ? "진행중" : "예정"})`,
      ),
    });
  }

  // Key metrics slide (if budget or team info exists)
  const metricBullets: string[] = [];
  if (data.budget) metricBullets.push(`예산: ${data.budget}`);
  if (data.teamSize) metricBullets.push(`팀 규모: ${data.teamSize}명`);
  if (metricBullets.length > 0 && format !== "executive") {
    slides.push({
      order: order++,
      layout: "two_column",
      title: "핵심 수치",
      bullets: metricBullets,
    });
  }

  // Closing slide
  slides.push({
    order: order++,
    layout: "closing",
    title: "감사합니다",
    subtitle: data.title,
  });

  return slides;
}

// ============================================================================
// Service Class
// ============================================================================

export class ProposalSlideService {
  constructor(private db: DB) {}

  /** 슬라이드 덱 자동 생성 */
  async generate(
    proposalId: string,
    tenantId: string,
    format: SlideFormat = "pitch",
  ): Promise<SlideDeck> {
    // 1. Proposal + sections + milestones 로드
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

    // 2. Section content를 type→content 맵으로 변환
    const sectionMap: Record<string, string> = {};
    for (const s of sections) {
      if (s.content?.trim()) sectionMap[s.type] = s.content;
    }

    // 3. 슬라이드 생성
    const slides = buildSlides(
      {
        title: proposal.title,
        description: proposal.description,
        category: proposal.category,
        status: proposal.status,
        budget: proposal.budget,
        teamSize: proposal.teamSize,
        ownerName: ownerRow?.name ?? null,
        sections: sectionMap,
        milestones: milestones.map((m) => ({ title: m.title, status: m.status })),
      },
      format,
    );

    // 4. DB 저장
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

  /** 특정 제안의 슬라이드 덱 목록 조회 */
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

  /** 슬라이드 덱 상세 조회 */
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

  /** 슬라이드 덱 삭제 */
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
