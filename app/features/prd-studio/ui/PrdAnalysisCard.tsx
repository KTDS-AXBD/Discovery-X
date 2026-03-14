import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "@remix-run/react";
import { StatusBadge } from "./StatusBadge";

// ── Types ──────────────────────────────────────────────────────────────

interface ReviewData {
  verdict: string;
  totalScore: number;
  feedbackCount: number;
}

interface AnalysisStatus {
  status: "none" | "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  queueId?: string;
  position?: number;
  requestedAt?: number | string;
  startedAt?: number | string;
  prdId?: string;
  prdTitle?: string;
  reviewData?: ReviewData | null;
  completedAt?: number | string;
  error?: string;
}

interface StreamStep {
  step: string;
  message: string;
  detail?: string;
  progress?: number;
}

interface PrdAnalysisCardProps {
  ideaId: string;
  selectedSourceCount: number;
  onOpenProposalModal?: () => void;
  onPrdCompleted?: (completed: boolean) => void;
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

function useAnalysisPolling(ideaId: string) {
  const [status, setStatus] = useState<AnalysisStatus>({ status: "none" });
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(() => {
    fetch(`/api/prd-studio/analyze-idea/${ideaId}/status`)
      .then((r) => r.json() as Promise<AnalysisStatus>)
      .then(setStatus)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [ideaId]);

  useEffect(() => {
    fetchStatus();
    const shouldPoll = status.status === "PENDING" || status.status === "PROCESSING";
    if (!shouldPoll) return;

    const interval = setInterval(fetchStatus, 10_000);
    return () => clearInterval(interval);
  }, [fetchStatus, status.status]);

  return { status, loading, refetch: fetchStatus };
}

// ── Verdict Config ─────────────────────────────────────────────────────

const VERDICT_STYLES: Record<string, { label: string; className: string }> = {
  READY: { label: "착수 가능", className: "text-green-600 bg-green-50 border-green-200" },
  CONDITIONAL: { label: "조건부 착수", className: "text-yellow-600 bg-yellow-50 border-yellow-200" },
  NOT_READY: { label: "재작성 필요", className: "text-red-600 bg-red-50 border-red-200" },
};

// ── Step Config ─────────────────────────────────────────────────────────

const ANALYSIS_STEPS = [
  { key: "prepare", label: "소스 분석" },
  { key: "generate", label: "PRD 8섹션 생성" },
  { key: "review", label: "AI 품질 검토" },
  { key: "save", label: "저장" },
];

function getActiveStep(status: string) {
  if (status === "PENDING") return 0;
  if (status === "PROCESSING") return 1;
  if (status === "COMPLETED") return 3;
  return -1;
}

// ── Component ──────────────────────────────────────────────────────────

export function PrdAnalysisCard({ ideaId, selectedSourceCount, onOpenProposalModal, onPrdCompleted, onNotify, stepNumber = 1 }: PrdAnalysisCardProps) {
  const { status: analysisStatus, loading, refetch } = useAnalysisPolling(ideaId);
  const [requesting, setRequesting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const prevStatusRef = useRef(analysisStatus.status);
  const [streaming, setStreaming] = useState(false);
  const [streamStep, setStreamStep] = useState<StreamStep | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const elapsed = useElapsed(
    analysisStatus.status === "PENDING" ? analysisStatus.requestedAt :
    analysisStatus.status === "PROCESSING" ? analysisStatus.startedAt : undefined,
    analysisStatus.status === "PENDING" || analysisStatus.status === "PROCESSING",
  );

  // Notify parent when PRD analysis completes
  useEffect(() => {
    onPrdCompleted?.(analysisStatus.status === "COMPLETED");
  }, [analysisStatus.status, onPrdCompleted]);

  // Completion notification
  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = analysisStatus.status;

    if ((prev === "PENDING" || prev === "PROCESSING") && analysisStatus.status === "COMPLETED") {
      setExpanded(true);
      onNotify?.("PRD 분석이 완료되었어요. 결과를 확인하세요.");

      if (typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          new Notification("PRD 분석 완료", { body: "결과를 확인하세요.", icon: "/favicon.ico" });
        } else if (Notification.permission !== "denied") {
          Notification.requestPermission();
        }
      }
    }
  }, [analysisStatus.status, onNotify]);

