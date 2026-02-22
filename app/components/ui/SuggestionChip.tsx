import * as React from "react";
import { cn } from "~/lib/utils/cn";

export type SuggestionChipProps = React.ButtonHTMLAttributes<HTMLButtonElement>;

const SuggestionChip = React.forwardRef<HTMLButtonElement, SuggestionChipProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          // Base styles
          "inline-flex items-center justify-center",
          "rounded-full border border-line",
          "px-3 py-1.5 text-xs",
          // Colors
          "text-fg-secondary",
          "bg-transparent",
          // Transitions
          "transition-all duration-normal",
          // Hover
          "hover:bg-surface-secondary hover:text-fg hover:border-line-secondary",
          // Active
          "active:scale-95",
          // Focus visible
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus-ring",
          // Disabled
          "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
SuggestionChip.displayName = "SuggestionChip";

export { SuggestionChip };
