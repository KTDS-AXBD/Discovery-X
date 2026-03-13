import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "~/components/ui/Dialog";

interface StrategyDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ideaId: string;
}

interface StrategyData {
  resultStrategy: {
    swot?: { strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[]; crossAnalysis: string };
    leanCanvas?: Record<string, string>;
    jtbd?: Record<string, string>;
    competition?: { directCompetitors: Array<{ name: string; description: string; strengths: string; weaknesses: string }>; indirectCompetitors: Array<{ name: string; description: string }>; differentiation: string };
    marketSizing?: { tam: { value: string; description: string }; sam: { value: string; description: string }; som: { value: string; description: string }; methodology: string; assumptions: string[] };
    riskAssessment?: { risks: Array<{ category: string; description: string; impact: string; likelihood: string; mitigation: string }>; overallRiskLevel: string; summary: string };
  } | null;
  resultGtm: Record<string, unknown> | null;
}

const TABS = [
  { key: "swot", label: "SWOT" },
  { key: "leanCanvas", label: "린 캔버스" },
  { key: "jtbd", label: "JTBD" },
  { key: "competition", label: "경쟁 분석" },
  { key: "marketSizing", label: "시장 규모" },
  { key: "riskAssessment", label: "리스크" },
] as const;

export function StrategyDetailModal({ open, onOpenChange, ideaId }: StrategyDetailModalProps) {
  const [data, setData] = useState<StrategyData>({ resultStrategy: null, resultGtm: null });
  const [activeTab, setActiveTab] = useState("swot");
  const [loaded, setLoaded] = useState(false);

  const fetchData = useCallback(() => {
    fetch(`/api/prd-studio/strategy/${ideaId}/result`)
      .then((r) => r.json() as Promise<StrategyData>)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [ideaId]);

  useEffect(() => {
    if (open && !loaded) fetchData();
  }, [open, loaded, fetchData]);

  const loading = open && !loaded;

  const strategy = data?.resultStrategy;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogTitle className="text-lg font-semibold">전략 분석 상세</DialogTitle>
        <DialogDescription className="text-sm text-fg-tertiary">
          PRD 기반 6개 전략 프레임워크 분석 결과
        </DialogDescription>

        {loading && (
          <div className="py-8 text-center text-fg-tertiary text-sm">로딩 중...</div>
        )}

        {!loading && strategy && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Tab bar */}
            <div className="flex gap-1 border-b border-border px-1 overflow-x-auto">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                    activeTab === tab.key
                      ? "border-accent-fg text-accent-fg"
                      : "border-transparent text-fg-tertiary hover:text-fg-secondary"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {activeTab === "swot" && strategy.swot && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                    <h4 className="text-xs font-semibold text-green-700 mb-2">강점 (S)</h4>
                    <ul className="space-y-1">
                      {strategy.swot.strengths.map((s, i) => (
                        <li key={i} className="text-xs text-green-800">{"\u2022"} {s}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg bg-red-50 border border-red-200 p-3">
                    <h4 className="text-xs font-semibold text-red-700 mb-2">약점 (W)</h4>
                    <ul className="space-y-1">
                      {strategy.swot.weaknesses.map((s, i) => (
                        <li key={i} className="text-xs text-red-800">{"\u2022"} {s}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg bg-blue-50 border border-blue-200 p-3">
                    <h4 className="text-xs font-semibold text-blue-700 mb-2">기회 (O)</h4>
                    <ul className="space-y-1">
                      {strategy.swot.opportunities.map((s, i) => (
                        <li key={i} className="text-xs text-blue-800">{"\u2022"} {s}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3">
                    <h4 className="text-xs font-semibold text-yellow-700 mb-2">위협 (T)</h4>
                    <ul className="space-y-1">
                      {strategy.swot.threats.map((s, i) => (
                        <li key={i} className="text-xs text-yellow-800">{"\u2022"} {s}</li>
                      ))}
                    </ul>
                  </div>
                  {strategy.swot.crossAnalysis && (
                    <div className="col-span-2 rounded-lg bg-surface-secondary p-3">
                      <h4 className="text-xs font-semibold text-fg mb-1">교차 분석</h4>
                      <p className="text-xs text-fg-secondary">{strategy.swot.crossAnalysis}</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "leanCanvas" && strategy.leanCanvas && (
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(strategy.leanCanvas).map(([key, value]) => (
                    <div key={key} className="rounded-lg border border-border p-2">
                      <h4 className="text-[10px] font-semibold text-fg-tertiary uppercase mb-1">{key}</h4>
                      <p className="text-xs text-fg-secondary">{value as string}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "jtbd" && strategy.jtbd && (
                <div className="space-y-2">
                  {Object.entries(strategy.jtbd).map(([key, value]) => (
                    <div key={key} className="rounded-lg border border-border p-3">
                      <h4 className="text-xs font-semibold text-fg mb-1">{key}</h4>
                      <p className="text-xs text-fg-secondary">{value as string}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "competition" && strategy.competition && (
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-fg">직접 경쟁사</h4>
                  {strategy.competition.directCompetitors.map((c, i) => (
                    <div key={i} className="rounded-lg border border-border p-3">
                      <h5 className="text-xs font-medium text-fg">{c.name}</h5>
                      <p className="text-xs text-fg-tertiary mt-1">{c.description}</p>
                      <div className="flex gap-4 mt-2 text-[10px]">
                        <span className="text-green-600">강점: {c.strengths}</span>
                        <span className="text-red-600">약점: {c.weaknesses}</span>
                      </div>
                    </div>
                  ))}
                  {strategy.competition.differentiation && (
                    <div className="rounded-lg bg-accent-bg/20 border border-accent-fg/20 p-3">
                      <h4 className="text-xs font-semibold text-accent-fg mb-1">차별화 전략</h4>
                      <p className="text-xs text-fg-secondary">{strategy.competition.differentiation}</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "marketSizing" && strategy.marketSizing && (
                <div className="space-y-3">
                  {(["tam", "sam", "som"] as const).map((level) => {
                    const d = strategy.marketSizing?.[level];
                    return d ? (
                      <div key={level} className="rounded-lg border border-border p-3">
                        <h4 className="text-xs font-semibold text-fg uppercase">{level}</h4>
                        <p className="text-sm font-medium text-accent-fg mt-1">{d.value}</p>
                        <p className="text-xs text-fg-tertiary mt-1">{d.description}</p>
                      </div>
                    ) : null;
                  })}
                  {strategy.marketSizing.assumptions.length > 0 && (
                    <div className="rounded-lg bg-surface-secondary p-3">
                      <h4 className="text-xs font-semibold text-fg mb-1">핵심 가정</h4>
                      <ul className="space-y-1">
                        {strategy.marketSizing.assumptions.map((a, i) => (
                          <li key={i} className="text-xs text-fg-secondary">{"\u2022"} {a}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {activeTab === "riskAssessment" && strategy.riskAssessment && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-fg">전체 리스크 수준:</span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      strategy.riskAssessment.overallRiskLevel === "high" ? "bg-red-100 text-red-700" :
                      strategy.riskAssessment.overallRiskLevel === "medium" ? "bg-yellow-100 text-yellow-700" :
                      "bg-green-100 text-green-700"
                    }`}>
                      {strategy.riskAssessment.overallRiskLevel}
                    </span>
                  </div>
                  {strategy.riskAssessment.risks.map((r, i) => (
                    <div key={i} className="rounded-lg border border-border p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="rounded bg-surface-secondary px-1.5 py-0.5 text-[10px] text-fg-tertiary">{r.category}</span>
                        <span className={`text-[10px] ${r.impact === "high" ? "text-red-600" : r.impact === "medium" ? "text-yellow-600" : "text-green-600"}`}>
                          영향: {r.impact}
                        </span>
                        <span className={`text-[10px] ${r.likelihood === "high" ? "text-red-600" : r.likelihood === "medium" ? "text-yellow-600" : "text-green-600"}`}>
                          확률: {r.likelihood}
                        </span>
                      </div>
                      <p className="text-xs text-fg-secondary">{r.description}</p>
                      <p className="text-xs text-fg-tertiary mt-1">완화: {r.mitigation}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {!loading && !strategy && (
          <div className="py-8 text-center text-fg-tertiary text-sm">전략 분석 결과가 없어요.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
