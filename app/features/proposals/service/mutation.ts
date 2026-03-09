import { eq, and, sql } from "drizzle-orm";
import type { DB } from "~/db";
import {
  proposals,
  proposalSections,
  ProposalSectionType,
} from "~/features/proposals/db/schema";
import { validateProposalTransition } from "~/features/proposals/constants";
import type {
  CreateProposalInput,
  UpdateProposalInput,
  ProposalSection,
} from "./types";
import { NotFoundError, ValidationError, UnauthorizedError } from "~/lib/errors";

export class ProposalMutationService {
  constructor(private db: DB) {}

  /** 새 제안 생성 (섹션 포함) */
  async create(input: CreateProposalInput): Promise<string> {
    const id = crypto.randomUUID();

    await this.db.insert(proposals).values({
      id,
      tenantId: input.tenantId,
      title: input.title,
      description: input.description ?? null,
      category: input.category ?? null,
      teamSize: input.teamSize ?? null,
      startDate: input.startDate ?? null,
      budget: input.budget ?? null,
      ownerId: input.ownerId,
    });

    // 모든 섹션 타입에 대해 기본 행 생성
    const sectionTypes = Object.values(ProposalSectionType);
    const sectionValues = sectionTypes.map((type, i) => ({
      proposalId: id,
      type,
      content: input.sectionContents?.[type] ?? "",
      sortOrder: i,
    }));
    await this.db.insert(proposalSections).values(sectionValues);

    return id;
  }

  /** 제안 삭제 (Owner만 가능) */
  async delete(id: string, tenantId: string, userId: string): Promise<void> {
    const proposal = await this.db
      .select({
        id: proposals.id,
        tenantId: proposals.tenantId,
        ownerId: proposals.ownerId,
      })
      .from(proposals)
      .where(eq(proposals.id, id))
      .get();

    if (!proposal || proposal.tenantId !== tenantId) {
      throw new NotFoundError("Proposal", id);
    }
    if (proposal.ownerId !== userId) {
      throw new UnauthorizedError("Forbidden");
    }

    await this.db.delete(proposals).where(eq(proposals.id, id));
  }

  /**
   * 제안 업데이트 (상태 전환 검증 포함)
   * 카테고리 upsert는 facade에서 처리
   */
  async update(
    id: string,
    tenantId: string,
    input: UpdateProposalInput,
  ): Promise<void> {
    const proposal = await this.db
      .select({
        id: proposals.id,
        tenantId: proposals.tenantId,
        ownerId: proposals.ownerId,
        status: proposals.status,
      })
      .from(proposals)
      .where(eq(proposals.id, id))
      .get();

    if (!proposal || proposal.tenantId !== tenantId) {
      throw new NotFoundError("Proposal", id);
    }

    // 상태 전환 검증
    if (input.status !== undefined && input.status !== proposal.status) {
      if (!validateProposalTransition(proposal.status, input.status)) {
        throw new ValidationError(
          "status",
          `상태 전환 불가: ${proposal.status} → ${input.status}`,
        );
      }
      if (input.status === "CLOSED" && !input.closeType) {
        throw new ValidationError("closeType", "종료 시 close_type(HOLD/DROP)이 필요합니다");
      }
    }

    const updates: Record<string, unknown> = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.description !== undefined)
      updates.description = input.description;
    if (input.category !== undefined) updates.category = input.category;
    if (input.teamSize !== undefined) updates.teamSize = input.teamSize;
    if (input.startDate !== undefined) updates.startDate = input.startDate;
    if (input.budget !== undefined) updates.budget = input.budget;
    if (input.status !== undefined) {
      updates.status = input.status;
      if (input.status === "CLOSED") {
        updates.closeType = input.closeType;
        updates.closedAt = sql`(unixepoch())`;
      } else if (proposal.status === "CLOSED") {
        updates.closeType = null;
        updates.closedAt = null;
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = sql`(unixepoch())`;
      await this.db
        .update(proposals)
        .set(updates)
        .where(eq(proposals.id, id));
    }

    // 섹션 업데이트
    if (input.sections && input.sections.length > 0) {
      for (const sec of input.sections) {
        await this.db
          .update(proposalSections)
          .set({ content: sec.content })
          .where(
            and(
              eq(proposalSections.proposalId, id),
              eq(proposalSections.type, sec.type),
            ),
          );
      }
    }
  }

  /** 섹션 목록 조회 */
  async getSections(proposalId: string): Promise<ProposalSection[]> {
    return this.db
      .select()
      .from(proposalSections)
      .where(eq(proposalSections.proposalId, proposalId));
  }

  /** 섹션 일괄 upsert (없으면 생성, 있으면 업데이트) */
  async upsertSections(
    proposalId: string,
    sections: Array<{ type: string; content: string; sortOrder: number }>,
  ): Promise<void> {
    const existing = await this.getSections(proposalId);
    const existingMap = new Map(existing.map((s) => [s.type, s]));

    for (const sec of sections) {
      const found = existingMap.get(sec.type);
      if (found) {
        await this.db
          .update(proposalSections)
          .set({ content: sec.content })
          .where(eq(proposalSections.id, found.id));
      } else {
        await this.db.insert(proposalSections).values({
          proposalId,
          type: sec.type,
          content: sec.content,
          sortOrder: sec.sortOrder,
        });
      }
    }
  }

  /** 단일 섹션 업데이트 */
  async updateSection(
    proposalId: string,
    sectionType: string,
    content: string,
  ): Promise<void> {
    await this.db
      .update(proposalSections)
      .set({ content })
      .where(
        and(
          eq(proposalSections.proposalId, proposalId),
          eq(proposalSections.type, sectionType),
        ),
      );
  }
}
