/**
 * AlertList: displays alert cards with severity colors and acknowledge button.
 */

import { useFetcher } from "@remix-run/react";
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { Card, CardContent } from "~/components/ui/Card";
import { formatDateTime } from "~/lib/format-date";

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
      return "border-l-4 border-l-[var(--dx-severity-critical)]";
    case "warning":
      return "border-l-4 border-l-[var(--dx-severity-warning)]";
    default:
      return "border-l-4 border-l-[var(--dx-severity-info)]";
  }
}

function formatDateLocal(iso: string): string {
  return formatDateTime(iso);
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
                    {formatDateLocal(alert.firedAt)}
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
                  <Button
                    type="submit"
                    variant="secondary"
                    size="sm"
                    disabled={isAcking}
                    className="shrink-0"
                  >
                    {isAcking ? "..." : "확인"}
                  </Button>
                </fetcher.Form>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
