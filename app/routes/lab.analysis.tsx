import { useState, useMemo } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { getDb } from "~/db";
import { getSessionContext } from "~/lib/auth/session.server";
import { LabService } from "~/lib/services";
import { InsightPanel } from "~/components/ontology/InsightPanel";
import { SimulationView } from "~/components/ontology/SimulationView";
import { Badge } from "~/components/ui/Badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/Select";

const MODES = [
  { key: "patterns", label: "패턴" },
  { key: "contradictions", label: "모순" },
  { key: "clusters", label: "클러스터" },
  { key: "centrality", label: "중심성" },
  { key: "simulation", label: "시뮬레이션" },
] as const;

type ModeKey = (typeof MODES)[number]["key"];
type AnalysisType = Exclude<ModeKey, "simulation">;

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as {
    DB: D1Database;
    SESSION_SECRET: string;
  };
  const db = getDb(env.DB);
  const ctx = await getSessionContext(request, db, env.SESSION_SECRET);
  if (!ctx) throw new Response("Unauthorized", { status: 401 });

  const service = new LabService(db);
  const [data, insights] = await Promise.all([
    service.getAnalysisData({ tenantId: ctx.tenantId }),
    service.getInsightSummary({ tenantId: ctx.tenantId }),
  ]);

  return json({ ...data, insights });
}

// analyzer 결과 → InsightPanel 내부 타입으로 변환
function mapPatterns(raw: unknown[]): unknown[] {
  return raw.map((item) => {
    const p = item as { path: string[]; count: number; examples: Array<{ fromLabel: string; toLabel: string }> };
    return { path: p.path, frequency: p.count };
  });
}

function mapContradictions(raw: unknown[]): unknown[] {
  return raw.map((item) => {
    const c = item as {
      nodeA: { id: string; label: string };
      nodeB: { id: string; label: string };
      supportEdges: unknown[];
      contradictEdges: unknown[];
    };
    return {
      nodeA: c.nodeA.label,
      nodeB: c.nodeB.label,
      supports: c.supportEdges.length,
      contradicts: c.contradictEdges.length,
    };
  });
}

function mapCentrality(raw: unknown[]): unknown[] {
  return raw.map((item) => {
    const e = item as { globalEntityId: string; label: string; totalDegree: number };
    return { nodeId: e.globalEntityId, label: e.label, degree: e.totalDegree };
  });
}

