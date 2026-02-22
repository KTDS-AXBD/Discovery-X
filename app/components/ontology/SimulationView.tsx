import { Card, CardContent } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";

interface AffectedNode {
  nodeId: string;
  label: string;
  ontologyType: string;
  impact: number;
  depth: number;
}

interface ScenarioImpact {
  entity: string;
  impact: string;
  probability: "high" | "medium" | "low";
  timeframe: string;
}

export interface SimulationViewProps {
  propagation?: {
    sourceNode: { id: string; label: string; ontologyType: string };
    magnitude: number;
    affectedNodes: AffectedNode[];
    totalNodes: number;
    maxDepthReached: number;
  };
  scenario?: {
    summary: string;
    impacts: ScenarioImpact[];
    risks: string[];
    opportunities: string[];
    recommendation: string;
  };
  loading?: boolean;
}

const PROBABILITY_STYLES = {
  high: "bg-badge-destructive-bg text-badge-destructive-text",
  medium: "bg-badge-warning-bg text-badge-warning-text",
  low: "bg-badge-success-bg text-badge-success-text",
};

const PROBABILITY_LABELS = { high: "높음", medium: "중간", low: "낮음" };

export function SimulationView({ propagation, scenario, loading }: SimulationViewProps) {
  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center rounded-lg border border-line-subtle">
        <p className="text-sm text-fg-tertiary font-mono-dx">SIMULATING...</p>
      </div>
    );
  }

  if (!propagation) return null;

  return (
    <div className="space-y-6">
      {/* Source + Summary */}
      <div className="flex items-center gap-3">
        <Badge variant="default">{propagation.sourceNode.label}</Badge>
        <span className="text-sm text-lab-accent">&rarr;</span>
        <span className="text-sm text-fg-secondary font-mono-dx">
          {propagation.affectedNodes.length} affected ({propagation.maxDepthReached} hops)
        </span>
      </div>

      {/* Impact Propagation */}
      <div>
        <p className="lab-stat-terminal mb-3">IMPACT PROPAGATION</p>
        <div className="space-y-1.5">
          {propagation.affectedNodes.map((node) => {
            const barWidth = Math.max(4, Math.round(node.impact * 100));
            return (
              <div key={node.nodeId} className="flex items-center gap-3">
                <span className="w-32 truncate text-sm text-fg">
                  {node.label}
                </span>
                <Badge variant="secondary" className="shrink-0 text-[10px]">
                  {node.ontologyType}
                </Badge>
                <div className="h-2 flex-1 rounded-full bg-surface-secondary">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${barWidth}%`, backgroundColor: "var(--dx-lab-accent)" }}
                  />
                </div>
                <span className="w-12 text-right text-[10px] tabular-nums text-fg-tertiary">
                  {(node.impact * 100).toFixed(0)}%
                </span>
                <span className="w-8 text-right text-[10px] text-fg-tertiary">
                  D{node.depth}
                </span>
              </div>
            );
          })}
          {propagation.affectedNodes.length === 0 && (
            <p className="py-4 text-center text-sm text-fg-tertiary">
              연결된 엔티티가 없습니다.
            </p>
          )}
        </div>
      </div>

      {/* Scenario (if LLM result available) */}
      {scenario && (
        <>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-fg-secondary">
              시나리오 요약
            </h3>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-fg">{scenario.summary}</p>
              </CardContent>
            </Card>
          </div>

          {scenario.impacts.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-fg-secondary">
                예상 영향
              </h3>
              <div className="space-y-2">
                {scenario.impacts.map((imp, i) => (
                  <Card key={i}>
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-fg">
                          {imp.entity}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${PROBABILITY_STYLES[imp.probability]}`}
                        >
                          {PROBABILITY_LABELS[imp.probability]}
                        </span>
                        <span className="text-[10px] text-fg-tertiary">
                          {imp.timeframe}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-fg-secondary">{imp.impact}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {scenario.risks.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-badge-destructive-text">
                  리스크
                </h3>
                <ul className="space-y-1">
                  {scenario.risks.map((risk, i) => (
                    <li key={i} className="text-xs text-fg-secondary">
                      &bull; {risk}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {scenario.opportunities.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-badge-success-text">
                  기회
                </h3>
                <ul className="space-y-1">
                  {scenario.opportunities.map((opp, i) => (
                    <li key={i} className="text-xs text-fg-secondary">
                      &bull; {opp}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {scenario.recommendation && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-fg-secondary">
                권고 사항
              </h3>
              <Card>
                <CardContent className="p-3">
                  <p className="text-sm text-fg">
                    {scenario.recommendation}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}
