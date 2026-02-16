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
        "block border-b border-[var(--axis-border-default)] px-4 py-3 last:border-b-0",
        "border-l-2 transition-colors",
        isSelected
          ? "border-l-[var(--axis-text-brand)] bg-[var(--axis-surface-secondary)]"
          : "border-l-transparent hover:bg-[var(--axis-surface-secondary)]/50",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p
          className={cn(
            "truncate text-sm font-medium",
            isSelected
              ? "text-[var(--axis-text-brand)]"
              : "text-[var(--axis-text-primary)]",
          )}
        >
          {name}
        </p>
        <TopicStatusBadge status={status} />
      </div>
      <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
        멤버 {memberCount}명
      </p>
    </Link>
  );
}
