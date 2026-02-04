import { useState } from "react";
import { Badge } from "~/components/ui/Badge";

export interface ContextItem {
  type: "discovery" | "evidence" | "experiment";
  id: string;
  title: string;
  status?: string;
  meta?: string;
}

interface ContextPanelProps {
  items: ContextItem[];
  onClose: () => void;
}

const TAB_CONFIG = [
  { key: "discovery" as const, label: "Discovery" },
  { key: "evidence" as const, label: "Evidence" },
  { key: "experiment" as const, label: "Experiment" },
];

export function ContextPanel({ items, onClose }: ContextPanelProps) {
  const [activeTab, setActiveTab] = useState<"discovery" | "evidence" | "experiment">("discovery");

  const filtered = items.filter((item) => item.type === activeTab);
  const counts = {
    discovery: items.filter((i) => i.type === "discovery").length,
    evidence: items.filter((i) => i.type === "evidence").length,
    experiment: items.filter((i) => i.type === "experiment").length,
  };

  return (
    <div className="flex h-full flex-col border-l border-[var(--axis-border-default)] bg-[var(--axis-surface-default)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--axis-border-default)] px-3 py-2">
        <span className="text-xs font-semibold text-[var(--axis-text-primary)]">
          컨텍스트
        </span>
        <button
          onClick={onClose}
          className="text-sm text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]"
        >
          &times;
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--axis-border-default)]">
        {TAB_CONFIG.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-2 py-2 text-[10px] font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-[var(--axis-text-brand)] text-[var(--axis-text-brand)]"
                : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-secondary)]"
            }`}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-[var(--axis-surface-secondary)] text-[9px]">
                {counts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-[var(--axis-text-tertiary)]">
            참조된 항목 없음
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                className="rounded-lg border border-[var(--axis-border-default)] p-2 text-xs"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[var(--axis-text-tertiary)]">
                    {item.id.slice(0, 8)}
                  </span>
                  {item.status && (
                    <Badge variant="default" className="text-[9px]">
                      {item.status}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 font-medium text-[var(--axis-text-primary)] line-clamp-2">
                  {item.title}
                </div>
                {item.meta && (
                  <div className="mt-0.5 text-[var(--axis-text-tertiary)]">
                    {item.meta}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Extract context items from tool call results */
export function extractContextItems(
  toolName: string,
  result: Record<string, unknown>,
): ContextItem[] {
  const items: ContextItem[] = [];

  if (toolName === "get_discovery_detail") {
    const disc = result.discovery as Record<string, unknown> | undefined;
    if (disc) {
      items.push({
        type: "discovery",
        id: String(disc.id),
        title: String(disc.title),
        status: String(disc.status),
        meta: disc.ownerId ? `Owner: ${String(disc.ownerId)}` : undefined,
      });
    }
    const exps = (result.experiments || []) as Array<Record<string, unknown>>;
    for (const e of exps) {
      items.push({
        type: "experiment",
        id: String(e.id),
        title: String(e.hypothesis),
        meta: e.completed ? "완료" : "진행 중",
      });
    }
    const evs = (result.evidence || []) as Array<Record<string, unknown>>;
    for (const e of evs) {
      items.push({
        type: "evidence",
        id: String(e.id),
        title: String(e.content).slice(0, 80),
        meta: `${String(e.type)}/${String(e.strength)}`,
      });
    }
  } else if (toolName === "list_discoveries") {
    const discs = (result.discoveries || []) as Array<Record<string, unknown>>;
    for (const d of discs) {
      items.push({
        type: "discovery",
        id: String(d.id),
        title: String(d.title),
        status: String(d.status),
      });
    }
  } else if (toolName === "create_discovery" || toolName === "promote_discovery") {
    if (result.discoveryId) {
      items.push({
        type: "discovery",
        id: String(result.discoveryId),
        title: String(result.title || ""),
        status: String(result.status || ""),
      });
    }
  } else if (toolName === "add_evidence") {
    if (result.evidenceId) {
      items.push({
        type: "evidence",
        id: String(result.evidenceId),
        title: String(result.content || "").slice(0, 80),
        meta: `${String(result.type || "")}/${String(result.strength || "")}`,
      });
    }
  } else if (toolName === "add_experiment") {
    if (result.experimentId) {
      items.push({
        type: "experiment",
        id: String(result.experimentId),
        title: String(result.hypothesis || ""),
      });
    }
  }

  return items;
}
