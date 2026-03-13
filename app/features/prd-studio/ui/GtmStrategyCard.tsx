import { useState, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────────────

interface GtmStrategyCardProps {
  ideaId: string;
  strategyCompleted: boolean;
  onOpenProposalModal?: () => void;
}

// ── GTM 섹션 라벨 ─────────────────────────────────────────────────────

const GTM_SECTIONS = ["비치헤드", "ICP", "메시징", "채널", "런치 플랜"];

// ── Component ──────────────────────────────────────────────────────────

export function GtmStrategyCard({ ideaId, strategyCompleted, onOpenProposalModal }: GtmStrategyCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const handleRequestGtm = useCallback(async () => {
    setRequesting(true);
    try {
      await fetch("/api/prd-studio/gtm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId }),
      });
    } finally {
      setRequesting(false);
    }
  }, [ideaId]);

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
        </div>
        <svg
          className={`h-4 w-4 text-fg-tertiary transition-transform ${expanded ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="border-t border-border px-4 py-4 space-y-4">
          {!strategyCompleted && (
            <p className="text-sm text-fg-tertiary">전략 분석을 먼저 완료해주세요.</p>
          )}

          {strategyCompleted && (
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={requesting}
                  onClick={handleRequestGtm}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-btn-bg px-3 py-1.5 text-xs font-medium text-btn-text transition-colors hover:bg-btn-bg-hover disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {requesting ? "요청 중..." : "GTM 분석 시작"}
                </button>
                {onOpenProposalModal && (
                  <button
                    type="button"
                    onClick={onOpenProposalModal}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-secondary"
                  >
                    사업제안 생성
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
