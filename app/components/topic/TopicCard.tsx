import { Link, useLocation } from "@remix-run/react";

import { cn } from "~/lib/utils/cn";

import { TopicStatusBadge } from "./TopicStatusBadge";

interface TopicCardProps {
  id: string;
  name: string;
  memberCount: number;
  status: string;
}

export function TopicCard({ id, name, memberCount, status }: TopicCardProps) {
  const location = useLocation();
  const isSelected = location.pathname === `/topics/${id}`;

  return (
    <Link
      to={`/topics/${id}`}
      className={cn(
        "block border-b border-line px-4 py-3 last:border-b-0",
        "border-l-2 transition-colors",
        isSelected
          ? "border-l-fg-brand bg-surface-secondary"
          : "border-l-transparent hover:bg-surface-secondary/50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className={cn(
            "truncate text-sm font-medium",
            isSelected
              ? "text-fg-brand"
              : "text-fg",
          )}
        >
          {name}
        </p>
        <TopicStatusBadge status={status} />
      </div>
      <p className="mt-1 text-xs text-fg-tertiary">
        멤버 {memberCount}명
      </p>
    </Link>
  );
}
