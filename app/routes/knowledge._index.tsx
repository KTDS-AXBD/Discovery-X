/**
 * /knowledge — 팀 지식 베이스 메인 뷰
 * scope별 그래프 통계 + 카드 그리드 + 검색/필터
 */

import { useState, useEffect, useCallback } from "react";
import { Link } from "@remix-run/react";
import type { ScopeType } from "~/lib/graph/types";

// ─── 타입 ───────────────────────────────────────────────────────────

interface GraphSummary {
  id: string;
  scopeType: ScopeType;
  scopeId: string;
  scopeName: string;
  nodeCount: number;
  version: number;
  updatedAt: string;
}

interface KnowledgeData {
  graphs: GraphSummary[];
  stats: { total: number; user: number; topic: number; org: number };
}

// ─── scope 설정 ─────────────────────────────────────────────────────

const SCOPE_CONFIG: Record<
  ScopeType,
  { label: string; icon: string; badgeCls: string; cardAccent: string }
> = {
  user: {
    label: "개인",
    icon: "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
    badgeCls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
    cardAccent: "border-l-blue-400",
  },
  topic: {
    label: "토픽",
    icon: "M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z",
    badgeCls:
      "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
    cardAccent: "border-l-green-400",
  },
  org: {
    label: "조직",
    icon: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21",
    badgeCls:
      "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
    cardAccent: "border-l-purple-400",
  },
  team: {
    label: "팀",
    icon: "M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z",
    badgeCls:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
    cardAccent: "border-l-amber-400",
  },
};

type ScopeFilter = "all" | ScopeType;

// ─── 통계 카드 ──────────────────────────────────────────────────────

function StatCard({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border p-4 text-left transition-colors ${
        active
          ? "border-[var(--axis-border-brand)] bg-[var(--axis-surface-brand)]"
          : "border-neutral-200 bg-white hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:border-neutral-600"
      }`}
    >
      <p className="text-xs text-[var(--axis-text-tertiary)]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[var(--axis-text-primary)]">
        {count}
      </p>
    </button>
  );
}

// ─── 그래프 카드 ────────────────────────────────────────────────────

function GraphCard({ graph }: { graph: GraphSummary }) {
  const config = SCOPE_CONFIG[graph.scopeType];
  const updatedDate = graph.updatedAt
    ? formatDate(graph.updatedAt)
    : "-";

  return (
    <Link
      to={`/knowledge/${graph.id}`}
      className={`block rounded-lg border border-l-4 border-neutral-200 bg-white p-5 transition-shadow hover:shadow-md dark:border-neutral-700 dark:bg-neutral-800 ${config.cardAccent}`}
    >
      {/* 헤더: scope 배지 + 버전 */}
      <div className="flex items-center justify-between">
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.badgeCls}`}
        >
          <svg
            className="h-3 w-3"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d={config.icon}
            />
          </svg>
          {config.label}
        </span>
        <span className="text-xs text-[var(--axis-text-tertiary)]">
          v{graph.version}
        </span>
      </div>

      {/* 이름 */}
      <h3 className="mt-3 text-sm font-semibold text-[var(--axis-text-primary)] truncate">
        {graph.scopeName}
      </h3>

      {/* 메타 정보 */}
      <div className="mt-2 flex items-center gap-3 text-xs text-[var(--axis-text-tertiary)]">
        <span className="flex items-center gap-1">
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 9.563C9 9.252 9.252 9 9.563 9h4.874c.311 0 .563.252.563.563v4.874c0 .311-.252.563-.563.563H9.564A.562.562 0 0 1 9 14.437V9.564Z"
            />
          </svg>
          노드 {graph.nodeCount}개
        </span>
        <span>{updatedDate}</span>
      </div>
    </Link>
  );
}

// ─── 빈 상태 ────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--axis-surface-brand)]">
        <svg
          className="h-8 w-8 text-[var(--axis-text-brand)]"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
          />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-[var(--axis-text-primary)]">
        아직 지식 그래프가 없습니다
      </h3>
      <p className="mt-2 max-w-sm text-sm text-[var(--axis-text-secondary)]">
        프로필 설정, 토픽 생성, Agent 대화를 통해 지식 그래프가 자동으로
        구축됩니다.
      </p>
    </div>
  );
}

// ─── 유틸 ───────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ─── 메인 컴포넌트 ──────────────────────────────────────────────────

export default function KnowledgeIndex() {
  const [data, setData] = useState<KnowledgeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // 검색어 디바운스
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // API 호출
  const fetchData = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (scope !== "all") params.set("scope", scope);
    if (debouncedSearch) params.set("search", debouncedSearch);

    try {
      const res = await fetch(`/api/knowledge?${params.toString()}`);
      if (res.ok) {
        const result = (await res.json()) as KnowledgeData;
        setData(result);
      }
    } finally {
      setLoading(false);
    }
  }, [scope, debouncedSearch]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const stats = data?.stats ?? { total: 0, user: 0, topic: 0, org: 0 };
  const graphList = data?.graphs ?? [];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {/* 헤더 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--axis-text-primary)]">
            팀 지식 베이스
          </h1>
          <p className="mt-1 text-sm text-[var(--axis-text-secondary)]">
            개인, 토픽, 조직 지식 그래프를 통합 탐색합니다.
          </p>
        </div>

        {/* 검색 */}
        <div className="relative w-full sm:w-72">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--axis-text-tertiary)]"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
            />
          </svg>
          <input
            type="text"
            placeholder="노드 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm text-[var(--axis-text-primary)] placeholder:text-[var(--axis-text-tertiary)] focus:border-[var(--axis-border-brand)] focus:outline-none focus:ring-1 focus:ring-[var(--axis-border-brand)] dark:border-neutral-700 dark:bg-neutral-800"
          />
        </div>
      </div>

      {/* 통계 카드 */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="전체 그래프"
          count={stats.total}
          active={scope === "all"}
          onClick={() => setScope("all")}
        />
        <StatCard
          label="개인 그래프"
          count={stats.user}
          active={scope === "user"}
          onClick={() => setScope("user")}
        />
        <StatCard
          label="토픽 그래프"
          count={stats.topic}
          active={scope === "topic"}
          onClick={() => setScope("topic")}
        />
        <StatCard
          label="조직 그래프"
          count={stats.org}
          active={scope === "org"}
          onClick={() => setScope("org")}
        />
      </div>

      {/* 그래프 목록 */}
      <div className="mt-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-[var(--axis-text-brand)]" />
          </div>
        ) : graphList.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {graphList.map((g) => (
              <GraphCard key={g.id} graph={g} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
