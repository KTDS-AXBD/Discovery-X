import { eq, desc, and, sql, like } from "drizzle-orm";
import type { DB } from "~/db";
import {
  proposals,
  proposalSections,
  proposalCategories,
  proposalComments,
  proposalLikes,
  proposalActions,
  proposalMembers,
  proposalMilestones,
  ProposalSectionType,
} from "~/features/proposals/db/schema";
import { users } from "~/db/schema";
import { validateProposalTransition } from "~/features/proposals/constants";

// ============================================================================
// Types
// ============================================================================

type Proposal = typeof proposals.$inferSelect;
type ProposalSection = typeof proposalSections.$inferSelect;

interface CreateProposalInput {
  tenantId: string;
  title: string;
  ownerId: string;
  description?: string | null;
  category?: string | null;
  teamSize?: number | null;
  startDate?: string | null;
  budget?: string | null;
  /** 섹션 타입별 내용 (key: sectionType, value: content) */
  sectionContents?: Record<string, string>;
}

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

interface ProposalWithOwner {
  id: string;
  title: string;
  description: string | null;
  status: string;
  category: string | null;
  likeCount: number;
  commentCount: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  ownerName: string | null;
}

interface CommentWithAuthor {
  id: string;
  authorId: string;
  content: string;
  createdAt: Date | null;
  authorName: string | null;
}

interface ProposalDetail {
  proposal: Proposal;
  sections: ProposalSection[];
  comments: CommentWithAuthor[];
  ownerName: string | null;
}

interface CreateActionInput {
  title: string;
  assigneeId?: string | null;
  dueDate?: string | null;
}

interface CreateMilestoneInput {
  title: string;
  startDate?: string | null;
  endDate?: string | null;
}

interface UpdateMilestoneInput {
  title?: string;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
}

// ============================================================================
// Service
// ============================================================================

export class ProposalService {
  constructor(private db: DB) {}

  // --------------------------------------------------------------------------
  // 접근 검증 (테넌트 소속 확인)
  // --------------------------------------------------------------------------

  async verifyAccess(proposalId: string, tenantId: string): Promise<void> {
    const proposal = await this.db
      .select({ tenantId: proposals.tenantId })
      .from(proposals)
      .where(eq(proposals.id, proposalId))
      .get();
    if (!proposal || proposal.tenantId !== tenantId) {
      throw new Error("Not found");
    }
  }

  // --------------------------------------------------------------------------
  // 목록 / 조회
  // --------------------------------------------------------------------------

  /**
   * 단순 목록 조회 (API용)
   */
  async list(tenantId: string): Promise<Proposal[]> {
    return this.db
      .select()
      .from(proposals)
      .where(eq(proposals.tenantId, tenantId))
      .orderBy(desc(proposals.updatedAt));
  }

  /**
   * 상세 조회 (단일)
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
   * Owner 이름 포함 목록 (목록 페이지용)
   */
  async listWithOwnerNames(tenantId: string): Promise<ProposalWithOwner[]> {
    return this.db
      .select({
        id: proposals.id,
        title: proposals.title,
        description: proposals.description,
        status: proposals.status,
        category: proposals.category,
        likeCount: proposals.likeCount,
        commentCount: proposals.commentCount,
        createdAt: proposals.createdAt,
        updatedAt: proposals.updatedAt,
        ownerName: users.name,
      })
      .from(proposals)
      .leftJoin(users, eq(proposals.ownerId, users.id))
      .where(eq(proposals.tenantId, tenantId));
  }

  /**
   * 사용자가 좋아요한 제안 ID 목록
   */
  async getUserLikedIds(userId: string): Promise<string[]> {
    const likes = await this.db
      .select({ proposalId: proposalLikes.proposalId })
      .from(proposalLikes)
      .where(eq(proposalLikes.userId, userId));
    return likes.map((l) => l.proposalId);
  }

  /**
   * 상세 조회 (섹션 + 댓글 + Owner 이름 포함)
   */
  async getDetail(
    id: string,
    tenantId: string,
  ): Promise<ProposalDetail | null> {
    const proposal = await this.db
      .select()
      .from(proposals)
      .where(eq(proposals.id, id))
      .get();

    if (!proposal || proposal.tenantId !== tenantId) {
      return null;
    }

    const [sections, comments, ownerRow] = await Promise.all([
      this.db
        .select()
        .from(proposalSections)
        .where(eq(proposalSections.proposalId, id)),
      this.db
        .select({
          id: proposalComments.id,
          authorId: proposalComments.authorId,
          content: proposalComments.content,
          createdAt: proposalComments.createdAt,
          authorName: users.name,
        })
        .from(proposalComments)
        .leftJoin(users, eq(proposalComments.authorId, users.id))
        .where(eq(proposalComments.proposalId, id)),
      this.db
        .select({ name: users.name })
        .from(users)
        .where(eq(users.id, proposal.ownerId))
        .get(),
    ]);

    return {
      proposal,
      sections,
      comments,
      ownerName: ownerRow?.name ?? null,
    };
  }

