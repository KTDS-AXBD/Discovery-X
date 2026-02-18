import { useState, useMemo } from "react";
import { useFetcher } from "@remix-run/react";
import type { IndividualScoreInput } from "~/features/matrix/types";

interface ScoreInputFormProps {
  cellId: string;
  period: string;
  existingScore?: Partial<IndividualScoreInput>;
}

// ─── 항목 정의 ───
interface ScoreField {
  key: keyof IndividualScoreInput;
  label: string;
  group: "clevel" | "execution";
  inverse?: boolean; // 높을수록 나쁨 (역수 처리)
}

const SCORE_FIELDS: ScoreField[] = [
  // C-Level 관점
  { key: "strategicFit", label: "전략 적합성", group: "clevel" },
  { key: "profitability", label: "수익성", group: "clevel" },
  { key: "marketScalability", label: "시장 확장성", group: "clevel" },
  { key: "brandImpact", label: "브랜드 영향력", group: "clevel" },
  { key: "roiExpectation", label: "투자 대비 기대수익", group: "clevel" },
  // Execution 관점
  { key: "feasibility", label: "실행 가능성", group: "execution" },
  { key: "techDifficulty", label: "기술 난이도", group: "execution", inverse: true },
  { key: "referenceExists", label: "레퍼런스 보유", group: "execution" },
  { key: "resourceAvailable", label: "인력 가용성", group: "execution" },
  { key: "riskLevel", label: "리스크 수준", group: "execution", inverse: true },
];

const DEFAULT_SCORE = 3.0;

export function ScoreInputForm({ cellId, period, existingScore }: ScoreInputFormProps) {
  const fetcher = useFetcher();
  const isSubmitting = fetcher.state !== "idle";

  const [scores, setScores] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    for (const field of SCORE_FIELDS) {
      const existing = existingScore?.[field.key];
      init[field.key] = typeof existing === "number" ? existing : DEFAULT_SCORE;
    }
    return init;
  });
  const [note, setNote] = useState(existingScore?.note ?? "");

  // 실시간 평균 계산
  const averages = useMemo(() => {
    const clevelFields = SCORE_FIELDS.filter((f) => f.group === "clevel");
    const execFields = SCORE_FIELDS.filter((f) => f.group === "execution");

    const clevelAvg =
      clevelFields.reduce((sum, f) => sum + (scores[f.key] ?? DEFAULT_SCORE), 0) /
      clevelFields.length;

    // Execution: inverse 필드는 (6 - score)로 변환
    const execAvg =
      execFields.reduce((sum, f) => {
        const val = scores[f.key] ?? DEFAULT_SCORE;
        return sum + (f.inverse ? 6 - val : val);
      }, 0) / execFields.length;

    return { clevelAvg, execAvg };
  }, [scores]);

  function handleScoreChange(key: string, value: number) {
    setScores((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit() {
    const formData = new FormData();
    formData.set("intent", "submitScore");
    formData.set("cellId", cellId);
    formData.set("period", period);
    for (const field of SCORE_FIELDS) {
      formData.set(field.key, String(scores[field.key] ?? DEFAULT_SCORE));
    }
    if (note.trim()) {
      formData.set("note", note.trim());
    }
    fetcher.submit(formData, { method: "post" });
  }

  return (
    <div className="space-y-5" style={{ fontFamily: "var(--dx-font-mono)" }}>
      {/* C-Level 그룹 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--dx-lab-accent,#6366f1)]">
            C-Level 관점
          </h4>
          <span className="text-xs text-[var(--axis-text-tertiary,#64748b)]">
            평균: <strong className="text-[var(--axis-text-primary)]">{averages.clevelAvg.toFixed(2)}</strong>
          </span>
        </div>
        <div className="space-y-2">
          {SCORE_FIELDS.filter((f) => f.group === "clevel").map((field) => (
            <ScoreSlider
              key={field.key}
              label={field.label}
              value={scores[field.key] ?? DEFAULT_SCORE}
              onChange={(v) => handleScoreChange(field.key, v)}
            />
          ))}
        </div>
      </div>

      {/* Execution 그룹 */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--dx-lab-accent,#6366f1)]">
            실무자(Execution) 관점
          </h4>
          <span className="text-xs text-[var(--axis-text-tertiary,#64748b)]">
            평균: <strong className="text-[var(--axis-text-primary)]">{averages.execAvg.toFixed(2)}</strong>
          </span>
        </div>
        <div className="space-y-2">
          {SCORE_FIELDS.filter((f) => f.group === "execution").map((field) => (
            <ScoreSlider
              key={field.key}
              label={field.label}
              value={scores[field.key] ?? DEFAULT_SCORE}
              onChange={(v) => handleScoreChange(field.key, v)}
              inverse={field.inverse}
            />
          ))}
        </div>
      </div>

      {/* 메모 */}
      <div>
        <label className="mb-1 block text-xs text-[var(--axis-text-tertiary,#64748b)]">
          메모 (선택)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full rounded border border-[var(--dx-border-subtle,#334155)] bg-[var(--axis-bg-tertiary,#0f172a)] px-3 py-2 text-xs text-[var(--axis-text-primary)]"
          placeholder="스코어에 대한 근거나 메모..."
        />
      </div>

      {/* 제출 */}
      <button
        type="button"
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-full rounded bg-[var(--dx-lab-accent,#6366f1)] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--dx-lab-accent-hover,#4f46e5)] disabled:opacity-50"
      >
        {isSubmitting ? "저장 중..." : existingScore ? "스코어 수정" : "스코어 제출"}
      </button>
    </div>
  );
}

// ─── 스코어 슬라이더 ───
function ScoreSlider({
  label,
  value,
  onChange,
  inverse,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  inverse?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 text-xs text-[var(--axis-text-secondary,#94a3b8)]">
        {label}
        {inverse && <span className="ml-1 text-[var(--dx-score-low,#ef4444)]">↓</span>}
      </span>
      <input
        type="range"
        min={1}
        max={5}
        step={0.5}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 accent-[var(--dx-lab-accent,#6366f1)]"
      />
      <span className="w-8 text-right text-xs font-semibold text-[var(--axis-text-primary)]">
        {value.toFixed(1)}
      </span>
    </div>
  );
}
