import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";

interface TopicMember {
  userId: string;
  name: string;
  email: string;
  role: string;
}

interface TopicMemberListProps {
  members: TopicMember[];
  currentUserId: string;
  onRemove?: (userId: string) => void;
}

const ROLE_CONFIG: Record<string, { label: string; variant: "warning" | "default" | "subtle" }> = {
  owner: { label: "owner", variant: "warning" },
  editor: { label: "editor", variant: "default" },
  viewer: { label: "viewer", variant: "subtle" },
};

export function TopicMemberList({ members, currentUserId, onRemove }: TopicMemberListProps) {
  return (
    <div className="divide-y divide-[var(--axis-surface-tertiary)]">
      {members.map((m) => {
        const roleConfig = ROLE_CONFIG[m.role] || { label: m.role, variant: "subtle" as const };
        const isOwner = m.role === "owner";

        return (
          <div key={m.userId} className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--axis-surface-tertiary)] text-sm font-medium text-[var(--axis-text-secondary)]">
                {(m.name || m.email)?.[0]?.toUpperCase() || "?"}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-[var(--axis-text-primary)]">
                  {m.name || m.email}
                </div>
                <div className="truncate text-xs text-[var(--axis-text-tertiary)]">
                  {m.email}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={roleConfig.variant}>{roleConfig.label}</Badge>
              {!isOwner && m.userId !== currentUserId && onRemove && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemove(m.userId)}
                  className="text-xs text-[var(--axis-text-tertiary)] hover:text-[var(--axis-badge-error-text)]"
                >
                  제거
                </Button>
              )}
            </div>
          </div>
        );
      })}
      {members.length === 0 && (
        <p className="py-4 text-center text-xs text-[var(--axis-text-tertiary)]">
          멤버가 없습니다
        </p>
      )}
    </div>
  );
}
