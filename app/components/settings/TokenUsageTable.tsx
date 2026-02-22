/**
 * Recent token usage log table — shows last 50 API calls.
 */

import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";

interface LogEntry {
  id: string;
  mode: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  toolRounds: number;
  createdAt: string | number | null;
}

interface TokenUsageTableProps {
  logs: LogEntry[];
  modeFilter: string;
  onModeChange: (mode: string) => void;
}

const MODE_LABELS: Record<string, string> = {
  all: "전체",
  default: "기본",
  ideas: "Ideas",
  direct: "전용 분석",
};

const MODE_BADGE_VARIANT: Record<string, "default" | "info" | "success" | "warning"> = {
  default: "default",
  ideas: "success",
  direct: "warning",
};

function formatTimestamp(ts: string | number | null): string {
  if (!ts) return "-";
  const d = typeof ts === "number" ? new Date(ts * 1000) : new Date(ts);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${month}-${day} ${hours}:${minutes}`;
}

function formatModel(model: string): string {
  if (model.includes("haiku")) return "Haiku";
  if (model.includes("opus")) return "Opus";
  if (model.includes("sonnet")) return "Sonnet";
  return model.split("-").slice(0, 2).join(" ");
}

export function TokenUsageTable({ logs, modeFilter, onModeChange }: TokenUsageTableProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">최근 사용 로그</CardTitle>
          <div className="flex gap-1">
            {Object.entries(MODE_LABELS).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => onModeChange(key)}
                className={`rounded px-2 py-0.5 text-xs ${
                  modeFilter === key
                    ? "bg-surface-brand text-fg-brand"
                    : "text-fg-tertiary hover:bg-surface-secondary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <p className="py-4 text-center text-sm text-fg-tertiary">
            사용 기록이 없습니다.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-line">
                  <th className="pb-2 pr-3 font-medium text-fg-tertiary">시간</th>
                  <th className="pb-2 pr-3 font-medium text-fg-tertiary">모드</th>
                  <th className="pb-2 pr-3 font-medium text-fg-tertiary">모델</th>
                  <th className="pb-2 pr-3 text-right font-medium text-fg-tertiary">입력</th>
                  <th className="pb-2 pr-3 text-right font-medium text-fg-tertiary">출력</th>
                  <th className="pb-2 text-right font-medium text-fg-tertiary">합계</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-line/50"
                  >
                    <td className="py-1.5 pr-3 text-fg-secondary">
                      {formatTimestamp(log.createdAt)}
                    </td>
                    <td className="py-1.5 pr-3">
                      <Badge variant={MODE_BADGE_VARIANT[log.mode] || "default"} className="text-[10px]">
                        {MODE_LABELS[log.mode] || log.mode}
                      </Badge>
                    </td>
                    <td className="py-1.5 pr-3 text-fg-secondary">
                      {formatModel(log.model)}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-fg-secondary">
                      {log.inputTokens.toLocaleString()}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-fg-secondary">
                      {log.outputTokens.toLocaleString()}
                    </td>
                    <td className="py-1.5 text-right tabular-nums font-medium text-fg">
                      {log.totalTokens.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
