import { useState, useEffect } from "react";
import type { AmbiguityResult } from "../types";
import { DimensionCard } from "./DimensionCard";

interface AmbiguityGaugeProps {
  result: AmbiguityResult | null;
  isEvaluating: boolean;
  onRefresh: () => void;
}

const DIMENSION_LABELS: Record<string, string> = {
  goal: "목표",
  constraint: "제약",
  success: "성공기준",
  context: "맥락",
};

export function AmbiguityGauge({ result, isEvaluating, onRefresh }: AmbiguityGaugeProps) {
  const targetPercent = result?.clarityPercent ?? 0;
  const [animatedPercent, setAnimatedPercent] = useState(0);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setAnimatedPercent(targetPercent);
    });
    return () => cancelAnimationFrame(raf);
  }, [targetPercent]);

  if (!result) {
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="flex items-center justify-between">
          <span className="text-sm text-neutral-500 dark:text-zinc-400">인터뷰 명확성 점수</span>
          <button
            onClick={onRefresh}
            disabled={isEvaluating}
            className="text-xs text-blue-600 hover:underline disabled:text-neutral-400 dark:text-blue-400 dark:disabled:text-zinc-600"
          >
            {isEvaluating ? "평가 중..." : "점수 확인하기"}
          </button>
        </div>
      </div>
    );
  }

  const { clarityPercent, gateStatus, dimensions } = result;
  const barColor = gateStatus === "pass" ? "bg-green-500"
    : gateStatus === "warn" ? "bg-yellow-500"
    : "bg-red-500";
  const gateLabel = gateStatus === "pass" ? "통과"
    : gateStatus === "warn" ? "보충 권장"
    : "보충 필요";

  const lowestDim = [...dimensions]
    .filter((d) => d.score > 0 || d.dimension !== "context")
    .sort((a, b) => a.score - b.score)[0];

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-3 dark:border-zinc-700 dark:bg-zinc-900">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-neutral-700 dark:text-zinc-200">
          인터뷰 명확성
        </span>
        <button
          onClick={onRefresh}
          disabled={isEvaluating}
          className="text-xs text-blue-600 hover:underline disabled:text-neutral-400 dark:text-blue-400 dark:disabled:text-zinc-600"
        >
          {isEvaluating ? "재평가 중..." : "새로고침"}
        </button>
      </div>

      {/* 프로그레스 바 */}
      <div className="space-y-1">
        <div className="h-3 w-full rounded-full bg-neutral-100 overflow-hidden dark:bg-zinc-800">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${animatedPercent}%` }}
          />
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-neutral-500 dark:text-zinc-500">모호</span>
          <span className="font-semibold dark:text-zinc-200">{clarityPercent}% — {gateLabel}</span>
          <span className="text-neutral-500 dark:text-zinc-500">명확</span>
        </div>
      </div>

      {/* 차원별 카드 */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {dimensions.map((dim) => (
          <DimensionCard key={dim.dimension} dimension={dim} />
        ))}
      </div>

      {/* 안내 메시지 */}
      {lowestDim && lowestDim.score < 0.6 && lowestDim.dimension !== "context" && (
        <div className="rounded bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          <strong>{DIMENSION_LABELS[lowestDim.dimension]}</strong> 차원 보충 권장
          {lowestDim.weakPoints[0] && `: ${lowestDim.weakPoints[0]}`}
        </div>
      )}
    </div>
  );
}
