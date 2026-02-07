/**
 * ScenarioView — 시나리오 탭 뷰 (Optimistic/Base/Pessimistic)
 */

import { useState } from "react";

const SCENARIO_LABELS: Record<string, string> = {
  optimistic: "Optimistic",
  base: "Base",
  pessimistic: "Pessimistic",
};

const SCENARIO_COLORS: Record<string, string> = {
  optimistic: "text-green-600 dark:text-green-400 border-green-500",
  base: "text-blue-600 dark:text-blue-400 border-blue-500",
  pessimistic: "text-red-600 dark:text-red-400 border-red-500",
};

interface Scenario {
  id: string;
  scenarioType: string;
  transformationPlan: Array<{ phase: string; duration: string; actions: string[]; milestones: string[] }> | null;
  valueProjection: Array<{ month: number; revenue: string; cost?: string; margin?: string; note?: string }> | null;
  riskFactors: Array<{ factor: string; probability: number; impact: number; mitigation: string }> | null;
  keyAssumptions: Array<{ assumption: string; confidence: number; validationMethod: string }> | null;
}

interface ScenarioViewProps {
  scenarios: Scenario[];
}

export default function ScenarioView({ scenarios }: ScenarioViewProps) {
  const [activeTab, setActiveTab] = useState(scenarios[0]?.scenarioType || "base");
  const active = scenarios.find((s) => s.scenarioType === activeTab);

  return (
    <div>
      {/* 탭 */}
      <div className="flex gap-1 mb-4">
        {scenarios.map((s) => {
          const isActive = s.scenarioType === activeTab;
          return (
            <button
              key={s.scenarioType}
              onClick={() => setActiveTab(s.scenarioType)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? `${SCENARIO_COLORS[s.scenarioType] || ""} border-b-2 bg-[var(--axis-surface-secondary)]`
                  : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]"
              }`}
            >
              {SCENARIO_LABELS[s.scenarioType] || s.scenarioType}
            </button>
          );
        })}
      </div>

      {active && (
        <div className="space-y-4">
          {/* 전환 계획 */}
          {active.transformationPlan && active.transformationPlan.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-[var(--axis-text-primary)] mb-2">
                전환 계획
              </h4>
              <div className="space-y-2">
                {active.transformationPlan.map((phase, i) => (
                  <div
                    key={i}
                    className="rounded border border-[var(--dx-border-subtle,var(--axis-border-default))] p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--axis-text-primary)]">
                        {phase.phase}
                      </span>
                      <span className="rounded bg-[var(--axis-surface-secondary)] px-1.5 py-0.5 text-xs text-[var(--axis-text-tertiary)]">
                        {phase.duration}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                      {phase.actions.join(" / ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 가치 예측 */}
          {active.valueProjection && active.valueProjection.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-[var(--axis-text-primary)] mb-2">
                가치 예측
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--dx-border-subtle,var(--axis-border-default))]">
                      <th className="py-1.5 text-left text-xs font-medium text-[var(--axis-text-tertiary)]">월</th>
                      <th className="py-1.5 text-right text-xs font-medium text-[var(--axis-text-tertiary)]">매출</th>
                      <th className="py-1.5 text-right text-xs font-medium text-[var(--axis-text-tertiary)]">비용</th>
                      <th className="py-1.5 text-right text-xs font-medium text-[var(--axis-text-tertiary)]">마진</th>
                      <th className="py-1.5 text-left text-xs font-medium text-[var(--axis-text-tertiary)]">비고</th>
                    </tr>
                  </thead>
                  <tbody>
                    {active.valueProjection.map((vp, i) => (
                      <tr key={i} className="border-b border-[var(--dx-border-subtle,var(--axis-border-default))]">
                        <td className="py-1.5 text-[var(--axis-text-primary)]">{vp.month}M</td>
                        <td className="py-1.5 text-right tabular-nums text-[var(--axis-text-primary)]">{vp.revenue}</td>
                        <td className="py-1.5 text-right tabular-nums text-[var(--axis-text-secondary)]">{vp.cost || "-"}</td>
                        <td className="py-1.5 text-right tabular-nums text-[var(--axis-text-secondary)]">{vp.margin || "-"}</td>
                        <td className="py-1.5 text-xs text-[var(--axis-text-tertiary)]">{vp.note || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 리스크 */}
          {active.riskFactors && active.riskFactors.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-[var(--axis-text-primary)] mb-2">
                주요 리스크
              </h4>
              <div className="space-y-1.5">
                {active.riskFactors.map((rf, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="flex-1 text-[var(--axis-text-secondary)]">{rf.factor}</span>
                    <span className="tabular-nums text-xs text-[var(--axis-text-tertiary)]">
                      확률 {rf.probability}% / 영향 {rf.impact}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
