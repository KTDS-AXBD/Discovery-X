/**
 * VoteDistributionChart - 투표 점수 분포 히스토그램
 *
 * 완료된 결정에서 1-10 점수 분포를 시각화
 */

interface VoteDistributionChartProps {
  distribution: Record<number, number>;
  averageScore: number;
  totalVoters: number;
  myVoteScore?: number;
}

export function VoteDistributionChart({
  distribution,
  averageScore,
  totalVoters,
  myVoteScore,
}: VoteDistributionChartProps) {
  // 최대 득표 수 (바 높이 정규화용)
  const maxCount = Math.max(...Object.values(distribution), 1);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-[var(--axis-text-primary)]">
          점수 분포
        </div>
        <div className="text-sm text-[var(--axis-text-tertiary)]">
          평균{" "}
          <span className="font-semibold text-[var(--axis-text-primary)]">
            {averageScore.toFixed(1)}
          </span>
          점 · {totalVoters}명 참여
        </div>
      </div>

      {/* 히스토그램 */}
      <div className="flex h-24 items-end gap-1">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((score) => {
          const count = distribution[score] || 0;
          const heightPercent = (count / maxCount) * 100;
          const isAverage = Math.round(averageScore) === score;
          const isMyVote = myVoteScore === score;

          return (
            <div key={score} className="flex flex-1 flex-col items-center gap-1">
              {/* 바 */}
              <div
                className="relative w-full min-h-[4px] rounded-t transition-all"
                style={{
                  height: `${Math.max(heightPercent, 4)}%`,
                  backgroundColor: getBarColor(score, isAverage, isMyVote),
                }}
              >
                {count > 0 && (
                  <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-xs font-medium text-[var(--axis-text-secondary)]">
                    {count}
                  </span>
                )}
              </div>
              {/* 라벨 */}
              <span
                className={`text-xs ${
                  isAverage
                    ? "font-bold text-[var(--axis-text-brand)]"
                    : isMyVote
                      ? "font-semibold text-[var(--axis-text-primary)]"
                      : "text-[var(--axis-text-tertiary)]"
                }`}
              >
                {score}
              </span>
            </div>
          );
        })}
      </div>

      {/* 범례 */}
      <div className="flex items-center gap-4 text-xs text-[var(--axis-text-tertiary)]">
        <div className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: "var(--axis-badge-info-bg)" }}
          />
          <span>평균 점수</span>
        </div>
        {myVoteScore !== undefined && (
          <div className="flex items-center gap-1.5">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm border border-[var(--axis-border-focus)]"
              style={{ backgroundColor: "var(--axis-surface-brand)" }}
            />
            <span>내 투표</span>
          </div>
        )}
      </div>
    </div>
  );
}

function getBarColor(score: number, isAverage: boolean, isMyVote: boolean): string {
  if (isAverage) {
    return "var(--axis-badge-info-bg)";
  }
  if (isMyVote) {
    return "var(--axis-surface-brand)";
  }
  // 점수에 따른 색상 그라데이션
  if (score >= 8) return "var(--axis-badge-success-bg)";
  if (score >= 5) return "var(--axis-surface-tertiary)";
  if (score >= 3) return "var(--axis-badge-warning-bg)";
  return "var(--axis-badge-destructive-bg)";
}
