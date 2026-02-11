import { cn } from "~/lib/utils/cn";
import { displayTitle } from "~/lib/utils/display-title";

interface SourceSidebarProps {
  items: {
    id: string;
    title: string;
    titleKo: string | null;
  }[];
  selectedItemId: string | null;
  viewedItemIds: Set<string>;
  onSelect: (id: string) => void;
}

export function SourceSidebar({ items, selectedItemId, viewedItemIds, onSelect }: SourceSidebarProps) {
  return (
    <div className="dx-panel flex flex-col overflow-hidden" style={{ height: "calc(100vh - var(--dx-nav-height) - 7rem)" }}>
      <div className="shrink-0 border-b border-[var(--axis-border-default)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--axis-text-primary)]">
          최근 수집 소스
          <span className="ml-1.5 text-xs font-normal text-[var(--axis-text-tertiary)]">
            ({items.length})
          </span>
        </h3>
      </div>
      <div className="flex-1 overflow-y-auto">
        {items.map((item) => {
          const isSelected = selectedItemId === item.id;
          const isViewed = viewedItemIds.has(item.id);
          return (
            <div
              key={item.id}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(item.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(item.id);
                }
              }}
              className={cn(
                "cursor-pointer border-b border-[var(--axis-border-default)] px-4 py-2.5 last:border-b-0",
                "border-l-2 transition-colors",
                isSelected
                  ? "border-l-[var(--axis-text-brand)] bg-[var(--axis-surface-secondary)]"
                  : "border-l-transparent hover:bg-[var(--axis-surface-secondary)]/50",
              )}
            >
              <p
                className={cn(
                  "truncate text-sm",
                  isViewed
                    ? "font-normal text-[var(--axis-text-tertiary)]"
                    : "font-medium text-[var(--axis-text-primary)]",
                )}
              >
                {displayTitle(item.titleKo, item.title)}
              </p>
            </div>
          );
        })}
        {items.length === 0 && (
          <p className="py-4 text-center text-xs text-[var(--axis-text-tertiary)]">
            수집 항목 없음
          </p>
        )}
      </div>
    </div>
  );
}
