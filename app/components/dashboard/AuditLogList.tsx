/**
 * AuditLogList: displays event log cards with event type colors and metadata.
 */

import { Link } from "@remix-run/react";
import { Badge } from "~/components/ui/Badge";
import { Card, CardContent } from "~/components/ui/Card";

interface AuditLogItem {
  id: string;
  eventType: string;
  actorId: string;
  actorName: string;
  discoveryId: string;
  discoveryTitle: string;
  metadata: Record<string, unknown> | null;
  timestamp: string;
}

interface AuditLogListProps {
  logs: AuditLogItem[];
}

type BadgeVariant = "success" | "info" | "warning" | "destructive" | "secondary" | "purple";

const EVENT_TYPE_MAP: Record<string, { label: string; border: string; variant: BadgeVariant }> = {
  CREATE_DISCOVERY: { label: "Discovery \uC0DD\uC131", border: "border-l-emerald-500", variant: "success" },
  PROMOTE: { label: "\uC2B9\uACA9", border: "border-l-blue-500", variant: "info" },
  ADD_EXPERIMENT: { label: "\uC2E4\uD5D8 \uCD94\uAC00", border: "border-l-blue-400", variant: "info" },
  COMPLETE_EXPERIMENT: { label: "\uC2E4\uD5D8 \uC644\uB8CC", border: "border-l-teal-500", variant: "success" },
  ADD_EVIDENCE: { label: "\uADFC\uAC70 \uCD94\uAC00", border: "border-l-indigo-500", variant: "info" },
  DECIDE_NEXT: { label: "NEXT \uACB0\uC815", border: "border-l-green-600", variant: "success" },
  DECIDE_NOT_NOW: { label: "NOT NOW \uACB0\uC815", border: "border-l-amber-500", variant: "warning" },
  DECIDE_DEAD_END: { label: "DEAD END \uACB0\uC815", border: "border-l-red-500", variant: "destructive" },
  REQUEST_EXTENSION: { label: "\uC5F0\uC7A5 \uC694\uCCAD", border: "border-l-purple-500", variant: "purple" },
  CHANGE_OWNER: { label: "Owner \uBCC0\uACBD", border: "border-l-slate-500", variant: "secondary" },
  CHANGE_REVIEWER: { label: "Reviewer \uBCC0\uACBD", border: "border-l-slate-400", variant: "secondary" },
  CHANGE_GATEKEEPER: { label: "Gatekeeper \uBCC0\uACBD", border: "border-l-slate-400", variant: "secondary" },
  REQUEST_GATE_APPROVAL: { label: "Gate \uC2B9\uC778 \uC694\uCCAD", border: "border-l-violet-500", variant: "purple" },
  SUBMIT_GATE_DECISION: { label: "Gate \uACB0\uC815 \uC81C\uCD9C", border: "border-l-violet-600", variant: "purple" },
  AUTO_CLOSE: { label: "\uC790\uB3D9 \uC885\uB8CC", border: "border-l-red-400", variant: "destructive" },
  STAGE_TRANSITION: { label: "\uB2E8\uACC4 \uC804\uD658", border: "border-l-blue-600", variant: "info" },
};

function getEventMeta(eventType: string) {
  return EVENT_TYPE_MAP[eventType] || {
    label: eventType,
    border: "border-l-gray-400",
    variant: "secondary" as BadgeVariant,
  };
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatActorName(actorId: string, actorName: string): string {
  if (actorId === "system-agent" || actorId === "system-radar" || actorId === "system") {
    return "\uC2DC\uC2A4\uD15C";
  }
  return actorName;
}

function summarizeMetadata(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const parts: string[] = [];
  if (metadata.previousOwnerId && metadata.newOwnerId) {
    parts.push("Owner \uBCC0\uACBD");
  }
  if (metadata.decision) {
    parts.push(`\uACB0\uC815: ${metadata.decision}`);
  }
  if (metadata.fromStatus && metadata.toStatus) {
    parts.push(`${metadata.fromStatus} \u2192 ${metadata.toStatus}`);
  }
  if (metadata.reason) {
    parts.push(String(metadata.reason));
  }
  return parts.length > 0 ? parts.join(" | ") : null;
}

export function AuditLogList({ logs }: AuditLogListProps) {
  if (logs.length === 0) {
    return (
      <div className="py-12 text-center text-[var(--axis-text-tertiary)]">
        {"\uC774\uBCA4\uD2B8 \uB85C\uADF8\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4."}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log, i) => {
        const meta = getEventMeta(log.eventType);
        const metaSummary = summarizeMetadata(log.metadata);

        return (
          <Card
            key={log.id}
            className={`border-l-4 ${meta.border}`}
            style={{
              animation: `fadeSlideIn 0.3s ease-out ${i * 40}ms both`,
            }}
          >
            <CardContent className="py-3">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant={meta.variant}>
                  {meta.label}
                </Badge>
                <span className="text-sm font-medium text-[var(--axis-text-primary)]">
                  {formatActorName(log.actorId, log.actorName)}
                </span>
                <span className="ml-auto text-xs text-[var(--axis-text-tertiary)]">
                  {formatDate(log.timestamp)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Link
                  to={`/discoveries/${log.discoveryId}`}
                  className="text-sm text-[var(--axis-text-brand)] hover:underline truncate"
                >
                  {log.discoveryTitle}
                </Link>
              </div>
              {metaSummary && (
                <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                  {metaSummary}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
