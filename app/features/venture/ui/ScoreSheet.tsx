/**
 * Score Sheet 컴포넌트
 *
 * 기회의 점수 breakdown을 시각적으로 표시
 */

import type { VdDepthScoreBreakdown, VdRecommendationType } from "../types";

interface ScoreSheetProps {
  potentialScore?: number | null;
  confidenceScore?: number | null;
  depthBreakdown?: VdDepthScoreBreakdown | null;
  effortScore?: number | null;
  recommendation?: VdRecommendationType | null;
  compact?: boolean;
}

export function ScoreSheet({
  potentialScore,
  confidenceScore,
  depthBreakdown,
  effortScore,
  recommendation,
  compact = false,
}: ScoreSheetProps) {
  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {potentialScore !== null && potentialScore !== undefined && (
          <ScorePill label="P" value={potentialScore} max={100} />
        )}
        {confidenceScore !== null && confidenceScore !== undefined && (
          <ScorePill label="C" value={confidenceScore} max={100} />
        )}
        {depthBreakdown && <ScorePill label="D" value={depthBreakdown.total} max={100} />}
        {effortScore !== null && effortScore !== undefined && (
          <ScorePill label="E" value={effortScore} max={100} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 주요 점수 */}
      <div className="grid gap-4 sm:grid-cols-2">
        {potentialScore !== null && potentialScore !== undefined && (
          <ScoreBar label="잠재력 (Potential)" value={potentialScore} max={100} />
        )}
        {confidenceScore !== null && confidenceScore !== undefined && (
          <ScoreBar label="신뢰도 (Confidence)" value={confidenceScore} max={100} />
        )}
      </div>

      {/* Depth Score Breakdown */}
      {depthBreakdown && (
        <div className="rounded-lg border border-[var(--axis-border-default)] p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="font-medium text-[var(--axis-text-primary)]">깊이 점수 (Depth)</span>
            <span className="text-lg font-bold text-[var(--axis-text-primary)]">
              {depthBreakdown.total}
              <span className="text-sm font-normal text-[var(--axis-text-tertiary)]">/100</span>
            </span>
          </div>
          <div className="space-y-2">
            <DepthComponent
              label="근거 깊이"
              value={depthBreakdown.evidenceDepth}
              max={40}
              description="Evidence Depth"
            />
            <DepthComponent
              label="가정 커버리지"
              value={depthBreakdown.assumptionCoverage}
              max={25}
              description="Assumption Coverage"
            />
            <DepthComponent
              label="리스크 대비"
              value={depthBreakdown.riskReadiness}
              max={15}
              description="Risk Readiness"
            />
            <DepthComponent
              label="실행 명확성"
              value={depthBreakdown.executionClarity}
              max={20}
              description="Execution Clarity"
            />
          </div>
        </div>
      )}

      {/* Effort Score */}
      {effortScore !== null && effortScore !== undefined && (
        <ScoreBar label="투입 노력 (Effort)" value={effortScore} max={100} />
      )}

      {/* Recommendation */}
      {recommendation && <RecommendationBadge recommendation={recommendation} />}
    </div>
  );
}

function ScorePill({ label, value, max }: { label: string; value: number; max: number }) {
  const percentage = (value / max) * 100;
  const color = getScoreColor(percentage);

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}
    >
      <span className="opacity-70">{label}</span>
      <span>{value}</span>
    </span>
  );
}

function ScoreBar({ label, value, max }: { label: string; value: number; max: number }) {
  const percentage = (value / max) * 100;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-[var(--axis-text-secondary)]">{label}</span>
        <span className="font-medium text-[var(--axis-text-primary)]">
          {value}
          <span className="text-[var(--axis-text-tertiary)]">/{max}</span>
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-[var(--axis-surface-tertiary)]">
        <div
          className={`h-full rounded-full transition-all ${getBarColor(percentage)}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function DepthComponent({
  label,
  value,
  max,
  description,
}: {
  label: string;
  value: number;
  max: number;
  description: string;
}) {
  const percentage = (value / max) * 100;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-[var(--axis-text-secondary)]">
          {label}
          <span className="ml-1 text-[var(--axis-text-tertiary)]">({description})</span>
        </span>
        <span className="text-[var(--axis-text-primary)]">
          {value}/{max}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-[var(--axis-surface-tertiary)]">
        <div
          className={`h-full rounded-full transition-all ${getBarColor(percentage)}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function RecommendationBadge({ recommendation }: { recommendation: VdRecommendationType }) {
  const config: Record<VdRecommendationType, { bg: string; text: string; label: string }> = {
    INVEST: {
      bg: "bg-[var(--axis-badge-success-bg)]",
      text: "text-[var(--axis-badge-success-text)]",
      label: "투자 권장",
    },
    EXPLORE: {
      bg: "bg-[var(--axis-badge-info-bg)]",
      text: "text-[var(--axis-badge-info-text)]",
      label: "추가 탐색",
    },
    HOLD: {
      bg: "bg-[var(--axis-badge-warning-bg)]",
      text: "text-[var(--axis-badge-warning-text)]",
      label: "보류",
    },
    DROP: {
      bg: "bg-[var(--axis-badge-destructive-bg)]",
      text: "text-[var(--axis-badge-destructive-text)]",
      label: "중단 권장",
    },
  };

  const { bg, text, label } = config[recommendation];

  return (
    <div className={`rounded-lg p-4 ${bg}`}>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-medium ${text}`}>Next-ROI 추천:</span>
        <span className={`text-lg font-bold ${text}`}>{label}</span>
      </div>
    </div>
  );
}

function getScoreColor(percentage: number): string {
  if (percentage >= 70) return "bg-[var(--axis-badge-success-bg)] text-[var(--axis-badge-success-text)]";
  if (percentage >= 40) return "bg-[var(--axis-badge-warning-bg)] text-[var(--axis-badge-warning-text)]";
  return "bg-[var(--axis-surface-tertiary)] text-[var(--axis-text-tertiary)]";
}

function getBarColor(percentage: number): string {
  if (percentage >= 70) return "bg-[var(--axis-badge-success-bg)]";
  if (percentage >= 40) return "bg-[var(--axis-badge-warning-bg)]";
  return "bg-[var(--axis-surface-secondary)]";
}
