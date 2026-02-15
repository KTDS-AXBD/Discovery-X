import { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/Dialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProposalCreationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ideaTitle?: string;
  ideaId?: string;
  onProposalCreated?: (proposalId: string) => void;
}

interface AnalysisEntry {
  title: string;
  content: string;
  sourceIds?: string[];
  analyzedAt?: string;
}

type AnalysisData = Record<string, AnalysisEntry> | null;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROPOSAL_TABS = [
  "가설",
  "타겟",
  "가치 제안",
  "수익 구조",
  "시나리오",
  "MVP",
  "실행 방안",
] as const;

type ProposalTab = (typeof PROPOSAL_TABS)[number];

const CATEGORY_LABELS: Record<string, string> = {
  market_research: "시장 조사",
  customer_research: "고객 조사",
  critical_thinking: "비판적 사고",
  bmc: "BMC",
  swot: "SWOT 분석",
  regulation: "규제/법",
  feasibility: "사업성 검증",
  differentiation: "차별화",
  industry_example: "산업별 사례",
  value_chain: "가치 사슬",
  lean_canvas: "린 캔버스",
  pestel: "PESTEL",
};

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS);

/** Which analysis categories map to each proposal tab */
const TAB_CATEGORY_MAP: Record<ProposalTab, string[]> = {
  가설: ["critical_thinking", "swot"],
  타겟: ["market_research", "customer_research"],
  "가치 제안": ["differentiation", "value_chain"],
  "수익 구조": ["feasibility"],
  시나리오: ["bmc", "lean_canvas", "pestel"],
  MVP: ["lean_canvas", "bmc"],
  "실행 방안": ["regulation", "industry_example"],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProposalCreationModal({
  open,
  onOpenChange,
  ideaTitle,
  ideaId,
  onProposalCreated,
}: ProposalCreationModalProps) {
  // -- state ----------------------------------------------------------------
  const [analysisData, setAnalysisData] = useState<AnalysisData>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<ProposalTab>("가설");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // -- fetch analysis data when modal opens ---------------------------------
  useEffect(() => {
    if (!open || !ideaId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setAnalysisData(null);
    setSelectedCategories(new Set());
    setSubmitError(null);

    fetch(`/api/ideas/${ideaId}/analysis`)
      .then(async (res) => {
        if (!res.ok) throw new Error("분석 데이터를 불러올 수 없습니다.");
        return res.json() as Promise<{ analysisData: AnalysisData }>;
      })
      .then((data) => {
        if (cancelled) return;
        const ad = data.analysisData;
        setAnalysisData(ad);

        // Pre-select all completed categories
        if (ad) {
          const completed = CATEGORY_KEYS.filter((k) => ad[k]?.content);
          setSelectedCategories(new Set(completed));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "알 수 없는 오류");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, ideaId]);

  // -- derived --------------------------------------------------------------
  const completedCategories = analysisData
    ? CATEGORY_KEYS.filter((k) => analysisData[k]?.content)
    : [];

  const hasAnalysis = completedCategories.length > 0;

  function toggleCategory(key: string) {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // -- tab content builder --------------------------------------------------
  function getTabContent(tab: ProposalTab): string | null {
    if (!analysisData) return null;
    const cats = TAB_CATEGORY_MAP[tab];
    const parts: string[] = [];

    for (const cat of cats) {
      if (selectedCategories.has(cat) && analysisData[cat]?.content) {
        parts.push(`### ${CATEGORY_LABELS[cat]}\n\n${analysisData[cat].content}`);
      }
    }

    return parts.length > 0 ? parts.join("\n\n---\n\n") : null;
  }

  // -- submit ---------------------------------------------------------------
  async function handleSubmit() {
    if (!ideaId || selectedCategories.size === 0) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch(`/api/ideas/${ideaId}/create-proposal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedCategories: [...selectedCategories] }),
      });

      const body = (await res.json().catch(() => null)) as
        | { proposalId?: string; error?: string }
        | null;

      if (!res.ok) {
        throw new Error(body?.error || "사업 제안 생성에 실패했습니다.");
      }

      const proposalId = body?.proposalId;
      if (!proposalId) {
        throw new Error("응답에 proposalId가 없습니다.");
      }

      onProposalCreated?.(proposalId);
      onOpenChange(false);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "알 수 없는 오류");
    } finally {
      setSubmitting(false);
    }
  }

  // -- render: loading / error / empty states --------------------------------
  function renderBody() {
    if (loading) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--axis-border-default)] border-t-[var(--axis-text-brand)]" />
            <p className="text-xs text-[var(--axis-text-tertiary)]">분석 데이터 로딩 중…</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-sm text-red-500">{error}</p>
        </div>
      );
    }

    if (!hasAnalysis) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-sm text-[var(--axis-text-secondary)]">
            AI 분석을 먼저 실행해주세요.
            <br />
            분석 결과를 바탕으로 사업 제안서를 생성합니다.
          </p>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-lg border border-[var(--axis-border-default)] px-4 py-2 text-sm text-[var(--axis-text-secondary)] transition-colors hover:bg-[var(--axis-surface-secondary)]"
          >
            닫기
          </button>
        </div>
      );
    }

    // -- main two-panel layout -----------------------------------------------
    const tabContent = getTabContent(activeTab);

    return (
      <div className="flex gap-4" style={{ minHeight: 400 }}>
        {/* Left: analysis category checkboxes */}
        <div className="flex w-64 shrink-0 flex-col rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)]">
          <div className="border-b border-[var(--axis-border-default)] px-4 py-2.5">
            <p className="text-xs font-semibold text-[var(--axis-text-secondary)]">
              분석 결과
            </p>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {CATEGORY_KEYS.map((key) => {
              const completed = completedCategories.includes(key);
              const entry = analysisData?.[key];
              return (
                <label
                  key={key}
                  className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-xs ${
                    completed
                      ? "cursor-pointer hover:bg-[var(--axis-surface-default)]"
                      : "cursor-not-allowed opacity-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedCategories.has(key)}
                    disabled={!completed}
                    onChange={() => toggleCategory(key)}
                    className="mt-0.5 accent-[var(--axis-text-brand)]"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className={completed ? "text-[var(--axis-text-primary)]" : "text-[var(--axis-text-tertiary)]"}>
                      {CATEGORY_LABELS[key]}
                    </span>
                    {completed && entry?.analyzedAt && (
                      <span className="text-[10px] text-[var(--axis-text-tertiary)]">
                        {formatDate(entry.analyzedAt)}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {/* Right: tab view */}
        <div className="flex flex-1 flex-col rounded-lg border border-[var(--axis-border-default)]">
          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto border-b border-[var(--axis-border-default)] px-3 scrollbar-none">
            {PROPOSAL_TABS.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`shrink-0 px-2.5 py-2 text-xs transition-colors ${
                  activeTab === tab
                    ? "border-b-2 border-[var(--axis-text-brand)] text-[var(--axis-text-brand)]"
                    : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {tabContent ? (
              <div className="prose prose-sm max-w-none text-sm text-[var(--axis-text-primary)]">
                <ReactMarkdown>{tabContent}</ReactMarkdown>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center">
                <p className="text-xs text-[var(--axis-text-tertiary)]">
                  관련 분석이 아직 없습니다
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // -- render ----------------------------------------------------------------
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{ideaTitle || "아이디어"} — 사업 제안</DialogTitle>
          <DialogDescription>
            포함할 분석을 선택하고 사업 제안서를 생성하세요.
          </DialogDescription>
        </DialogHeader>

        {renderBody()}

        {/* Footer — only when analysis exists */}
        {hasAnalysis && !loading && !error && (
          <div className="flex items-center justify-between border-t border-[var(--axis-border-default)] pt-4">
            <div>
              {submitError && (
                <p className="text-xs text-red-500">{submitError}</p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-lg border border-[var(--axis-border-default)] px-4 py-2 text-sm text-[var(--axis-text-secondary)] transition-colors hover:bg-[var(--axis-surface-secondary)]"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={selectedCategories.size === 0 || submitting}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                  selectedCategories.size === 0 || submitting
                    ? "cursor-not-allowed bg-[var(--axis-surface-brand)] opacity-50"
                    : "bg-[var(--axis-surface-brand)] hover:opacity-90"
                }`}
              >
                {submitting ? "생성 중..." : "사업 제안 생성"}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}.${m}.${day} ${h}:${min}`;
  } catch {
    return iso;
  }
}
