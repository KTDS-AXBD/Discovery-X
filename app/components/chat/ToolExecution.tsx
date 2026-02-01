import { useState } from "react";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { Badge } from "~/components/ui/Badge";

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
};

const QUERY_TOOLS = new Set([
  "list_discoveries",
  "get_discovery_detail",
  "search_similar",
  "get_metrics",
  "get_radar_items",
  "get_weekly_review",
  "get_recall_queue",
  "list_users",
]);

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

  return (
    <div className="space-y-2 text-xs">
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
          {evs.map((e) => (
            <div key={String(e.id)} className="ml-2 text-[var(--axis-text-secondary)]">
              [{String(e.type)}/{String(e.strength)}] {String(e.content)}
            </div>
          ))}
        </div>
      )}
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
    default:
      return null;
  }
}

export function ToolExecution({ toolName, result, isRunning }: ToolExecutionProps) {
  const label = TOOL_LABELS[toolName] || toolName;
  const hasError = "error" in result;
  const isQuery = QUERY_TOOLS.has(toolName);
  // Queries default collapsed, mutations default expanded
  const [expanded, setExpanded] = useState(!isQuery);
  const [showJson, setShowJson] = useState(false);

  if (isRunning) {
    return (
      <AlertBanner variant="default" className="my-1">
        <div className="flex items-center gap-2 text-xs">
          <Badge variant="info" className="text-[10px] animate-pulse">도구</Badge>
          <span className="font-medium">{label}</span>
          <Badge variant="default" className="text-[10px]">실행 중...</Badge>
        </div>
      </AlertBanner>
    );
  }

  const formattedResult = !hasError ? formatResult(toolName, result) : null;
  const hasContent = formattedResult || (!hasError && Object.keys(result).length > 0);

  return (
    <AlertBanner
      variant={hasError ? "destructive" : isQuery ? "default" : "info"}
      className="my-1"
    >
      <div
        className="flex cursor-pointer items-center gap-2 text-xs"
        onClick={() => hasContent && setExpanded(!expanded)}
      >
        <Badge variant={hasError ? "error" : "info"} className="text-[10px]">
          도구
        </Badge>
        <span className="font-medium">{label}</span>
        {hasError ? (
          <>
            <Badge variant="error" className="text-[10px]">오류</Badge>
            <span className="text-[var(--axis-text-error)] truncate">{String(result.error)}</span>
          </>
        ) : (
          <Badge variant="success" className="text-[10px]">완료</Badge>
        )}
        {hasContent && (
          <span className="ml-auto text-[var(--axis-text-tertiary)]">
            {expanded ? "▲" : "▼"}
          </span>
        )}
      </div>

      {/* Mutation summary (always visible) */}
      {!isQuery && !hasError && "discoveryId" in result && (
        <div className="mt-1 text-xs text-[var(--axis-text-secondary)]">
          Discovery: {String(result.discoveryId as string).slice(0, 8)}...
          {"status" in result && ` → ${String(result.status)}`}
        </div>
      )}

      {/* Suggestion on error */}
      {hasError && "suggestion" in result && (
        <div className="mt-1 text-xs text-[var(--axis-text-secondary)]">
          {String(result.suggestion)}
        </div>
      )}

      {/* Expanded content */}
      {expanded && hasContent && (
        <div className="mt-2 border-t border-[var(--axis-border-subtle)] pt-2">
          {!showJson && formattedResult ? (
            formattedResult
          ) : (
            <pre className="max-h-64 overflow-auto rounded bg-[var(--axis-surface-secondary)] p-2 text-[11px] leading-relaxed">
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
    </AlertBanner>
  );
}
