import { useState, useEffect, useCallback } from "react";
import { Link } from "@remix-run/react";
import { StatusBadge } from "./StatusBadge";

// ── Types ──────────────────────────────────────────────────────────────

interface AnalysisStatus {
  status: "none" | "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  queueId?: string;
  position?: number;
  requestedAt?: number | string;
  startedAt?: number | string;
  prdId?: string;
  completedAt?: number | string;
  error?: string;
}

interface CompletedResult {
  prdTitle?: string;
  verdict?: string;
}

interface PrdAnalysisCardProps {
  ideaId: string;
  selectedSourceCount: number;
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
    // PENDING/PROCESSING일 때만 polling
    const shouldPoll = status.status === "PENDING" || status.status === "PROCESSING";
    if (!shouldPoll) return;

    const interval = setInterval(fetchStatus, 10_000);
    return () => clearInterval(interval);
  }, [fetchStatus, status.status]);

  return { status, loading, refetch: fetchStatus };
}

// ── Component ──────────────────────────────────────────────────────────

export function PrdAnalysisCard({ ideaId, selectedSourceCount }: PrdAnalysisCardProps) {
  const { status: analysisStatus, loading, refetch } = useAnalysisPolling(ideaId);
  const [requesting, setRequesting] = useState(false);
  const [completedResult, setCompletedResult] = useState<CompletedResult | null>(null);
  const [expanded, setExpanded] = useState(false);

  // COMPLETED 상태일 때 PRD 상세 데이터 fetch
  useEffect(() => {
    if (analysisStatus.status !== "COMPLETED" || !analysisStatus.prdId) return;

    fetch(`/api/prd-studio/${analysisStatus.prdId}/sections`)
      .then((r) => r.json() as Promise<Record<string, unknown>>)
      .then(() => {
        // 큐에 저장된 결과로 표시 (별도 API 호출 불필요)
        fetch(`/api/prd-studio/analyze-idea/${ideaId}/status`)
          .then((r) => r.json() as Promise<AnalysisStatus & { resultReview?: CompletedResult }>)
          .catch(() => {});
      })
      .catch(() => {});
  }, [analysisStatus.status, analysisStatus.prdId, ideaId]);

  // 리뷰 데이터 fetch (COMPLETED 시)
  useEffect(() => {
    if (analysisStatus.status !== "COMPLETED" || !analysisStatus.prdId) {
      setCompletedResult(null);
      return;
    }

    fetch(`/api/prd-studio/${analysisStatus.prdId}/review-summary`)
      .catch(() => {});

    // PRD reviews에서 가져오기
    fetch(`/api/prd-studio`)
      .then((r) => r.json() as Promise<{ prds: Array<{ id: string; title: string; finalRating: number | null; status: string }> }>)
      .then((data) => {
        const prd = data.prds?.find((p) => p.id === analysisStatus.prdId);
        if (prd) {
          setCompletedResult({ prdTitle: prd.title, verdict: prd.status });
        }
      })
      .catch(() => {});
  }, [analysisStatus.status, analysisStatus.prdId]);

  const handleRequestAnalysis = useCallback(async () => {
    setRequesting(true);
    try {
      const res = await fetch("/api/prd-studio/analyze-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId }),
      });
      if (res.ok) {
        refetch();
      }
    } finally {
      setRequesting(false);
    }
  }, [ideaId, refetch]);

  const handleCancel = useCallback(async () => {
    await fetch(`/api/prd-studio/analyze-idea/${ideaId}/cancel`, { method: "DELETE" });
    refetch();
  }, [ideaId, refetch]);

  const handleRetry = useCallback(async () => {
    // 재분석: 새 요청
    setRequesting(true);
    try {
      const res = await fetch("/api/prd-studio/analyze-idea", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId }),
      });
      if (res.ok) {
        refetch();
      }
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
          <span className="text-sm font-semibold text-fg">PRD 분석</span>
          {analysisStatus.status !== "none" && (
            <StatusBadge status={
              analysisStatus.status === "COMPLETED" ? "REVIEWED" :
              analysisStatus.status === "PROCESSING" ? "IN_REVIEW" :
              analysisStatus.status === "PENDING" ? "DRAFT" :
              analysisStatus.status === "FAILED" ? "DRAFT" : "DRAFT"
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

      {/* Collapsed summary line */}
      {!expanded && analysisStatus.status !== "none" && (
        <div className="border-t border-border px-4 py-2 text-xs text-fg-tertiary">
          {analysisStatus.status === "PENDING" && `대기 중 (큐 ${analysisStatus.position ?? "?"}번째)`}
          {analysisStatus.status === "PROCESSING" && "분석 진행 중..."}
          {analysisStatus.status === "COMPLETED" && (
            <Link to={`/prd-studio/${analysisStatus.prdId}`} className="text-accent-fg hover:underline">
              {completedResult?.prdTitle ?? "PRD 보기"} →
            </Link>
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
                  Claude Sonnet 4.6 기반 · API 비용 없음 · 소스 {selectedSourceCount}개
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

          {/* ── State: PENDING ── */}
          {analysisStatus.status === "PENDING" && (
            <>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-sm text-fg-secondary">
                  분석 대기 중 (큐 {analysisStatus.position ?? "?"}번째)
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-secondary overflow-hidden">
                <div className="h-full w-1/6 rounded-full bg-yellow-400 animate-pulse" />
              </div>
              <p className="text-xs text-fg-tertiary">
                로컬 배치 프로세서가 순차 처리해요. 잠시 기다려주세요.
              </p>
              <button
                type="button"
                onClick={handleCancel}
                className="text-xs text-fg-tertiary hover:text-red-500 transition-colors"
              >
                취소
              </button>
            </>
          )}

          {/* ── State: PROCESSING ── */}
          {analysisStatus.status === "PROCESSING" && (
            <>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-accent-fg animate-pulse" />
                <span className="text-sm text-fg-secondary">분석 진행 중...</span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-secondary overflow-hidden">
                <div className="h-full w-3/5 rounded-full bg-accent-fg animate-[pulse_2s_ease-in-out_infinite]" />
              </div>
              <p className="text-xs text-fg-tertiary">
                Claude Sonnet 4.6 · PRD 8섹션 생성 + AI 검토를 한 번에 수행해요.
              </p>
            </>
          )}

          {/* ── State: COMPLETED ── */}
          {analysisStatus.status === "COMPLETED" && analysisStatus.prdId && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-fg">
                  {completedResult?.prdTitle ?? "PRD 분석 완료"}
                </span>
                <StatusBadge status="REVIEWED" />
              </div>

              {/* Score bars (if available from loaded PRD) */}
              <CompletedReviewSummary prdId={analysisStatus.prdId} />

              <div className="flex items-center gap-2">
                <Link
                  to={`/prd-studio/${analysisStatus.prdId}`}
                  className="inline-flex items-center gap-1 rounded-lg bg-btn-bg px-3 py-1.5 text-xs font-medium text-btn-text transition-colors hover:bg-btn-bg-hover"
                >
                  PRD 상세 보기
                </Link>
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
              <p className="text-xs text-fg-tertiary">
                오류: {analysisStatus.error ?? "알 수 없는 오류"}
              </p>
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

// ── Sub-Component: Completed Review Summary ────────────────────────────

function CompletedReviewSummary({ prdId: _prdId }: { prdId: string }) {
  return (
    <p className="text-xs text-fg-tertiary">
      PRD 상세 페이지에서 스코어카드와 피드백을 확인하세요.
    </p>
  );
}
