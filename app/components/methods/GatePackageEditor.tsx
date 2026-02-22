import { Card, CardContent } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import { formatDate } from "~/lib/format-date";

interface CriticalCheckItem {
  name: string;
  passed: boolean;
  message: string;
  details?: Record<string, unknown>;
}

interface GatePackageData {
  id: string;
  gateType: string;
  decision: string | null;
  rationale: string | null;
  autoDraftedAt: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
  scorecard: {
    evidenceCount: number;
    strongEvidenceCount: number;
    confirmedEvidenceCount: number;
    experimentCount: number;
    completedExperimentCount: number;
    methodRunCount: number;
    assumptionCount: number;
    validatedAssumptionCount: number;
    openAssumptionCount: number;
    readinessScore: number;
    criticalChecks?: {
      passed: boolean;
      checks: CriticalCheckItem[];
    };
  } | null;
  methodRunSummary: Array<{
    runId: string;
    methodPackId: string;
    completedAt: string | null;
    hasOutput: boolean;
  }> | null;
  evidenceSummary: Array<{
    id: string;
    type: string;
    strength: string;
    reliabilityLabel: string | null;
    content: string;
    hasSource: boolean;
    hasDate: boolean;
  }> | null;
  assumptions: Array<{
    id: string;
    statement: string;
    status: string;
    refutationQuestions: string[] | null;
  }> | null;
}

interface GatePackageEditorProps {
  gatePackage: GatePackageData;
}

const DECISION_BADGE: Record<string, { variant: "success" | "destructive" | "warning" | "secondary"; label: string }> = {
  GO: { variant: "success", label: "진행" },
  NO_GO: { variant: "destructive", label: "중단" },
  CONDITIONAL: { variant: "warning", label: "조건부 진행" },
  PENDING: { variant: "secondary", label: "대기" },
};

function ScoreBar({ score }: { score: number }) {
  const color =
    score >= 70
      ? "var(--axis-badge-success-text)"
      : score >= 40
        ? "var(--axis-badge-warning-text, #F59E0B)"
        : "var(--axis-badge-destructive-text, #EF4444)";

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-2 rounded-full bg-surface-secondary">
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${score}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-sm font-bold" style={{ color }}>
        {score}
      </span>
    </div>
  );
}

