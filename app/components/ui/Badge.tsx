import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[var(--axis-badge-default-bg)] text-[var(--axis-badge-default-text)]",
        secondary:
          "border-transparent bg-[var(--axis-bg-muted)] text-[var(--axis-text-secondary)]",
        destructive:
          "border-transparent bg-[var(--axis-badge-error-bg)] text-[var(--axis-badge-error-text)]",
        success:
          "border-transparent bg-[var(--axis-badge-success-bg)] text-[var(--axis-badge-success-text)]",
        warning:
          "border-transparent bg-[var(--axis-badge-warning-bg)] text-[var(--axis-badge-warning-text)]",
        error:
          "border-transparent bg-[var(--axis-badge-error-bg)] text-[var(--axis-badge-error-text)]",
        info:
          "border-transparent bg-[var(--axis-badge-info-bg)] text-[var(--axis-badge-info-text)]",
        purple:
          "border-transparent bg-[var(--axis-badge-purple-bg)] text-[var(--axis-badge-purple-text)]",
        outline: "border-[var(--axis-border-default)] text-[var(--axis-text-primary)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ className, variant, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
);
Badge.displayName = "Badge";

export { Badge, badgeVariants };
