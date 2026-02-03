/**
 * Opportunity Card 컴포넌트
 *
 * 기회 요약 정보를 표시하는 카드
 */

import { Link } from "@remix-run/react";
import { Badge } from "~/components/ui/Badge";
import type { VdOpportunity, VdRecommendationType } from "../types";

const RECOMMENDATION_VARIANTS: Record<VdRecommendationType, "success" | "info" | "warning" | "destructive"> = {
  INVEST: "success",
  EXPLORE: "info",
  HOLD: "warning",
  DROP: "destructive",
};

const RECOMMENDATION_LABELS: Record<VdRecommendationType, string> = {
  INVEST: "투자",
  EXPLORE: "탐색",
  HOLD: "보류",
  DROP: "중단",
};

interface OpportunityCardProps {
  opportunity: VdOpportunity;
  sprintId: string;
  showActions?: boolean;
  onShortlistToggle?: (id: string, value: boolean) => void;
}

export function OpportunityCard({
  opportunity,
  sprintId,
  showActions = true,
  onShortlistToggle,
}: OpportunityCardProps) {
  const recommendation = opportunity.recommendation as VdRecommendationType | null;

  return (
    <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-4">
      {/* 헤더 */}
      <div className="mb-3 flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Link
              to={`/venture/sprints/${sprintId}/opportunities/${opportunity.id}`}
              className="font-semibold text-[var(--axis-text-primary)] hover:underline"
            >
              {opportunity.title}
            </Link>
            {opportunity.isShortlisted === 1 && (
              <Badge variant="success" className="text-xs">
                Shortlist
              </Badge>
            )}
            {opportunity.isFinal === 1 && (
              <Badge variant="info" className="text-xs">
                Final
              </Badge>
            )}
          </div>
          {opportunity.targetSegment && (
            <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
              {opportunity.targetSegment}
            </p>
          )}
        </div>
        {opportunity.rank && (
          <span className="ml-2 text-lg font-bold text-[var(--axis-text-tertiary)]">
            #{opportunity.rank}
          </span>
        )}
      </div>

      {/* 설명 */}
      {opportunity.description && (
        <p className="mb-3 text-sm text-[var(--axis-text-secondary)] line-clamp-2">
          {opportunity.description}
        </p>
      )}

      {/* 점수 */}
      <div className="mb-3 flex flex-wrap gap-2">
        {opportunity.potentialScore !== null && (
          <ScoreBadge label="잠재력" value={opportunity.potentialScore} />
        )}
        {opportunity.confidenceScore !== null && (
          <ScoreBadge label="신뢰도" value={opportunity.confidenceScore} />
        )}
        {opportunity.depthScore !== null && (
          <ScoreBadge label="깊이" value={opportunity.depthScore} />
        )}
        {recommendation && (
          <Badge variant={RECOMMENDATION_VARIANTS[recommendation]}>
            {RECOMMENDATION_LABELS[recommendation]}
          </Badge>
        )}
      </div>

      {/* 액션 */}
      {showActions && onShortlistToggle && (
        <div className="flex items-center gap-2 border-t border-[var(--axis-border-default)] pt-3">
          <button
            type="button"
            onClick={() => onShortlistToggle(opportunity.id, opportunity.isShortlisted !== 1)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              opportunity.isShortlisted === 1
                ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-on-brand)]"
                : "bg-[var(--axis-surface-tertiary)] text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-secondary)]"
            }`}
          >
            {opportunity.isShortlisted === 1 ? "Shortlist 해제" : "Shortlist 추가"}
          </button>
        </div>
      )}
    </div>
  );
}

function ScoreBadge({ label, value }: { label: string; value: number }) {
  const getColor = (v: number) => {
    if (v >= 70) return "text-[var(--axis-badge-success-text)]";
    if (v >= 40) return "text-[var(--axis-badge-warning-text)]";
    return "text-[var(--axis-text-tertiary)]";
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-[var(--axis-surface-secondary)] px-2 py-0.5 text-xs ${getColor(value)}`}
    >
      <span className="text-[var(--axis-text-tertiary)]">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}
