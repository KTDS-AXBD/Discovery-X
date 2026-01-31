import type { BadgeProps } from "~/components/ui/Badge";

export const STATUS_CONFIG: Record<string, { label: string; variant: BadgeProps["variant"] }> = {
  INBOX: { label: "Inbox", variant: "info" },
  OPEN: { label: "진행 중", variant: "warning" },
  NEXT: { label: "전진", variant: "success" },
  NOT_NOW: { label: "보류", variant: "secondary" },
  DEAD_END: { label: "중단", variant: "destructive" },
  EXTENSION_REQUESTED: { label: "연장 요청", variant: "purple" },
};
