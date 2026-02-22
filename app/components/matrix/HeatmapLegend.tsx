import { STAGE_GATE_LABELS } from "~/features/matrix/types";

const SCORE_LEVELS = [
  { label: "높음 (≥4.0)", color: "var(--dx-score-high)" },
  { label: "보통 (≥2.5)", color: "var(--dx-score-medium)" },
  { label: "낮음 (<2.5)", color: "var(--dx-score-low)" },
  { label: "미평가", color: "var(--dx-score-none)" },
];

const STAGES = ["S0", "S1", "S2", "S3", "S4"];

export function HeatmapLegend() {
  return (
    <div
      className="flex flex-wrap items-center gap-6 text-[10px] text-fg-tertiary font-mono-dx"
    >
      {/* 스코어 범례 */}
      <div className="flex items-center gap-3">
        <span className="font-medium uppercase tracking-wider">Score</span>
        {SCORE_LEVELS.map((s) => (
          <span key={s.label} className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            {s.label}
          </span>
        ))}
      </div>

      {/* Stage-Gate 범례 */}
      <div className="flex items-center gap-3">
        <span className="font-medium uppercase tracking-wider">Stage</span>
        {STAGES.map((s) => (
          <span key={s} className="flex items-center gap-1">
            <span className="font-bold text-lab-accent">{s}</span>
            {STAGE_GATE_LABELS[s] ?? s}
          </span>
        ))}
      </div>

      {/* Delta 범례 */}
      <div className="flex items-center gap-2">
        <span className="font-medium uppercase tracking-wider">Delta</span>
        <span style={{ color: "var(--dx-score-high)" }}>▲ 상승</span>
        <span style={{ color: "var(--dx-score-low)" }}>▼ 하락</span>
      </div>
    </div>
  );
}
