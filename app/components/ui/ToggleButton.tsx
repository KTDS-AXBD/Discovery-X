import * as React from "react";
import { cn } from "~/lib/utils/cn";

export interface ToggleButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
  pressed?: boolean;
  onPressedChange?: (pressed: boolean) => void;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "p-1.5",
  md: "p-2",
  lg: "p-2.5",
};

const ToggleButton = React.forwardRef<HTMLButtonElement, ToggleButtonProps>(
  (
    {
      pressed = false,
      onPressedChange,
      size = "md",
      className,
      children,
      onClick,
      ...props
    },
    ref
  ) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e);
      if (!e.defaultPrevented) {
        onPressedChange?.(!pressed);
      }
    };

    return (
      <button
        ref={ref}
        type="button"
        role="button"
        aria-pressed={pressed}
        onClick={handleClick}
        className={cn(
          // Base styles
          "inline-flex items-center justify-center rounded-md",
          sizeClasses[size],
          // Colors
          "text-[var(--axis-icon-secondary)]",
          "bg-transparent",
          // Transitions
          "transition-all duration-[var(--dx-transition-normal)]",
          // Hover state
          "hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-icon-default)]",
          // Active/pressed state - scale effect
          "active:scale-[var(--dx-scale-pressed)]",
          // Focus visible
          "focus-visible:outline-none focus-visible:ring-[var(--dx-focus-ring-width)] focus-visible:ring-offset-[var(--dx-focus-ring-offset)] focus-visible:ring-[var(--dx-focus-ring-color-default)]",
          // Pressed state visual
          pressed && [
            "bg-[var(--axis-surface-brand-muted)]",
            "text-[var(--axis-text-brand)]",
            "ring-1 ring-inset ring-[var(--dx-toggle-selected-ring)]",
          ],
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
ToggleButton.displayName = "ToggleButton";

export { ToggleButton };
