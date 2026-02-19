import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData, useSearchParams } from "@remix-run/react";
import { useEffect, useState } from "react";
import { getDb } from "~/db";
import { discoveries, users } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { tenantWhere } from "~/lib/query/tenant-scope";
import { AppShell } from "~/components/layout/AppShell";
import { PageHeader } from "~/components/layout/PageHeader";
import { StatusBadge } from "~/components/ui/StatusBadge";
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { SearchInput } from "~/components/ui/SearchInput";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "~/components/ui/Table";
import { STATUS_CONFIG } from "~/lib/constants/status";
import { cn } from "~/lib/utils/cn";
import { eq, inArray } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import { formatDate, isOverdue } from "~/lib/format-date";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  // Get filter from query params
  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status");

  // Query discoveries with optional status filter + tenant scope
  let allDiscoveries;
  if (statusFilter === "OVERDUE") {
    // Special filter: OPEN/EXTENSION_REQUESTED + dueDate < now
    const openDiscoveries = await db.select().from(discoveries)
      .where(tenantWhere(discoveries, ctx.tenantId));
    allDiscoveries = openDiscoveries.filter(
      (d) =>
        (d.status === DiscoveryStatus.IDEA_CARD ||
          d.status === DiscoveryStatus.HYPOTHESIS) &&
        isOverdue(d.dueDate)
    );
  } else if (statusFilter && statusFilter in DiscoveryStatus) {
    allDiscoveries = await db.select().from(discoveries)
      .where(tenantWhere(discoveries, ctx.tenantId, eq(discoveries.status, statusFilter)));
  } else {
    allDiscoveries = await db.select().from(discoveries)
      .where(tenantWhere(discoveries, ctx.tenantId));
  }

  // Batch-fetch owner names
  const ownerIds = [...new Set(allDiscoveries.map((d) => d.ownerId).filter(Boolean))] as string[];
  const ownerList = ownerIds.length > 0
    ? await db.select().from(users).where(inArray(users.id, ownerIds))
    : [];
  const ownerMap = new Map(ownerList.map((u) => [u.id, u]));

  const discoveryList = allDiscoveries.map((discovery) => {
    const owner = discovery.ownerId ? ownerMap.get(discovery.ownerId) : null;

    const isInboxOverdue =
      discovery.status === DiscoveryStatus.DISCOVERY &&
      Date.now() - new Date(discovery.createdAt).getTime() > 7 * 24 * 60 * 60 * 1000;

    const isOpenOverdue =
      (discovery.status === DiscoveryStatus.IDEA_CARD ||
        discovery.status === DiscoveryStatus.HYPOTHESIS) &&
      isOverdue(discovery.dueDate);

    return {
      ...discovery,
      ownerName: owner?.name,
      isInboxOverdue,
      isOpenOverdue,
    };
  });

  return json({ user: ctx.user, discoveries: discoveryList });
}


interface SemanticResult {
  id: string;
  title: string;
  seedSummary: string | null;
  status: string;
  score?: number;
  deadEndFailurePattern?: unknown;
  notNowTriggerType?: string | null;
  notNowTriggerCondition?: string | null;
}

interface SemanticResponse {
  results: SemanticResult[];
  source?: "vectorize" | "fts5";
}

type SearchMode = "text" | "semantic";

