import { Badge } from "~/components/ui/Badge";
import type { BadgeProps } from "~/components/ui/Badge";
import { cn } from "~/lib/utils/cn";

interface StatusBadgeProps {
  status: string;
  config?: Record<string, { label: string; variant?: string | null; [key: string]: unknown }>;
  size?: "sm" | "md";
}

export function StatusBadge({ status, config, size = "sm" }: StatusBadgeProps) {
  const raw = config?.[status];
  const entry = { label: raw?.label ?? status, variant: raw?.variant ?? "default" };
  const sizeClass = size === "md" ? "px-3 py-1 text-sm" : "";
  const isInbox = status === "DISCOVERY";

  return (
    <Badge
      variant={entry.variant as BadgeProps["variant"]}
      className={cn(
        sizeClass,
        isInbox && "border border-dashed border-current",
      )}
    >
      {entry.label}
      {isInbox && " (임시)"}
    </Badge>
  );
}
