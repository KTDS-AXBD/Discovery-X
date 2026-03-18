import type { AmbiguityResult, DimensionScore } from "../types";

interface GateBlockerProps {
  result: AmbiguityResult;
  onClose: () => void;
  onGoToSection: (sectionType: string) => void;
  onForceGenerate?: () => void;
}

const DIMENSION_LABELS: Record<string, string> = {
  goal: "목표",
  constraint: "제약",
  success: "성공기준",
  context: "맥락",
};

const PRIMARY_SECTION: Record<string, string> = {
  goal: "objectives",
  constraint: "requirements",
  success: "target_users",
  context: "background",
};

export function GateBlocker({
  result,
  onClose,
  onGoToSection,
  onForceGenerate,
}: GateBlockerProps) {
  const isBlock = result.gateStatus === "block";
  const weakDimensions = result.dimensions
    .filter((d) => d.score < 0.6 && !(d.dimension === "context" && d.rationale.includes("미적용")))
    .sort((a, b) => a.score - b.score);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="mx-4 max-w-lg rounded-lg bg-white p-6 shadow-xl dark:bg-zinc-900 dark:border dark:border-zinc-700">
        <h3 className="text-lg font-semibold text-neutral-800 dark:text-zinc-100">
          {isBlock
            ? "답변을 보충하면 더 좋은 PRD를 만들 수 있어요"
            : "일부 차원이 부족해요"}
        </h3>

        <p className="mt-2 text-sm text-neutral-600 dark:text-zinc-400">
          명확성 {result.clarityPercent}% &mdash;{" "}
          {isBlock
            ? "60% 이상이면 PRD 생성이 가능해요."
            : "생성은 가능하지만 보충을 권장해요."}
        </p>

        {/* 부족 차원별 보충 질문 카드 */}
        <div className="mt-4 space-y-3">
          {weakDimensions.map((dim) => (
            <SuggestionCard
              key={dim.dimension}
              dimension={dim}
              onGoToSection={onGoToSection}
            />
          ))}
        </div>

        {/* 액션 버튼 */}
        <div className="mt-6 flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="rounded px-4 py-2 text-sm font-medium
                       text-blue-600 hover:bg-blue-50
                       dark:text-blue-400 dark:hover:bg-zinc-800"
          >
            보충하기
          </button>
          {!isBlock && onForceGenerate && (
            <button
              onClick={onForceGenerate}
              className="rounded px-4 py-2 text-sm font-medium
                         text-neutral-500 hover:bg-neutral-100
                         dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              그래도 생성하기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** 차원별 보충 질문 카드 */
function SuggestionCard({
  dimension,
  onGoToSection,
}: {
  dimension: DimensionScore;
  onGoToSection: (sectionType: string) => void;
}) {
  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/30">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-300">
        {DIMENSION_LABELS[dimension.dimension]} 차원 ({dimension.score.toFixed(1)})
      </div>
      {dimension.suggestedQuestions.length > 0 ? (
        <div className="mt-2">
          <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-400">
            {dimension.suggestedQuestions.slice(0, 2).map((q, i) => (
              <li key={i}>Q{i + 1}: {q}</li>
            ))}
          </ul>
          {dimension.suggestedQuestions.length > 2 && (
            <p className="mt-1 text-[10px] text-amber-500">
              +{dimension.suggestedQuestions.length - 2}개 추가 질문
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          이 차원의 답변을 더 구체적으로 작성해주세요.
        </p>
      )}
      <button
        onClick={() => onGoToSection(PRIMARY_SECTION[dimension.dimension])}
        className="mt-2 text-xs text-blue-600 hover:underline dark:text-blue-400"
      >
        이 질문에 답변하기 →
      </button>
    </div>
  );
}
