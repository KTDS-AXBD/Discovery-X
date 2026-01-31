import * as React from "react";
import { cn } from "~/lib/utils/cn";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => {
    return (
      <select
        className={cn(
          "flex h-10 w-full rounded-md border px-3 py-2 text-sm transition-colors",
          "bg-[var(--axis-input-bg-default)] text-[var(--axis-input-text-default)]",
          "border-[var(--axis-input-border-default)]",
          "hover:border-[var(--axis-input-border-hover)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--axis-input-border-focus)] focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--axis-input-bg-disabled)]",
          error && "border-[var(--axis-input-border-error)] focus-visible:ring-[var(--axis-input-border-error)]",
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = "Select";

export { Select };