export default function DiscoveriesIndex() {
  const { user, discoveries } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const currentFilter = searchParams.get("status");

  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>("text");
  const [semanticResults, setSemanticResults] = useState<SemanticResult[]>([]);
  const [semanticSource, setSemanticSource] = useState<
    "vectorize" | "fts5" | null
  >(null);
  const [isSearching, setIsSearching] = useState(false);

  // 시맨틱 검색 디바운스 (300ms)
  useEffect(() => {
    if (searchMode !== "semantic" || searchQuery.length < 2) {
      setSemanticResults([]);
      setSemanticSource(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/similar-seeds?q=${encodeURIComponent(searchQuery)}&limit=10`,
          { signal: controller.signal },
        );
        const data = (await res.json()) as SemanticResponse;
        setSemanticResults(data.results ?? []);
        setSemanticSource(data.source ?? null);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setSemanticResults([]);
        setSemanticSource(null);
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
  }, [searchQuery, searchMode]);

  const isSemanticView = searchMode === "semantic" && searchQuery.length >= 2;

  // 텍스트 모드: 클라이언트 사이드 필터링
  const filteredDiscoveries =
    searchMode === "text" && searchQuery.length >= 2
      ? discoveries.filter((d) => {
          const q = searchQuery.toLowerCase();
          return (
            d.title.toLowerCase().includes(q) ||
            (d.seedSummary &&
              String(d.seedSummary).toLowerCase().includes(q))
          );
        })
      : discoveries;

  return (
    <AppShell user={user}>
      <PageHeader
        title="Discoveries"
        description="전체 Discovery 목록을 확인하고 관리합니다"
        actions={
          <Button asChild>
            <Link to="/discoveries/new">새 Discovery 만들기</Link>
          </Button>
        }
      />

      {/* Filters — flat text style */}
      <div className="mt-6 flex flex-wrap gap-4">
        <Link
          to="/discoveries"
          className={cn(
            "pb-1 text-sm font-medium transition-colors duration-[var(--dx-transition-normal)]",
            !currentFilter
              ? "text-[var(--axis-text-primary)] font-semibold border-b-2 border-[var(--axis-text-brand)]"
              : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]"
          )}
        >
          전체
        </Link>
        {Object.entries(STATUS_CONFIG).map(([status, { label }]) => (
          <Link
            key={status}
            to={`/discoveries?status=${status}`}
            className={cn(
              "pb-1 text-sm font-medium transition-colors duration-[var(--dx-transition-normal)]",
              currentFilter === status
                ? "text-[var(--axis-text-primary)] font-semibold border-b-2 border-[var(--axis-text-brand)]"
                : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]"
            )}
          >
            {status === "DISCOVERY" ? "Inbox (임시)" : label}
          </Link>
        ))}
        <Link
          to="/discoveries?status=OVERDUE"
          className={cn(
            "pb-1 text-sm font-medium transition-colors duration-[var(--dx-transition-normal)]",
            currentFilter === "OVERDUE"
              ? "text-[var(--axis-text-error)] font-semibold border-b-2 border-[var(--axis-text-error)]"
              : "text-[var(--axis-text-error)] opacity-60 hover:opacity-100"
          )}
        >
          기한초과
        </Link>
      </div>

      {/* 검색 */}
      <div className="mt-4 flex items-center gap-3">
        <SearchInput
          placeholder={
            searchMode === "semantic"
              ? "AI 시맨틱 검색..."
              : "제목, 요약으로 검색..."
          }
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm flex-1"
        />
        <div className="flex items-center gap-1 text-xs">
          <button
            type="button"
            onClick={() => setSearchMode("text")}
            className={cn(
              "rounded px-2 py-1 transition-colors",
              searchMode === "text"
                ? "bg-[var(--dx-surface-card-hover,var(--axis-surface-tertiary))] text-[var(--axis-text-primary)] font-medium"
                : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]",
            )}
          >
            텍스트
          </button>
          <button
            type="button"
            onClick={() => setSearchMode("semantic")}
            className={cn(
              "rounded px-2 py-1 transition-colors",
              searchMode === "semantic"
                ? "bg-[var(--dx-surface-card-hover,var(--axis-surface-tertiary))] text-[var(--axis-text-primary)] font-medium"
                : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]",
            )}
          >
            시맨틱 (AI)
          </button>
          {searchMode === "semantic" && (
            <Badge variant="purple" className="ml-1">
              AI
            </Badge>
          )}
        </div>
      </div>

      {/* 시맨틱 검색 결과 헤더 */}
      {isSemanticView &&
        !isSearching &&
        semanticResults.length > 0 &&
        semanticSource && (
          <div className="mt-4 flex items-center gap-2">
            <Badge
              variant={
                semanticSource === "vectorize" ? "purple" : "subtle"
              }
            >
              {semanticSource === "vectorize" ? "Vectorize" : "FTS"}
            </Badge>
            <span className="text-xs text-[var(--axis-text-tertiary)]">
              {semanticResults.length}건 검색됨
            </span>
          </div>
        )}

      {/* 로딩 */}
      {isSemanticView && isSearching && (
        <p className="mt-8 py-12 text-center text-sm text-[var(--axis-text-tertiary)]">
          검색 중...
        </p>
      )}

      {/* 시맨틱 검색 결과 */}
      {isSemanticView && !isSearching && (
        <>
          {/* Mobile Cards — Semantic */}
          <div className="mt-4 space-y-3 sm:hidden">
            {semanticResults.length === 0 ? (
              <p className="py-12 text-center text-sm text-[var(--axis-text-tertiary)]">
                검색 결과가 없습니다.
              </p>
            ) : (
              semanticResults.map((result) => (
                <Link
                  key={String(result.id)}
                  to={`/discoveries/${result.id}`}
                  className="block rounded-[var(--dx-card-radius)] bg-[var(--dx-surface-card,var(--axis-surface-default))] p-5 border border-[var(--dx-border-subtle,var(--dx-card-border-subtle))] transition-colors hover:bg-[var(--dx-surface-card-hover,var(--axis-surface-secondary))]"
                >
                  <div className="flex items-start justify-between">
                    <h3 className="text-sm font-medium text-[var(--axis-text-primary)]">
                      {result.title}
                    </h3>
                    <span className="ml-2 shrink-0">
                      <StatusBadge status={result.status} />
                    </span>
                  </div>
                  {result.score != null && (
                    <div className="mt-2 text-xs text-[var(--axis-text-brand)]">
                      {Math.round(result.score * 100)}% 유사
                    </div>
                  )}
                </Link>
              ))
            )}
          </div>

          {/* Desktop Table — Semantic */}
          <div className="mt-4 hidden sm:block">
            <Table>
              <TableHeader>
                <tr>
                  <TableHead className="pl-6">제목</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>유사도</TableHead>
                  <TableHead className="text-right pr-6">
                    <span className="sr-only">액션</span>
                  </TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {semanticResults.length === 0 ? (
                  <tr>
                    <td
                      colSpan={4}
                      className="py-12 text-center text-sm text-[var(--axis-text-tertiary)]"
                    >
                      검색 결과가 없습니다.
                    </td>
                  </tr>
                ) : (
                  semanticResults.map((result) => (
                    <TableRow key={String(result.id)}>
                      <TableCell className="pl-6 font-medium text-[var(--axis-text-primary)]">
                        <Link
                          to={`/discoveries/${result.id}`}
                          className="hover:text-[var(--axis-text-brand)]"
                        >
                          {result.title}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={result.status} />
                      </TableCell>
                      <TableCell>
                        {result.score != null ? (
                          <span className="text-xs text-[var(--axis-text-brand)]">
                            {Math.round(result.score * 100)}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-6">
                        <Link
                          to={`/discoveries/${result.id}`}
                          className="text-[var(--axis-text-brand)] hover:underline"
                        >
                          보기
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      {/* 일반 목록 (텍스트 모드 또는 검색 미사용) */}
      {!isSemanticView && (
        <>
          {/* Mobile Cards */}
          <div className="mt-8 space-y-3 sm:hidden">
            {filteredDiscoveries.length === 0 ? (
              <p className="py-12 text-center text-sm text-[var(--axis-text-tertiary)]">
                {searchQuery.length >= 2
                  ? "검색 결과가 없습니다."
                  : "표시할 Discovery가 없습니다."}
              </p>
            ) : (
              filteredDiscoveries.map((discovery) => (
                <Link
                  key={discovery.id}
                  to={`/discoveries/${discovery.id}`}
                  className={cn(
                    "block rounded-[var(--dx-card-radius)] bg-[var(--dx-surface-card,var(--axis-surface-default))] p-5 border border-[var(--dx-border-subtle,var(--dx-card-border-subtle))] transition-colors hover:bg-[var(--dx-surface-card-hover,var(--axis-surface-secondary))]",
                    (discovery.isInboxOverdue || discovery.isOpenOverdue) &&
                      "ring-2 ring-[var(--axis-border-error)]",
                  )}
                >
                  <div className="flex items-start justify-between">
                    <h3 className="text-sm font-medium text-[var(--axis-text-primary)]">
                      {discovery.title}
                    </h3>
                    <span className="ml-2 shrink-0">
                      <StatusBadge status={discovery.status} />
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs text-[var(--axis-text-tertiary)]">
                    <span>{discovery.ownerName || "미지정"}</span>
                    <span>{formatDate(discovery.createdAt)}</span>
                    {discovery.isInboxOverdue && (
                      <Badge variant="destructive">⚠ 7일 초과 — 승격 또는 DROP 필요</Badge>
                    )}
                    {discovery.isOpenOverdue && (
                      <Badge variant="destructive">OVERDUE</Badge>
                    )}
                  </div>
                  {discovery.status === DiscoveryStatus.DISCOVERY && !discovery.isInboxOverdue && (
                    <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                      실험을 등록하여 승격하세요
                    </p>
                  )}
                </Link>
              ))
            )}
          </div>

          {/* Desktop Table */}
          <div className="mt-8 hidden sm:block">
            <Table>
              <TableHeader>
                <tr>
                  <TableHead className="pl-6">제목</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>생성일</TableHead>
                  <TableHead className="text-right pr-6">
                    <span className="sr-only">액션</span>
                  </TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {filteredDiscoveries.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="py-12 text-center text-sm text-[var(--axis-text-tertiary)]"
                    >
                      {searchQuery.length >= 2
                        ? "검색 결과가 없습니다."
                        : "표시할 Discovery가 없습니다."}
                    </td>
                  </tr>
                ) : (
                  filteredDiscoveries.map((discovery) => (
                    <TableRow
                      key={discovery.id}
                      className={cn(
                        "transition-colors hover:bg-[var(--axis-surface-secondary)]",
                        (discovery.isInboxOverdue ||
                          discovery.isOpenOverdue) &&
                          "bg-[var(--axis-surface-error)]",
                      )}
                    >
                      <TableCell className="pl-6 font-medium text-[var(--axis-text-primary)]">
                        <Link
                          to={`/discoveries/${discovery.id}`}
                          className="hover:text-[var(--axis-text-brand)]"
                        >
                          {discovery.title}
                        </Link>
                        {discovery.isInboxOverdue && (
                          <Badge variant="destructive" className="ml-2">
                            ⚠ 7일 초과 — 승격 또는 DROP 필요
                          </Badge>
                        )}
                        {discovery.isOpenOverdue && (
                          <Badge variant="destructive" className="ml-2">
                            OVERDUE
                          </Badge>
                        )}
                        {discovery.status === DiscoveryStatus.DISCOVERY && !discovery.isInboxOverdue && (
                          <span className="ml-2 text-xs text-[var(--axis-text-tertiary)]">
                            실험을 등록하여 승격하세요
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={discovery.status} />
                      </TableCell>
                      <TableCell>{discovery.ownerName || "—"}</TableCell>
                      <TableCell>{formatDate(discovery.createdAt)}</TableCell>
                      <TableCell className="text-right pr-6">
                        <Link
                          to={`/discoveries/${discovery.id}`}
                          className="text-[var(--axis-text-brand)] hover:underline"
                        >
                          보기
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </AppShell>
  );
}
