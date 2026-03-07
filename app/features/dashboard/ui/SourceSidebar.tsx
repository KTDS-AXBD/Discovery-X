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
    <aside className="flex w-96 shrink-0 flex-col overflow-hidden border-r border-line bg-surface">
      <div className="shrink-0 border-b border-line px-6 py-4">
        <h2 className="text-sm font-semibold text-fg">
          최근 수집 소스
          <span className="ml-1.5 text-xs font-normal text-fg-tertiary">
            ({items.length})
          </span>
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        <div>
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
                  "cursor-pointer border-b border-line py-3 text-xs leading-relaxed transition-colors last:border-b-0",
                  isSelected
                    ? "border-l-2 border-l-fg-brand bg-surface-secondary pl-3"
                    : "pl-0 hover:text-fg",
                  isViewed && !isSelected
                    ? "text-fg-tertiary"
                    : "font-medium text-fg",
                )}
              >
                {displayTitle(item.titleKo, item.title)}
              </div>
            );
          })}
          {items.length === 0 && (
            <p className="py-4 text-center text-xs text-fg-tertiary">
              수집 항목 없음
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
