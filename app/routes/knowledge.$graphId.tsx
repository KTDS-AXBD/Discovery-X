/**
 * /knowledge/:graphId — 개별 그래프 상세 뷰
 * 노드 목록 (타입별 그룹핑) + 관계 목록 + Projection 미리보기
 */

import { useEffect } from "react";
import { Link, useParams, useFetcher } from "@remix-run/react";
import type { ScopeType, JsonLdNode } from "~/lib/graph/types";

// ─── 타입 ───────────────────────────────────────────────────────────

interface Edge {
  source: string;
  target: string;
  type: string;
}

interface GraphDetail {
  graph: {
    id: string;
    scopeType: ScopeType;
    scopeId: string;
    version: number;
    nodes: JsonLdNode[];
    edges: Edge[];
  };
  projection: {
    projType: string;
    content: string;
    graphVersion: number;
  } | null;
}

// ─── scope 설정 ─────────────────────────────────────────────────────

const SCOPE_BADGE: Record<ScopeType, { label: string; cls: string }> = {
  user: {
    label: "개인",
    cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  },
  topic: {
    label: "토픽",
    cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  },
  org: {
    label: "조직",
    cls: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  },
};

// 노드 타입 한글 매핑
const NODE_TYPE_LABELS: Record<string, string> = {
  "dx:User": "사용자",
  "dx:Expertise": "전문 분야",
  "dx:Preference": "관심 분야",
  "dx:Concept": "개념",
  "dx:Decision": "의사결정",
  "dx:Signal": "시그널",
  "dx:Glossary": "용어",
  "dx:Rule": "규칙",
  "dx:Pattern": "패턴",
};

const NODE_TYPE_COLORS: Record<string, string> = {
  "dx:User": "bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300",
  "dx:Expertise":
    "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300",
  "dx:Preference":
    "bg-pink-50 text-pink-700 dark:bg-pink-900/20 dark:text-pink-300",
  "dx:Concept":
    "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300",
  "dx:Decision":
    "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300",
  "dx:Signal":
    "bg-cyan-50 text-cyan-700 dark:bg-cyan-900/20 dark:text-cyan-300",
  "dx:Glossary":
    "bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-300",
  "dx:Rule":
    "bg-orange-50 text-orange-700 dark:bg-orange-900/20 dark:text-orange-300",
  "dx:Pattern":
    "bg-violet-50 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300",
};

const DEFAULT_TYPE_COLOR =
  "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";

// ─── 노드 그룹 컴포넌트 ────────────────────────────────────────────

