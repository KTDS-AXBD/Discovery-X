/**
 * ProposalService — Facade.
 * 실제 구현은 proposal/ 서브모듈 참조.
 */
import type { DB } from "~/db";
import { ProposalQueryService } from "./proposal/query";
import { ProposalMutationService } from "./proposal/mutation";
import { ProposalCollabService } from "./proposal/collab";
import type { UpdateProposalInput } from "./proposal/types";

// backward-compat re-export
export type {
  Proposal,
  ProposalSection,
  CreateProposalInput,
  UpdateProposalInput,
  ProposalWithOwner,
  CommentWithAuthor,
  ProposalDetail,
  CreateActionInput,
  CreateMilestoneInput,
  UpdateMilestoneInput,
} from "./proposal/types";

export class ProposalService {
  private query: ProposalQueryService;
  private mutation: ProposalMutationService;
  private collab: ProposalCollabService;

  constructor(db: DB) {
    this.query = new ProposalQueryService(db);
    this.mutation = new ProposalMutationService(db);
    this.collab = new ProposalCollabService(db);
  }

  // --- Query delegates ---

  verifyAccess = (...args: Parameters<ProposalQueryService["verifyAccess"]>) =>
    this.query.verifyAccess(...args);

  list = (...args: Parameters<ProposalQueryService["list"]>) =>
    this.query.list(...args);

  getById = (...args: Parameters<ProposalQueryService["getById"]>) =>
    this.query.getById(...args);

  listWithOwnerNames = (
    ...args: Parameters<ProposalQueryService["listWithOwnerNames"]>
  ) => this.query.listWithOwnerNames(...args);

  getUserLikedIds = (
    ...args: Parameters<ProposalQueryService["getUserLikedIds"]>
  ) => this.query.getUserLikedIds(...args);

  getDetail = (...args: Parameters<ProposalQueryService["getDetail"]>) =>
    this.query.getDetail(...args);

  // --- Mutation delegates ---

  create = (...args: Parameters<ProposalMutationService["create"]>) =>
    this.mutation.create(...args);

  delete = (...args: Parameters<ProposalMutationService["delete"]>) =>
    this.mutation.delete(...args);

  /** update + 카테고리 upsert 조합 (원본 동작 유지) */
  update = async (
    id: string,
    tenantId: string,
    input: UpdateProposalInput,
  ): Promise<void> => {
    await this.mutation.update(id, tenantId, input);
    if (input.category) {
      await this.collab.upsertCategory(tenantId, input.category);
    }
  };

  getSections = (
    ...args: Parameters<ProposalMutationService["getSections"]>
  ) => this.mutation.getSections(...args);

  upsertSections = (
    ...args: Parameters<ProposalMutationService["upsertSections"]>
  ) => this.mutation.upsertSections(...args);

  updateSection = (
    ...args: Parameters<ProposalMutationService["updateSection"]>
  ) => this.mutation.updateSection(...args);

  // --- Collab delegates ---

  listComments = (
    ...args: Parameters<ProposalCollabService["listComments"]>
  ) => this.collab.listComments(...args);

  addComment = (...args: Parameters<ProposalCollabService["addComment"]>) =>
    this.collab.addComment(...args);

  updateComment = (
    ...args: Parameters<ProposalCollabService["updateComment"]>
  ) => this.collab.updateComment(...args);

  deleteComment = (
    ...args: Parameters<ProposalCollabService["deleteComment"]>
  ) => this.collab.deleteComment(...args);

  toggleLike = (...args: Parameters<ProposalCollabService["toggleLike"]>) =>
    this.collab.toggleLike(...args);

  createAction = (
    ...args: Parameters<ProposalCollabService["createAction"]>
  ) => this.collab.createAction(...args);

  toggleAction = (
    ...args: Parameters<ProposalCollabService["toggleAction"]>
  ) => this.collab.toggleAction(...args);

  deleteAction = (
    ...args: Parameters<ProposalCollabService["deleteAction"]>
  ) => this.collab.deleteAction(...args);

  addMember = (...args: Parameters<ProposalCollabService["addMember"]>) =>
    this.collab.addMember(...args);

  removeMember = (...args: Parameters<ProposalCollabService["removeMember"]>) =>
    this.collab.removeMember(...args);

  createMilestone = (
    ...args: Parameters<ProposalCollabService["createMilestone"]>
  ) => this.collab.createMilestone(...args);

  updateMilestone = (
    ...args: Parameters<ProposalCollabService["updateMilestone"]>
  ) => this.collab.updateMilestone(...args);

  deleteMilestone = (
    ...args: Parameters<ProposalCollabService["deleteMilestone"]>
  ) => this.collab.deleteMilestone(...args);

  listCategories = (
    ...args: Parameters<ProposalCollabService["listCategories"]>
  ) => this.collab.listCategories(...args);
}
