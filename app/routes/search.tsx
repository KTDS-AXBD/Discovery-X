import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { useEffect, useRef, useState } from "react";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { PageHeader } from "~/components/layout/PageHeader";
import { SearchInput } from "~/components/ui/SearchInput";
import { Badge } from "~/components/ui/Badge";
import { StatusBadge } from "~/components/ui/StatusBadge";
import { cn } from "~/lib/utils/cn";
import { formatDate } from "~/lib/format-date";

// ─── Types ──────────────────────────────────────────────────────────

type EntityType = "all" | "discovery" | "idea" | "source" | "proposal";
type SearchMode = "text" | "semantic";

interface SearchResult {
  id: string;
  type: "discovery" | "idea" | "source" | "proposal";
  title: string;
  subtitle: string | null;
  status: string;
  score?: number;
  url: string;
  source?: "vectorize" | "fts5" | "like";
  createdAt: string | null;
}

interface SearchResponse {
  results: SearchResult[];
  total: number;
  mode: SearchMode;
  query: string;
}

// ─── Loader ─────────────────────────────────────────────────────────

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return redirect("/login");
  return json({ user: ctx.user });
}

// ─── 카테고리 탭 설정 ───────────────────────────────────────────────

const TABS: Array<{ value: EntityType; label: string }> = [
  { value: "all", label: "전체" },
  { value: "discovery", label: "Discovery" },
  { value: "idea", label: "아이디어" },
  { value: "source", label: "소스" },
  { value: "proposal", label: "사업제안" },
];

const TYPE_BADGE_VARIANT: Record<string, "default" | "warning" | "success" | "purple"> = {
  discovery: "default",
  idea: "warning",
  source: "success",
  proposal: "purple",
};

const TYPE_LABEL: Record<string, string> = {
  discovery: "Discovery",
  idea: "아이디어",
  source: "소스",
  proposal: "사업제안",
};

const SOURCE_LABEL: Record<string, string> = {
  vectorize: "Vectorize",
  fts5: "FTS",
  like: "LIKE",
};

// ─── Component ──────────────────────────────────────────────────────

