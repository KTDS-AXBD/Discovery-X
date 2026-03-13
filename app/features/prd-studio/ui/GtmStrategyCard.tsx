import { useState, useEffect, useCallback } from "react";
import { StatusBadge } from "./StatusBadge";
import type { GtmResult } from "../types";

// ── Types ──────────────────────────────────────────────────────────────

interface GtmStatus {
  status: "none" | "PENDING_GTM" | "COMPLETED";
  hasStrategy?: boolean;
  hasGtm?: boolean;
  completedAt?: number | string;
}

interface GtmStrategyCardProps {
  ideaId: string;
  strategyCompleted: boolean;
  onOpenProposalModal?: () => void;
  onOpenDetail?: () => void;
}

// ── Polling Hook ───────────────────────────────────────────────────────

function useGtmPolling(ideaId: string, enabled: boolean) {
  const [status, setStatus] = useState<GtmStatus>({ status: "none" });
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(false);

  const fetchStatus = useCallback(() => {
    fetch(`/api/prd-studio/gtm/${ideaId}/status`)
      .then((r) => r.json() as Promise<GtmStatus>)
      .then((data) => {
        setStatus(data);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [ideaId]);

  useEffect(() => {
    if (!enabled) return;
    fetchStatus();
    const shouldPoll = status.status === "PENDING_GTM";
    if (!shouldPoll) return;

    const interval = setInterval(fetchStatus, 10_000);
    return () => clearInterval(interval);
  }, [fetchStatus, status.status, enabled]);

  return { status, loading, error, refetch: fetchStatus };
}

// ── GTM 섹션 라벨 ─────────────────────────────────────────────────────

const GTM_SECTIONS = ["비치헤드", "ICP", "메시징", "채널", "런치 플랜"];

// ── Helper: 채널 우선도 배지 ───────────────────────────────────────────

function ChannelBadges({ channels }: { channels: GtmResult["channelStrategy"]["channels"] }) {
  const counts = { primary: 0, secondary: 0, experimental: 0 };
  for (const ch of channels) {
    counts[ch.priority]++;
  }
  return (
    <div className="flex gap-1.5">
      {counts.primary > 0 && (
        <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
          핵심 {counts.primary}
        </span>
      )}
      {counts.secondary > 0 && (
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700">
          보조 {counts.secondary}
        </span>
      )}
      {counts.experimental > 0 && (
        <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-700">
          실험 {counts.experimental}
        </span>
      )}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────

export function GtmStrategyCard({ ideaId, strategyCompleted, onOpenProposalModal, onOpenDetail }: GtmStrategyCardProps) {
  const { status: gtmStatus, loading, error, refetch } = useGtmPolling(ideaId, strategyCompleted);
  const [expanded, setExpanded] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [gtmResult, setGtmResult] = useState<GtmResult | null>(null);

  // Fetch GTM result when COMPLETED
  useEffect(() => {
    if (gtmStatus.status !== "COMPLETED") return;
    fetch(`/api/prd-studio/strategy/${ideaId}/result`)
      .then((r) => r.json() as Promise<{ resultGtm?: GtmResult }>)
      .then((data) => {
        if (data.resultGtm) setGtmResult(data.resultGtm);
      })
      .catch(() => {});
  }, [gtmStatus.status, ideaId]);

  const handleRequestGtm = useCallback(async () => {
    setRequesting(true);
    try {
      const res = await fetch("/api/prd-studio/gtm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId }),
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
          <span className="text-sm font-semibold text-fg">GTM 전략</span>
          {gtmStatus.status !== "none" && (
            <StatusBadge status={
              gtmStatus.status === "COMPLETED" ? "REVIEWED" : "DRAFT"
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
      {!expanded && gtmStatus.status !== "none" && (
        <div className="border-t border-border px-4 py-2 text-xs text-fg-tertiary">
          {gtmStatus.status === "PENDING_GTM" && "GTM 분석 대기 중..."}
          {gtmStatus.status === "COMPLETED" && "GTM 전략 분석 완료"}
        </div>
      )}

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          {/* ── State a: none + !strategyCompleted (비활성) ── */}
          {!strategyCompleted && gtmStatus.status === "none" && (
            <p className="text-sm text-fg-tertiary">전략 분석을 먼저 완료해주세요.</p>
          )}

          {/* ── State b: none + strategyCompleted (GTM 시작 가능) ── */}
          {strategyCompleted && gtmStatus.status === "none" && (
            <>
              <p className="text-sm text-fg-secondary">
                전략 분석 결과 기반 GTM 전략을 생성해요.
              </p>
              <div className="flex flex-wrap gap-1.5">
                {GTM_SECTIONS.map((s) => (
                  <span key={s} className="rounded-full bg-surface-secondary px-2 py-0.5 text-xs text-fg-tertiary">
                    {s}
                  </span>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-fg-tertiary">Claude Sonnet 4.6 기반</span>
                <button
                  type="button"
                  disabled={requesting}
                  onClick={handleRequestGtm}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-btn-bg px-3 py-1.5 text-xs font-medium text-btn-text transition-colors hover:bg-btn-bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {requesting ? "요청 중..." : "GTM 분석 시작"}
                </button>
              </div>
            </>
          )}

          {/* ── State c: PENDING_GTM (대기 중) ── */}
          {gtmStatus.status === "PENDING_GTM" && (
            <>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-yellow-400 animate-pulse" />
                <span className="text-sm text-fg-secondary">GTM 분석 대기 중</span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-secondary overflow-hidden">
                <div className="h-full w-1/4 rounded-full bg-yellow-400 animate-pulse" />
              </div>
              <p className="text-xs text-fg-tertiary">
                배치 프로세서가 순차 처리해요. 약 1~2분 소요돼요.
              </p>
            </>
          )}

          {/* ── State d: COMPLETED (결과 표시) ── */}
          {gtmStatus.status === "COMPLETED" && (
            <>
              {gtmResult ? (
                <div className="space-y-3">
                  {/* 비치헤드 */}
                  <div className="rounded-lg border border-border p-3">
                    <span className="text-xs font-medium text-fg-tertiary">비치헤드 세그먼트</span>
                    <p className="text-sm font-medium text-fg mt-1">{gtmResult.beachheadSegment.segment}</p>
                    <p className="text-xs text-fg-tertiary mt-0.5">{gtmResult.beachheadSegment.rationale}</p>
                  </div>

                  {/* ICP */}
                  <div className="rounded-lg border border-border p-3">
                    <span className="text-xs font-medium text-fg-tertiary">ICP (이상적 고객 프로필)</span>
                    <p className="text-sm text-fg mt-1">{gtmResult.icp.profile}</p>
                  </div>

                  {/* 메시징 */}
                  <div className="rounded-lg border border-border p-3">
                    <span className="text-xs font-medium text-fg-tertiary">핵심 메시지</span>
                    <p className="text-sm font-semibold text-fg mt-1">{gtmResult.messaging.oneLiner}</p>
                  </div>

                  {/* 채널 배지 */}
                  <div className="rounded-lg border border-border p-3">
                    <span className="text-xs font-medium text-fg-tertiary">채널 전략</span>
                    <div className="mt-1.5">
                      <ChannelBadges channels={gtmResult.channelStrategy.channels} />
                    </div>
                  </div>

                  {/* 런치 플랜 */}
                  <div className="rounded-lg border border-border p-3">
                    <span className="text-xs font-medium text-fg-tertiary">런치 플랜</span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {gtmResult.launchPlan.phases.map((phase) => (
                        <span key={phase.name} className="rounded bg-surface-secondary px-2 py-0.5 text-xs text-fg-secondary">
                          {phase.name} ({phase.duration})
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-20 animate-pulse rounded bg-surface-secondary" />
              )}

              {/* 하단 버튼 */}
              <div className="flex items-center gap-2 pt-1">
                {onOpenProposalModal && (
                  <button
                    type="button"
                    onClick={onOpenProposalModal}
                    className="inline-flex items-center gap-1 rounded-lg bg-btn-bg px-3 py-1.5 text-xs font-medium text-btn-text transition-colors hover:bg-btn-bg-hover"
                  >
                    사업제안 생성
                  </button>
                )}
                {onOpenDetail && (
                  <button
                    type="button"
                    onClick={onOpenDetail}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-secondary"
                  >
                    상세 보기
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleRequestGtm}
                  disabled={requesting}
                  className="text-xs text-fg-tertiary hover:text-fg-secondary transition-colors disabled:opacity-50"
                >
                  {requesting ? "요청 중..." : "재분석"}
                </button>
              </div>
            </>
          )}

          {/* ── State e: 에러 상태 ── */}
          {error && gtmStatus.status === "none" && strategyCompleted && (
            <>
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-red-500" />
                <span className="text-sm text-red-600">상태 조회에 실패했어요</span>
              </div>
              <button
                type="button"
                onClick={refetch}
                className="inline-flex items-center gap-1 rounded-lg bg-btn-bg px-3 py-1.5 text-xs font-medium text-btn-text transition-colors hover:bg-btn-bg-hover"
              >
                재시도
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
