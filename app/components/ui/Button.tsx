import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--axis-button-bg-default)] text-[var(--axis-button-text-default)] hover:bg-[var(--axis-button-bg-hover)] active:bg-[var(--axis-button-bg-active)] focus-visible:ring-[var(--axis-button-border-focus)]",
        secondary:
          "bg-[var(--axis-button-secondary-bg-default)] text-[var(--axis-button-secondary-text-default)] hover:bg-[var(--axis-button-secondary-bg-hover)] active:bg-[var(--axis-button-secondary-bg-active)]",
        ghost:
          "bg-[var(--axis-button-ghost-bg-default)] text-[var(--axis-button-ghost-text-default)] hover:bg-[var(--axis-button-ghost-bg-hover)] active:bg-[var(--axis-button-ghost-bg-active)]",
        destructive:
          "bg-[var(--axis-button-destructive-bg-default)] text-[var(--axis-button-destructive-text-default)] hover:bg-[var(--axis-button-destructive-bg-hover)] active:bg-[var(--axis-button-destructive-bg-active)]",
        success:
          "bg-[var(--axis-button-success-bg-default)] text-[var(--axis-button-success-text-default)] hover:bg-[var(--axis-button-success-bg-hover)] active:bg-[var(--axis-button-success-bg-active)]",
        purple:
          "bg-[var(--axis-button-purple-bg-default)] text-[var(--axis-button-purple-text-default)] hover:bg-[var(--axis-button-purple-bg-hover)] active:bg-[var(--axis-button-purple-bg-active)]",
        outline:
          "border border-[var(--axis-border-default)] bg-transparent hover:bg-[var(--axis-surface-secondary)] text-[var(--axis-text-primary)]",
        link: "text-[var(--axis-text-brand)] underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-xs",
        default: "h-10 px-4 py-2",
        lg: "h-12 px-6 text-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
