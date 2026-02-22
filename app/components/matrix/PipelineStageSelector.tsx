import { useState } from "react";
import { useFetcher } from "@remix-run/react";
import { STAGE_GATE_MAP, STAGE_GATE_LABELS } from "~/features/matrix/types";

interface PipelineStageSelectorProps {
  cellId: string;
  currentStage: string;
  onStageChange?: () => void;
}

// Stage-Gate 순서 (전진만 허용)
const PIPELINE_ORDER = ["activity", "signal", "scorecard", "brief", "validation", "pilot_ready"] as const;

function getStageIndex(stage: string): number {
  return PIPELINE_ORDER.indexOf(stage as (typeof PIPELINE_ORDER)[number]);
}

function getNextStage(current: string): string | null {
  const idx = getStageIndex(current);
  if (idx < 0 || idx >= PIPELINE_ORDER.length - 1) return null;
  return PIPELINE_ORDER[idx + 1];
}

export function PipelineStageSelector({
  cellId,
  currentStage,
  onStageChange,
}: PipelineStageSelectorProps) {
  const fetcher = useFetcher();
  const [showConfirm, setShowConfirm] = useState(false);
  const isSubmitting = fetcher.state !== "idle";

  const currentIdx = getStageIndex(currentStage);
  const nextStage = getNextStage(currentStage);
  const currentGate = (STAGE_GATE_MAP as Record<string, string>)[currentStage] ?? "S0";
  const nextGate = nextStage ? (STAGE_GATE_MAP as Record<string, string>)[nextStage] ?? "" : null;

  function handleAdvance() {
    if (!nextStage) return;
    const formData = new FormData();
    formData.set("intent", "updatePipelineStage");
    formData.set("cellId", cellId);
    formData.set("pipelineStage", nextStage);
    fetcher.submit(formData, { method: "post" });
    setShowConfirm(false);
    onStageChange?.();
  }

  return (
    <div style={{ fontFamily: "var(--dx-font-mono)" }}>
      {/* 파이프라인 Progress */}
      <div className="flex items-center gap-1">
        {PIPELINE_ORDER.map((stage, i) => {
          const gate = (STAGE_GATE_MAP as Record<string, string>)[stage] ?? "S?";
          const isActive = i <= currentIdx;
          const isCurrent = stage === currentStage;

          return (
            <div key={stage} className="flex items-center">
              {/* Stage 노드 */}
              <div
                className={`flex h-8 items-center justify-center rounded px-2 text-[10px] font-medium transition-colors ${
                  isCurrent
                    ? "bg-lab-accent text-white ring-2 ring-lab-accent ring-offset-1 ring-offset-2"
                    : isActive
                      ? "bg-lab-accent/20 text-lab-accent"
                      : "bg-surface-tertiary text-fg-tertiary"
                }`}
                title={STAGE_GATE_LABELS[gate] ?? stage}
              >
                {gate}
              </div>
              {/* 연결선 */}
              {i < PIPELINE_ORDER.length - 1 && (
                <div
                  className={`h-0.5 w-3 ${
                    i < currentIdx
                      ? "bg-lab-accent"
                      : "bg-line-subtle"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 현재 단계 레이블 */}
      <p className="mt-2 text-[10px] text-fg-tertiary">
        현재: <strong className="text-fg">{currentGate} · {STAGE_GATE_LABELS[currentGate] ?? currentStage}</strong>
      </p>

      {/* 전진 버튼 */}
      {nextStage && !showConfirm && (
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={isSubmitting}
          className="mt-3 rounded border border-lab-accent px-3 py-1.5 text-[10px] font-medium text-lab-accent transition-colors hover:bg-lab-accent hover:text-white disabled:opacity-50"
        >
          {nextGate}로 전진 →
        </button>
      )}

      {/* 확인 다이얼로그 (인라인) */}
      {showConfirm && nextStage && (
        <div className="mt-3 rounded border border-line-subtle bg-surface-tertiary p-3">
          <p className="text-xs text-fg-secondary">
            <strong className="text-fg">{currentGate}</strong>에서{" "}
            <strong className="text-lab-accent">{nextGate}</strong>로 이동하시겠습니까?
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={handleAdvance}
              disabled={isSubmitting}
              className="rounded bg-lab-accent px-3 py-1 text-[10px] font-medium text-white disabled:opacity-50"
            >
              {isSubmitting ? "처리 중..." : "확인"}
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="rounded border border-line-subtle px-3 py-1 text-[10px] text-fg-tertiary"
            >
              취소
            </button>
          </div>
        </div>
      )}

      {/* 마지막 단계 안내 */}
      {!nextStage && (
        <p className="mt-3 text-[10px] text-fg-success">
          파일럿 준비 단계 (최종)
        </p>
      )}
    </div>
  );
}
