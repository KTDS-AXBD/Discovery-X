import { eq, desc } from "drizzle-orm";
import type { DB } from "~/db";
import {
  proposals,
  proposalSections,
  proposalComments,
  proposalLikes,
} from "~/features/proposals/db/schema";
import { users } from "~/db";
import type {
  Proposal,
  ProposalWithOwner,
  ProposalDetail,
} from "./types";
import { NotFoundError } from "~/lib/errors";

export class ProposalQueryService {
  constructor(private db: DB) {}

  /** 접근 검증 (테넌트 소속 확인) */
  async verifyAccess(proposalId: string, tenantId: string): Promise<void> {
    const proposal = await this.db
      .select({ tenantId: proposals.tenantId })
      .from(proposals)
      .where(eq(proposals.id, proposalId))
      .get();
    if (!proposal || proposal.tenantId !== tenantId) {
      throw new NotFoundError("Proposal", proposalId);
    }
  }

  /** 단순 목록 조회 (API용) */
  async list(tenantId: string): Promise<Proposal[]> {
    return this.db
      .select()
      .from(proposals)
      .where(eq(proposals.tenantId, tenantId))
      .orderBy(desc(proposals.updatedAt));
  }

  /** 상세 조회 (단일) */
  async getById(id: string): Promise<Proposal | null> {
    const result = await this.db
      .select()
      .from(proposals)
      .where(eq(proposals.id, id))
      .get();
    return result ?? null;
  }

  /** Owner 이름 포함 목록 (목록 페이지용) */
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

  /** 사용자가 좋아요한 제안 ID 목록 */
  async getUserLikedIds(userId: string): Promise<string[]> {
    const likes = await this.db
      .select({ proposalId: proposalLikes.proposalId })
      .from(proposalLikes)
      .where(eq(proposalLikes.userId, userId));
    return likes.map((l) => l.proposalId);
  }

  /** 상세 조회 (섹션 + 댓글 + Owner 이름 포함) */
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
}
