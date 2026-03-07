import { Badge } from "~/components/ui/Badge";
import { formatDate } from "~/lib/format-date";

interface MethodRun {
  id: string;
  methodPackId: string;
  methodPackName: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
}

interface MethodRunTimelineProps {
  runs: MethodRun[];
}

const STATUS_BADGE: Record<string, { variant: "warning" | "success" | "destructive"; label: string }> = {
  RUNNING: { variant: "warning", label: "진행 중" },
  COMPLETED: { variant: "success", label: "완료" },
  FAILED: { variant: "destructive", label: "실패" },
};

export function MethodRunTimeline({ runs }: MethodRunTimelineProps) {
  if (runs.length === 0) {
    return (
      <p className="text-sm text-fg-tertiary">
        아직 실행된 방법론이 없습니다.
      </p>
    );
  }

  return (
    <div className="relative space-y-4">
      {/* Timeline line */}
      <div className="absolute left-3 top-2 bottom-2 w-px bg-line" />

      {runs.map((run) => {
        const statusConfig = STATUS_BADGE[run.status] || STATUS_BADGE.RUNNING;

        return (
          <div key={run.id} className="relative flex gap-3 pl-8">
            {/* Timeline dot */}
            <div
              className="absolute left-1.5 top-1.5 h-3 w-3 rounded-full border-2 border-surface"
              style={{
                backgroundColor:
                  run.status === "COMPLETED"
                    ? "var(--axis-badge-success-text)"
                    : run.status === "FAILED"
                      ? "var(--axis-badge-destructive-text, #EF4444)"
                      : "var(--axis-badge-warning-text, #F59E0B)",
              }}
            />

            <div className="min-w-0 flex-1 rounded-lg border border-line bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <span className="text-xs text-fg-tertiary">
                    {run.methodPackId}
                  </span>
                  <h4 className="text-sm font-medium text-fg">
                    {run.methodPackName}
                  </h4>
                </div>
                <Badge variant={statusConfig.variant}>{statusConfig.label}</Badge>
              </div>

              <div className="mt-1 flex gap-3 text-[10px] text-fg-tertiary">
                <span>
                  시작: {formatDate(run.startedAt)}
                </span>
                {run.completedAt && (
                  <span>
                    완료: {formatDate(run.completedAt)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
