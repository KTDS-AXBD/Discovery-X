import { useState, useEffect, useCallback } from "react";
import { StatusBadge } from "./StatusBadge";

// ── Types ──────────────────────────────────────────────────────────────

interface StrategyStatus {
  status: "none" | "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  queueId?: string;
  position?: number;
  requestedAt?: number | string;
  startedAt?: number | string;
  hasStrategy?: boolean;
  hasGtm?: boolean;
  strategyFrameworks?: number;
  completedAt?: number | string;
  error?: string;
}

interface StrategyCanvasCardProps {
  ideaId: string;
  prdCompleted: boolean;
  onStrategyCompleted?: () => void;
}

// ── Polling Hook ───────────────────────────────────────────────────────

function useStrategyPolling(ideaId: string, enabled: boolean) {
  const [status, setStatus] = useState<StrategyStatus>({ status: "none" });
  const [loading, setLoading] = useState(enabled);

  const fetchStatus = useCallback(() => {
    fetch(`/api/prd-studio/strategy/${ideaId}/status`)
      .then((r) => r.json() as Promise<StrategyStatus>)
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ideaId]);

  useEffect(() => {
    if (!enabled) return;
    fetchStatus();
    const shouldPoll = status.status === "PENDING" || status.status === "PROCESSING";
    if (!shouldPoll) return;

    const interval = setInterval(fetchStatus, 10_000);
    return () => clearInterval(interval);
  }, [fetchStatus, status.status, enabled]);

  return { status, loading, refetch: fetchStatus };
}

// ── Framework Labels ──────────────────────────────────────────────────

const FRAMEWORK_CONFIG = [
  { key: "swot", label: "SWOT", description: "강점·약점·기회·위협" },
  { key: "leanCanvas", label: "린 캔버스", description: "9블록 비즈니스 모델" },
  { key: "jtbd", label: "JTBD", description: "고객 가치 제안 6파트" },
  { key: "competition", label: "경쟁 분석", description: "경쟁사 비교" },
  { key: "marketSizing", label: "시장 규모", description: "TAM/SAM/SOM" },
  { key: "riskAssessment", label: "리스크", description: "영향×확률 매트릭스" },
];

// ── Component ──────────────────────────────────────────────────────────

