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

  const hasGraphData = graphNodes.length > 0;

  return (
    <div className="flex gap-0 -mx-6 -mt-0">
      {/* Left Panel — Control sidebar */}
      <aside className="w-[300px] shrink-0 border-r border-line bg-surface-panel p-6 self-start sticky top-0">
        {/* Title + description */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-fg">Ontology 분석</h2>
          <p className="mt-1 text-xs text-fg-tertiary">
            문서에서 개념과 관계를 추출하여 온톨로지를 구성합니다.
          </p>
        </div>

        <div className="space-y-4">
          {/* File Upload area */}
          <div>
            <label className="mb-2 block text-sm font-medium text-fg-secondary">소스 선택</label>
            <div className="cursor-pointer rounded-lg border-2 border-dashed border-line p-6 text-center transition-colors hover:border-fg-tertiary">
              <svg className="mx-auto mb-2 h-8 w-8 text-fg-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
              <p className="text-xs text-fg-tertiary">
                파일을 드래그하거나 클릭하여 업로드
              </p>
              <p className="mt-1 text-[10px] text-fg-quaternary">
                PDF, TXT, DOCX 지원
              </p>
            </div>
          </div>

          {/* Source dropdown */}
          <div>
            <label className="mb-2 block text-sm font-medium text-fg-secondary">또는 기존 소스 선택</label>
            <select className="w-full rounded border border-line bg-surface p-2 text-sm text-fg-secondary">
              <option value="">소스를 선택하세요</option>
            </select>
          </div>

          {/* Analysis options */}
          <div>
            <label className="mb-2 block text-sm font-medium text-fg-secondary">분석 옵션</label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-xs text-fg-secondary">
                <input type="checkbox" defaultChecked className="rounded" />
                개념 추출
              </label>
              <label className="flex items-center gap-2 text-xs text-fg-secondary">
                <input type="checkbox" defaultChecked className="rounded" />
                관계 분석
              </label>
              <label className="flex items-center gap-2 text-xs text-fg-secondary">
                <input type="checkbox" className="rounded" />
                계층 구조 생성
              </label>
              <label className="flex items-center gap-2 text-xs text-fg-secondary">
                <input type="checkbox" className="rounded" />
                유사 개념 그룹핑
              </label>
            </div>
          </div>

          {/* Analyze button */}
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded bg-surface-brand py-3 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            분석 시작
          </button>

          {/* Info box */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 dark:border-blue-800 dark:bg-blue-900/20">
            <p className="text-xs leading-relaxed text-blue-800 dark:text-blue-300">
              <strong>Ontology란?</strong><br />
              도메인 내 개념과 그들 간의 관계를 형식화한 지식 표현 방법입니다.
              사업 아이디어의 핵심 요소를 구조화하여 이해도를 높일 수 있습니다.
            </p>
          </div>
        </div>
      </aside>

      {/* Right Panel — Main content */}
      <main className="flex-1 overflow-auto">
        {!hasGraphData ? (
          /* Empty state — centered icon + text */
          <div className="flex h-full min-h-[500px] flex-col items-center justify-center p-8 text-center">
            <svg className="mb-4 h-16 w-16 text-fg-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth="1" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-9.86a4.5 4.5 0 00-6.364 0l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
            </svg>
            <h3 className="mb-2 text-lg font-semibold text-fg">Ontology 분석을 시작해보세요</h3>
            <p className="max-w-md text-sm text-fg-tertiary">
              문서나 소스를 선택하고 분석을 시작하면, 개념과 관계가 시각화됩니다.
            </p>
          </div>
        ) : (
          /* Has data — show stats + graph + extraction log */
          <div className="space-y-6 p-6">
            {/* Instrument Panel — Stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {[
                { key: "nodes" as const, label: "NODES" },
                { key: "edges" as const, label: "EDGES" },
                { key: "globalEntities" as const, label: "GLOBAL" },
                { key: "unreviewedNodes" as const, label: "UNREV.N", warn: true },
                { key: "unreviewedEdges" as const, label: "UNREV.E", warn: true },
              ].map(({ key, label, warn }) => {
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
                        } font-mono-dx`}
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
        )}
      </main>
    </div>
  );
}
