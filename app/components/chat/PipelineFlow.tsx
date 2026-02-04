import { STATUS_CONFIG, STAGE_CATEGORIES } from "~/lib/constants/status";

interface PipelineFlowProps {
  currentStatus: string;
}

const PIPELINE_STAGES = [
  // Row 1: Ideation + Validation
  { id: "DISCOVERY", row: 0, col: 0 },
  { id: "IDEA_CARD", row: 0, col: 1 },
  { id: "HYPOTHESIS", row: 0, col: 2 },
  { id: "EXPERIMENT", row: 0, col: 3 },
  { id: "EVIDENCE_REVIEW", row: 0, col: 4 },
  // Row 2: Execution + Terminal
  { id: "GATE1", row: 1, col: 0 },
  { id: "SPRINT", row: 1, col: 1 },
  { id: "GATE2", row: 1, col: 2 },
  { id: "HANDOFF", row: 1, col: 3 },
  { id: "HOLD", row: 1, col: 4 },
  { id: "DROP", row: 1, col: 5 },
];

const NODE_W = 88;
const NODE_H = 32;
const GAP_X = 12;
const GAP_Y = 16;
const PAD = 8;

function getStageOrder(status: string): number {
  return STATUS_CONFIG[status]?.order ?? 99;
}

export function PipelineFlow({ currentStatus }: PipelineFlowProps) {
  const currentOrder = getStageOrder(currentStatus);

  const maxCol = Math.max(...PIPELINE_STAGES.map((s) => s.col));
  const svgWidth = (maxCol + 1) * (NODE_W + GAP_X) - GAP_X + PAD * 2;
  const svgHeight = 2 * (NODE_H + GAP_Y) - GAP_Y + PAD * 2;

  return (
    <div className="my-2 overflow-x-auto">
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="text-xs"
      >
        {/* Connection arrows within same row */}
        {PIPELINE_STAGES.map((stage, i) => {
          const next = PIPELINE_STAGES[i + 1];
          if (!next || next.row !== stage.row) return null;

          const x1 = PAD + stage.col * (NODE_W + GAP_X) + NODE_W;
          const y1 = PAD + stage.row * (NODE_H + GAP_Y) + NODE_H / 2;
          const x2 = PAD + next.col * (NODE_W + GAP_X);
          const y2 = y1;

          const stageOrder = getStageOrder(stage.id);
          const isPast = stageOrder < currentOrder;

          return (
            <line
              key={`${stage.id}-${next.id}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={isPast ? "var(--axis-text-brand)" : "var(--axis-border-default)"}
              strokeWidth={isPast ? 2 : 1}
              strokeDasharray={isPast ? "none" : "4 2"}
            />
          );
        })}

        {/* Row connector: EVIDENCE_REVIEW → GATE1 */}
        {(() => {
          const erStage = PIPELINE_STAGES.find((s) => s.id === "EVIDENCE_REVIEW")!;
          const g1Stage = PIPELINE_STAGES.find((s) => s.id === "GATE1")!;
          const x1 = PAD + erStage.col * (NODE_W + GAP_X) + NODE_W / 2;
          const y1 = PAD + erStage.row * (NODE_H + GAP_Y) + NODE_H;
          const x2 = PAD + g1Stage.col * (NODE_W + GAP_X) + NODE_W / 2;
          const y2 = PAD + g1Stage.row * (NODE_H + GAP_Y);
          const isPast = getStageOrder("EVIDENCE_REVIEW") < currentOrder;
          return (
            <path
              d={`M ${x1} ${y1} C ${x1} ${y1 + 12}, ${x2} ${y2 - 12}, ${x2} ${y2}`}
              fill="none"
              stroke={isPast ? "var(--axis-text-brand)" : "var(--axis-border-default)"}
              strokeWidth={isPast ? 2 : 1}
              strokeDasharray={isPast ? "none" : "4 2"}
            />
          );
        })()}

        {/* Stage nodes */}
        {PIPELINE_STAGES.map((stage) => {
          const config = STATUS_CONFIG[stage.id];
          if (!config) return null;

          const x = PAD + stage.col * (NODE_W + GAP_X);
          const y = PAD + stage.row * (NODE_H + GAP_Y);
          const stageOrder = config.order;
          const isCurrent = stage.id === currentStatus;
          const isPast = stageOrder < currentOrder;
          const isFuture = stageOrder > currentOrder && !isCurrent;
          const isTerminal = stage.id === "HOLD" || stage.id === "DROP";

          let fillColor = "var(--axis-surface-secondary)";
          let strokeColor = "var(--axis-border-default)";
          let textColor = "var(--axis-text-tertiary)";
          let strokeWidth = 1;

          if (isCurrent) {
            const cat = STAGE_CATEGORIES[config.category];
            fillColor = "var(--axis-surface-brand)";
            strokeColor = cat?.color || "var(--axis-text-brand)";
            textColor = "var(--axis-text-brand)";
            strokeWidth = 2;
          } else if (isPast) {
            fillColor = "var(--axis-surface-secondary)";
            strokeColor = "var(--axis-text-brand)";
            textColor = "var(--axis-text-secondary)";
            strokeWidth = 1.5;
          } else if (isTerminal && !isCurrent) {
            fillColor = "var(--axis-surface-secondary)";
            textColor = "var(--axis-text-tertiary)";
          }

          return (
            <g key={stage.id}>
              <rect
                x={x}
                y={y}
                width={NODE_W}
                height={NODE_H}
                rx={6}
                fill={fillColor}
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeDasharray={isFuture && !isTerminal ? "4 2" : "none"}
              />
              {/* Checkmark for past stages */}
              {isPast && !isCurrent && (
                <text
                  x={x + 8}
                  y={y + NODE_H / 2 + 1}
                  fill="var(--axis-text-brand)"
                  fontSize={10}
                  dominantBaseline="middle"
                >
                  &#x2713;
                </text>
              )}
              {/* Current indicator */}
              {isCurrent && (
                <circle
                  cx={x + 10}
                  cy={y + NODE_H / 2}
                  r={3}
                  fill="var(--axis-text-brand)"
                />
              )}
              <text
                x={isPast ? x + 20 : isCurrent ? x + 18 : x + NODE_W / 2}
                y={y + NODE_H / 2 + 1}
                fill={textColor}
                fontSize={10}
                fontWeight={isCurrent ? 600 : 400}
                dominantBaseline="middle"
                textAnchor={isPast || isCurrent ? "start" : "middle"}
              >
                {config.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
