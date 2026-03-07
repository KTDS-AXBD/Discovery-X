import { Link } from "@remix-run/react";
import { Card, CardContent } from "~/components/ui/Card";

interface RelatedDiscoveriesProps {
  items: Array<{ id: string; score: number; title?: string }>;
}

export function RelatedDiscoveries({ items }: RelatedDiscoveriesProps) {
  if (items.length === 0) return null;

  return (
    <Card className="mt-6">
      <CardContent className="p-5">
        <h3 className="mb-3 text-sm font-semibold text-fg-secondary">
          관련 Discovery
        </h3>
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                to={`/discoveries/${item.id}`}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-surface-card-hover text-fg"
              >
                <span className="truncate">{item.title || item.id.slice(0, 8)}</span>
                <span className="ml-2 shrink-0 text-xs text-fg-muted">
                  {Math.round(item.score * 100)}%
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
