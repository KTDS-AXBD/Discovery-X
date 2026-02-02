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
  // Web form events (UPPER_CASE)
  CREATE_DISCOVERY: { label: "Discovery \uC0DD\uC131", border: "border-l-[var(--dx-event-create)]", variant: "success" },
  UPDATE_DISCOVERY: { label: "Discovery \uC218\uC815", border: "border-l-[var(--dx-event-neutral)]", variant: "secondary" },
  PROMOTE_OPEN: { label: "OPEN \uC2B9\uACA9", border: "border-l-[var(--dx-event-promote)]", variant: "info" },
  ADD_EXPERIMENT: { label: "\uC2E4\uD5D8 \uCD94\uAC00", border: "border-l-[var(--dx-event-experiment)]", variant: "info" },
  COMPLETE_EXPERIMENT: { label: "\uC2E4\uD5D8 \uC644\uB8CC", border: "border-l-[var(--dx-event-complete)]", variant: "success" },
  ADD_EVIDENCE: { label: "\uADFC\uAC70 \uCD94\uAC00", border: "border-l-[var(--dx-event-evidence)]", variant: "info" },
  SUBMIT_FOR_APPROVAL: { label: "\uACB0\uC815 \uC81C\uCD9C", border: "border-l-[var(--dx-event-gate)]", variant: "purple" },
  APPROVE_DECISION: { label: "\uACB0\uC815 \uC2B9\uC778", border: "border-l-[var(--dx-event-next)]", variant: "success" },
  REJECT_DECISION: { label: "\uACB0\uC815 \uAC70\uBD80", border: "border-l-[var(--dx-event-destructive)]", variant: "destructive" },
  START_METHOD_RUN: { label: "\uBC29\uBC95\uB860 \uC2E4\uD589", border: "border-l-[var(--dx-event-experiment)]", variant: "info" },
  CHANGE_OWNER: { label: "Owner \uBCC0\uACBD", border: "border-l-[var(--dx-event-neutral)]", variant: "secondary" },
  CHANGE_REVIEWER: { label: "Reviewer \uBCC0\uACBD", border: "border-l-[var(--dx-event-neutral)]", variant: "secondary" },
  CHANGE_GATEKEEPER: { label: "Gatekeeper \uBCC0\uACBD", border: "border-l-[var(--dx-event-neutral)]", variant: "secondary" },
  REQUEST_GATE_APPROVAL: { label: "Gate \uC2B9\uC778 \uC694\uCCAD", border: "border-l-[var(--dx-event-gate)]", variant: "purple" },
  SUBMIT_GATE_DECISION: { label: "Gate \uACB0\uC815 \uC81C\uCD9C", border: "border-l-[var(--dx-event-gate)]", variant: "purple" },
  AUTO_CLOSED_OVERDUE: { label: "\uC790\uB3D9 \uC885\uB8CC", border: "border-l-[var(--dx-event-auto-close)]", variant: "destructive" },
  // Agent events (snake_case)
  created: { label: "Discovery \uC0DD\uC131", border: "border-l-[var(--dx-event-create)]", variant: "success" },
  updated: { label: "Discovery \uC218\uC815", border: "border-l-[var(--dx-event-neutral)]", variant: "secondary" },
  promoted_to_idea_card: { label: "Idea Card \uC2B9\uACA9", border: "border-l-[var(--dx-event-promote)]", variant: "info" },
  promoted_to_open: { label: "OPEN \uC2B9\uACA9", border: "border-l-[var(--dx-event-promote)]", variant: "info" },
  stage_transition: { label: "\uB2E8\uACC4 \uC804\uD658", border: "border-l-[var(--dx-event-promote)]", variant: "info" },
  experiment_added: { label: "\uC2E4\uD5D8 \uCD94\uAC00", border: "border-l-[var(--dx-event-experiment)]", variant: "info" },
  experiment_completed: { label: "\uC2E4\uD5D8 \uC644\uB8CC", border: "border-l-[var(--dx-event-complete)]", variant: "success" },
  evidence_added: { label: "\uADFC\uAC70 \uCD94\uAC00", border: "border-l-[var(--dx-event-evidence)]", variant: "info" },
  decided_next: { label: "NEXT \uACB0\uC815", border: "border-l-[var(--dx-event-next)]", variant: "success" },
  decided_hold: { label: "HOLD \uACB0\uC815", border: "border-l-[var(--dx-event-warning)]", variant: "warning" },
  decided_drop: { label: "DROP \uACB0\uC815", border: "border-l-[var(--dx-event-destructive)]", variant: "destructive" },
  extension_requested: { label: "\uC5F0\uC7A5 \uC694\uCCAD", border: "border-l-[var(--dx-event-purple)]", variant: "purple" },
  // Radar events
  AUTO_SEED_CREATED: { label: "Radar Seed", border: "border-l-[var(--dx-event-create)]", variant: "success" },
};

function getEventMeta(eventType: string) {
  return EVENT_TYPE_MAP[eventType] || {
    label: eventType,
    border: "border-l-[var(--dx-event-neutral)]",
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
