import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { eq, and, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { contextNodes, contextEdges, discoveries, ontologyTypes } from "~/db/schema";
import { getSessionContext } from "~/lib/auth/session.server";
import { GraphViewer } from "~/components/graph/GraphViewer";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as {
    DB: D1Database;
    SESSION_SECRET: string;
  };
  const db = getDb(env.DB);
  const ctx = await getSessionContext(request, db, env.SESSION_SECRET);
  if (!ctx) throw new Response("Unauthorized", { status: 401 });

  // 테넌트의 모든 노드 (rejected 제외)
  const nodes = await db
    .select({
      id: contextNodes.id,
      label: contextNodes.label,
      ontologyTypeId: contextNodes.ontologyTypeId,
      sourceEvidenceId: contextNodes.sourceEvidenceId,
      metadata: contextNodes.metadata,
    })
    .from(contextNodes)
    .innerJoin(discoveries, eq(contextNodes.discoveryId, discoveries.id))
    .where(
      and(
        eq(discoveries.tenantId, ctx.tenantId),
        sql`${contextNodes.reviewed} != 2`,
      ),
    );

  const nodeIds = new Set(nodes.map((n) => n.id));

  // 관련 엣지 (rejected 제외, 양쪽 노드 모두 존재)
  const allEdges = await db
    .select({
      id: contextEdges.id,
      fromNodeId: contextEdges.fromNodeId,
      toNodeId: contextEdges.toNodeId,
      relationType: contextEdges.relationType,
      strength: contextEdges.strength,
      sourceEvidenceId: contextEdges.sourceEvidenceId,
    })
    .from(contextEdges)
    .where(sql`${contextEdges.reviewed} != 2`);

  const edges = allEdges.filter(
    (e) => nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId),
  );

  const types = await db.select().from(ontologyTypes);

  return json({ nodes, edges, types });
}

export default function OntologyGlobalGraph() {
  const { nodes, edges, types } = useLoaderData<typeof loader>();

  const graphNodes = nodes.map((n) => ({
    id: n.id,
    label: n.label,
    ontologyTypeId: n.ontologyTypeId,
    sourceEvidenceId: n.sourceEvidenceId,
    metadata: n.metadata as Record<string, unknown> | null,
  }));

  const graphEdges = edges.map((e) => ({
    id: e.id,
    fromNodeId: e.fromNodeId,
    toNodeId: e.toNodeId,
    relationType: e.relationType,
    strength: (e.strength ?? 100) / 100,
    sourceEvidenceId: e.sourceEvidenceId,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--axis-text-tertiary)]">
          노드 {nodes.length}개, 엣지 {edges.length}개
        </p>
      </div>

      <Card>
        <CardContent className="p-4">
          <GraphViewer
            nodes={graphNodes}
            edges={graphEdges}
            ontologyTypes={types}
          />
        </CardContent>
      </Card>

      {/* Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">범례</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-xs text-[var(--axis-text-secondary)]">
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-6 bg-[var(--axis-badge-success-text)]" /> supports
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-6 border-t-2 border-dashed border-[var(--axis-button-destructive-bg-default)]" /> contradicts
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-6 bg-[var(--axis-badge-purple-text)]" /> causes
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-6 border-t-2 border-dashed border-[var(--axis-text-tertiary)]" /> relates_to
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-0.5 w-6 border-t-2 border-dashed border-[var(--axis-badge-info-text)]" /> depends_on
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
