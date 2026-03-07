import { cn } from "~/lib/utils/cn";
import {
  type SourceTypeFilter,
  SOURCE_TYPE_LABELS,
} from "~/lib/utils/source-type";

const FILTER_KEYS: SourceTypeFilter[] = ["all", "web", "youtube", "text", "pdf"];

interface SourceFilterBarProps {
  value: SourceTypeFilter;
  onChange: (value: SourceTypeFilter) => void;
  counts?: Partial<Record<SourceTypeFilter, number>>;
}

export function SourceFilterBar({ value, onChange, counts }: SourceFilterBarProps) {
  return (
    <div className="flex flex-wrap gap-1">
      {FILTER_KEYS.map((key) => {
        const count = counts?.[key] ?? 0;
        const isActive = value === key;
        const isEmpty = key !== "all" && count === 0;

        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            disabled={isEmpty}
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors",
              isActive
                ? "bg-surface-brand text-white"
                : isEmpty
                  ? "bg-surface-secondary text-fg-tertiary/40 cursor-not-allowed"
                  : "bg-surface-secondary text-fg-tertiary hover:text-fg-secondary"
            )}
          >
            {SOURCE_TYPE_LABELS[key]}
            {counts && !isEmpty && (
              <span className="ml-0.5 opacity-70">{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
