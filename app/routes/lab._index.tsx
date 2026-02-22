import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { getSessionContext } from "~/lib/auth/session.server";
import { LabService } from "~/lib/services";
import { Card, CardContent } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import { GraphViewer } from "~/components/graph/GraphViewer";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as {
    DB: D1Database;
    SESSION_SECRET: string;
  };
  const db = getDb(env.DB);
  const ctx = await getSessionContext(request, db, env.SESSION_SECRET);
  if (!ctx) throw new Response("Unauthorized", { status: 401 });

  const service = new LabService(db);
  const data = await service.getOverviewData({ tenantId: ctx.tenantId });

  return json(data);
}

const STAT_ITEMS = [
  { key: "nodes" as const, label: "NODES" },
  { key: "edges" as const, label: "EDGES" },
  { key: "globalEntities" as const, label: "GLOBAL" },
  { key: "unreviewedNodes" as const, label: "UNREV.N", warn: true },
  { key: "unreviewedEdges" as const, label: "UNREV.E", warn: true },
];

export default function LabOverview() {
  const { stats, graphNodes, graphEdges, recentNodes, types } = useLoaderData<typeof loader>();
  const typeMap = new Map(types.map((t) => [t.id, t]));

  const preparedNodes = graphNodes.map((n) => ({
    id: n.id,
    label: n.label,
    ontologyTypeId: n.ontologyTypeId,
    sourceEvidenceId: n.sourceEvidenceId,
    metadata: n.metadata as Record<string, unknown> | null,
  }));

  const preparedEdges = graphEdges.map((e) => ({
    id: e.id,
    fromNodeId: e.fromNodeId,
    toNodeId: e.toNodeId,
    relationType: e.relationType,
    strength: (e.strength ?? 100) / 100,
    sourceEvidenceId: e.sourceEvidenceId,
  }));

  return (
    <div className="space-y-6">
      {/* Instrument Panel — Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {STAT_ITEMS.map(({ key, label, warn }) => {
          const value = stats[key];
          const isWarning = warn && value > 0;
          return (
            <Card key={key} className={isWarning ? "lab-instrument-active" : ""}>
              <CardContent className="p-4">
                <p className="lab-stat-terminal">{label}</p>
                <p
                  className={`mt-1 text-[30px] font-bold tabular-nums ${
                    isWarning
                      ? "text-lab-accent"
                      : "text-fg"
                  }`}
                  style={{ fontFamily: "var(--dx-font-mono)" }}
                >
                  {value.toLocaleString()}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Graph Card */}
      <Card>
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="lab-stat-terminal">KNOWLEDGE GRAPH</p>
            <span className="text-xs text-fg-tertiary font-mono-dx">
              {graphNodes.length}N / {graphEdges.length}E
            </span>
          </div>
          <GraphViewer
            nodes={preparedNodes}
            edges={preparedEdges}
            ontologyTypes={types}
          />
          {/* Legend */}
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-fg-secondary">
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-6 bg-badge-success-text" /> supports
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-6 border-t-2 border-dashed border-btn-destructive-bg" /> contradicts
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-6 bg-badge-purple-text" /> causes
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-6 border-t-2 border-dashed border-fg-tertiary" /> relates_to
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-6 border-t-2 border-dashed border-fg-info" /> depends_on
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Extraction Log — Recent auto-generated nodes */}
      <div>
        <p className="lab-stat-terminal mb-3">EXTRACTION LOG</p>
        {recentNodes.length === 0 ? (
          <p className="text-sm text-fg-tertiary font-mono-dx">
            &gt; No extractions found. Run entity extraction from Agent chat.
          </p>
        ) : (
          <div className="space-y-1.5">
            {recentNodes.map((node) => {
              const typeInfo = typeMap.get(node.ontologyTypeId ?? "");
              return (
                <Card key={node.id}>
                  <CardContent className="flex items-center gap-3 p-3">
                    {typeInfo && (
                      <span
                        className="flex h-8 w-8 items-center justify-center rounded-full text-sm"
                        style={{ backgroundColor: typeInfo.color + "20", color: typeInfo.color }}
                      >
                        {typeInfo.icon}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-fg">
                          {node.label}
                        </span>
                        {typeInfo && (
                          <Badge variant="secondary" className="text-[10px]">
                            {typeInfo.nameKo}
                          </Badge>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-[10px] text-fg-tertiary font-mono-dx">
                        <span>CONF {((node.confidence ?? 1) * 100).toFixed(0)}%</span>
                        {node.globalEntityId && <span>GLOBAL</span>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
