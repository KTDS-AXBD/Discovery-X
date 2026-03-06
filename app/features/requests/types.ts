/**
 * 요구사항 도메인 TypeScript 인터페이스
 * Bounded Context: requests
 */

import type { RequestClassificationValue, HumanVerdictValue, WorkPlanStatusValue, RequestStatusValue } from "./constants";

/** AI 리뷰 결과 */
export interface RequestReview {
  id: string;
  requestId: string;
  classification: RequestClassificationValue;
  impactScore: number;
  feasibilityScore: number;
  rationale: string;
  matchedRoutes: string[] | null;
  matchedSpecSections: string[] | null;
  workPlanDraft: string | null;
  modelId: string | null;
  tokenUsage: number;
  humanVerdict: HumanVerdictValue | null;
  humanComment: string | null;
  reviewedBy: string | null;
  createdAt: Date;
  reviewedAt: Date | null;
}

/** 요구사항 이벤트 */
export interface RequestEvent {
  id: string;
  requestId: string;
  eventType: string;
  actorId: string | null;
  actorType: "user" | "agent" | "system";
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

/** 작업계획 */
export interface WorkPlan {
  id: string;
  requestId: string;
  reviewId: string | null;
  title: string;
  description: string;
  steps: string[] | null;
  estimatedEffort: string | null;
  linkedDiscoveryId: string | null;
  status: WorkPlanStatusValue;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** AI 분석 요청 입력 */
export interface AnalyzeRequestInput {
  requestId: string;
}

/** AI 분석 결과 출력 */
export interface AnalyzeRequestOutput {
  reviewId: string;
  classification: RequestClassificationValue;
  impactScore: number;
  feasibilityScore: number;
  rationale: string;
  matchedRoutes: string[];
  matchedSpecSections: string[];
  workPlanDraft: string | null;
}

/** HITL 판정 입력 */
export interface HumanVerdictInput {
  requestId: string;
  verdict: HumanVerdictValue;
  comment?: string;
  reviewerId: string;
}

/** 칸반 보드용 요구사항 (리뷰 정보 포함) */
export interface RequestWithReview {
  id: string;
  title: string;
  description: string;
  priority: string;
  status: RequestStatusValue;
  reason: string | null;
  submitterId: string;
  submitterName: string | null;
  createdAt: string;
  reviewedAt: string | null;
  aiReviewId: string | null;
  review: {
    classification: RequestClassificationValue;
    impactScore: number;
    feasibilityScore: number;
    rationale: string;
    humanVerdict: HumanVerdictValue | null;
    workPlanDraft: string | null;
  } | null;
  linkedDiscoveryId: string | null;
}
