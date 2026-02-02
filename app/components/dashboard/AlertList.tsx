/**
 * AlertList: displays alert cards with severity colors and acknowledge button.
 */

import { useFetcher } from "@remix-run/react";
import { Badge } from "~/components/ui/Badge";
import { Card, CardContent } from "~/components/ui/Card";

interface AlertItem {
  id: string;
  severity: string;
  message: string;
  discoveryId: string | null;
  acknowledged: boolean;
  firedAt: string;
  acknowledgedAt: string | null;
}

interface AlertListProps {
  alerts: AlertItem[];
}

function severityVariant(severity: string) {
  switch (severity) {
    case "critical":
      return "destructive" as const;
    case "warning":
      return "warning" as const;
    default:
      return "secondary" as const;
  }
}

function severityBorder(severity: string) {
  switch (severity) {
    case "critical":
      return "border-l-4 border-l-red-500";
    case "warning":
      return "border-l-4 border-l-amber-500";
    default:
      return "border-l-4 border-l-blue-500";
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AlertList({ alerts }: AlertListProps) {
  const fetcher = useFetcher();

  if (alerts.length === 0) {
    return (
      <div className="py-12 text-center text-[var(--axis-text-tertiary)]">
        알림이 없습니다.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {alerts.map((alert, i) => {
        const isAcking =
          fetcher.state !== "idle" &&
          fetcher.formData?.get("alertId") === alert.id;

        return (
          <Card
            key={alert.id}
            className={`${severityBorder(alert.severity)} ${
              alert.acknowledged ? "opacity-60" : ""
            }`}
            style={{
              animation: `fadeSlideIn 0.3s ease-out ${i * 60}ms both`,
            }}
          >
            <CardContent className="flex items-start gap-3 py-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant={severityVariant(alert.severity)}>
                    {alert.severity.toUpperCase()}
                  </Badge>
                  {alert.acknowledged && (
                    <span className="text-xs text-[var(--axis-text-tertiary)]">
                      확인됨
                    </span>
                  )}
                  <span className="ml-auto text-xs text-[var(--axis-text-tertiary)]">
                    {formatDate(alert.firedAt)}
                  </span>
                </div>
                <p className="text-sm text-[var(--axis-text-primary)] leading-relaxed">
                  {alert.message}
                </p>
                {alert.discoveryId && (
                  <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                    Discovery: {alert.discoveryId}
                  </p>
                )}
              </div>
              {!alert.acknowledged && (
                <fetcher.Form method="post">
                  <input type="hidden" name="alertId" value={alert.id} />
                  <input type="hidden" name="_action" value="acknowledge" />
                  <button
                    type="submit"
                    disabled={isAcking}
                    className="shrink-0 rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-1.5 text-xs font-medium text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-tertiary)] transition-colors disabled:opacity-50"
                  >
                    {isAcking ? "..." : "확인"}
                  </button>
                </fetcher.Form>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
