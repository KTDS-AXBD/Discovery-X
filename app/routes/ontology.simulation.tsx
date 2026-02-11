import { useState, useEffect } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { eq, and, ne } from "drizzle-orm";
import { getDb } from "~/db";
import { contextNodes, discoveries, ontologyTypes } from "~/db/schema";
import { getSessionContext } from "~/lib/auth/session.server";
import { SimulationView } from "~/components/ontology/SimulationView";
import { Badge } from "~/components/ui/Badge";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as {
    DB: D1Database;
    SESSION_SECRET: string;
  };
  const db = getDb(env.DB);
  const ctx = await getSessionContext(request, db, env.SESSION_SECRET);
  if (!ctx) throw new Response("Unauthorized", { status: 401 });

  const nodes = await db
    .select({
      id: contextNodes.id,
      label: contextNodes.label,
      ontologyTypeId: contextNodes.ontologyTypeId,
      discoveryId: contextNodes.discoveryId,
      globalEntityId: contextNodes.globalEntityId,
    })
    .from(contextNodes)
    .innerJoin(discoveries, eq(contextNodes.discoveryId, discoveries.id))
    .where(
      and(eq(discoveries.tenantId, ctx.tenantId), ne(contextNodes.reviewed, 2)),
    )
    .limit(200);

  const types = await db.select().from(ontologyTypes);

  return json({ nodes, types, tenantId: ctx.tenantId });
}

export default function OntologySimulation() {
  const { nodes, types } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<{
    success?: boolean;
    result?: unknown;
    propagation?: unknown;
    scenario?: unknown;
    error?: string;
  }>();

  const [sourceNodeId, setSourceNodeId] = useState("");
  const [magnitude, setMagnitude] = useState("1.0");
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<"propagate" | "scenario">("propagate");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [propagationResult, setPropagationResult] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [scenarioResult, setScenarioResult] = useState<any>(null);

  const typeMap = new Map(types.map((t) => [t.id, t.nameKo]));

  useEffect(() => {
    if (fetcher.data?.success) {
      if (fetcher.data.result) {
        setPropagationResult(fetcher.data.result);
        setScenarioResult(null);
      }
      if (fetcher.data.propagation) {
        setPropagationResult(fetcher.data.propagation);
      }
      if (fetcher.data.scenario) {
        setScenarioResult(fetcher.data.scenario);
      }
    }
  }, [fetcher.data]);

  function runSimulation() {
    const payload: Record<string, string | number> = {
      type: mode,
      sourceNodeId,
      magnitude: parseFloat(magnitude),
    };
    if (mode === "scenario") {
      payload.question = question;
    }
    fetcher.submit(JSON.stringify(payload), {
      method: "POST",
      action: "/api/ontology/simulate",
      encType: "application/json",
    });
  }

  const isLoading = fetcher.state !== "idle";
  const selectedNode = nodes.find((n) => n.id === sourceNodeId);

  return (
    <div className="space-y-6">
      {/* Mode Toggle */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMode("propagate")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "propagate"
              ? "bg-[var(--axis-surface-brand)] text-white"
              : "bg-[var(--axis-surface-secondary)] text-[var(--axis-text-secondary)] hover:text-[var(--axis-text-primary)]"
          }`}
        >
          영향도 분석
        </button>
        <button
          type="button"
          onClick={() => setMode("scenario")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
            mode === "scenario"
              ? "bg-[var(--axis-surface-brand)] text-white"
              : "bg-[var(--axis-surface-secondary)] text-[var(--axis-text-secondary)] hover:text-[var(--axis-text-primary)]"
          }`}
        >
          시나리오 생성
        </button>
      </div>

      {/* Input Form */}
      <div className="space-y-3 rounded-lg border border-[var(--axis-border-default)] p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--axis-text-secondary)]">
            시작 엔티티
          </label>
          <select
            value={sourceNodeId}
            onChange={(e) => setSourceNodeId(e.target.value)}
            className="w-full rounded border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm text-[var(--axis-text-primary)]"
          >
            <option value="">엔티티 선택...</option>
            {nodes.map((node) => (
              <option key={node.id} value={node.id}>
                {node.label} ({typeMap.get(node.ontologyTypeId ?? "") || "기타"})
              </option>
            ))}
          </select>
          {selectedNode && (
            <div className="mt-1 flex items-center gap-1">
              <Badge variant="secondary" className="text-[10px]">
                {typeMap.get(selectedNode.ontologyTypeId ?? "") || "기타"}
              </Badge>
              {selectedNode.globalEntityId && (
                <Badge variant="info" className="text-[10px]">
                  글로벌 엔티티
                </Badge>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--axis-text-secondary)]">
            변화 강도
          </label>
          <input
            type="range"
            min="0.1"
            max="1.0"
            step="0.1"
            value={magnitude}
            onChange={(e) => setMagnitude(e.target.value)}
            className="w-full"
          />
          <span className="text-xs text-[var(--axis-text-tertiary)]">{magnitude}</span>
        </div>

        {mode === "scenario" && (
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--axis-text-secondary)]">
              시뮬레이션 질문
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="예: 이 시장이 30% 성장하면 어떤 영향이?"
              className="w-full rounded border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm text-[var(--axis-text-primary)] placeholder:text-[var(--axis-text-tertiary)]"
            />
          </div>
        )}

        <button
          type="button"
          onClick={runSimulation}
          disabled={
            !sourceNodeId || isLoading || (mode === "scenario" && !question)
          }
          className="rounded-lg bg-[var(--axis-surface-brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {isLoading
            ? "실행 중..."
            : mode === "propagate"
              ? "영향도 분석 실행"
              : "시나리오 생성"}
        </button>
      </div>

      {/* Error */}
      {fetcher.data?.error && (
        <p className="text-sm text-[var(--axis-badge-destructive-text,#991B1B)]">
          {fetcher.data.error}
        </p>
      )}

      {/* Results */}
      <SimulationView
        propagation={propagationResult}
        scenario={scenarioResult}
        loading={isLoading}
      />

      {/* Prompt to run if no results */}
      {!propagationResult && !isLoading && (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-[var(--axis-border-default)]">
          <div className="text-center">
            <p className="text-sm text-[var(--axis-text-tertiary)]">
              엔티티를 선택하고 시뮬레이션을 실행하세요.
            </p>
            <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
              영향도 분석은 그래프 전파, 시나리오 생성은 AI 분석을 포함합니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
