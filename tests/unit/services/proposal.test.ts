/**
 * ProposalService 단위 테스트
 *
 * 대상: app/lib/services/proposal.service.ts
 * - list, getById, delete, update (상태 전환 + 섹션 + 카테고리), updateSection
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb } from "tests/helpers/db";
import type { DB } from "~/db";
import { ProposalService } from "~/features/proposals/service/proposal.service";
import { users, tenants, tenantMembers } from "~/db/schema";
import {
  proposals,
  proposalSections,
  proposalCategories,
  proposalComments,
} from "~/features/proposals/db/schema";
import { eq } from "drizzle-orm";

let db: ReturnType<typeof createTestDb>;
let service: ProposalService;

const TENANT_ID = "tenant-proposal-test";
const USER_ID = "user-proposal-1";
const OTHER_USER_ID = "user-proposal-2";
const OTHER_TENANT = "tenant-proposal-other";
const PROPOSAL_ID = "prop-1";
const PROPOSAL_ID_2 = "prop-2";

beforeAll(() => {
  db = createTestDb();
  service = new ProposalService(db as unknown as DB);

  // 공통 fixture: users, tenants, tenantMembers
  db.insert(users)
    .values([
      { id: USER_ID, email: "owner@test.com", name: "Owner", role: "admin" },
      { id: OTHER_USER_ID, email: "other@test.com", name: "Other", role: "user" },
    ])
    .run();

  db.insert(tenants)
    .values([
      { id: TENANT_ID, name: "Test Tenant", slug: "test-tenant", ownerUserId: USER_ID },
      { id: OTHER_TENANT, name: "Other Tenant", slug: "other-tenant", ownerUserId: OTHER_USER_ID },
    ])
    .run();

  db.insert(tenantMembers)
    .values([
      { id: "tm-prop-1", tenantId: TENANT_ID, userId: USER_ID },
      { id: "tm-prop-2", tenantId: OTHER_TENANT, userId: OTHER_USER_ID },
    ])
    .run();

  // 테스트용 proposal 삽입
  db.insert(proposals)
    .values([
      {
        id: PROPOSAL_ID,
        tenantId: TENANT_ID,
        ownerId: USER_ID,
        title: "테스트 제안 1",
        status: "PROPOSAL",
        description: "설명",
      },
      {
        id: PROPOSAL_ID_2,
        tenantId: TENANT_ID,
        ownerId: USER_ID,
        title: "테스트 제안 2",
        status: "FORMALIZATION",
        description: "형상화 단계",
      },
    ])
    .run();

  // 테스트용 섹션 삽입
  db.insert(proposalSections)
    .values([
      { id: "sec-1", proposalId: PROPOSAL_ID, type: "overview", content: "기존 개요" },
      { id: "sec-2", proposalId: PROPOSAL_ID, type: "content", content: "기존 내용" },
    ])
    .run();
});

// ============================================================================
// list
// ============================================================================

describe("ProposalService", () => {
  describe("list", () => {
    it("tenant별 목록을 updatedAt 내림차순으로 반환", async () => {
      const result = await service.list(TENANT_ID);

      expect(result.length).toBe(2);
      expect(result.every((p) => p.tenantId === TENANT_ID)).toBe(true);
    });

    it("다른 tenant의 proposal은 포함되지 않음", async () => {
      const result = await service.list(OTHER_TENANT);

      expect(result).toHaveLength(0);
    });
  });

  // ============================================================================
  // getById
  // ============================================================================

  describe("getById", () => {
    it("존재하는 proposal 반환", async () => {
      const result = await service.getById(PROPOSAL_ID);

      expect(result).not.toBeNull();
      expect(result!.id).toBe(PROPOSAL_ID);
      expect(result!.title).toBe("테스트 제안 1");
    });

    it("존재하지 않는 id → null 반환", async () => {
      const result = await service.getById("non-existent");

      expect(result).toBeNull();
    });
  });

  // ============================================================================
  // delete
  // ============================================================================

  describe("delete", () => {
    const DELETE_PROPOSAL = "prop-del-1";

    beforeAll(() => {
      db.insert(proposals)
        .values({
          id: DELETE_PROPOSAL,
          tenantId: TENANT_ID,
          ownerId: USER_ID,
          title: "삭제 대상",
          status: "PROPOSAL",
        })
        .run();
    });

    it("정상 삭제 — owner + 같은 tenant", async () => {
      await service.delete(DELETE_PROPOSAL, TENANT_ID, USER_ID);

      const found = db
        .select()
        .from(proposals)
        .where(eq(proposals.id, DELETE_PROPOSAL))
        .get();
      expect(found).toBeUndefined();
    });

    it("다른 tenant → 'Not found' 에러", async () => {
      await expect(
        service.delete(PROPOSAL_ID, OTHER_TENANT, USER_ID),
      ).rejects.toThrow("Not found");
    });

    it("다른 owner → 'Forbidden' 에러", async () => {
      await expect(
        service.delete(PROPOSAL_ID, TENANT_ID, OTHER_USER_ID),
      ).rejects.toThrow("Forbidden");
    });

    it("존재하지 않는 proposal → 'Not found' 에러", async () => {
      await expect(
        service.delete("no-such-id", TENANT_ID, USER_ID),
      ).rejects.toThrow("Not found");
    });
  });

  // ============================================================================
  // update
  // ============================================================================

  describe("update", () => {
    it("기본 필드 업데이트 (title, description, category)", async () => {
      await service.update(PROPOSAL_ID, TENANT_ID, {
        title: "수정된 제목",
        description: "수정된 설명",
        category: "AI/ML",
      });

      const updated = await service.getById(PROPOSAL_ID);
      expect(updated!.title).toBe("수정된 제목");
      expect(updated!.description).toBe("수정된 설명");
      expect(updated!.category).toBe("AI/ML");
    });

    it("유효한 상태 전환: PROPOSAL → FORMALIZATION", async () => {
      await service.update(PROPOSAL_ID, TENANT_ID, {
        status: "FORMALIZATION",
      });

      const updated = await service.getById(PROPOSAL_ID);
      expect(updated!.status).toBe("FORMALIZATION");
    });

    it("무효한 상태 전환 시 에러 throw", async () => {
      // FORMALIZATION → COMPLETED는 허용되지 않음 (VALIDATION을 거쳐야 함)
      await expect(
        service.update(PROPOSAL_ID, TENANT_ID, { status: "COMPLETED" }),
      ).rejects.toThrow("상태 전환 불가");
    });

    it("CLOSED 전환 시 closeType 없으면 에러", async () => {
      await expect(
        service.update(PROPOSAL_ID, TENANT_ID, { status: "CLOSED" }),
      ).rejects.toThrow("close_type(HOLD/DROP)이 필요합니다");
    });

    it("CLOSED 전환 시 closeType 있으면 정상", async () => {
      await service.update(PROPOSAL_ID, TENANT_ID, {
        status: "CLOSED",
        closeType: "HOLD",
      });

      const updated = await service.getById(PROPOSAL_ID);
      expect(updated!.status).toBe("CLOSED");
      expect(updated!.closeType).toBe("HOLD");
      expect(updated!.closedAt).not.toBeNull();
    });

    it("CLOSED에서 PROPOSAL로 복원 시 closeType/closedAt 초기화", async () => {
      // 현재 PROPOSAL_ID는 CLOSED 상태 (위 테스트에서 전환됨)
      await service.update(PROPOSAL_ID, TENANT_ID, {
        status: "PROPOSAL",
      });

      const updated = await service.getById(PROPOSAL_ID);
      expect(updated!.status).toBe("PROPOSAL");
      expect(updated!.closeType).toBeNull();
      expect(updated!.closedAt).toBeNull();
    });

    it("다른 tenant → 'Not found' 에러", async () => {
      await expect(
        service.update(PROPOSAL_ID, OTHER_TENANT, { title: "해킹" }),
      ).rejects.toThrow("Not found");
    });

    it("섹션 업데이트 (sections 배열)", async () => {
      await service.update(PROPOSAL_ID, TENANT_ID, {
        sections: [{ type: "overview", content: "AI 기반 사업 개요" }],
      });

      const sections = db
        .select()
        .from(proposalSections)
        .where(eq(proposalSections.proposalId, PROPOSAL_ID))
        .all();
      const overview = sections.find((s) => s.type === "overview");
      expect(overview!.content).toBe("AI 기반 사업 개요");
    });

    it("카테고리 upsert — 신규 생성", async () => {
      await service.update(PROPOSAL_ID, TENANT_ID, {
        category: "신규카테고리",
      });

      const cats = db
        .select()
        .from(proposalCategories)
        .where(eq(proposalCategories.name, "신규카테고리"))
        .all();
      expect(cats).toHaveLength(1);
      expect(cats[0].usageCount).toBe(1);
    });

    it("카테고리 upsert — 기존 카테고리 usageCount 증가", async () => {
      await service.update(PROPOSAL_ID_2, TENANT_ID, {
        category: "신규카테고리",
      });

      const cats = db
        .select()
        .from(proposalCategories)
        .where(eq(proposalCategories.name, "신규카테고리"))
        .all();
      expect(cats).toHaveLength(1);
      expect(cats[0].usageCount).toBe(2);
    });
  });

  // ============================================================================
  // updateSection
  // ============================================================================

  describe("updateSection", () => {
    it("특정 섹션의 content 수정", async () => {
      await service.updateSection(PROPOSAL_ID, "content", "완전히 새로운 내용");

      const sections = db
        .select()
        .from(proposalSections)
        .where(eq(proposalSections.proposalId, PROPOSAL_ID))
        .all();
      const content = sections.find((s) => s.type === "content");
      expect(content!.content).toBe("완전히 새로운 내용");
    });
  });

  // ============================================================================
  // 댓글 CRUD + commentCount 동기화
  // ============================================================================

  describe("comments", () => {
    const COMMENT_PROPOSAL = "prop-comment-test";

    beforeAll(() => {
      db.insert(proposals)
        .values({
          id: COMMENT_PROPOSAL,
          tenantId: TENANT_ID,
          ownerId: USER_ID,
          title: "댓글 테스트 제안",
          status: "PROPOSAL",
          commentCount: 0,
        })
        .run();
    });

    describe("addComment", () => {
      it("댓글 추가 + commentCount 증가", async () => {
        await service.addComment(COMMENT_PROPOSAL, USER_ID, "첫 번째 댓글");

        const comments = await service.listComments(COMMENT_PROPOSAL);
        expect(comments).toHaveLength(1);
        expect(comments[0].content).toBe("첫 번째 댓글");

        const proposal = db
          .select({ commentCount: proposals.commentCount })
          .from(proposals)
          .where(eq(proposals.id, COMMENT_PROPOSAL))
          .get();
        expect(proposal!.commentCount).toBe(1);
      });

      it("두 번째 댓글 추가 시 commentCount 2", async () => {
        await service.addComment(COMMENT_PROPOSAL, OTHER_USER_ID, "두 번째 댓글");

        const proposal = db
          .select({ commentCount: proposals.commentCount })
          .from(proposals)
          .where(eq(proposals.id, COMMENT_PROPOSAL))
          .get();
        expect(proposal!.commentCount).toBe(2);
      });
    });

    describe("updateComment", () => {
      it("본인 댓글 수정 성공", async () => {
        const comments = await service.listComments(COMMENT_PROPOSAL);
        const myComment = comments.find((c) => c.authorId === USER_ID)!;

        await service.updateComment(
          myComment.id,
          COMMENT_PROPOSAL,
          USER_ID,
          "수정된 댓글",
        );

        const updated = await service.listComments(COMMENT_PROPOSAL);
        const found = updated.find((c) => c.id === myComment.id)!;
        expect(found.content).toBe("수정된 댓글");
      });

      it("타인 댓글 수정 시 Forbidden", async () => {
        const comments = await service.listComments(COMMENT_PROPOSAL);
        const otherComment = comments.find(
          (c) => c.authorId === OTHER_USER_ID,
        )!;

        await expect(
          service.updateComment(
            otherComment.id,
            COMMENT_PROPOSAL,
            USER_ID,
            "해킹",
          ),
        ).rejects.toThrow("Forbidden");
      });

      it("존재하지 않는 댓글 수정 시 Not found", async () => {
        await expect(
          service.updateComment(
            "no-such-comment",
            COMMENT_PROPOSAL,
            USER_ID,
            "내용",
          ),
        ).rejects.toThrow("Comment not found");
      });
    });

    describe("deleteComment", () => {
      it("타인 댓글 삭제 시 Forbidden", async () => {
        const comments = await service.listComments(COMMENT_PROPOSAL);
        const otherComment = comments.find(
          (c) => c.authorId === OTHER_USER_ID,
        )!;

        await expect(
          service.deleteComment(otherComment.id, COMMENT_PROPOSAL, USER_ID),
        ).rejects.toThrow("Forbidden");
      });

      it("본인 댓글 삭제 + commentCount 감소", async () => {
        const comments = await service.listComments(COMMENT_PROPOSAL);
        const myComment = comments.find((c) => c.authorId === USER_ID)!;

        await service.deleteComment(myComment.id, COMMENT_PROPOSAL, USER_ID);

        const remaining = await service.listComments(COMMENT_PROPOSAL);
        expect(remaining.find((c) => c.id === myComment.id)).toBeUndefined();

        const proposal = db
          .select({ commentCount: proposals.commentCount })
          .from(proposals)
          .where(eq(proposals.id, COMMENT_PROPOSAL))
          .get();
        expect(proposal!.commentCount).toBe(1);
      });

      it("존재하지 않는 댓글 삭제 시 Not found", async () => {
        await expect(
          service.deleteComment("no-such-comment", COMMENT_PROPOSAL, USER_ID),
        ).rejects.toThrow("Comment not found");
      });
    });
  });
});
