import { Link } from "@remix-run/react";
import { Card, CardContent } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { StatusBadge } from "~/components/ui/StatusBadge";
import { STATUS_CONFIG } from "~/lib/constants/status";
import { formatDate } from "~/lib/format-date";

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
            <StatusBadge status={status} config={STATUS_CONFIG} />
            {createdByAgent && (
              <Badge variant="purple" className="text-[10px]">
                Agent
              </Badge>
            )}
          </div>
          <p className="mt-1 truncate text-sm font-medium text-fg">
            {title}
          </p>
          <div className="mt-0.5 flex gap-3 text-xs text-fg-tertiary">
            {ownerId && <span>Owner: {ownerId}</span>}
            {dueDate && (
              <span>기한: {formatDate(dueDate)}</span>
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
