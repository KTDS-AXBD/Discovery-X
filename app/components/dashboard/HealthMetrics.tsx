import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";

interface HealthData {
  summary: {
    totalDiscoveries: number;
    activeCount: number;
    terminalCount: number;
    overdueCount: number;
    totalEvidence: number;
    strongEvidenceRatio: string;
    experimentCompletionRate: string;
  };
  avgDwellByStage: Record<string, number>;
  stageTransitions: Record<string, number>;
  evidenceByStrength: Record<string, number>;
}

interface HealthMetricsProps {
  data: HealthData;
}

const STAGE_LABELS: Record<string, string> = {
  DISCOVERY: "Discovery",
  IDEA_CARD: "Idea Card",
  HYPOTHESIS: "Hypothesis",
  EXPERIMENT: "Experiment",
  EVIDENCE_REVIEW: "Evidence Review",
  GATE1: "Gate 1",
  SPRINT: "Sprint",
  GATE2: "Gate 2",
  HANDOFF: "Handoff",
};

function DwellBar({ stage, days, maxDays }: { stage: string; days: number; maxDays: number }) {
  const width = maxDays > 0 ? Math.min((days / maxDays) * 100, 100) : 0;
  const isWarning = days > 14;
  const isCritical = days > 21;

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="w-32 text-xs text-[var(--axis-text-secondary)] truncate">
        {STAGE_LABELS[stage] || stage}
      </span>
      <div className="flex-1 h-5 rounded bg-[var(--axis-surface-tertiary)] overflow-hidden">
        <div
          className="h-full rounded transition-all"
          style={{
            width: `${width}%`,
            backgroundColor: isCritical
              ? "var(--axis-badge-destructive-text, #EF4444)"
              : isWarning
              ? "var(--axis-badge-warning-text, #F59E0B)"
              : "var(--axis-chart-bar, #3B82F6)",
          }}
        />
      </div>
      <span className="w-16 text-right text-xs font-medium text-[var(--axis-text-primary)]">
        {days}일
      </span>
    </div>
  );
}

export function HealthMetrics({ data }: HealthMetricsProps) {
  const { summary, avgDwellByStage, stageTransitions, evidenceByStrength } = data;
  const maxDwell = Math.max(...Object.values(avgDwellByStage), 1);

  const strengthLabels: Record<string, string> = {
    A: "Hard (A)",
    B: "Direct (B)",
    C: "Indirect (C)",
    D: "Intuition (D)",
  };
  const strengthColors: Record<string, string> = {
    A: "var(--axis-badge-success-text, #10B981)",
    B: "var(--axis-chart-bar, #3B82F6)",
    C: "var(--axis-badge-warning-text, #F59E0B)",
    D: "var(--axis-text-tertiary, #9CA3AF)",
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard label="활성 Discovery" value={summary.activeCount} />
        <SummaryCard
          label="기한 초과"
          value={summary.overdueCount}
          variant={summary.overdueCount > 0 ? "warning" : "default"}
        />
        <SummaryCard label="강한 근거 비율" value={summary.strongEvidenceRatio} />
        <SummaryCard label="실험 완료율" value={summary.experimentCompletionRate} />
      </div>

      {/* Stage Dwell Time */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">단계별 평균 체류시간</CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(avgDwellByStage).length === 0 ? (
            <p className="text-sm text-[var(--axis-text-tertiary)]">데이터가 없습니다.</p>
          ) : (
            <div>
              {Object.entries(avgDwellByStage)
                .sort((a, b) => {
                  const order = Object.keys(STAGE_LABELS);
                  return order.indexOf(a[0]) - order.indexOf(b[0]);
                })
                .map(([stage, days]) => (
                  <DwellBar key={stage} stage={stage} days={days} maxDays={maxDwell} />
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Evidence Quality */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">근거 품질 분포</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            {["A", "B", "C", "D"].map((s) => {
              const count = evidenceByStrength[s] || 0;
              const total = summary.totalEvidence || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={s} className="flex-1 text-center">
                  <div className="text-2xl font-bold text-[var(--axis-text-primary)]">{count}</div>
                  <div className="mt-1 h-2 rounded-full bg-[var(--axis-surface-tertiary)]">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: strengthColors[s],
                      }}
                    />
                  </div>
                  <div className="mt-1 text-[10px] text-[var(--axis-text-tertiary)]">
                    {strengthLabels[s]}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Stage Transitions */}
      {Object.keys(stageTransitions).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">최근 단계 전환</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {Object.entries(stageTransitions)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([transition, count]) => (
                  <div
                    key={transition}
                    className="flex items-center gap-1.5 rounded-full border border-[var(--axis-border-default)] px-3 py-1"
                  >
                    <span className="text-xs text-[var(--axis-text-secondary)]">{transition}</span>
                    <Badge variant="default">{count}</Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  variant = "default",
}: {
  label: string;
  value: string | number;
  variant?: "default" | "warning";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-[var(--axis-text-tertiary)]">{label}</p>
        <p
          className="mt-1 text-2xl font-bold"
          style={{
            color:
              variant === "warning"
                ? "var(--axis-badge-destructive-text, #EF4444)"
                : "var(--axis-text-primary)",
          }}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
