import { eq, desc, and, sql, like } from "drizzle-orm";
import type { DB } from "~/db";
import {
  proposals,
  proposalComments,
  proposalLikes,
  proposalActions,
  proposalMembers,
  proposalMilestones,
  proposalCategories,
} from "~/features/proposals/db/schema";
import { users } from "~/db";
import type {
  CommentWithAuthor,
  CreateActionInput,
  CreateMilestoneInput,
  UpdateMilestoneInput,
} from "./types";
import { NotFoundError, UnauthorizedError, ConflictError } from "~/lib/errors";

export class ProposalCollabService {
  constructor(private db: DB) {}

  // --------------------------------------------------------------------------
  // 댓글
  // --------------------------------------------------------------------------

  /** 댓글 목록 (작성자 이름 포함) */
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

  /** 댓글 추가 (commentCount 동기화) */
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
    await this.db
      .update(proposals)
      .set({ commentCount: sql`${proposals.commentCount} + 1` })
      .where(eq(proposals.id, proposalId));
  }

  /** 댓글 수정 (본인만) */
  async updateComment(
    commentId: string,
    proposalId: string,
    authorId: string,
    content: string,
  ): Promise<void> {
    const comment = await this.db
      .select({ id: proposalComments.id, authorId: proposalComments.authorId })
      .from(proposalComments)
      .where(
        and(
          eq(proposalComments.id, commentId),
          eq(proposalComments.proposalId, proposalId),
        ),
      )
      .get();
    if (!comment) {
      throw new NotFoundError("Comment", commentId);
    }
    if (comment.authorId !== authorId) {
      throw new UnauthorizedError("Forbidden");
    }
    await this.db
      .update(proposalComments)
      .set({ content })
      .where(eq(proposalComments.id, commentId));
  }

  /** 댓글 삭제 (본인만, commentCount 동기화) */
  async deleteComment(
    commentId: string,
    proposalId: string,
    authorId: string,
  ): Promise<void> {
    const comment = await this.db
      .select({ id: proposalComments.id, authorId: proposalComments.authorId })
      .from(proposalComments)
      .where(
        and(
          eq(proposalComments.id, commentId),
          eq(proposalComments.proposalId, proposalId),
        ),
      )
      .get();
    if (!comment) {
      throw new NotFoundError("Comment", commentId);
    }
    if (comment.authorId !== authorId) {
      throw new UnauthorizedError("Forbidden");
    }
    await this.db
      .delete(proposalComments)
      .where(eq(proposalComments.id, commentId));
    await this.db
      .update(proposals)
      .set({ commentCount: sql`MAX(0, ${proposals.commentCount} - 1)` })
      .where(eq(proposals.id, proposalId));
  }

  // --------------------------------------------------------------------------
  // 좋아요
  // --------------------------------------------------------------------------

  /** 좋아요 토글 (true: 좋아요 추가, false: 좋아요 취소) */
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

  /** 액션 생성 */
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

  /** 액션 완료 토글 */
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
      throw new NotFoundError("Action", actionId);
    }
    await this.db
      .update(proposalActions)
      .set({ completed: completed ? 1 : 0 })
      .where(eq(proposalActions.id, actionId));
  }

  /** 액션 삭제 */
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
      throw new NotFoundError("Action", actionId);
    }
    await this.db
      .delete(proposalActions)
      .where(eq(proposalActions.id, actionId));
  }

  // --------------------------------------------------------------------------
  // 멤버
  // --------------------------------------------------------------------------

  /** 멤버 추가 */
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
      throw new ConflictError("이미 등록된 멤버입니다");
    }
    await this.db
      .insert(proposalMembers)
      .values({ proposalId, userId });
  }

  /** 멤버 제거 */
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

  /** 마일스톤 생성 */
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

  /** 마일스톤 업데이트 */
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
      throw new NotFoundError("Milestone", milestoneId);
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

  /** 마일스톤 삭제 */
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
      throw new NotFoundError("Milestone", milestoneId);
    }
    await this.db
      .delete(proposalMilestones)
      .where(eq(proposalMilestones.id, milestoneId));
  }

  // --------------------------------------------------------------------------
  // 카테고리
  // --------------------------------------------------------------------------

  /** 카테고리 검색 (tenantId 필터 항상 적용) */
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

  /** 카테고리 upsert (usage count 증가) — facade에서 update 시 호출 */
  async upsertCategory(
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
