import { useState } from "react";
import { Badge } from "~/components/ui/Badge";
import { SearchInput } from "~/components/ui/SearchInput";

interface MarketSidebarProps {
  items: {
    id: string;
    title: string;
    titleKo?: string | null;
    summaryKo?: string | null;
    relevanceScore?: number | null;
    status?: string;
  }[];
  activeItemId: string | null;
  onSelectItem: (id: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  new: "var(--axis-text-brand)",
  reviewed: "var(--axis-text-success)",
  dismissed: "var(--axis-text-tertiary)",
  saved: "var(--axis-text-warning)",
};

export function MarketSidebar({
  items,
  activeItemId,
  onSelectItem,
}: MarketSidebarProps) {
  const [search, setSearch] = useState("");

  const filtered = items.filter((item) => {
    const q = search.toLowerCase();
    return (
      item.title.toLowerCase().includes(q) ||
      (item.titleKo && item.titleKo.toLowerCase().includes(q))
    );
  });

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-[var(--axis-border-default)] bg-[var(--axis-surface-default)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--axis-border-default)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--axis-text-primary)]">
          시장 탐색
        </h2>
        <Badge variant="subtle" className="text-xs">
          {items.length}
        </Badge>
      </div>

      {/* Search */}
      <div className="px-3 py-2">
        <SearchInput
          placeholder="항목 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Item list */}
      <ul className="max-h-[calc(100vh-160px)] flex-1 overflow-y-auto px-2 pb-2">
        {filtered.length === 0 && (
          <li className="px-2 py-6 text-center text-xs text-[var(--axis-text-tertiary)]">
            검색 결과가 없습니다
          </li>
        )}
        {filtered.map((item) => {
          const isActive = item.id === activeItemId;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onSelectItem(item.id)}
                className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left transition-colors ${
                  isActive
                    ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-brand)]"
                    : "text-[var(--axis-text-primary)] hover:bg-[var(--axis-surface-secondary)]"
                }`}
              >
                {/* Status dot */}
                {item.status && (
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        STATUS_COLORS[item.status] ??
                        "var(--axis-text-tertiary)",
                    }}
                  />
                )}

                <div className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {item.titleKo || item.title}
                  </span>
                  {item.summaryKo && (
                    <span className="mt-0.5 block truncate text-xs text-[var(--axis-text-tertiary)]">
                      {item.summaryKo}
                    </span>
                  )}
                </div>

                {item.relevanceScore != null && (
                  <Badge
                    variant={item.relevanceScore >= 7 ? "purple" : "subtle"}
                    className="shrink-0 text-xs"
                  >
                    {item.relevanceScore}
                  </Badge>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
