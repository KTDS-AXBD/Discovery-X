import { useState } from "react";
import { Badge } from "~/components/ui/Badge";
import { IconButton } from "~/components/ui/IconButton";
import { SectionPanel } from "~/components/ui/SectionPanel";

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
  messageCount?: number;
  toolCallCount?: number;
}

const TAB_CONFIG = [
  { key: "discovery" as const, label: "Discovery" },
  { key: "evidence" as const, label: "Evidence" },
  { key: "experiment" as const, label: "Experiment" },
];

export function ContextPanel({ items, onClose, messageCount = 0, toolCallCount = 0 }: ContextPanelProps) {
  const [activeTab, setActiveTab] = useState<"discovery" | "evidence" | "experiment">("discovery");

  const filtered = items.filter((item) => item.type === activeTab);
  const counts = {
    discovery: items.filter((i) => i.type === "discovery").length,
    evidence: items.filter((i) => i.type === "evidence").length,
    experiment: items.filter((i) => i.type === "experiment").length,
  };

  return (
    <div className="flex h-full flex-col border-l border-line bg-surface dx-animate-slide-right">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
        <span className="text-sm font-semibold text-fg">
          컨텍스트
        </span>
        <IconButton label="패널 닫기" size="xs" onClick={onClose}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </IconButton>
      </div>

      {/* Quick stats */}
      {(messageCount > 0 || toolCallCount > 0) && (
        <SectionPanel title="대화 통계">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-surface-secondary px-3 py-2 text-center">
              <div className="text-lg font-bold text-fg">{messageCount}</div>
              <div className="text-[10px] text-fg-tertiary">메시지</div>
            </div>
            <div className="rounded-lg bg-surface-secondary px-3 py-2 text-center">
              <div className="text-lg font-bold text-fg">{toolCallCount}</div>
              <div className="text-[10px] text-fg-tertiary">도구 호출</div>
            </div>
          </div>
        </SectionPanel>
      )}

      {/* Context items tabs */}
      <div className="flex border-b border-line">
        {TAB_CONFIG.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-2 py-2 text-[10px] font-medium transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-fg-brand text-fg-brand"
                : "text-fg-tertiary hover:text-fg-secondary"
            }`}
          >
            {tab.label}
            {counts[tab.key] > 0 && (
              <span className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-surface-secondary text-[9px]">
                {counts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-xs text-fg-tertiary">
            참조된 항목 없음
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((item) => (
              <div
                key={`${item.type}-${item.id}`}
                className="dx-panel dx-panel-hover rounded-lg p-2.5 text-xs"
              >
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-fg-tertiary">
                    {item.id.slice(0, 8)}
                  </span>
                  {item.status && (
                    <Badge variant="default" className="text-[9px]">
                      {item.status}
                    </Badge>
                  )}
                </div>
                <div className="mt-1 font-medium text-fg line-clamp-2">
                  {item.title}
                </div>
                {item.meta && (
                  <div className="mt-0.5 text-fg-tertiary">
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
