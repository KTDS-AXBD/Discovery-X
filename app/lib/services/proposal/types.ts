import {
  proposals,
  proposalSections,
} from "~/features/proposals/db/schema";

// 스키마 기반 타입 별칭
export type Proposal = typeof proposals.$inferSelect;
export type ProposalSection = typeof proposalSections.$inferSelect;

export interface CreateProposalInput {
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

export interface UpdateProposalInput {
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

export interface ProposalWithOwner {
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

export interface CommentWithAuthor {
  id: string;
  authorId: string;
  content: string;
  createdAt: Date | null;
  authorName: string | null;
}

export interface ProposalDetail {
  proposal: Proposal;
  sections: ProposalSection[];
  comments: CommentWithAuthor[];
  ownerName: string | null;
}

export interface CreateActionInput {
  title: string;
  assigneeId?: string | null;
  dueDate?: string | null;
}

export interface CreateMilestoneInput {
  title: string;
  startDate?: string | null;
  endDate?: string | null;
}

export interface UpdateMilestoneInput {
  title?: string;
  status?: string;
  startDate?: string | null;
  endDate?: string | null;
}
