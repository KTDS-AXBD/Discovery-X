import { useState } from "react";
import { Badge } from "~/components/ui/Badge";
import { cn } from "~/lib/utils/cn";
import { PipelineFlow } from "./PipelineFlow";
import { EvidenceChart } from "./EvidenceChart";
import { EvidenceCard } from "./EvidenceCard";

interface ToolExecutionProps {
  toolName: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
  isRunning?: boolean;
}

const TOOL_LABELS: Record<string, string> = {
  create_discovery: "Discovery 생성",
  update_discovery: "Discovery 수정",
  promote_discovery: "OPEN 승격",
  add_experiment: "실험 추가",
  complete_experiment: "실험 완료",
  add_evidence: "근거 추가",
  decide_next: "NEXT 결정",
  decide_not_now: "NOT_NOW 결정",
  decide_dead_end: "DEAD_END 결정",
  request_extension: "연장 요청",
  list_discoveries: "목록 조회",
  get_discovery_detail: "상세 조회",
  search_similar: "유사 검색",
  get_metrics: "지표 조회",
  get_radar_items: "Radar 조회",
  get_weekly_review: "주간 리뷰",
  get_recall_queue: "재검토 큐",
  list_users: "사용자 조회",
  generate_discovery_digest: "Discovery 리포트",
  get_experiment_context: "실험 컨텍스트",
  get_stage_info: "단계 정보",
  validate_evidence: "근거 검증",
  list_method_packs: "방법론 팩 목록",
  recommend_methods: "방법론 추천",
  start_method_run: "방법론 실행 시작",
  complete_method_run: "방법론 실행 완료",
  draft_gate_package: "Gate 패키지 초안",
  get_gate_package: "Gate 패키지 조회",
  extract_entities: "엔티티 추출",
  link_entities: "엔티티 연결",
  query_graph: "그래프 조회",
  get_duplicate_queue: "중복 큐 조회",
  review_duplicate: "중복 검토",
  register_kpi: "KPI 등록",
  record_kpi_measurement: "KPI 측정",
  get_kpi_status: "KPI 현황",
  get_pipeline_health: "파이프라인 건강도",
  link_discoveries: "Discovery 연결",
  get_linked_discoveries: "연결된 Discovery",
  request_gate_approval: "Gate 승인 요청",
  submit_gate_approval: "Gate 승인 제출",
  get_alerts: "알림 조회",
  acknowledge_alert: "알림 확인",
  manage_webhook: "웹훅 관리",
  transition_stage: "단계 전환",
  decide_gate: "Gate 결정",
  decide_hold: "보류 결정",
  decide_drop: "종료 결정",
};

const QUERY_TOOLS = new Set([
  "list_discoveries",
  "get_discovery_detail",
  "get_experiment_context",
  "search_similar",
  "get_metrics",
  "get_radar_items",
  "get_weekly_review",
  "get_recall_queue",
  "list_users",
  "get_stage_info",
  "validate_evidence",
  "list_method_packs",
  "get_gate_package",
  "query_graph",
  "get_duplicate_queue",
  "get_kpi_status",
  "get_pipeline_health",
  "get_linked_discoveries",
  "get_alerts",
]);

type ToolCategory = "query" | "mutation" | "error";

function getToolCategory(toolName: string, hasError: boolean): ToolCategory {
  if (hasError) return "error";
  if (QUERY_TOOLS.has(toolName)) return "query";
  return "mutation";
}

const CATEGORY_STYLES: Record<ToolCategory, { border: string; icon: string; bg: string }> = {
  query: {
    border: "border-l-[var(--axis-text-tertiary)]",
    icon: "\uD83D\uDCCB",
    bg: "bg-[var(--axis-surface-default)]",
  },
  mutation: {
    border: "border-l-[var(--axis-text-brand)]",
    icon: "\u270F\uFE0F",
    bg: "bg-[var(--axis-surface-default)]",
  },
  error: {
    border: "border-l-[var(--axis-text-error)]",
    icon: "\u26A0\uFE0F",
    bg: "bg-[var(--axis-surface-default)]",
  },
};

