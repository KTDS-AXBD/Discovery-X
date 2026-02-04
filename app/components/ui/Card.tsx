import * as React from "react";
import {
  Card as AxisCard,
  CardHeader as AxisCardHeader,
  CardFooter as AxisCardFooter,
  CardTitle as AxisCardTitle,
  CardDescription as AxisCardDescription,
  CardContent as AxisCardContent,
} from "@axis-ds/ui-react";
import { cn } from "~/lib/utils/cn";

type CardProps = React.ComponentPropsWithoutRef<typeof AxisCard>;

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, ...props }, ref) => (
    <AxisCard
      ref={ref}
      className={cn(
        "rounded-[var(--dx-card-radius)] shadow-none border border-[var(--dx-border-subtle,var(--dx-card-border-subtle))] bg-[var(--dx-surface-card,var(--axis-surface-default))] transition-colors duration-200",
        className,
      )}
      {...props}
    />
  ),
);
Card.displayName = "Card";

const CardHeader = AxisCardHeader;
const CardFooter = AxisCardFooter;
const CardTitle = AxisCardTitle;
const CardDescription = AxisCardDescription;
const CardContent = AxisCardContent;

/** Grouped section within a card (used in right panels, detail views) */
function CardSection({
  title,
  children,
  className,
}: {
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("px-5 py-4", className)}>
      {title && (
        <h4 className="dx-section-title mb-2">{title}</h4>
      )}
      {children}
    </div>
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, CardSection };
