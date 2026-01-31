const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  INBOX: { label: "Inbox", className: "bg-blue-100 text-blue-800" },
  OPEN: { label: "진행 중", className: "bg-yellow-100 text-yellow-800" },
  NEXT: { label: "전진", className: "bg-green-100 text-green-800" },
  NOT_NOW: { label: "보류", className: "bg-gray-100 text-gray-800" },
  DEAD_END: { label: "중단", className: "bg-red-100 text-red-800" },
  EXTENSION_REQUESTED: { label: "연장 요청", className: "bg-purple-100 text-purple-800" },
};

interface StatusBadgeProps {
  status: string;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "sm" }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || { label: status, className: "bg-gray-100 text-gray-800" };
  const sizeClass = size === "md" ? "px-3 py-1 text-sm" : "px-2 py-0.5 text-xs";

  return (
    <span className={`inline-flex rounded-full font-semibold ${config.className} ${sizeClass}`}>
      {config.label}
    </span>
  );
}
