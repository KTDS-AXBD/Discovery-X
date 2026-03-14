import { useState, useEffect, useCallback, useRef } from "react";
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
  onNotify?: (message: string) => void;
  stepNumber?: number;
}

// ── Elapsed Time ──────────────────────────────────────────────────────

function computeElapsed(start: number): string {
  const diff = Math.max(0, Math.floor((Date.now() - start) / 1000));
  return diff < 60 ? `${diff}초` : `${Math.floor(diff / 60)}분 ${diff % 60}초`;
}

function useElapsed(since: number | string | undefined, active: boolean) {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!active || !since) return;
    const start = typeof since === "number"
      ? (since > 1e12 ? since : since * 1000)
      : new Date(since).getTime();
    const tick = () => setElapsed(computeElapsed(start));
    const raf = requestAnimationFrame(tick);
    const interval = setInterval(tick, 1000);
    return () => { cancelAnimationFrame(raf); clearInterval(interval); };
  }, [since, active]);

  return active && since ? elapsed : "";
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

const STRATEGY_STEPS = [
  { key: "queue", label: "큐 대기" },
  { key: "analyze", label: "6 프레임워크 분석" },
  { key: "synthesize", label: "결과 종합" },
];

function getActiveStep(status: string) {
  if (status === "PENDING") return 0;
  if (status === "PROCESSING") return 1;
  if (status === "COMPLETED") return 3;
  return -1;
}

// ── Component ──────────────────────────────────────────────────────────

export function StrategyCanvasCard({ ideaId, prdCompleted, onStrategyCompleted, onNotify, stepNumber = 2 }: StrategyCanvasCardProps) {
  const { status: strategyStatus, loading, refetch } = useStrategyPolling(ideaId, prdCompleted);
  const [requesting, setRequesting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const prevStatusRef = useRef(strategyStatus.status);

  const elapsed = useElapsed(
    strategyStatus.status === "PENDING" ? strategyStatus.requestedAt :
    strategyStatus.status === "PROCESSING" ? strategyStatus.startedAt : undefined,
    strategyStatus.status === "PENDING" || strategyStatus.status === "PROCESSING",
  );

  // Notify parent when strategy completes
  useEffect(() => {
    if (strategyStatus.status === "COMPLETED" && onStrategyCompleted) {
      onStrategyCompleted();
    }
  }, [strategyStatus.status, onStrategyCompleted]);

  // Completion notification
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = strategyStatus.status;

    if ((prev === "PENDING" || prev === "PROCESSING") && strategyStatus.status === "COMPLETED") {
      setExpanded(true);
      onNotify?.("전략 분석이 완료되었어요. 6개 프레임워크 결과를 확인하세요.");

      if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
        new Notification("전략 분석 완료", { body: "6개 프레임워크 분석 결과를 확인하세요.", icon: "/favicon.ico" });
      }
    }
  }, [strategyStatus.status, onNotify]);

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

  const activeStep = getActiveStep(strategyStatus.status);

  return (
    <div className="rounded-lg border border-border bg-surface overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-surface-secondary/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
            strategyStatus.status === "COMPLETED"
              ? "bg-green-500 text-white"
              : strategyStatus.status === "PENDING" || strategyStatus.status === "PROCESSING"
              ? "bg-accent-fg text-white"
              : prdCompleted
              ? "bg-surface-secondary text-fg-tertiary border border-border"
              : "bg-surface-secondary text-fg-tertiary/40 border border-border/50"
          }`}>
            {strategyStatus.status === "COMPLETED" ? "✓" : stepNumber}
          </span>
          <span className={`text-sm font-semibold ${prdCompleted || strategyStatus.status !== "none" ? "text-fg" : "text-fg-tertiary"}`}>전략 분석</span>
          {strategyStatus.status !== "none" && (
            <StatusBadge status={
              strategyStatus.status === "COMPLETED" ? "REVIEWED" :
              strategyStatus.status === "PROCESSING" ? "IN_REVIEW" :
              strategyStatus.status === "PENDING" ? "DRAFT" : "DRAFT"
            } />
          )}
        </div>
        <div className="flex items-center gap-2">
          {elapsed && (
            <span className="font-mono text-[10px] tabular-nums text-fg-tertiary">{elapsed}</span>
          )}
          <svg
            className={`h-4 w-4 text-fg-tertiary transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </div>
      </button>

      {/* Collapsed summary */}
      {!expanded && strategyStatus.status !== "none" && (
        <div className="border-t border-border px-4 py-2 text-xs text-fg-tertiary">
          {strategyStatus.status === "PENDING" && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
              대기 중 · 큐 {strategyStatus.position ?? "?"}번째 · 예상 1~2분
            </span>
          )}
          {strategyStatus.status === "PROCESSING" && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-fg animate-pulse" />
              6 프레임워크 분석 중 · Claude Sonnet 4.6
            </span>
          )}
          {strategyStatus.status === "COMPLETED" && `${strategyStatus.strategyFrameworks ?? 0}개 프레임워크 완료${strategyStatus.hasGtm ? " + GTM" : ""}`}
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
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
                  <span className="text-sm text-fg-secondary">전략 분석 대기 중</span>
                </div>
                {elapsed && (
                  <span className="font-mono text-xs tabular-nums text-fg-tertiary">{elapsed} 경과</span>
                )}
              </div>

              <div className="flex items-center gap-0.5 text-[10px]">
                {STRATEGY_STEPS.map((step, i) => (
                  <div key={step.key} className="flex items-center gap-0.5">
                    {i > 0 && <span className="text-fg-tertiary mx-1">→</span>}
                    <span className={i === activeStep
                      ? "font-semibold text-yellow-600 bg-yellow-50 rounded px-1.5 py-0.5"
                      : i < activeStep ? "text-fg-tertiary line-through" : "text-fg-tertiary"
                    }>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="h-1.5 w-full rounded-full bg-surface-secondary overflow-hidden">
                <div className="h-full rounded-full bg-yellow-400 animate-pulse" style={{ width: "8%" }} />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-tertiary">
                  예상 1~2분 · 큐 {strategyStatus.position ?? "?"}번째
                </span>
                <button type="button" onClick={handleCancel} className="text-xs text-fg-tertiary hover:text-red-500 transition-colors">
                  취소
                </button>
              </div>
            </div>
          )}

          {/* ── State: PROCESSING ── */}
          {strategyStatus.status === "PROCESSING" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-accent-fg animate-pulse" />
                  <span className="text-sm text-fg-secondary">전략 분석 진행 중</span>
                </div>
                {elapsed && (
                  <span className="font-mono text-xs tabular-nums text-fg-tertiary">{elapsed} 경과</span>
                )}
              </div>

              <div className="flex items-center gap-0.5 text-[10px]">
                {STRATEGY_STEPS.map((step, i) => (
                  <div key={step.key} className="flex items-center gap-0.5">
                    {i > 0 && <span className="text-fg-tertiary mx-1">→</span>}
                    <span className={i === activeStep
                      ? "font-semibold text-accent-fg bg-blue-50 rounded px-1.5 py-0.5"
                      : i < activeStep ? "text-green-600" : "text-fg-tertiary"
                    }>
                      {i < activeStep ? `✓ ${step.label}` : step.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="h-1.5 w-full rounded-full bg-surface-secondary overflow-hidden">
                <div className="h-full rounded-full bg-accent-fg transition-all duration-1000 ease-out" style={{ width: "55%" }} />
              </div>

              <span className="text-xs text-fg-tertiary">
                SWOT · 린캔버스 · JTBD · 경쟁분석 · 시장규모 · 리스크 · 완료 시 자동 알림
              </span>
            </div>
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
