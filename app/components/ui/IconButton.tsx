import * as React from "react";
import { cn } from "~/lib/utils/cn";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: "xs" | "sm" | "md";
  variant?: "default" | "ghost";
  label: string;
}

const sizeMap = {
  xs: "h-6 w-6",
  sm: "h-8 w-8",
  md: "h-10 w-10",
} as const;

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ size = "sm", variant = "ghost", label, className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        "inline-flex items-center justify-center rounded-lg transition-all duration-[var(--dx-transition-normal)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dx-focus-ring-color-default)] focus-visible:ring-offset-1",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        sizeMap[size],
        variant === "ghost"
          ? "text-[var(--axis-text-tertiary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-primary)]"
          : "bg-[var(--axis-surface-secondary)] text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-tertiary)] hover:text-[var(--axis-text-primary)]",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = "IconButton";

export { IconButton };