function DiscoveriesTable({ data }: { data: Record<string, unknown> }) {
  const discoveries = (data.discoveries || []) as Array<Record<string, unknown>>;
  if (discoveries.length === 0) return <p className="text-xs text-[var(--axis-text-tertiary)]">결과 없음</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-[var(--axis-border-default)]">
            <th className="py-1 pr-2 text-left font-medium">ID</th>
            <th className="py-1 pr-2 text-left font-medium">제목</th>
            <th className="py-1 pr-2 text-left font-medium">상태</th>
            <th className="py-1 text-left font-medium">기한</th>
          </tr>
        </thead>
        <tbody>
          {discoveries.map((d) => (
            <tr key={String(d.id)} className="border-b border-[var(--axis-border-subtle)]">
              <td className="py-1 pr-2 font-mono">{String(d.id).slice(0, 8)}</td>
              <td className="py-1 pr-2 max-w-[200px] truncate">{String(d.title)}</td>
              <td className="py-1 pr-2">
                <Badge variant="default" className="text-[10px]">{String(d.status)}</Badge>
              </td>
              <td className="py-1">{d.dueDate ? String(d.dueDate).slice(0, 10) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {"hasMore" in data && Boolean(data.hasMore) && (
        <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">더 많은 결과가 있습니다</p>
      )}
    </div>
  );
}

function MetricsView({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      {Object.entries(data).map(([key, value]) => (
        <div key={key} className="flex justify-between rounded bg-[var(--axis-surface-secondary)] px-2 py-1">
          <span className="text-[var(--axis-text-secondary)]">{key}</span>
          <span className="font-medium">{typeof value === "object" ? JSON.stringify(value) : String(value)}</span>
        </div>
      ))}
    </div>
  );
}

function SearchResults({ data }: { data: Record<string, unknown> }) {
  const results = (data.results || []) as Array<Record<string, unknown>>;
  if (results.length === 0) return <p className="text-xs text-[var(--axis-text-tertiary)]">일치하는 결과 없음</p>;
  return (
    <ul className="space-y-1 text-xs">
      {results.map((r) => (
        <li key={String(r.id)} className="flex items-center gap-2">
          <span className="font-mono text-[var(--axis-text-tertiary)]">{String(r.id).slice(0, 8)}</span>
          <span>{String(r.title)}</span>
          <Badge variant="default" className="text-[10px]">{String(r.status)}</Badge>
        </li>
      ))}
    </ul>
  );
}

function DetailCard({ data }: { data: Record<string, unknown> }) {
  const discovery = data.discovery as Record<string, unknown> | undefined;
  const exps = (data.experiments || []) as Array<Record<string, unknown>>;
  const evs = (data.evidence || []) as Array<Record<string, unknown>>;
  if (!discovery) return null;

  // Evidence strength distribution for chart
  const strengthDist: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const e of evs) {
    const s = String(e.strength);
    if (s in strengthDist) strengthDist[s]++;
  }

  return (
    <div className="space-y-2 text-xs">
      {/* Pipeline flow diagram */}
      {!!discovery.status && (
        <PipelineFlow currentStatus={String(discovery.status)} />
      )}
      <div className="rounded bg-[var(--axis-surface-secondary)] p-2">
        <div className="font-medium">{String(discovery.title)}</div>
        <div className="mt-1 text-[var(--axis-text-secondary)]">{String(discovery.seedSummary || "")}</div>
        <div className="mt-1 flex gap-2">
          <Badge variant="default" className="text-[10px]">{String(discovery.status)}</Badge>
          <span>Owner: {String(discovery.ownerId || "미지정")}</span>
        </div>
      </div>
      {exps.length > 0 && (
        <div>
          <div className="font-medium mb-1">실험 ({exps.length})</div>
          {exps.map((e) => (
            <div key={String(e.id)} className="ml-2 border-l-2 border-[var(--axis-border-default)] pl-2 mb-1">
              <span>{String(e.hypothesis)}</span>
              {e.completed ? <Badge variant="success" className="ml-1 text-[10px]">완료</Badge> : null}
            </div>
          ))}
        </div>
      )}
      {evs.length > 0 && (
        <div>
          <div className="font-medium mb-1">근거 ({evs.length})</div>
          <EvidenceChart distribution={strengthDist} total={evs.length} />
          {evs.map((e) => (
            <EvidenceCard key={String(e.id)} evidence={e} />
          ))}
        </div>
      )}
    </div>
  );
}

function DigestView({ data }: { data: Record<string, unknown> }) {
  if (!data.digest) return null;
  return (
    <div className="text-xs text-[var(--axis-text-secondary)]">
      <p>리포트가 Agent 응답에 포함됩니다.</p>
    </div>
  );
}

function formatResult(toolName: string, result: Record<string, unknown>) {
  switch (toolName) {
    case "list_discoveries":
      return <DiscoveriesTable data={result} />;
    case "get_discovery_detail":
      return <DetailCard data={result} />;
    case "get_metrics":
      return <MetricsView data={result} />;
    case "search_similar":
      return <SearchResults data={result} />;
    case "generate_discovery_digest":
      return <DigestView data={result} />;
    default:
      return null;
  }
}

export function ToolExecution({ toolName, result, isRunning }: ToolExecutionProps) {
  const label = TOOL_LABELS[toolName] || toolName;
  const hasError = "error" in result;
  const isQuery = QUERY_TOOLS.has(toolName);
  const category = getToolCategory(toolName, hasError);
  const styles = CATEGORY_STYLES[category];
  // Queries default collapsed, mutations default expanded
  const [expanded, setExpanded] = useState(!isQuery);
  const [showJson, setShowJson] = useState(false);

  if (isRunning) {
    return (
      <div className={cn(
        "my-1.5 rounded-lg border border-[var(--axis-border-default)] border-l-4 p-3",
        "border-l-[var(--axis-text-brand)] bg-[var(--axis-surface-default)]",
      )}>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-sm">{styles.icon}</span>
          <span className="font-medium text-[var(--axis-text-primary)]">{label}</span>
          <Badge variant="default" className="text-[10px] animate-pulse">실행 중...</Badge>
        </div>
      </div>
    );
  }

  const formattedResult = !hasError ? formatResult(toolName, result) : null;
  const hasContent = formattedResult || (!hasError && Object.keys(result).length > 0);

  return (
    <div className={cn(
      "my-1.5 rounded-lg border border-[var(--axis-border-default)] border-l-4 p-3",
      styles.border,
      styles.bg,
    )}>
      <div
        className="flex cursor-pointer items-center gap-2 text-xs"
        role="button"
        aria-expanded={expanded}
        tabIndex={0}
        onClick={() => hasContent && setExpanded(!expanded)}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && hasContent) {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
      >
        <span className="text-sm">{styles.icon}</span>
        <span className="font-medium text-[var(--axis-text-primary)]">{label}</span>
        {hasError ? (
          <>
            <Badge variant="error" className="text-[10px]">오류</Badge>
            <span className="text-[var(--axis-text-error)] truncate max-w-[200px]">{String(result.error)}</span>
          </>
        ) : (
          <Badge variant="success" className="text-[10px]">완료</Badge>
        )}
        {hasContent && (
          <span className="ml-auto text-[var(--axis-text-tertiary)] text-[10px]">
            {expanded ? "▲ 접기" : "▼ 펼치기"}
          </span>
        )}
      </div>

      {/* Mutation summary (always visible) */}
      {!isQuery && !hasError && "discoveryId" in result && (
        <div className="mt-1.5 text-xs text-[var(--axis-text-secondary)]">
          Discovery: {String(result.discoveryId as string).slice(0, 8)}...
          {"status" in result && ` → ${String(result.status)}`}
        </div>
      )}

      {/* Suggestion on error */}
      {hasError && "suggestion" in result && (
        <div className="mt-1.5 text-xs text-[var(--axis-text-secondary)]">
          {String(result.suggestion)}
        </div>
      )}

      {/* Expanded content */}
      {expanded && hasContent && (
        <div className="mt-2 border-t border-[var(--axis-border-subtle)] pt-2">
          {!showJson && formattedResult ? (
            formattedResult
          ) : (
            <pre className="max-h-64 overflow-auto rounded-lg bg-[var(--axis-surface-secondary)] p-2 text-[11px] leading-relaxed">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
          <div className="mt-1 flex justify-end">
            <button
              onClick={(e) => { e.stopPropagation(); setShowJson(!showJson); }}
              className="text-[10px] text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-secondary)]"
            >
              {showJson ? "포맷 보기" : "JSON 보기"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
