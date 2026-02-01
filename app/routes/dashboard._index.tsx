/**
 * /dashboard (Pipeline view) — Kanban-style Discovery pipeline.
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { Card, CardContent } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import { StatusBadge } from "~/components/ui/StatusBadge";

const PIPELINE_COLUMNS = [
  { status: "INBOX", label: "Inbox" },
  { status: "OPEN", label: "Open" },
  { status: "EXTENSION_REQUESTED", label: "Extension" },
  { status: "NEXT", label: "Next" },
  { status: "NOT_NOW", label: "Not Now" },
  { status: "DEAD_END", label: "Dead End" },
] as const;

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);
  if (!user) return json({ columns: {} });

  const allDiscoveries = await db.select().from(discoveries);

  const columns: Record<string, typeof allDiscoveries> = {};
  for (const col of PIPELINE_COLUMNS) {
    columns[col.status] = allDiscoveries.filter((d) => d.status === col.status);
  }

  return json({ columns });
}

export default function DashboardPipeline() {
  const { columns } = useLoaderData<typeof loader>();

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-[var(--axis-text-primary)]">
        Discovery Pipeline
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {PIPELINE_COLUMNS.map((col) => {
          const items = (columns as Record<string, Array<{
            id: string;
            title: string;
            status: string;
            ownerId: string | null;
            dueDate: Date | string | null;
            createdByAgent: number;
          }>>)[col.status] || [];
          return (
            <div key={col.status} className="flex flex-col">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase text-[var(--axis-text-tertiary)]">
                  {col.label}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {items.length}
                </Badge>
              </div>
              <div className="max-h-[600px] flex-1 space-y-2 overflow-y-auto">
                {items.map((d) => (
                  <Link key={d.id} to={`/discoveries/${d.id}`}>
                    <Card className="cursor-pointer transition-shadow hover:shadow-md">
                      <CardContent className="p-3">
                        <p className="text-xs font-medium text-[var(--axis-text-primary)] line-clamp-2">
                          {d.title}
                        </p>
                        <div className="mt-1.5 flex items-center gap-1">
                          <StatusBadge status={d.status} />
                          {d.createdByAgent ? (
                            <Badge variant="purple" className="text-[9px]">AI</Badge>
                          ) : null}
                        </div>
                        {d.dueDate && (
                          <p className="mt-1 text-[10px] text-[var(--axis-text-tertiary)]">
                            기한: {new Date(d.dueDate).toLocaleDateString("ko-KR")}
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                ))}
                {items.length === 0 && (
                  <div className="rounded-md border border-dashed border-[var(--axis-border-default)] p-3 text-center text-xs text-[var(--axis-text-tertiary)]">
                    없음
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
