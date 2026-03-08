/**
 * Proposal Agent tool handlers — 사업제안 PPT 슬라이드 생성/조회
 */

import type { DB } from "~/db";
import { ProposalSlideService } from "~/features/proposals/service/slides";
import type { SlideFormat } from "~/features/proposals/service/slides";

const VALID_FORMATS = ["executive", "pitch", "internal"] as const;

interface GenerateSlidesInput {
  proposalId: string;
  format?: string;
  tenantId?: string;
}

interface ListSlidesInput {
  proposalId: string;
  tenantId?: string;
}

interface GetSlideDeckInput {
  slideDeckId: string;
  tenantId?: string;
}

export async function generateProposalSlides(
  db: DB,
  input: GenerateSlidesInput,
): Promise<string> {
  const { proposalId, tenantId } = input;

  if (!proposalId) {
    return JSON.stringify({ error: "proposalId가 필요합니다." });
  }
  if (!tenantId) {
    return JSON.stringify({ error: "tenantId가 필요합니다." });
  }

  const format = (VALID_FORMATS.includes(input.format as SlideFormat)
    ? input.format
    : "pitch") as SlideFormat;

  try {
    const service = new ProposalSlideService(db);
    const deck = await service.generate(proposalId, tenantId, format);

    return JSON.stringify({
      success: true,
      slideDeckId: deck.id,
      format: deck.format,
      title: deck.title,
      slideCount: deck.slides.length,
      slides: deck.slides.map((s) => ({
        order: s.order,
        layout: s.layout,
        title: s.title,
        bulletCount: s.bullets?.length ?? 0,
      })),
      message: `${deck.slides.length}장의 슬라이드가 생성되었습니다. (${format})`,
    });
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : "슬라이드 생성 실패",
    });
  }
}

export async function listProposalSlides(
  db: DB,
  input: ListSlidesInput,
): Promise<string> {
  const { proposalId, tenantId } = input;

  if (!proposalId) {
    return JSON.stringify({ error: "proposalId가 필요합니다." });
  }
  if (!tenantId) {
    return JSON.stringify({ error: "tenantId가 필요합니다." });
  }

  try {
    const service = new ProposalSlideService(db);
    const decks = await service.list(proposalId, tenantId);

    return JSON.stringify({
      success: true,
      count: decks.length,
      decks: decks.map((d) => ({
        id: d.id,
        format: d.format,
        title: d.title,
        slideCount: d.slides.length,
        createdAt: d.createdAt,
      })),
    });
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : "조회 실패",
    });
  }
}

export async function getSlideDeckDetail(
  db: DB,
  input: GetSlideDeckInput,
): Promise<string> {
  const { slideDeckId, tenantId } = input;

  if (!slideDeckId) {
    return JSON.stringify({ error: "slideDeckId가 필요합니다." });
  }
  if (!tenantId) {
    return JSON.stringify({ error: "tenantId가 필요합니다." });
  }

  try {
    const service = new ProposalSlideService(db);
    const deck = await service.getById(slideDeckId, tenantId);

    if (!deck) {
      return JSON.stringify({ error: "슬라이드 덱을 찾을 수 없습니다." });
    }

    return JSON.stringify({
      success: true,
      id: deck.id,
      proposalId: deck.proposalId,
      format: deck.format,
      title: deck.title,
      slideCount: deck.slides.length,
      slides: deck.slides,
    });
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : "조회 실패",
    });
  }
}
