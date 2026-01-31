import { AlertBanner } from "~/components/ui/AlertBanner";
import { Badge } from "~/components/ui/Badge";

interface ToolExecutionProps {
  toolName: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
}

const TOOL_LABELS: Record<string, string> = {
  create_discovery: "Discovery 생성",
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
  list_users: "사용자 조회",
};

export function ToolExecution({ toolName, result }: ToolExecutionProps) {
  const label = TOOL_LABELS[toolName] || toolName;
  const hasError = "error" in result;
  const isQuery = [
    "list_discoveries",
    "get_discovery_detail",
    "search_similar",
    "get_metrics",
    "get_radar_items",
    "list_users",
  ].includes(toolName);

  return (
    <AlertBanner
      variant={hasError ? "destructive" : isQuery ? "default" : "info"}
      className="my-1"
    >
      <div className="flex items-center gap-2 text-xs">
        <Badge variant={hasError ? "error" : "info"} className="text-[10px]">
          도구
        </Badge>
        <span className="font-medium">{label}</span>
        {hasError ? (
          <span className="text-[var(--axis-text-error)]">
            실패: {String(result.error)}
          </span>
        ) : (
          <span className="text-[var(--axis-text-success)]">완료</span>
        )}
      </div>
      {!isQuery && !hasError && "discoveryId" in result && (
        <div className="mt-1 text-xs text-[var(--axis-text-secondary)]">
          Discovery: {String(result.discoveryId as string).slice(0, 8)}...
          {"status" in result && ` → ${String(result.status)}`}
        </div>
      )}
    </AlertBanner>
  );
}
