import { Badge } from "~/components/ui/Badge";

interface TopicStatusBadgeProps {
  status: string;
}

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "subtle" }> = {
  active: { label: "활성", variant: "default" },
  completed: { label: "완료", variant: "secondary" },
  archived: { label: "아카이브", variant: "subtle" },
};

export function TopicStatusBadge({ status }: TopicStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || { label: status, variant: "subtle" as const };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}