  // --------------------------------------------------------------------------
  // 생성
  // --------------------------------------------------------------------------

  /**
   * 새 제안 생성 (섹션 포함)
   */
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

  // --------------------------------------------------------------------------
  // 삭제
  // --------------------------------------------------------------------------

  /**
   * 제안 삭제 (Owner만 가능)
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

  // --------------------------------------------------------------------------
  // 업데이트
  // --------------------------------------------------------------------------

  /**
   * 제안 업데이트 (상태 전환 검증 포함)
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
   * 단일 섹션 업데이트
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

  // --------------------------------------------------------------------------
  // 댓글
  // --------------------------------------------------------------------------

  /**
   * 댓글 목록 (작성자 이름 포함)
   */
  async listComments(proposalId: string): Promise<CommentWithAuthor[]> {
    return this.db
      .select({
        id: proposalComments.id,
        authorId: proposalComments.authorId,
        content: proposalComments.content,
        createdAt: proposalComments.createdAt,
        authorName: users.name,
      })
      .from(proposalComments)
      .leftJoin(users, eq(proposalComments.authorId, users.id))
      .where(eq(proposalComments.proposalId, proposalId));
  }

  /**
   * 댓글 추가
   */
  async addComment(
    proposalId: string,
    authorId: string,
    content: string,
  ): Promise<void> {
    await this.db.insert(proposalComments).values({
      proposalId,
      authorId,
      content,
    });
  }

  // --------------------------------------------------------------------------
  // 좋아요
  // --------------------------------------------------------------------------

  /**
   * 좋아요 토글 (true: 좋아요 추가, false: 좋아요 취소)
   */
  async toggleLike(proposalId: string, userId: string): Promise<boolean> {
    const existing = await this.db
      .select({ id: proposalLikes.id })
      .from(proposalLikes)
      .where(
        and(
          eq(proposalLikes.proposalId, proposalId),
          eq(proposalLikes.userId, userId),
        ),
      )
      .get();

    if (existing) {
      // Unlike
      await this.db
        .delete(proposalLikes)
        .where(eq(proposalLikes.id, existing.id));
      await this.db
        .update(proposals)
        .set({ likeCount: sql`MAX(0, ${proposals.likeCount} - 1)` })
        .where(eq(proposals.id, proposalId));
      return false;
    } else {
      // Like
      await this.db
        .insert(proposalLikes)
        .values({ proposalId, userId });
      await this.db
        .update(proposals)
        .set({ likeCount: sql`${proposals.likeCount} + 1` })
        .where(eq(proposals.id, proposalId));
      return true;
    }
  }

  // --------------------------------------------------------------------------
  // 액션
  // --------------------------------------------------------------------------

  /**
   * 액션 생성
   */
  async createAction(
    proposalId: string,
    input: CreateActionInput,
  ): Promise<string> {
    const [created] = await this.db
      .insert(proposalActions)
      .values({
        proposalId,
        title: input.title,
        assigneeId: input.assigneeId ?? null,
        dueDate: input.dueDate ?? null,
      })
      .returning({ id: proposalActions.id });
    return created.id;
  }

  /**
   * 액션 완료 토글
   */
  async toggleAction(
    actionId: string,
    proposalId: string,
    completed: boolean,
  ): Promise<void> {
    const actionItem = await this.db
      .select({ id: proposalActions.id })
      .from(proposalActions)
      .where(
        and(
          eq(proposalActions.id, actionId),
          eq(proposalActions.proposalId, proposalId),
        ),
      )
      .get();
    if (!actionItem) {
      throw new Error("Action not found");
    }
    await this.db
      .update(proposalActions)
      .set({ completed: completed ? 1 : 0 })
      .where(eq(proposalActions.id, actionId));
  }

