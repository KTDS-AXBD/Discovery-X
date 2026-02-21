import { useState, useCallback } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { getDb } from "~/db";
import { getSessionContext } from "~/lib/auth/session.server";
import { LabService } from "~/lib/services";
import { Card, CardContent } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as {
    DB: D1Database;
    SESSION_SECRET: string;
  };
  const db = getDb(env.DB);
  const ctx = await getSessionContext(request, db, env.SESSION_SECRET);
  if (!ctx) throw new Response("Unauthorized", { status: 401 });

  const service = new LabService(db);
  const data = await service.getReviewQueueData({ tenantId: ctx.tenantId });

  return json(data);
}

const RELATION_LABELS: Record<string, string> = {
  supports: "지지함",
  contradicts: "모순됨",
  causes: "원인됨",
  relates_to: "관련됨",
  depends_on: "의존함",
};

function LabButton({ variant, children, ...props }: {
  variant: "approve" | "reject" | "edit" | "save" | "cancel";
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const styles = {
    approve: "bg-[var(--axis-badge-success-bg,#D1FAE5)] text-[var(--axis-badge-success-text,#065F46)]",
    reject: "bg-[var(--axis-badge-destructive-bg,#FEE2E2)] text-[var(--axis-badge-destructive-text,#991B1B)]",
    edit: "bg-[var(--axis-surface-secondary)] text-[var(--axis-text-secondary)]",
    save: "bg-[var(--dx-lab-accent)] text-white",
    cancel: "bg-[var(--axis-surface-secondary)] text-[var(--axis-text-secondary)]",
  };
  return (
    <button
      type="button"
      className={`rounded px-2 py-1 text-[10px] font-medium uppercase tracking-wide hover:opacity-80 ${styles[variant]}`}
      style={{ fontFamily: "var(--dx-font-mono)" }}
      {...props}
    >
      {children}
    </button>
  );
}

export default function LabReview() {
  const { unreviewedNodes, unreviewedEdges, types } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();
  const typeMap = new Map(types.map((t) => [t.id, t]));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editTypeId, setEditTypeId] = useState("");

  function handleReview(type: "node" | "edge", id: string, action: "approve" | "reject" | "edit", editedLabel?: string, editedTypeId?: string) {
    const payload: Record<string, string> = { type, id, action };
    if (action === "edit") {
      if (editedLabel) payload.editedLabel = editedLabel;
      if (editedTypeId) payload.editedTypeId = editedTypeId;
    }
    fetcher.submit(
      JSON.stringify(payload),
      { method: "POST", action: "/api/lab/review", encType: "application/json" },
    );
    setEditingId(null);
  }

  const startEdit = useCallback((nodeId: string, label: string, typeId: string | null) => {
    setEditingId(nodeId);
    setEditLabel(label);
    setEditTypeId(typeId ?? "");
  }, []);

  const totalCount = unreviewedNodes.length + unreviewedEdges.length;

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <p className="lab-stat-terminal text-sm">REVIEW QUEUE</p>
        <Badge variant="secondary" className="text-[10px]" style={{ fontFamily: "var(--dx-font-mono)" }}>
          {totalCount}
        </Badge>
      </div>

      {totalCount === 0 && (
        <p className="text-sm text-[var(--axis-text-tertiary)]" style={{ fontFamily: "var(--dx-font-mono)" }}>
          &gt; Queue empty. Items appear after auto-extraction runs.
        </p>
      )}

      {/* Nodes */}
      {unreviewedNodes.length > 0 && (
        <div className="mb-8">
          <p className="lab-stat-terminal mb-3">ENTITIES ({unreviewedNodes.length})</p>
          <div className="space-y-2">
            {unreviewedNodes.map((node) => {
              const typeInfo = typeMap.get(node.ontologyTypeId ?? "");
              const isEditing = editingId === node.id;
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
                      {isEditing ? (
                        <div className="flex flex-col gap-1.5">
                          <input
                            type="text"
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="rounded border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-2 py-1 text-sm text-[var(--axis-text-primary)]"
                          />
                          <select
                            value={editTypeId}
                            onChange={(e) => setEditTypeId(e.target.value)}
                            className="rounded border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-2 py-1 text-xs text-[var(--axis-text-secondary)]"
                          >
                            {types.map((t) => (
                              <option key={t.id} value={t.id}>{t.nameKo}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-[var(--axis-text-primary)]">
                              {node.label}
                            </span>
                            {typeInfo && (
                              <Badge variant="secondary" className="text-[10px]">
                                {typeInfo.nameKo}
                              </Badge>
                            )}
                          </div>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--axis-text-tertiary)]" style={{ fontFamily: "var(--dx-font-mono)" }}>
                            <span>CONF {((node.confidence ?? 1) * 100).toFixed(0)}%</span>
                            {node.globalEntityId && <span>GLOBAL_ID</span>}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {isEditing ? (
                        <>
                          <LabButton variant="save" onClick={() => handleReview("node", node.id, "edit", editLabel, editTypeId)} disabled={fetcher.state !== "idle"}>
                            SAVE
                          </LabButton>
                          <LabButton variant="cancel" onClick={() => setEditingId(null)}>
                            CANCEL
                          </LabButton>
                        </>
                      ) : (
                        <>
                          <LabButton variant="approve" onClick={() => handleReview("node", node.id, "approve")} disabled={fetcher.state !== "idle"}>
                            APPROVE
                          </LabButton>
                          <LabButton variant="edit" onClick={() => startEdit(node.id, node.label, node.ontologyTypeId)} disabled={fetcher.state !== "idle"}>
                            EDIT
                          </LabButton>
                          <LabButton variant="reject" onClick={() => handleReview("node", node.id, "reject")} disabled={fetcher.state !== "idle"}>
                            REJECT
                          </LabButton>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Edges */}
      {unreviewedEdges.length > 0 && (
        <div>
          <p className="lab-stat-terminal mb-3">RELATIONS ({unreviewedEdges.length})</p>
          <div className="space-y-2">
            {unreviewedEdges.map((edge) => (
              <Card key={edge.id}>
                <CardContent className="flex items-center gap-3 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-sm" style={{ fontFamily: "var(--dx-font-mono)" }}>
                      <span className="text-[var(--axis-text-tertiary)]">{edge.fromNodeId.slice(0, 8)}</span>
                      <span className="text-[var(--dx-lab-accent)]">&rarr;</span>
                      <Badge variant="secondary" className="text-[10px]">
                        {RELATION_LABELS[edge.relationType] || edge.relationType}
                      </Badge>
                      <span className="text-[var(--dx-lab-accent)]">&rarr;</span>
                      <span className="text-[var(--axis-text-tertiary)]">{edge.toNodeId.slice(0, 8)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[var(--axis-text-tertiary)]" style={{ fontFamily: "var(--dx-font-mono)" }}>
                      <span>STR {((edge.strength ?? 100) / 100).toFixed(2)}</span>
                      <span>CONF {((edge.confidence ?? 1) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <LabButton variant="approve" onClick={() => handleReview("edge", edge.id, "approve")} disabled={fetcher.state !== "idle"}>
                      APPROVE
                    </LabButton>
                    <LabButton variant="reject" onClick={() => handleReview("edge", edge.id, "reject")} disabled={fetcher.state !== "idle"}>
                      REJECT
                    </LabButton>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
