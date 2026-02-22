import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils/cn";

const alertBannerVariants = cva(
  "relative w-full rounded-lg border p-4",
  {
    variants: {
      variant: {
        default:
          "bg-surface text-fg border-line",
        info:
          "bg-[var(--axis-blue-100)] text-[var(--axis-blue-900)] border-[var(--axis-blue-200)]",
        success:
          "bg-[var(--axis-green-100)] text-[var(--axis-green-900)] border-[var(--axis-green-200)]",
        warning:
          "bg-[var(--axis-yellow-100)] text-[var(--axis-yellow-900)] border-[var(--axis-yellow-200)]",
        destructive:
          "bg-[var(--axis-red-100)] text-[var(--axis-red-900)] border-[var(--axis-red-200)]",
        purple:
          "bg-[var(--axis-purple-100)] text-[var(--axis-purple-900)] border-[var(--axis-purple-200)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface AlertBannerProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertBannerVariants> {
  title?: string;
}

const AlertBanner = React.forwardRef<HTMLDivElement, AlertBannerProps>(
  ({ className, variant, title, children, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn(alertBannerVariants({ variant }), className)}
      {...props}
    >
      {title && <h5 className="mb-1 font-medium leading-none tracking-tight">{title}</h5>}
      {children && <div className="text-sm [&_p]:leading-relaxed">{children}</div>}
    </div>
  )
);
AlertBanner.displayName = "AlertBanner";

export { AlertBanner, alertBannerVariants };
