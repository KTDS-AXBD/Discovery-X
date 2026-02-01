import * as React from "react";
import { Badge as AxisBadge, badgeVariants as axisBadgeVariants } from "@axis-ds/ui-react";
import type { BadgeProps as AxisBadgeProps } from "@axis-ds/ui-react";
import { cn } from "~/lib/utils/cn";

export interface BadgeProps
  extends Omit<AxisBadgeProps, "variant">,
    React.PropsWithChildren {
  variant?: AxisBadgeProps["variant"] | "purple";
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(
  ({ variant, className, ...props }, ref) => {
    if (variant === "purple") {
      return (
        <AxisBadge
          ref={ref}
          className={cn(
            "border-transparent bg-[var(--axis-badge-purple-bg)] text-[var(--axis-badge-purple-text)]",
            className
          )}
          {...props}
        />
      );
    }
    return (
      <AxisBadge
        ref={ref}
        variant={variant as AxisBadgeProps["variant"]}
        className={className}
        {...props}
      />
    );
  }
);
Badge.displayName = "Badge";

const badgeVariants = axisBadgeVariants;

export { Badge, badgeVariants };
