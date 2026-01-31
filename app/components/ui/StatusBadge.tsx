import { Badge } from "~/components/ui/Badge";
import { STATUS_CONFIG } from "~/lib/constants/status";
import { cn } from "~/lib/utils/cn";

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || { label: status, variant: "default" as const };
  const sizeClass = size === "md" ? "px-3 py-1 text-sm" : "";

  return (
    <Badge variant={config.variant} className={cn(sizeClass)}>
      {config.label}
    </Badge>
  );
}
