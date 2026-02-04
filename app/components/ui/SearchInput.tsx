import * as React from "react";
import { cn } from "~/lib/utils/cn";

interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  onFilter?: () => void;
  showFilter?: boolean;
}

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, onFilter, showFilter = false, ...props }, ref) => (
    <div className={cn("relative flex items-center", className)}>
      <svg
        className="pointer-events-none absolute left-2.5 h-4 w-4 text-[var(--axis-text-tertiary)]"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth="2"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
      <input
        ref={ref}
        type="search"
        className={cn(
          "h-8 w-full rounded-lg border border-[var(--dx-border-subtle,var(--axis-border-default))] bg-[var(--dx-surface-card,var(--axis-surface-default))] pl-8 pr-2 text-xs text-[var(--axis-text-primary)] placeholder:text-[var(--axis-text-tertiary)]",
          "transition-colors focus:border-[var(--axis-border-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--axis-border-brand)]",
          showFilter && "pr-8",
        )}
        {...props}
      />
      {showFilter && onFilter && (
        <button
          type="button"
          onClick={onFilter}
          className="absolute right-2 rounded p-0.5 text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]"
          aria-label="필터"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
          </svg>
        </button>
      )}
    </div>
  ),
);
SearchInput.displayName = "SearchInput";

export { SearchInput };
