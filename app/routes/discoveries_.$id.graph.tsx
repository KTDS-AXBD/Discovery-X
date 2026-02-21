import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import {
  contextNodes,
  contextEdges,
  contextSnapshots,
  ontologyTypes,
} from "~/db/schema";
import { DiscoveryService } from "~/lib/services";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { Button } from "~/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { GraphViewer } from "~/components/graph/GraphViewer";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) return redirect("/login");
  const user = ctx.user;

  const { id } = params;
  if (!id) throw new Response("Not Found", { status: 404 });

  const service = new DiscoveryService(db);
  const discovery = await service.getById(id);
  if (!discovery) throw new Response("Not Found", { status: 404 });

  const nodes = await db
    .select()
    .from(contextNodes)
    .where(eq(contextNodes.discoveryId, id));

  const allEdges = await db.select().from(contextEdges);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = allEdges.filter(
    (e) => nodeIds.has(e.fromNodeId) || nodeIds.has(e.toNodeId)
  );

  const types = await db.select().from(ontologyTypes);

  const snapshots = await db
    .select()
    .from(contextSnapshots)
    .where(eq(contextSnapshots.discoveryId, id));

  return json({ user, discovery, nodes, edges, ontologyTypes: types, snapshots });
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) return redirect("/login");

  const { id } = params;
  if (!id) throw new Response("Not Found", { status: 404 });

  const service = new DiscoveryService(db);
  const discovery = await service.getById(id);
  if (!discovery) throw new Response("Not Found", { status: 404 });

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "save-snapshot") {
    const nodes = await db
      .select()
      .from(contextNodes)
      .where(eq(contextNodes.discoveryId, id));

    const allEdges = await db.select().from(contextEdges);
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = allEdges.filter(
      (e) => nodeIds.has(e.fromNodeId) || nodeIds.has(e.toNodeId)
    );

    await db.insert(contextSnapshots).values({
      id: crypto.randomUUID(),
      discoveryId: id,
      stage: discovery.status,
      snapshotData: {
        nodes: nodes.map((n) => ({ ...n })),
        edges: edges.map((e) => ({ ...e })),
      },
    });

    return json({ success: true, message: "스냅샷이 저장되었습니다." });
  }

  return json({ error: "알 수 없는 요청입니다" }, { status: 400 });
}

export default function DiscoveryGraph() {
  const { user, discovery, nodes, edges, ontologyTypes: types, snapshots } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

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
    <AppShell user={user}>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--axis-text-primary)]">
            맥락 그래프 — {discovery.title}
          </h1>
          <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
            노드 {nodes.length}개, 엣지 {edges.length}개 · 스냅샷 {snapshots.length}개
          </p>
        </div>
        <div className="flex gap-2">
          <Form method="post">
            <input type="hidden" name="intent" value="save-snapshot" />
            <Button type="submit" variant="secondary" size="sm">
              스냅샷 저장
            </Button>
          </Form>
          <Button variant="outline" size="sm" asChild>
            <Link to={`/discoveries/${discovery.id}`}>상세로 돌아가기</Link>
          </Button>
        </div>
      </div>

      {actionData && "message" in actionData && (
        <div className="mb-4 rounded-md bg-[var(--axis-surface-success)] px-4 py-2 text-sm text-[var(--axis-badge-success-text)]">
          {actionData.message}
        </div>
      )}

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
      <Card className="mt-4">
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
    </AppShell>
  );
}
