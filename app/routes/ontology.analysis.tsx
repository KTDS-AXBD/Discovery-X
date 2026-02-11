import { useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useFetcher } from "@remix-run/react";
import { getSessionContext } from "~/lib/auth/session.server";
import { getDb } from "~/db";
import { InsightPanel } from "~/components/ontology/InsightPanel";

const ANALYSIS_TYPES = [
  { key: "patterns", label: "패턴 감지" },
  { key: "contradictions", label: "모순 감지" },
  { key: "clusters", label: "클러스터" },
  { key: "centrality", label: "중심성" },
] as const;

type AnalysisType = (typeof ANALYSIS_TYPES)[number]["key"];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as {
    DB: D1Database;
    SESSION_SECRET: string;
  };
  const db = getDb(env.DB);
  const ctx = await getSessionContext(request, db, env.SESSION_SECRET);
  if (!ctx) throw new Response("Unauthorized", { status: 401 });

  return json({ tenantId: ctx.tenantId });
}

export default function OntologyAnalysis() {
  useLoaderData<typeof loader>();
  const fetcher = useFetcher<{ results?: unknown; error?: string }>();
  const [activeType, setActiveType] = useState<AnalysisType>("patterns");
  const [results, setResults] = useState<Record<string, unknown>>({});

  function runAnalysis(type: AnalysisType) {
    setActiveType(type);
    if (results[type]) return; // already cached

    fetcher.submit(
      JSON.stringify({ analysisType: type }),
      {
        method: "POST",
        action: "/api/ontology/analyze",
        encType: "application/json",
      },
    );
  }

  // Store fetcher results
  if (fetcher.data?.results && !results[activeType]) {
    setResults((prev) => ({ ...prev, [activeType]: fetcher.data!.results }));
  }

  const isLoading = fetcher.state !== "idle" && !results[activeType];

  return (
    <div className="space-y-6">
      {/* Analysis type selector */}
      <div className="flex gap-2">
        {ANALYSIS_TYPES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => runAnalysis(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              activeType === key
                ? "bg-[var(--axis-surface-brand)] text-white"
                : "bg-[var(--axis-surface-secondary)] text-[var(--axis-text-secondary)] hover:text-[var(--axis-text-primary)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Error state */}
      {fetcher.data?.error && (
        <div className="rounded-md bg-[var(--axis-badge-destructive-bg,#FEE2E2)] px-4 py-2 text-sm text-[var(--axis-badge-destructive-text,#991B1B)]">
          {fetcher.data.error}
        </div>
      )}

      {/* Results */}
      <InsightPanel
        type={activeType as "pattern" | "contradiction" | "cluster" | "centrality"}
        data={results[activeType] ?? null}
        loading={isLoading}
      />

      {/* Prompt to run analysis if no results yet */}
      {!results[activeType] && !isLoading && (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-[var(--axis-border-default)]">
          <div className="text-center">
            <p className="text-sm text-[var(--axis-text-tertiary)]">
              &quot;{ANALYSIS_TYPES.find((t) => t.key === activeType)?.label}&quot; 분석을 실행하려면 위 버튼을 클릭하세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