export function GatePackageEditor({ gatePackage }: GatePackageEditorProps) {
  const scorecard = gatePackage.scorecard;
  const decisionConfig = DECISION_BADGE[gatePackage.decision || "PENDING"] || DECISION_BADGE.PENDING;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-fg">
            {gatePackage.gateType} 패키지
          </h3>
          {gatePackage.autoDraftedAt && (
            <p className="text-xs text-fg-tertiary">
              자동 초안: {formatDate(gatePackage.autoDraftedAt)}
            </p>
          )}
        </div>
        <Badge variant={decisionConfig.variant}>{decisionConfig.label}</Badge>
      </div>

      {/* Readiness Score */}
      {scorecard && (
        <Card>
          <CardContent className="p-4">
            <h4 className="mb-2 text-sm font-medium text-fg">
              준비도 점수
            </h4>
            <ScoreBar score={scorecard.readinessScore} />

            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <ScoreItem
                label="강한 근거"
                value={`${scorecard.strongEvidenceCount}/${scorecard.evidenceCount}`}
              />
              <ScoreItem
                label="확인된 근거"
                value={`${scorecard.confirmedEvidenceCount}`}
              />
              <ScoreItem
                label="실험 완료"
                value={`${scorecard.completedExperimentCount}/${scorecard.experimentCount}`}
              />
              <ScoreItem
                label="방법론 실행"
                value={`${scorecard.methodRunCount}`}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* 비판적 검증 4종 (v1.4 §7.3) */}
      {scorecard?.criticalChecks && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-medium text-fg">
                비판적 검증 4종
              </h4>
              <Badge variant={scorecard.criticalChecks.passed ? "success" : "destructive"}>
                {scorecard.criticalChecks.passed ? "전체 통과" : "미통과"}
              </Badge>
            </div>
            {!scorecard.criticalChecks.passed && (
              <div className="mb-3 rounded-md border border-badge-destructive-text bg-surface-secondary p-2">
                <p className="text-xs font-medium" style={{ color: "var(--axis-badge-destructive-text, #EF4444)" }}>
                  비판적 검증을 통과하지 못해 승인을 요청할 수 없습니다. 아래 항목을 보완하세요.
                </p>
              </div>
            )}
            <div className="space-y-2">
              {scorecard.criticalChecks.checks.map((check) => (
                <CriticalCheckCard key={check.name} check={check} />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Evidence Summary */}
      {gatePackage.evidenceSummary && gatePackage.evidenceSummary.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h4 className="mb-2 text-sm font-medium text-fg">
              근거 요약 ({gatePackage.evidenceSummary.length}건)
            </h4>
            <div className="space-y-2">
              {gatePackage.evidenceSummary.map((ev) => (
                <div
                  key={ev.id}
                  className="flex items-start gap-2 rounded border border-line p-2"
                >
                  <Badge
                    variant={
                      ev.strength === "A" || ev.strength === "B"
                        ? "success"
                        : "secondary"
                    }
                  >
                    {ev.strength}급
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-fg">
                      {ev.content}
                    </p>
                    <div className="mt-0.5 flex gap-2 text-[10px] text-fg-tertiary">
                      <span>{ev.type}</span>
                      {ev.reliabilityLabel && <span>{ev.reliabilityLabel}</span>}
                      {!ev.hasSource && (
                        <span className="text-badge-destructive-text">
                          출처 누락
                        </span>
                      )}
                      {!ev.hasDate && (
                        <span className="text-badge-warning-text">
                          날짜 누락
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Assumptions */}
      {gatePackage.assumptions && gatePackage.assumptions.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h4 className="mb-2 text-sm font-medium text-fg">
              가정 ({gatePackage.assumptions.length}건)
            </h4>
            <div className="space-y-2">
              {gatePackage.assumptions.map((a) => (
                <div
                  key={a.id}
                  className="rounded border border-line p-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs text-fg">
                      {a.statement}
                    </p>
                    <Badge
                      variant={
                        a.status === "VALIDATED"
                          ? "success"
                          : a.status === "INVALIDATED"
                            ? "destructive"
                            : "secondary"
                      }
                    >
                      {a.status === "VALIDATED"
                        ? "검증됨"
                        : a.status === "INVALIDATED"
                          ? "반증됨"
                          : "미검증"}
                    </Badge>
                  </div>
                  {a.refutationQuestions && a.refutationQuestions.length > 0 && (
                    <p className="mt-1 text-[10px] text-fg-tertiary">
                      반증 질문: {a.refutationQuestions.join(", ")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Method Run Summary */}
      {gatePackage.methodRunSummary && gatePackage.methodRunSummary.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h4 className="mb-2 text-sm font-medium text-fg">
              방법론 실행 ({gatePackage.methodRunSummary.length}건)
            </h4>
            <div className="space-y-1">
              {gatePackage.methodRunSummary.map((run) => (
                <div
                  key={run.runId}
                  className="flex items-center justify-between rounded p-1.5 text-xs"
                >
                  <span className="text-fg">
                    {run.methodPackId}
                  </span>
                  <div className="flex items-center gap-2">
                    {run.completedAt && (
                      <span className="text-fg-tertiary">
                        {formatDate(run.completedAt)}
                      </span>
                    )}
                    {run.hasOutput ? (
                      <Badge variant="success">산출물 있음</Badge>
                    ) : (
                      <Badge variant="secondary">산출물 없음</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rationale */}
      {gatePackage.rationale && (
        <Card>
          <CardContent className="p-4">
            <h4 className="mb-2 text-sm font-medium text-fg">
              결정 근거
            </h4>
            <p className="text-sm text-fg-secondary">
              {gatePackage.rationale}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ScoreItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold text-fg">{value}</p>
      <p className="text-[10px] text-fg-tertiary">{label}</p>
    </div>
  );
}

const CRITICAL_CHECK_LABELS: Record<string, string> = {
  evidence_check: "Evidence Check",
  time_stress_test: "Time Stress Test",
  cross_context_test: "Cross-Context Test",
  ontology_consistency: "Ontology Consistency",
};

function CriticalCheckCard({ check }: { check: CriticalCheckItem }) {
  return (
    <div
      className="flex items-start gap-2 rounded border p-2"
      style={{
        borderColor: check.passed
          ? "var(--axis-badge-success-text, #22C55E)"
          : "var(--axis-badge-destructive-text, #EF4444)",
      }}
    >
      <span className="mt-0.5 text-sm">
        {check.passed ? "\u2705" : "\u274C"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-fg">
          {CRITICAL_CHECK_LABELS[check.name] || check.name}
        </p>
        <p className="text-[11px] text-fg-secondary">
          {check.message}
        </p>
      </div>
    </div>
  );
}