export function StrategyCanvasCard({ ideaId, prdCompleted, onStrategyCompleted }: StrategyCanvasCardProps) {
  const { status: strategyStatus, loading, refetch } = useStrategyPolling(ideaId, prdCompleted);
  const [requesting, setRequesting] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Notify parent when strategy completes
  useEffect(() => {
    if (strategyStatus.status === "COMPLETED" && onStrategyCompleted) {
      onStrategyCompleted();
    }
  }, [strategyStatus.status, onStrategyCompleted]);

  const handleRequest = useCallback(async (mode: "batch" | "realtime") => {
    setRequesting(true);
    try {
      const res = await fetch("/api/prd-studio/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId, mode }),
      });
      if (res.ok) refetch();
    } finally {
      setRequesting(false);
    }
  }, [ideaId, refetch]);

  const handleCancel = useCallback(async () => {
    await fetch(`/api/prd-studio/strategy/${ideaId}/cancel`, { method: "DELETE" });
    refetch();
  }, [ideaId, refetch]);

  const handleRetry = useCallback(async () => {
    setRequesting(true);
    try {
      const res = await fetch("/api/prd-studio/strategy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId, mode: "batch" }),
      });
      if (res.ok) refetch();
    } finally {
      setRequesting(false);
    }
  }, [ideaId, refetch]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="h-6 w-32 animate-pulse rounded bg-surface-secondary" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-fg">전략 분석</span>
          {strategyStatus.status !== "none" && (
            <StatusBadge status={
              strategyStatus.status === "COMPLETED" ? "REVIEWED" :
              strategyStatus.status === "PROCESSING" ? "IN_REVIEW" :
              strategyStatus.status === "PENDING" ? "DRAFT" : "DRAFT"
            } />
          )}
        </div>
        <svg
          className={`h-4 w-4 text-fg-tertiary transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Collapsed summary */}
      {!expanded && strategyStatus.status !== "none" && (
        <div className="border-t border-border px-4 py-2 text-xs text-fg-tertiary">
          {strategyStatus.status === "PENDING" && `대기 중 (큐 ${strategyStatus.position ?? "?"}번째)`}
          {strategyStatus.status === "PROCESSING" && "전략 분석 진행 중..."}
          {strategyStatus.status === "COMPLETED" && `${strategyStatus.strategyFrameworks ?? 0}개 프레임워크 완료`}
          {strategyStatus.status === "FAILED" && `실패: ${strategyStatus.error ?? "알 수 없는 오류"}`}
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          {/* ── State: none (PRD 미완료) ── */}
          {!prdCompleted && strategyStatus.status === "none" && (
            <p className="text-sm text-fg-tertiary">PRD 분석을 먼저 완료해주세요.</p>
          )}

          {/* ── State: none (PRD 완료 — 활성화) ── */}
          {prdCompleted && strategyStatus.status === "none" && (
            <>
              <p className="text-sm text-fg-secondary">
                PRD 기반 6개 전략 프레임워크를 자동 분석해요.
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {FRAMEWORK_CONFIG.map((f) => (
                  <span key={f.key} className="rounded bg-surface-secondary px-2 py-1 text-xs text-fg-tertiary text-center">
                    {f.label}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-tertiary">
                  Claude Sonnet 4.6 기반
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={requesting}
                    onClick={() => handleRequest("batch")}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-btn-bg px-3 py-1.5 text-xs font-medium text-btn-text transition-colors hover:bg-btn-bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {requesting ? "요청 중..." : "배치 분석"}
                  </button>
                  <button
                    type="button"
                    disabled={requesting}
                    onClick={() => handleRequest("realtime")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    즉시 분석
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ── State: PENDING ── */}
          {strategyStatus.status === "PENDING" && (
            <>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-sm text-fg-secondary">
                  전략 분석 대기 중 (큐 {strategyStatus.position ?? "?"}번째)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-secondary overflow-hidden">
                <div className="h-full w-1/6 rounded-full bg-yellow-400 animate-pulse" />
              </div>
              <button type="button" onClick={handleCancel} className="text-xs text-fg-tertiary hover:text-red-500 transition-colors">
                취소
              </button>
            </>
          )}

          {/* ── State: PROCESSING ── */}
          {strategyStatus.status === "PROCESSING" && (
            <>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-accent-fg animate-pulse" />
                <span className="text-sm text-fg-secondary">전략 분석 진행 중...</span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-secondary overflow-hidden">
                <div className="h-full w-3/5 rounded-full bg-accent-fg animate-[pulse_2s_ease-in-out_infinite]" />
              </div>
              <p className="text-xs text-fg-tertiary">
                SWOT · 린캔버스 · JTBD · 경쟁분석 · 시장규모 · 리스크를 분석해요.
              </p>
            </>
          )}

          {/* ── State: COMPLETED ── */}
          {strategyStatus.status === "COMPLETED" && (
            <>
              <div className="grid grid-cols-3 gap-2">
                {FRAMEWORK_CONFIG.map((f) => (
                  <div key={f.key} className="rounded-lg border border-border p-2 text-center">
                    <span className="text-xs font-medium text-fg">{f.label}</span>
                    <p className="text-[10px] text-fg-tertiary mt-0.5">{f.description}</p>
                  </div>
                ))}
              </div>

              {strategyStatus.hasGtm && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2">
                  <span className="text-xs font-medium text-green-700">GTM 전략 포함</span>
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={requesting}
                  className="text-xs text-fg-tertiary hover:text-fg-secondary transition-colors disabled:opacity-50"
                >
                  {requesting ? "요청 중..." : "재분석"}
                </button>
              </div>
            </>
          )}

          {/* ── State: FAILED ── */}
          {strategyStatus.status === "FAILED" && (
            <>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-sm text-red-600">전략 분석에 실패했어요</span>
              </div>
              <p className="text-xs text-fg-tertiary">오류: {strategyStatus.error ?? "알 수 없는 오류"}</p>
              <button
                type="button"
                onClick={handleRetry}
                disabled={requesting}
                className="inline-flex items-center gap-1 rounded-lg bg-btn-bg px-3 py-1.5 text-xs font-medium text-btn-text transition-colors hover:bg-btn-bg-hover disabled:opacity-50"
              >
                {requesting ? "요청 중..." : "재시도"}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
