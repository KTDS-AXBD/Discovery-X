/**
 * Decision Card 컴포넌트
 *
 * Gate 결정 정보 및 투표 UI
 */

import { Badge } from "~/components/ui/Badge";
import { VD_DECISION_TYPE_CONFIG, VD_DECISION_STATUS_CONFIG } from "../constants/decision-types";
import type { VdDecision, VdVote, VdDecisionTypeValue, VdDecisionStatusType } from "../types";

interface DecisionCardProps {
  decision: VdDecision & {
    votes: VdVote[];
    myVote?: VdVote | null;
    aggregation?: {
      totalVoters: number;
      averageScore: number;
      hasConsensus: boolean;
    } | null;
  };
  isCompleted?: boolean;
  children?: React.ReactNode;
}

export function DecisionCard({ decision, isCompleted = false, children }: DecisionCardProps) {
  const typeConfig = VD_DECISION_TYPE_CONFIG[decision.decisionType as VdDecisionTypeValue];
  const statusConfig = VD_DECISION_STATUS_CONFIG[decision.status as VdDecisionStatusType];

  return (
    <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
      {/* 헤더 */}
      <div className="mb-4 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant={statusConfig?.variant || "secondary"}>
              {statusConfig?.label || decision.status}
            </Badge>
            <span className="font-semibold text-[var(--axis-text-primary)]">
              {typeConfig?.label || decision.decisionType}
            </span>
          </div>
          {typeConfig?.description && (
            <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
              {typeConfig.description}
            </p>
          )}
        </div>
        <div className="text-right text-xs text-[var(--axis-text-tertiary)]">
          <div>투표: {decision.votes.length}명</div>
          {decision.timeoutAt && !isCompleted && (
            <div>마감: {new Date(decision.timeoutAt).toLocaleString("ko-KR")}</div>
          )}
          {decision.decidedAt && isCompleted && (
            <div>결정: {new Date(decision.decidedAt).toLocaleString("ko-KR")}</div>
          )}
        </div>
      </div>

      {/* Agent 추천안 */}
      {decision.agentRecommendation && (
        <AgentRecommendation recommendation={decision.agentRecommendation} />
      )}

      {/* 완료된 결정 결과 */}
      {isCompleted && decision.selectedOption && (
        <div className="mb-4 rounded-md bg-[var(--axis-surface-secondary)] p-4">
          <div className="text-sm font-medium text-[var(--axis-text-primary)]">결정 결과</div>
          <p className="mt-1 text-sm text-[var(--axis-text-secondary)]">
            {decision.selectedOption}
          </p>
          {decision.humanRationale && (
            <p className="mt-2 text-xs text-[var(--axis-text-tertiary)]">
              {decision.humanRationale}
            </p>
          )}
        </div>
      )}

      {/* 투표 결과 */}
      {decision.aggregation && decision.aggregation.totalVoters > 0 && (
        <VoteAggregation aggregation={decision.aggregation} isCompleted={isCompleted} />
      )}

      {/* 자식 컴포넌트 (투표 폼 등) */}
      {children}
    </div>
  );
}

interface AgentRecommendationProps {
  recommendation: NonNullable<VdDecision["agentRecommendation"]>;
}

function AgentRecommendation({ recommendation }: AgentRecommendationProps) {
  return (
    <div className="mb-4 rounded-md bg-[var(--axis-surface-secondary)] p-4">
      <div className="mb-2 text-sm font-medium text-[var(--axis-text-primary)]">Agent 추천</div>
      <p className="text-sm text-[var(--axis-text-secondary)]">{recommendation.recommendation}</p>
      {recommendation.rationale && (
        <p className="mt-2 text-xs text-[var(--axis-text-tertiary)]">{recommendation.rationale}</p>
      )}
      {recommendation.confidence !== undefined && (
        <div className="mt-2 text-xs text-[var(--axis-text-tertiary)]">
          신뢰도: {recommendation.confidence}%
        </div>
      )}
    </div>
  );
}

interface VoteAggregationProps {
  aggregation: {
    totalVoters: number;
    averageScore: number;
    hasConsensus: boolean;
  };
  isCompleted: boolean;
}

function VoteAggregation({ aggregation, isCompleted }: VoteAggregationProps) {
  return (
    <div className="border-t border-[var(--axis-border-default)] pt-4">
      <div className="flex items-center gap-2 text-sm text-[var(--axis-text-tertiary)]">
        {isCompleted ? (
          <>
            <span>평균 점수: {aggregation.averageScore.toFixed(1)} / 10</span>
            <span className="text-[var(--axis-border-default)]">•</span>
            <span>투표자: {aggregation.totalVoters}명</span>
          </>
        ) : (
          <>
            <span>현재 {aggregation.totalVoters}명 투표 완료</span>
            {aggregation.hasConsensus && (
              <Badge variant="success" className="ml-2">
                합의 도달
              </Badge>
            )}
          </>
        )}
      </div>
    </div>
  );
}