export default function LabAnalysis() {
  const { nodes, types, insights } = useLoaderData<typeof loader>();
  const analysisFetcher = useFetcher<{ results?: unknown; error?: string }>();
  const simFetcher = useFetcher<{
    success?: boolean;
    result?: unknown;
    propagation?: unknown;
    scenario?: unknown;
    error?: string;
  }>();

  const [activeMode, setActiveMode] = useState<ModeKey>("patterns");
  const [analysisResults, setAnalysisResults] = useState<Record<string, unknown>>({});

  // Simulation state
  const [sourceNodeId, setSourceNodeId] = useState("");
  const [magnitude, setMagnitude] = useState("1.0");
  const [question, setQuestion] = useState("");
  const [simMode, setSimMode] = useState<"propagate" | "scenario">("propagate");
  const typeMap = new Map(types.map((t) => [t.id, t.nameKo]));

  function runAnalysis(type: AnalysisType) {
    setActiveMode(type);
    if (analysisResults[type]) return;
    analysisFetcher.submit(
      JSON.stringify({ type }),
      { method: "POST", action: "/api/lab/analyze", encType: "application/json" },
    );
  }

  // Store analysis results
  if (analysisFetcher.data?.results && activeMode !== "simulation" && !analysisResults[activeMode]) {
    setAnalysisResults((prev) => ({ ...prev, [activeMode]: analysisFetcher.data!.results }));
  }

  function runSimulation() {
    const payload: Record<string, string | number> = {
      type: simMode,
      sourceNodeId,
      magnitude: parseFloat(magnitude),
    };
    if (simMode === "scenario") {
      payload.question = question;
    }
    simFetcher.submit(JSON.stringify(payload), {
      method: "POST",
      action: "/api/lab/simulate",
      encType: "application/json",
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const propagationResult = useMemo<any>(() => {
    if (!simFetcher.data?.success) return null;
    return simFetcher.data.propagation ?? simFetcher.data.result ?? null;
  }, [simFetcher.data]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scenarioResult = useMemo<any>(() => {
    if (!simFetcher.data?.success) return null;
    if (simFetcher.data.result) return null;
    return simFetcher.data.scenario ?? null;
  }, [simFetcher.data]);

  const isAnalysisLoading = analysisFetcher.state !== "idle" && !analysisResults[activeMode];
  const isSimLoading = simFetcher.state !== "idle";
  const selectedNode = nodes.find((n) => n.id === sourceNodeId);

  return (
    <div className="space-y-6">
      {/* Insight Summary Widget */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-base font-semibold text-fg font-mono-dx">
          인사이트 요약
          <Badge variant="info" className="text-[10px]">자동 분석</Badge>
        </h2>
        {insights.hasData ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InsightPanel
              type="patterns"
              data={mapPatterns(insights.patterns)}
            />
            <InsightPanel
              type="contradictions"
              data={mapContradictions(insights.contradictions)}
            />
            <InsightPanel
              type="centrality"
              data={mapCentrality(insights.topEntities)}
            />
          </div>
        ) : (
          <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-line-subtle">
            <p className="text-sm text-fg-tertiary font-mono-dx">
              &gt; 데이터 부족 — Evidence가 더 쌓이면 인사이트가 나타나요
            </p>
          </div>
        )}
      </section>

      {/* Mode selector */}
      <div className="flex flex-wrap gap-2">
        {MODES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (key === "simulation") {
                setActiveMode("simulation");
              } else {
                runAnalysis(key);
              }
            }}
            className={`rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors ${
              activeMode === key
                ? "bg-lab-accent text-white"
                : "bg-surface-secondary text-fg-secondary hover:text-fg"
            } font-mono-dx`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Analysis modes */}
      {activeMode !== "simulation" && (
        <>
          {analysisFetcher.data?.error && (
            <div className="rounded-md bg-badge-destructive-bg px-4 py-2 text-sm text-badge-destructive-text">
              {analysisFetcher.data.error}
            </div>
          )}

          <InsightPanel
            type={activeMode}
            data={analysisResults[activeMode] ?? null}
            loading={isAnalysisLoading}
          />

          {!analysisResults[activeMode] && !isAnalysisLoading && (
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-line-subtle">
              <p className="text-sm text-fg-tertiary font-mono-dx">
                &gt; Click button above to run analysis
              </p>
            </div>
          )}
        </>
      )}

      {/* Simulation mode */}
      {activeMode === "simulation" && (
        <>
          {/* Sub-mode toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSimMode("propagate")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                simMode === "propagate"
                  ? "bg-lab-accent text-white"
                  : "bg-surface-secondary text-fg-secondary hover:text-fg"
              } font-mono-dx`}
            >
              영향도 분석
            </button>
            <button
              type="button"
              onClick={() => setSimMode("scenario")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                simMode === "scenario"
                  ? "bg-lab-accent text-white"
                  : "bg-surface-secondary text-fg-secondary hover:text-fg"
              } font-mono-dx`}
            >
              시나리오 생성
            </button>
          </div>

          {/* Input Form */}
          <div className="space-y-3 rounded-lg border border-line-subtle p-4">
            <div>
              <label className="lab-stat-terminal mb-1 block">SOURCE ENTITY</label>
              <Select value={sourceNodeId || undefined} onValueChange={setSourceNodeId}>
                <SelectTrigger className="w-full rounded border border-line bg-surface-primary px-3 py-2 text-sm text-fg">
                  <SelectValue placeholder="엔티티 선택..." />
                </SelectTrigger>
                <SelectContent>
                  {nodes.map((node) => (
                    <SelectItem key={node.id} value={node.id}>
                      {node.label} ({typeMap.get(node.ontologyTypeId ?? "") || "기타"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedNode && (
                <div className="mt-1 flex items-center gap-1">
                  <Badge variant="secondary" className="text-[10px]">
                    {typeMap.get(selectedNode.ontologyTypeId ?? "") || "기타"}
                  </Badge>
                  {selectedNode.globalEntityId && (
                    <Badge variant="info" className="text-[10px]">GLOBAL</Badge>
                  )}
                </div>
              )}
            </div>

            <div>
              <label className="lab-stat-terminal mb-1 block">MAGNITUDE</label>
              <input
                type="range"
                min="0.1"
                max="1.0"
                step="0.1"
                value={magnitude}
                onChange={(e) => setMagnitude(e.target.value)}
                className="w-full"
              />
              <span className="text-xs text-fg-tertiary font-mono-dx">
                {magnitude}
              </span>
            </div>

            {simMode === "scenario" && (
              <div>
                <label className="lab-stat-terminal mb-1 block">SCENARIO QUERY</label>
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="예: 이 시장이 30% 성장하면 어떤 영향이?"
                  className="w-full rounded border border-line bg-surface-primary px-3 py-2 text-sm text-fg placeholder:text-fg-tertiary"
                />
              </div>
            )}

            <button
              type="button"
              onClick={runSimulation}
              disabled={!sourceNodeId || isSimLoading || (simMode === "scenario" && !question)}
              className="rounded-md bg-lab-accent px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 font-mono-dx"
            >
              {isSimLoading ? "RUNNING..." : simMode === "propagate" ? "RUN PROPAGATION" : "RUN SCENARIO"}
            </button>
          </div>

          {simFetcher.data?.error && (
            <p className="text-sm text-badge-destructive-text">
              {simFetcher.data.error}
            </p>
          )}

          <SimulationView
            propagation={propagationResult}
            scenario={scenarioResult}
            loading={isSimLoading}
          />

          {!propagationResult && !isSimLoading && (
            <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-line-subtle">
              <p className="text-sm text-fg-tertiary font-mono-dx">
                &gt; Select entity and run simulation
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
