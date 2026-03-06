/**
 * 요구사항 도메인 TypeScript 인터페이스
 * Bounded Context: requests
 */

import type { RequestClassificationValue, HumanVerdictValue, WorkPlanStatusValue, RequestStatusValue, RunStatusValue } from "./constants";
import type { WorkPlanStepData } from "./db/schema";

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
  steps: WorkPlanStepData[] | null;
  estimatedEffort: string | null;
  linkedDiscoveryId: string | null;
  status: WorkPlanStatusValue;
  progress: number;
  startedAt: Date | null;
  completedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Agent 실행 기록 */
export interface WorkPlanRun {
  id: string;
  workPlanId: string;
  stepIndex: number;
  status: RunStatusValue;
  agentInput: string | null;
  agentOutput: string | null;
  modelId: string | null;
  tokenUsage: number;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
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

/** 작업 현황 대시보드용 (요구사항 + 작업계획 + 실행 이력) */
export interface WorkPlanWithContext {
  id: string;
  requestId: string;
  requestTitle: string;
  requestPriority: string;
  title: string;
  description: string;
  steps: WorkPlanStepData[] | null;
  estimatedEffort: string | null;
  status: WorkPlanStatusValue;
  progress: number;
  startedAt: string | null;
  completedAt: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
  runs: WorkPlanRun[];
}