  // SSE cleanup on unmount
  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const handleRequestAnalysis = useCallback(async () => {
    setRequesting(true);
    setStreaming(true);
    setStreamStep({ step: "prepare", message: "분석 준비 중...", progress: 0 });
    setStreamError(null);
    setExpanded(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/prd-studio/analyze-idea/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId }),
        signal: abort.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "요청 실패" })) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop()!;

        for (const chunk of chunks) {
          if (!chunk.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(chunk.slice(6)) as { type: string; [k: string]: unknown };

            if (event.type === "step") {
              setStreamStep({
                step: event.step as string,
                message: event.message as string,
                detail: event.detail as string | undefined,
                progress: event.progress as number | undefined,
              });
            } else if (event.type === "complete") {
              setStreaming(false);
              setStreamStep(null);
              refetch();
              onPrdCompleted?.(true);
              onNotify?.("PRD 분석이 완료되었어요. 결과를 확인하세요.");

              if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
                new Notification("PRD 분석 완료", {
                  body: `${event.title} — ${event.totalScore ? `${event.totalScore}점` : "검토 완료"}`,
                  icon: "/favicon.ico",
                });
              }
            } else if (event.type === "error") {
              throw new Error(event.message as string);
            }
          } catch (parseErr) {
            if (parseErr instanceof SyntaxError) continue;
            throw parseErr;
          }
        }
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        setStreamError(error instanceof Error ? error.message : "분석 중 오류 발생");
        setStreaming(false);
        setStreamStep(null);
      }
    } finally {
      setRequesting(false);
      abortRef.current = null;
    }
  }, [ideaId, refetch, onPrdCompleted, onNotify]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
    setStreamStep(null);
    setRequesting(false);
  }, []);

  const handleRetry = handleRequestAnalysis;

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="h-6 w-32 animate-pulse rounded bg-surface-secondary" />
      </div>
    );
  }

  const activeStep = getActiveStep(analysisStatus.status);

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
            analysisStatus.status === "COMPLETED"
              ? "bg-green-500 text-white"
              : streaming || analysisStatus.status === "PENDING" || analysisStatus.status === "PROCESSING"
              ? "bg-accent-fg text-white"
              : "bg-surface-secondary text-fg-tertiary border border-border"
          }`}>
            {analysisStatus.status === "COMPLETED" ? "✓" : stepNumber}
          </span>
          <span className="text-sm font-semibold text-fg">PRD 분석</span>
          {analysisStatus.status !== "none" && (
            <StatusBadge status={
              analysisStatus.status === "COMPLETED" ? "REVIEWED" :
              analysisStatus.status === "PROCESSING" ? "IN_REVIEW" :
              analysisStatus.status === "PENDING" ? "DRAFT" : "DRAFT"
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

      {/* Collapsed summary line */}
      {!expanded && streaming && streamStep && (
        <div className="border-t border-border px-4 py-2 text-xs text-fg-tertiary">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent-fg animate-pulse" />
            {streamStep.message} {streamStep.detail ? `· ${streamStep.detail}` : ""}
          </span>
        </div>
      )}
      {!expanded && !streaming && analysisStatus.status !== "none" && (
        <div className="border-t border-border px-4 py-2 text-xs text-fg-tertiary">
          {analysisStatus.status === "PENDING" && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" />
              대기 중 · 큐 {analysisStatus.position ?? "?"}번째 · 예상 2~3분
            </span>
          )}
          {analysisStatus.status === "PROCESSING" && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent-fg animate-pulse" />
              PRD 생성 중 · Claude Sonnet 4.6
            </span>
          )}
          {analysisStatus.status === "COMPLETED" && (
            <span className="flex items-center justify-between">
              <Link to={`/prd-studio/${analysisStatus.prdId}`} className="text-accent-fg hover:underline">
                {analysisStatus.prdTitle ?? "PRD 보기"} →
              </Link>
              {analysisStatus.reviewData && (
                <span className={`text-[10px] font-medium ${
                  analysisStatus.reviewData.totalScore >= 80 ? "text-green-600" :
                  analysisStatus.reviewData.totalScore >= 60 ? "text-yellow-600" : "text-red-600"
                }`}>
                  {analysisStatus.reviewData.totalScore}점
                </span>
              )}
            </span>
          )}
          {analysisStatus.status === "FAILED" && `실패: ${analysisStatus.error ?? "알 수 없는 오류"}`}
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          {/* ── State: none ── */}
          {analysisStatus.status === "none" && (
            <>
              <p className="text-sm text-fg-secondary">
                소스를 기반으로 체계적인 PRD를 자동 생성하고 AI가 8개 기준으로 검토해요.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {["프로젝트 요약", "배경 & 문제", "목표", "대상 사용자", "요구사항", "해결 방안", "리스크", "일정"].map((s) => (
                  <span key={s} className="rounded-full bg-surface-secondary px-2 py-0.5 text-xs text-fg-tertiary">{s}</span>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-tertiary">
                  GPT-4.1 / Gemini 기반 · 소스 {selectedSourceCount}개 · 약 30초
                </span>
                <button
                  type="button"
                  disabled={selectedSourceCount === 0 || requesting}
                  onClick={handleRequestAnalysis}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-btn-bg px-3 py-1.5 text-xs font-medium text-btn-text transition-colors hover:bg-btn-bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {requesting ? "요청 중..." : "PRD 분석 시작"}
                </button>
              </div>
              {selectedSourceCount === 0 && (
                <p className="text-xs text-yellow-600">소스를 먼저 추가해주세요.</p>
              )}
            </>
          )}

          {/* ── State: Streaming (SSE 실시간 분석) ── */}
          {streaming && streamStep && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-accent-fg animate-pulse" />
                  <span className="text-sm text-fg-secondary">{streamStep.message}</span>
                </div>
              </div>

              {/* Step indicators */}
              <div className="flex items-center gap-0.5 text-[10px]">
                {ANALYSIS_STEPS.map((step, i) => {
                  const stepIndex = ANALYSIS_STEPS.findIndex(s => s.key === streamStep.step);
                  const isCurrent = step.key === streamStep.step;
                  const isDone = i < stepIndex;
                  return (
                    <div key={step.key} className="flex items-center gap-0.5">
                      {i > 0 && <span className="text-fg-tertiary mx-1">→</span>}
                      <span className={
                        isCurrent ? "font-semibold text-accent-fg bg-blue-50 rounded px-1.5 py-0.5"
                        : isDone ? "text-green-600"
                        : "text-fg-tertiary"
                      }>
                        {isDone ? `✓ ${step.label}` : step.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="h-1.5 w-full rounded-full bg-surface-secondary overflow-hidden">
                <div
                  className="h-full rounded-full bg-accent-fg transition-all duration-700 ease-out"
                  style={{ width: `${streamStep.progress ?? 10}%` }}
                />
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-tertiary">
                  {streamStep.detail ?? "처리 중..."} · 완료 시 자동 알림
                </span>
                <button type="button" onClick={handleCancel} className="text-xs text-fg-tertiary hover:text-red-500 transition-colors">
                  취소
                </button>
              </div>
            </div>
          )}

          {/* ── State: Stream Error ── */}
          {!streaming && streamError && (
            <>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-sm text-red-600">분석에 실패했어요</span>
              </div>
              <p className="text-xs text-fg-tertiary">오류: {streamError}</p>
              <button
                type="button"
                onClick={() => { setStreamError(null); handleRetry(); }}
                disabled={requesting}
                className="inline-flex items-center gap-1 rounded-lg bg-btn-bg px-3 py-1.5 text-xs font-medium text-btn-text transition-colors hover:bg-btn-bg-hover disabled:opacity-50"
              >
                {requesting ? "요청 중..." : "재시도"}
              </button>
            </>
          )}

          {/* ── State: PENDING (legacy — 이전 큐 방식 호환) ── */}
          {!streaming && !streamError && analysisStatus.status === "PENDING" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-sm text-fg-secondary">대기 중 (이전 요청)</span>
              </div>
              <p className="text-xs text-fg-tertiary">이전 배치 요청이 대기 중이에요. 재분석을 시작하세요.</p>
              <button
                type="button"
                onClick={handleRetry}
                disabled={requesting}
                className="inline-flex items-center gap-1.5 rounded-lg bg-btn-bg px-3 py-1.5 text-xs font-medium text-btn-text transition-colors hover:bg-btn-bg-hover disabled:opacity-50"
              >
                {requesting ? "요청 중..." : "실시간 분석 시작"}
              </button>
            </div>
          )}

          {/* ── State: COMPLETED ── */}
          {analysisStatus.status === "COMPLETED" && analysisStatus.prdId && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-fg">
                  {analysisStatus.prdTitle ?? "PRD 분석 완료"}
                </span>
                <StatusBadge status="REVIEWED" />
              </div>

              {/* Verdict badge + score */}
              {analysisStatus.reviewData && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {(() => {
                      const v = VERDICT_STYLES[analysisStatus.reviewData.verdict];
                      return v ? (
                        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium ${v.className}`}>
                          {v.label}
                          <span className="opacity-70">({analysisStatus.reviewData.totalScore}/100)</span>
                        </span>
                      ) : null;
                    })()}
                    <span className="text-xs text-fg-tertiary">
                      Claude Sonnet 4.6 · 피드백 {analysisStatus.reviewData.feedbackCount}건
                    </span>
                  </div>

                  {/* Score bar */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-surface-secondary overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          analysisStatus.reviewData.totalScore >= 80 ? "bg-green-500" :
                          analysisStatus.reviewData.totalScore >= 60 ? "bg-yellow-500" : "bg-red-500"
                        }`}
                        style={{ width: `${analysisStatus.reviewData.totalScore}%` }}
                      />
                    </div>
                    <span className="text-xs font-medium text-fg-secondary w-12 text-right">
                      {analysisStatus.reviewData.totalScore}점
                    </span>
                  </div>
                </div>
              )}

              {!analysisStatus.reviewData && (
                <p className="text-xs text-fg-tertiary">PRD 상세 페이지에서 스코어카드와 피드백을 확인하세요.</p>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <Link
                  to={`/prd-studio/${analysisStatus.prdId}`}
                  className="inline-flex items-center gap-1 rounded-lg bg-btn-bg px-3 py-1.5 text-xs font-medium text-btn-text transition-colors hover:bg-btn-bg-hover"
                >
                  PRD 상세 보기
                </Link>
                {onOpenProposalModal && (
                  <button
                    type="button"
                    onClick={onOpenProposalModal}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-secondary"
                  >
                    사업제안 생성
                  </button>
                )}
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
          {analysisStatus.status === "FAILED" && (
            <>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-sm text-red-600">분석에 실패했어요</span>
              </div>
              <p className="text-xs text-fg-tertiary">오류: {analysisStatus.error ?? "알 수 없는 오류"}</p>
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
