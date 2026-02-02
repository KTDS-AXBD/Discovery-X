import * as React from "react";
import { Button as AxisButton, buttonVariants as axisButtonVariants } from "@axis-ds/ui-react";
import type { ButtonProps as AxisButtonProps } from "@axis-ds/ui-react";
import { cn } from "~/lib/utils/cn";

const customVariants = {
  success:
    "bg-[var(--axis-button-success-bg-default)] text-[var(--axis-button-success-text-default)] hover:bg-[var(--axis-button-success-bg-hover)] active:bg-[var(--axis-button-success-bg-active)]",
  purple:
    "bg-[var(--axis-button-purple-bg-default)] text-[var(--axis-button-purple-text-default)] hover:bg-[var(--axis-button-purple-bg-hover)] active:bg-[var(--axis-button-purple-bg-active)]",
  destructive:
    "bg-[var(--axis-button-destructive-bg-default)] text-[var(--axis-button-destructive-text-default)] hover:bg-[var(--axis-button-destructive-bg-hover)] active:bg-[var(--axis-button-destructive-bg-active)]",
} as const;

type CustomVariant = keyof typeof customVariants;

export interface ButtonProps
  extends Omit<AxisButtonProps, "variant">,
    React.PropsWithChildren {
  variant?: AxisButtonProps["variant"] | CustomVariant;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant, className, ...props }, ref) => {
    if (variant && variant in customVariants) {
      return (
        <AxisButton
          ref={ref}
          className={cn(customVariants[variant as CustomVariant], className)}
          {...props}
        />
      );
    }
    return (
      <AxisButton
        ref={ref}
        variant={variant as AxisButtonProps["variant"]}
        className={className}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

const buttonVariants = axisButtonVariants;

export { Button, buttonVariants };
