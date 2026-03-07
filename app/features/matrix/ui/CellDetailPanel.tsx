import type { CellDetail, ConsensusScoreView, LinkedTopic } from "~/features/matrix/types";
import { getScoreLevel, getScoreColor, STAGE_GATE_MAP, STAGE_GATE_LABELS } from "~/features/matrix/types";
import { Card, CardSection } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";

// ─── Props ───
interface CellDetailPanelProps {
  cell: CellDetail;
  topics: LinkedTopic[];
  consensus: ConsensusScoreView | null;
}

// ─── 시간지평선 레이블 ───
const TIME_HORIZON_LABELS: Record<string, string> = {
  short: "단기 (0~3개월)",
  mid: "중기 (1~2년)",
  long: "장기 (3년 이내)",
};

// ─── 셀 상태 레이블 ───
const STATUS_LABELS: Record<string, string> = {
  active: "활성",
  watching: "관찰중",
  paused: "중단",
  archived: "보관",
};

// ─── 매출 단위 레이블 ───
const REVENUE_UNIT_LABELS: Record<string, string> = {
  krw_100m: "억원",
  usd_1k: "K USD",
  custom: "",
};

// ─── Pipeline Stage 배지 색상 ───
function getStageBadgeClass(stage: string): string {
  const gate = (STAGE_GATE_MAP as Record<string, string>)[stage] ?? "S0";
  switch (gate) {
    case "S0": return "bg-gray-100 text-gray-700";
    case "S1": return "bg-blue-100 text-blue-700";
    case "S2": return "bg-amber-100 text-amber-700";
    case "S3": return "bg-purple-100 text-purple-700";
    case "S4": return "bg-green-100 text-green-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

// ─── 우선순위 시각화 ───
function PriorityDots({ priority }: { priority: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={`inline-block h-2 w-2 rounded-full ${
            i < priority
              ? "bg-lab-accent"
              : "bg-line-subtle"
          }`}
        />
      ))}
    </span>
  );
}

// ─── 스코어 바 ───
function ScoreBar({ label, score, maxScore = 5 }: { label: string; score: number; maxScore?: number }) {
  const pct = Math.min(100, (score / maxScore) * 100);
  const level = getScoreLevel(score);
  const color = getScoreColor(level);

  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs text-fg-muted font-mono-dx">
        {label}
      </span>
      <div className="flex-1 h-2 rounded-full bg-line-subtle overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
      <span
        className="w-10 text-right text-xs font-semibold font-mono-dx"
        style={{ color }}
      >
        {score.toFixed(1)}
      </span>
    </div>
  );
}

// ─── 메인 컴포넌트 ───
export function CellDetailPanel({ cell, topics, consensus }: CellDetailPanelProps) {
  const stageGate = (STAGE_GATE_MAP as Record<string, string>)[cell.pipelineStage] ?? "S0";
  const stageLabel = STAGE_GATE_LABELS[stageGate] ?? cell.pipelineStage;
  const compositeScore = consensus?.compositeScore ?? null;
  const scoreLevel = getScoreLevel(compositeScore);
  const scoreColor = getScoreColor(scoreLevel);

  return (
    <Card className="overflow-hidden">
      {/* ─── 헤더: 산업 × 기능 + Stage 배지 ─── */}
      <div className="px-5 pt-5 pb-3 border-b border-line-subtle">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-fg font-mono-dx">
              {cell.industryName} × {cell.functionName}
            </h2>
            <p className="mt-1 text-xs text-fg-muted">
              {TIME_HORIZON_LABELS[cell.timeHorizon] ?? cell.timeHorizon}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${getStageBadgeClass(cell.pipelineStage)}`}>
              {stageGate} · {stageLabel}
            </span>
            <Badge variant="subtle">
              {STATUS_LABELS[cell.status] ?? cell.status}
            </Badge>
          </div>
        </div>
      </div>

      {/* ─── 스코어 요약 ─── */}
      <CardSection title="종합 스코어">
        {consensus ? (
          <div className="space-y-3">
            <div className="flex items-end gap-3">
              <span
                className="text-4xl font-bold font-mono-dx leading-none"
                style={{ color: scoreColor }}
              >
                {compositeScore?.toFixed(2) ?? "—"}
              </span>
              <span className="text-xs text-fg-muted pb-1">
                / 5.00
                {consensus.prevComposite !== null && (
                  <span className="ml-2">
                    {consensus.compositeScore - consensus.prevComposite > 0 ? "▲" : "▼"}
                    {Math.abs(consensus.compositeScore - consensus.prevComposite).toFixed(2)}
                  </span>
                )}
              </span>
            </div>
            <ScoreBar label="C-Level" score={consensus.clevelScore} />
            <ScoreBar label="Execution" score={consensus.executionScore} />
            <div className="flex items-center gap-4 text-xs text-fg-muted">
              <span>시그널 보정: {consensus.signalAdjustment >= 0 ? "+" : ""}{consensus.signalAdjustment.toFixed(2)}</span>
              <span>참여자: {consensus.participantCount}명</span>
              {consensus.deviation !== null && (
                <span>편차: {consensus.deviation.toFixed(2)}</span>
              )}
              <Badge variant={consensus.status === "confirmed" ? "default" : "subtle"}>
                {consensus.status === "confirmed" ? "확정" : consensus.status === "revised" ? "수정" : "초안"}
              </Badge>
            </div>
          </div>
        ) : (
          <p className="text-sm text-fg-muted">
            아직 합의 스코어가 없습니다. 개별 스코어를 입력하세요.
          </p>
        )}
      </CardSection>

      {/* ─── 메타 정보 ─── */}
      <CardSection title="상세 정보">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <div>
            <dt className="text-xs text-fg-muted">담당자</dt>
            <dd className="font-medium">{cell.ownerName ?? "미지정"}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">우선순위</dt>
            <dd><PriorityDots priority={cell.priority} /></dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">매출 잠재력</dt>
            <dd className="font-medium font-mono-dx">
              {cell.revenuePotential !== null
                ? `${cell.revenuePotential}${REVENUE_UNIT_LABELS[cell.revenueUnit] ?? ""}`
                : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">시간지평선</dt>
            <dd className="font-medium">{TIME_HORIZON_LABELS[cell.timeHorizon] ?? cell.timeHorizon}</dd>
          </div>
        </dl>
        {cell.description && (
          <p className="mt-3 text-sm text-fg-secondary">
            {cell.description}
          </p>
        )}
      </CardSection>

      {/* ─── 연결 토픽 ─── */}
      {topics.length > 0 && (
        <CardSection title={`연결된 토픽 (${topics.length})`}>
          <ul className="space-y-1.5">
            {topics.map((t) => (
              <li
                key={t.topicId}
                className="flex items-center justify-between text-sm"
              >
                <span className="text-fg">{t.topicName}</span>
                <span className="text-xs text-fg-muted font-mono-dx">
                  {(t.relevance * 100).toFixed(0)}%
                </span>
              </li>
            ))}
          </ul>
        </CardSection>
      )}

      {/* ─── 태그 ─── */}
      {cell.tags.length > 0 && (
        <CardSection>
          <div className="flex flex-wrap gap-1.5">
            {cell.tags.map((tag) => (
              <Badge key={tag} variant="subtle" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </CardSection>
      )}
    </Card>
  );
}
