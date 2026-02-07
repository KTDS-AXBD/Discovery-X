import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";

interface Member {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: string;
  joinedAt: string | null;
}

interface MemberListProps {
  members: Member[];
  currentUserId: string;
  ownerUserId: string;
  onRemove?: (userId: string) => void;
  onRoleChange?: (userId: string, newRole: string) => void;
}

const ROLE_VARIANTS: Record<string, "default" | "purple" | "warning" | "secondary"> = {
  owner: "purple",
  admin: "warning",
  gatekeeper: "default",
  member: "secondary",
  viewer: "secondary",
};

export function MemberList({ members, currentUserId, ownerUserId, onRemove, onRoleChange: _onRoleChange }: MemberListProps) {
  const isOwner = currentUserId === ownerUserId;

  return (
    <div className="divide-y divide-[var(--axis-surface-tertiary)]">
      {members.map((m) => (
        <div key={m.id} className="flex items-center justify-between py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--axis-surface-tertiary)] text-sm font-medium text-[var(--axis-text-secondary)]">
              {(m.name || m.email)?.[0]?.toUpperCase() || "?"}
            </div>
            <div>
              <div className="text-sm font-medium text-[var(--axis-text-primary)]">
                {m.name || m.email}
              </div>
              <div className="text-xs text-[var(--axis-text-tertiary)]">{m.email}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={ROLE_VARIANTS[m.role] || "secondary"}>
              {m.role}
            </Badge>
            {isOwner && m.userId !== ownerUserId && onRemove && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onRemove(m.userId)}
                className="text-xs text-[var(--axis-text-tertiary)] hover:text-[var(--axis-badge-error-text)]"
              >
                Remove
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