  /**
   * 액션 삭제
   */
  async deleteAction(actionId: string, proposalId: string): Promise<void> {
    const actionItem = await this.db
      .select({ id: proposalActions.id })
      .from(proposalActions)
      .where(
        and(
          eq(proposalActions.id, actionId),
          eq(proposalActions.proposalId, proposalId),
        ),
      )
      .get();
    if (!actionItem) {
      throw new Error("Action not found");
    }
    await this.db
      .delete(proposalActions)
      .where(eq(proposalActions.id, actionId));
  }

  // --------------------------------------------------------------------------
  // 멤버
  // --------------------------------------------------------------------------

  /**
   * 멤버 추가
   */
  async addMember(proposalId: string, userId: string): Promise<void> {
    const existing = await this.db
      .select({ userId: proposalMembers.userId })
      .from(proposalMembers)
      .where(
        and(
          eq(proposalMembers.proposalId, proposalId),
          eq(proposalMembers.userId, userId),
        ),
      )
      .get();
    if (existing) {
      throw new Error("이미 등록된 멤버입니다");
    }
    await this.db
      .insert(proposalMembers)
      .values({ proposalId, userId });
  }

  /**
   * 멤버 제거
   */
  async removeMember(proposalId: string, userId: string): Promise<void> {
    await this.db
      .delete(proposalMembers)
      .where(
        and(
          eq(proposalMembers.proposalId, proposalId),
          eq(proposalMembers.userId, userId),
        ),
      );
  }

  // --------------------------------------------------------------------------
  // 마일스톤
  // --------------------------------------------------------------------------

  /**
   * 마일스톤 생성
   */
  async createMilestone(
    proposalId: string,
    input: CreateMilestoneInput,
  ): Promise<string> {
    const existing = await this.db
      .select({ sortOrder: proposalMilestones.sortOrder })
      .from(proposalMilestones)
      .where(eq(proposalMilestones.proposalId, proposalId));
    const maxSort = existing.reduce(
      (max, m) => Math.max(max, m.sortOrder),
      -1,
    );

    const [created] = await this.db
      .insert(proposalMilestones)
      .values({
        proposalId,
        title: input.title,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
        sortOrder: maxSort + 1,
      })
      .returning({ id: proposalMilestones.id });
    return created.id;
  }

  /**
   * 마일스톤 업데이트
   */
  async updateMilestone(
    milestoneId: string,
    proposalId: string,
    input: UpdateMilestoneInput,
  ): Promise<void> {
    const milestone = await this.db
      .select({ id: proposalMilestones.id })
      .from(proposalMilestones)
      .where(
        and(
          eq(proposalMilestones.id, milestoneId),
          eq(proposalMilestones.proposalId, proposalId),
        ),
      )
      .get();
    if (!milestone) {
      throw new Error("Milestone not found");
    }

    const updates: Record<string, unknown> = {};
    if (input.title !== undefined) updates.title = input.title;
    if (input.status !== undefined) updates.status = input.status;
    if (input.startDate !== undefined) updates.startDate = input.startDate;
    if (input.endDate !== undefined) updates.endDate = input.endDate;

    if (Object.keys(updates).length > 0) {
      await this.db
        .update(proposalMilestones)
        .set(updates)
        .where(eq(proposalMilestones.id, milestoneId));
    }
  }

  /**
   * 마일스톤 삭제
   */
  async deleteMilestone(
    milestoneId: string,
    proposalId: string,
  ): Promise<void> {
    const milestone = await this.db
      .select({ id: proposalMilestones.id })
      .from(proposalMilestones)
      .where(
        and(
          eq(proposalMilestones.id, milestoneId),
          eq(proposalMilestones.proposalId, proposalId),
        ),
      )
      .get();
    if (!milestone) {
      throw new Error("Milestone not found");
    }
    await this.db
      .delete(proposalMilestones)
      .where(eq(proposalMilestones.id, milestoneId));
  }

  // --------------------------------------------------------------------------
  // 카테고리
  // --------------------------------------------------------------------------

  /**
   * 카테고리 검색 (tenantId 필터 항상 적용)
   */
  async listCategories(
    tenantId: string,
    query?: string,
  ): Promise<string[]> {
    const whereClause = query
      ? and(
          eq(proposalCategories.tenantId, tenantId),
          like(proposalCategories.name, `%${query}%`),
        )
      : eq(proposalCategories.tenantId, tenantId);

    const categories = await this.db
      .select({ name: proposalCategories.name })
      .from(proposalCategories)
      .where(whereClause)
      .orderBy(desc(proposalCategories.usageCount))
      .limit(20);

    return categories.map((c) => c.name);
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