export default function SearchPage() {
  const { user } = useLoaderData<typeof loader>();

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("text");
  const [activeTab, setActiveTab] = useState<EntityType>("all");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // 페이지 진입 시 자동 포커스
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 검색 디바운스 (300ms) + AbortController
  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setIsSearching(false);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          q: query,
          type: activeTab,
          mode,
          limit: "20",
        });
        const res = await fetch(`/api/search?${params}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as SearchResponse;
        setResults(data.results ?? []);
        setHasSearched(true);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setResults([]);
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, mode, activeTab]);

  // 탭별 결과 수 계산
  const countByType = (type: EntityType) => {
    if (type === "all") return results.length;
    return results.filter((r) => r.type === type).length;
  };

  // 현재 탭에 따른 필터링 (all이면 전체 API 결과 사용)
  const filteredResults = activeTab === "all"
    ? results
    : results.filter((r) => r.type === activeTab);

  return (
    <AppShell user={user} hideSidebar>
      <PageHeader
        title="통합 검색"
        description="Discovery, 아이디어, 소스, 사업제안을 한번에 검색합니다"
      />

      {/* 검색 입력 */}
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center gap-3">
          <SearchInput
            ref={inputRef}
            placeholder={
              mode === "semantic"
                ? "AI 시맨틱 검색..."
                : "검색어를 입력하세요..."
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1"
          />
          <div className="flex shrink-0 items-center gap-1 text-xs">
            <button
              type="button"
              onClick={() => setMode("text")}
              className={cn(
                "rounded px-2 py-1 transition-colors",
                mode === "text"
                  ? "bg-[var(--dx-surface-card-hover,var(--axis-surface-tertiary))] font-medium text-[var(--axis-text-primary)]"
                  : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]",
              )}
            >
              텍스트
            </button>
            <button
              type="button"
              onClick={() => setMode("semantic")}
              className={cn(
                "rounded px-2 py-1 transition-colors",
                mode === "semantic"
                  ? "bg-[var(--dx-surface-card-hover,var(--axis-surface-tertiary))] font-medium text-[var(--axis-text-primary)]"
                  : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]",
              )}
            >
              시맨틱 (AI)
            </button>
            {mode === "semantic" && (
              <Badge variant="purple" className="ml-1">AI</Badge>
            )}
          </div>
        </div>
      </div>

      {/* 카테고리 탭 */}
      {hasSearched && (
        <div className="mt-6 flex flex-wrap gap-4">
          {TABS.map((tab) => {
            const count = countByType(tab.value);
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={cn(
                  "pb-1 text-sm font-medium transition-colors duration-[var(--dx-transition-normal)]",
                  activeTab === tab.value
                    ? "border-b-2 border-[var(--axis-text-brand)] font-semibold text-[var(--axis-text-primary)]"
                    : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]",
                )}
              >
                {tab.label}
                {hasSearched && (
                  <span className="ml-1.5 text-xs text-[var(--axis-text-tertiary)]">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 로딩 */}
      {isSearching && (
        <p className="mt-8 py-12 text-center text-sm text-[var(--axis-text-tertiary)]">
          검색 중...
        </p>
      )}

      {/* 초기 상태 */}
      {!hasSearched && !isSearching && query.length < 2 && (
        <p className="mt-8 py-12 text-center text-sm text-[var(--axis-text-tertiary)]">
          검색어를 입력하면 Discovery, 아이디어, 소스, 사업제안을 한번에 검색합니다
        </p>
      )}

      {/* 결과 없음 */}
      {hasSearched && !isSearching && filteredResults.length === 0 && (
        <p className="mt-8 py-12 text-center text-sm text-[var(--axis-text-tertiary)]">
          &ldquo;{query}&rdquo;에 대한 검색 결과가 없습니다.
        </p>
      )}

      {/* 검색 결과 */}
      {hasSearched && !isSearching && filteredResults.length > 0 && (
        <>
          {/* Mobile 카드 */}
          <div className="mt-6 space-y-3 sm:hidden">
            {filteredResults.map((result) => (
              <ResultCard key={`${result.type}-${result.id}`} result={result} />
            ))}
          </div>

          {/* Desktop 카드 리스트 */}
          <div className="mt-6 hidden space-y-2 sm:block">
            {filteredResults.map((result) => (
              <ResultRow key={`${result.type}-${result.id}`} result={result} />
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}

// ─── 모바일 카드 ────────────────────────────────────────────────────

function ResultCard({ result }: { result: SearchResult }) {
  return (
    <Link
      to={result.url}
      className="block rounded-[var(--dx-card-radius)] border border-[var(--dx-border-subtle,var(--dx-card-border-subtle))] bg-[var(--dx-surface-card,var(--axis-surface-default))] p-4 transition-colors hover:bg-[var(--dx-surface-card-hover,var(--axis-surface-secondary))]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <Badge variant={TYPE_BADGE_VARIANT[result.type]}>
              {TYPE_LABEL[result.type]}
            </Badge>
            <h3 className="truncate text-sm font-medium text-[var(--axis-text-primary)]">
              {result.title}
            </h3>
          </div>
          {result.subtitle && (
            <p className="truncate text-xs text-[var(--axis-text-tertiary)]">
              {result.subtitle}
            </p>
          )}
        </div>
        <span className="shrink-0">
          <StatusBadge status={result.status} />
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--axis-text-tertiary)]">
        {result.score != null && (
          <span className="text-[var(--axis-text-brand)]">
            {Math.round(result.score * 100)}% 유사
          </span>
        )}
        {result.source && (
          <Badge variant="subtle">{SOURCE_LABEL[result.source] ?? result.source}</Badge>
        )}
        <span>{formatDate(result.createdAt)}</span>
      </div>
    </Link>
  );
}

// ─── 데스크톱 행 ────────────────────────────────────────────────────

function ResultRow({ result }: { result: SearchResult }) {
  return (
    <Link
      to={result.url}
      className="flex items-center gap-4 rounded-[var(--dx-card-radius)] border border-[var(--dx-border-subtle,var(--dx-card-border-subtle))] bg-[var(--dx-surface-card,var(--axis-surface-default))] px-5 py-3 transition-colors hover:bg-[var(--dx-surface-card-hover,var(--axis-surface-secondary))]"
    >
      <Badge variant={TYPE_BADGE_VARIANT[result.type]} className="shrink-0">
        {TYPE_LABEL[result.type]}
      </Badge>

      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium text-[var(--axis-text-primary)]">
          {result.title}
        </h3>
        {result.subtitle && (
          <p className="mt-0.5 truncate text-xs text-[var(--axis-text-tertiary)]">
            {result.subtitle}
          </p>
        )}
      </div>

      <StatusBadge status={result.status} />

      {result.score != null && (
        <span className="shrink-0 text-xs text-[var(--axis-text-brand)]">
          {Math.round(result.score * 100)}%
        </span>
      )}

      {result.source && (
        <Badge variant="subtle" className="shrink-0">
          {SOURCE_LABEL[result.source] ?? result.source}
        </Badge>
      )}

      <span className="shrink-0 text-xs text-[var(--axis-text-tertiary)]">
        {formatDate(result.createdAt)}
      </span>
    </Link>
  );
}
