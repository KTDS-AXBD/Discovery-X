import { eq, desc, and, sql } from "drizzle-orm";
import type { DB } from "~/db";
import {
  proposals,
  proposalSections,
  proposalCategories,
} from "~/features/proposals/db/schema";
import { validateProposalTransition } from "~/features/proposals/constants";

// ============================================================================
// Types
// ============================================================================

type Proposal = typeof proposals.$inferSelect;

interface UpdateProposalInput {
  title?: string;
  description?: string;
  category?: string | null;
  teamSize?: number | null;
  startDate?: string | null;
  budget?: string | null;
  status?: string;
  closeType?: string | null;
  sections?: Array<{ type: string; content: string }>;
}

// ============================================================================
// Service
// ============================================================================

export class ProposalService {
  constructor(private db: DB) {}

  /**
   * 목록 조회
   * routes/api.proposals.ts loader 패턴 추출
   */
  async list(tenantId: string): Promise<Proposal[]> {
    return this.db
      .select()
      .from(proposals)
      .where(eq(proposals.tenantId, tenantId))
      .orderBy(desc(proposals.updatedAt));
  }

  /**
   * 상세 조회
   */
  async getById(id: string): Promise<Proposal | null> {
    const result = await this.db
      .select()
      .from(proposals)
      .where(eq(proposals.id, id))
      .get();
    return result ?? null;
  }

  /**
   * 삭제
   * routes/api.proposals.ts DELETE action 패턴 추출
   */
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
      throw new Error("Not found");
    }
    if (proposal.ownerId !== userId) {
      throw new Error("Forbidden");
    }

    await this.db.delete(proposals).where(eq(proposals.id, id));
  }

  /**
   * 업데이트 (상태 전환 포함)
   * routes/api.proposals.ts PUT action 패턴 추출
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
      throw new Error("Not found");
    }

    // 상태 전환 검증
    if (input.status !== undefined && input.status !== proposal.status) {
      if (!validateProposalTransition(proposal.status, input.status)) {
        throw new Error(
          `상태 전환 불가: ${proposal.status} → ${input.status}`,
        );
      }
      if (input.status === "CLOSED" && !input.closeType) {
        throw new Error("종료 시 close_type(HOLD/DROP)이 필요합니다");
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

    // 카테고리 upsert
    if (input.category) {
      await this.upsertCategory(tenantId, input.category);
    }
  }

  /**
   * 섹션 업데이트
   */
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

  /**
   * 카테고리 upsert (usage count 증가)
   */
  private async upsertCategory(
    tenantId: string,
    categoryName: string,
  ): Promise<void> {
    const existing = await this.db
      .select()
      .from(proposalCategories)
      .where(
        and(
          eq(proposalCategories.tenantId, tenantId),
          eq(proposalCategories.name, categoryName),
        ),
      )
      .get();

    if (existing) {
      await this.db
        .update(proposalCategories)
        .set({
          usageCount: sql`${proposalCategories.usageCount} + 1`,
        })
        .where(eq(proposalCategories.id, existing.id));
    } else {
      await this.db.insert(proposalCategories).values({
        tenantId,
        name: categoryName,
        usageCount: 1,
      });
    }
  }
}
