import { Link } from "@remix-run/react";
import { Card, CardContent } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { StatusBadge } from "~/components/ui/StatusBadge";

interface DiscoveryCardProps {
  id: string;
  title: string;
  status: string;
  ownerId?: string | null;
  dueDate?: string | null;
  createdByAgent?: boolean;
}

export function DiscoveryCard({
  id,
  title,
  status,
  ownerId,
  dueDate,
  createdByAgent,
}: DiscoveryCardProps) {
  return (
    <Card className="my-2">
      <CardContent className="flex items-center justify-between p-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <StatusBadge status={status} />
            {createdByAgent && (
              <Badge variant="purple" className="text-[10px]">
                Agent
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-sm font-medium text-[var(--axis-text-primary)]">
            {title}
          </p>
          <div className="mt-0.5 flex gap-3 text-xs text-[var(--axis-text-tertiary)]">
            {ownerId && <span>Owner: {ownerId}</span>}
            {dueDate && (
              <span>기한: {new Date(dueDate).toLocaleDateString("ko-KR")}</span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/discoveries/${id}`}>상세</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