function NodeGroup({
  type,
  nodes,
}: {
  type: string;
  nodes: JsonLdNode[];
}) {
  const typeLabel = NODE_TYPE_LABELS[type] ?? type.replace("dx:", "");
  const typeColor = NODE_TYPE_COLORS[type] ?? DEFAULT_TYPE_COLOR;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
      {/* 그룹 헤더 */}
      <div className="flex items-center gap-2 border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
        <span
          className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${typeColor}`}
        >
          {typeLabel}
        </span>
        <span className="text-xs text-[var(--axis-text-tertiary)]">
          {nodes.length}개
        </span>
      </div>

      {/* 노드 목록 */}
      <ul className="divide-y divide-neutral-100 dark:divide-neutral-700">
        {nodes.map((node) => (
          <NodeItem key={node["@id"]} node={node} />
        ))}
      </ul>
    </div>
  );
}

function NodeItem({ node }: { node: JsonLdNode }) {
  const label =
    (node["dx:label"] as string) ??
    (node["dx:name"] as string) ??
    node["@id"];
  const description = node["dx:description"] as string | undefined;
  const importance = node["dx:importance"] as number | undefined;

  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-[var(--axis-text-primary)]">
          {label}
        </span>
        {typeof importance === "number" && (
          <ImportanceBar value={importance} />
        )}
      </div>
      {description && (
        <p className="mt-1 text-xs text-[var(--axis-text-secondary)] line-clamp-2">
          {description}
        </p>
      )}
      <p className="mt-0.5 text-[10px] text-[var(--axis-text-tertiary)] font-mono">
        {node["@id"]}
      </p>
    </li>
  );
}

function ImportanceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-1" title={`중요도: ${pct}%`}>
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700">
        <div
          className="h-full rounded-full bg-[var(--axis-text-brand)]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] text-[var(--axis-text-tertiary)]">
        {pct}%
      </span>
    </div>
  );
}

// ─── 관계 목록 ──────────────────────────────────────────────────────

function EdgeList({ edges, nodeMap }: { edges: Edge[]; nodeMap: Map<string, string> }) {
  if (edges.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-[var(--axis-text-tertiary)]">
        관계가 없습니다
      </p>
    );
  }

  return (
    <ul className="divide-y divide-neutral-100 dark:divide-neutral-700">
      {edges.map((edge, i) => {
        const sourceName = nodeMap.get(edge.source) ?? edge.source;
        const targetName = nodeMap.get(edge.target) ?? edge.target;
        return (
          <li key={`${edge.source}-${edge.target}-${i}`} className="flex items-center gap-2 px-4 py-2.5 text-sm">
            <span className="font-medium text-[var(--axis-text-primary)] truncate max-w-[140px]">
              {sourceName}
            </span>
            <span className="shrink-0 rounded-md bg-neutral-100 px-2 py-0.5 text-xs text-[var(--axis-text-secondary)] dark:bg-neutral-700">
              {edge.type}
            </span>
            <svg
              className="h-3 w-3 shrink-0 text-[var(--axis-text-tertiary)]"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
              />
            </svg>
            <span className="font-medium text-[var(--axis-text-primary)] truncate max-w-[140px]">
              {targetName}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ─── Projection 미리보기 ────────────────────────────────────────────

function ProjectionPreview({
  projection,
}: {
  projection: { projType: string; content: string; graphVersion: number } | null;
}) {
  if (!projection) {
    return (
      <p className="py-6 text-center text-sm text-[var(--axis-text-tertiary)]">
        Projection이 아직 생성되지 않았습니다
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-xs text-[var(--axis-text-tertiary)]">
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono dark:bg-neutral-700">
          {projection.projType}
        </span>
        <span>Graph v{projection.graphVersion}</span>
      </div>
      <div className="prose prose-sm max-w-none rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-900 dark:prose-invert">
        <pre className="whitespace-pre-wrap text-xs">{projection.content}</pre>
      </div>
    </div>
  );
}

// ─── 유틸 ───────────────────────────────────────────────────────────

/** 노드를 @type별로 그룹핑 */
function groupByType(nodes: JsonLdNode[]): Map<string, JsonLdNode[]> {
  const map = new Map<string, JsonLdNode[]>();
  for (const node of nodes) {
    const t = node["@type"];
    const list = map.get(t) ?? [];
    list.push(node);
    map.set(t, list);
  }
  return map;
}

/** 노드 id → label 맵 */
function buildNodeMap(nodes: JsonLdNode[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const node of nodes) {
    const label =
      (node["dx:label"] as string) ??
      (node["dx:name"] as string) ??
      node["@id"];
    map.set(node["@id"], label);
  }
  return map;
}

// ─── 메인 컴포넌트 ──────────────────────────────────────────────────

export default function KnowledgeGraphDetail() {
  const { graphId } = useParams();
  const fetcher = useFetcher<GraphDetail | { error: string }>();

  useEffect(() => {
    if (graphId && fetcher.state === "idle" && !fetcher.data) {
      fetcher.load(`/api/knowledge/${graphId}`);
    }
  }, [graphId]); // eslint-disable-line react-hooks/exhaustive-deps

  const loading = fetcher.state === "loading" || (!fetcher.data && fetcher.state === "idle" && !graphId);
  const errorMsg =
    fetcher.data && "error" in fetcher.data ? fetcher.data.error : null;
  const data =
    fetcher.data && "graph" in fetcher.data ? fetcher.data : null;

  // 로딩
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-[var(--axis-text-brand)]" />
      </div>
    );
  }

  // 에러
  if (errorMsg || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 text-center">
        <p className="text-sm text-red-600 dark:text-red-400">
          {errorMsg ?? "데이터를 불러올 수 없습니다"}
        </p>
        <Link
          to="/knowledge"
          className="mt-4 inline-block text-sm text-[var(--axis-text-brand)] hover:underline"
        >
          목록으로 돌아가기
        </Link>
      </div>
    );
  }

  const { graph, projection } = data;
  const badge = SCOPE_BADGE[graph.scopeType];
  const grouped = groupByType(graph.nodes);
  const nodeMap = buildNodeMap(graph.nodes);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Link
          to="/knowledge"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-200 text-[var(--axis-text-tertiary)] transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-700"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
            />
          </svg>
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[var(--axis-text-primary)]">
              Graph: {graph.scopeId}
            </h1>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}
            >
              {badge.label}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-[var(--axis-text-tertiary)]">
            버전 {graph.version} | 노드 {graph.nodes.length}개 | 관계{" "}
            {graph.edges.length}개
          </p>
        </div>
      </div>

      {/* 노드 목록 (타입별 그룹) */}
      <section className="mt-6">
        <h2 className="text-sm font-semibold text-[var(--axis-text-primary)]">
          노드
        </h2>
        <div className="mt-3 space-y-4">
          {grouped.size === 0 ? (
            <p className="py-4 text-center text-sm text-[var(--axis-text-tertiary)]">
              노드가 없습니다
            </p>
          ) : (
            Array.from(grouped.entries()).map(([type, nodes]) => (
              <NodeGroup key={type} type={type} nodes={nodes} />
            ))
          )}
        </div>
      </section>

      {/* 관계 목록 */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-[var(--axis-text-primary)]">
          관계
        </h2>
        <div className="mt-3 rounded-lg border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-800">
          <EdgeList edges={graph.edges} nodeMap={nodeMap} />
        </div>
      </section>

      {/* Projection 미리보기 */}
      <section className="mt-8">
        <h2 className="text-sm font-semibold text-[var(--axis-text-primary)]">
          Projection 미리보기
        </h2>
        <div className="mt-3">
          <ProjectionPreview projection={projection} />
        </div>
      </section>
    </div>
  );
}
