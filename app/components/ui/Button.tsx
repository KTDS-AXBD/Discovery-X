import * as React from "react";
import { Button as AxisButton, buttonVariants as axisButtonVariants } from "@axis-ds/ui-react";
import type { ButtonProps as AxisButtonProps } from "@axis-ds/ui-react";
import { cn } from "~/lib/utils/cn";

// 공통 인터랙션 스타일
const baseInteractionStyles = cn(
  "transition-all duration-[var(--dx-transition-normal)]",
  "active:scale-[var(--dx-scale-pressed)]",
  "focus-visible:outline-none focus-visible:ring-[var(--dx-focus-ring-width)] focus-visible:ring-offset-[var(--dx-focus-ring-offset)]",
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
);

const customVariants = {
  success: cn(
    "bg-[var(--axis-button-success-bg-default)] text-[var(--axis-button-success-text-default)]",
    "hover:bg-[var(--axis-button-success-bg-hover)]",
    "active:bg-[var(--axis-button-success-bg-active)]",
    "focus-visible:ring-[var(--dx-focus-ring-color-success)]",
    "disabled:bg-[var(--axis-button-success-bg-disabled)]",
    baseInteractionStyles
  ),
  purple: cn(
    "bg-[var(--axis-button-purple-bg-default)] text-[var(--axis-button-purple-text-default)]",
    "hover:bg-[var(--axis-button-purple-bg-hover)]",
    "active:bg-[var(--axis-button-purple-bg-active)]",
    "focus-visible:ring-[var(--dx-focus-ring-color-purple)]",
    "disabled:bg-[var(--axis-button-purple-bg-disabled)]",
    baseInteractionStyles
  ),
  destructive: cn(
    "bg-[var(--axis-button-destructive-bg-default)] text-[var(--axis-button-destructive-text-default)]",
    "hover:bg-[var(--axis-button-destructive-bg-hover)]",
    "active:bg-[var(--axis-button-destructive-bg-active)]",
    "focus-visible:ring-[var(--dx-focus-ring-color-destructive)]",
    "disabled:bg-[var(--axis-button-destructive-bg-disabled)]",
    baseInteractionStyles
  ),
} as const;

type CustomVariant = keyof typeof customVariants;

// 기본 variant용 인터랙션 스타일
const defaultInteractionStyles = cn(
  "transition-all duration-[var(--dx-transition-normal)]",
  "active:scale-[var(--dx-scale-pressed)]",
  "focus-visible:outline-none focus-visible:ring-[var(--dx-focus-ring-width)] focus-visible:ring-offset-[var(--dx-focus-ring-offset)] focus-visible:ring-[var(--dx-focus-ring-color-default)]",
  "disabled:active:scale-100"
);

export interface ButtonProps
  extends Omit<AxisButtonProps, "variant">,
    React.PropsWithChildren {
  variant?: AxisButtonProps["variant"] | CustomVariant;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, className, loading, disabled, children, ...props }, ref) => {
    const isDisabled = disabled || loading;

    if (variant && variant in customVariants) {
      return (
        <AxisButton
          ref={ref}
          disabled={isDisabled}
          className={cn(customVariants[variant as CustomVariant], className)}
          {...props}
        >
          {loading ? (
            <span className="inline-flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {children}
            </span>
          ) : (
            children
          )}
        </AxisButton>
      );
    }
    return (
      <AxisButton
        ref={ref}
        variant={variant as AxisButtonProps["variant"]}
        disabled={isDisabled}
        className={cn(defaultInteractionStyles, className)}
        {...props}
      >
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            {children}
          </span>
        ) : (
          children
        )}
      </AxisButton>
    );
  }
);
Button.displayName = "Button";

const buttonVariants = axisButtonVariants;

export { Button, buttonVariants };
