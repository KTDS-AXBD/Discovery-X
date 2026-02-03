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
          "rounded-full border border-[var(--axis-border-default)]",
          "px-3 py-1.5 text-xs",
          // Colors
          "text-[var(--axis-text-secondary)]",
          "bg-transparent",
          // Transitions
          "transition-all duration-[var(--dx-transition-normal)]",
          // Hover
          "hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-primary)] hover:border-[var(--axis-border-secondary)]",
          // Active
          "active:scale-[var(--dx-scale-pressed)]",
          // Focus visible
          "focus-visible:outline-none focus-visible:ring-[var(--dx-focus-ring-width)] focus-visible:ring-offset-[var(--dx-focus-ring-offset)] focus-visible:ring-[var(--dx-focus-ring-color-default)]",
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
