/**
 * /dashboard (Pipeline view) — 11-stage Discovery pipeline.
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { tenantWhere } from "~/lib/query/tenant-scope";
import { Card, CardContent } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import { StatusBadge } from "~/components/ui/StatusBadge";
import { PIPELINE_COLUMNS, STAGE_CATEGORIES } from "~/lib/constants/status";
import { formatDate } from "~/lib/format-date";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return json({ columns: {} });

  const allDiscoveries = await db.select().from(discoveries)
    .where(tenantWhere(discoveries, ctx.tenantId));

  const columns: Record<string, typeof allDiscoveries> = {};
  for (const col of PIPELINE_COLUMNS) {
    columns[col.status] = allDiscoveries.filter((d) => d.status === col.status);
  }

  return json({ columns });
}

export default function DashboardPipeline() {
  const { columns } = useLoaderData<typeof loader>();

  // Group columns by category for visual separation
  const categories = [
    { key: "ideation" as const, cols: PIPELINE_COLUMNS.filter((c) => c.category === "ideation") },
    { key: "validation" as const, cols: PIPELINE_COLUMNS.filter((c) => c.category === "validation") },
    { key: "execution" as const, cols: PIPELINE_COLUMNS.filter((c) => c.category === "execution") },
    { key: "terminal" as const, cols: PIPELINE_COLUMNS.filter((c) => c.category === "terminal") },
  ];

  let globalIndex = 0;

  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-[var(--axis-text-primary)]">
        Discovery 파이프라인
      </h2>

      {categories.map((cat) => {
        const catConfig = STAGE_CATEGORIES[cat.key];
        return (
          <div key={cat.key} className="mb-6">
            <div className="mb-2 flex items-center gap-2">
              <div
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: catConfig.color }}
              />
              <span className="text-xs font-semibold uppercase tracking-wider text-[var(--axis-text-tertiary)]">
                {catConfig.label}
              </span>
            </div>
            <div
              className="grid gap-3"
              style={{
                gridTemplateColumns: `repeat(${cat.cols.length}, minmax(0, 1fr))`,
              }}
            >
              {cat.cols.map((col) => {
                const i = globalIndex++;
                const items = (columns as Record<string, Array<{
                  id: string;
                  title: string;
                  status: string;
                  ownerId: string | null;
                  dueDate: Date | string | null;
                  createdByAgent: number;
                }>>)[col.status] || [];
                return (
                  <div
                    key={col.status}
                    className="flex flex-col"
                    style={{
                      opacity: 0,
                      animation: "dx-fade-in-up 0.3s ease-out forwards",
                      animationDelay: `${i * 40}ms`,
                    }}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold text-[var(--axis-text-tertiary)]">
                        {col.label}
                      </span>
                      <Badge variant="outline" className="text-[10px]">
                        {items.length}
                      </Badge>
                    </div>
                    <div className="max-h-[500px] flex-1 space-y-2 overflow-y-auto">
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
                                  기한: {formatDate(d.dueDate)}
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
      })}
    </div>
  );
}
