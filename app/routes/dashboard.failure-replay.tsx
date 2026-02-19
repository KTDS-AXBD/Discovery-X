import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, users } from "~/db/schema";
import { DiscoveryStatus, TriggerType } from "~/db/schema";
import { PageHeader } from "~/components/layout/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/Card";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "~/components/ui/Table";
import { Badge } from "~/components/ui/Badge";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { and, eq, gte, lte } from "drizzle-orm";
import {
  getSessionContext,
  getSessionSecret,
} from "~/lib/auth/session.server";
import { formatDate } from "~/lib/format-date";
import { FAILURE_PATTERNS } from "~/lib/constants/failure-patterns";

const PATTERN_LABEL_MAP = Object.fromEntries(
  FAILURE_PATTERNS.map((p) => [p.id, p.label])
);

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  [TriggerType.TECHNOLOGY_MATURITY]: "기술 성숙도",
  [TriggerType.POLICY_REGULATION]: "정책/규제",
  [TriggerType.CUSTOMER_BEHAVIOR]: "고객 행동",
  [TriggerType.INTERNAL_CAPABILITY]: "내부 역량",
};

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return redirect("/login");

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Dead End: DROP 상태, 최근 30일 결정
  const deadEndRows = await db
    .select()
    .from(discoveries)
    .where(
      and(
        eq(discoveries.status, DiscoveryStatus.DROP),
        eq(discoveries.tenantId, ctx.tenantId),
        gte(discoveries.decidedAt, thirtyDaysAgo)
      )
    );

  const deadEndList = await Promise.all(
    deadEndRows.map(async (d) => {
      const owner = d.ownerId
        ? await db.query.users.findFirst({
            where: eq(users.id, d.ownerId),
          })
        : null;

      return {
        id: d.id,
        title: d.title,
        ownerName: owner?.name ?? null,
        decidedAt: d.decidedAt,
        failurePatterns: (d.deadEndFailurePattern as string[] | null) ?? [],
        evidenceReason: d.deadEndEvidenceReason,
      };
    })
  );

  // HOLD 재검토: revisitDate 도래
  const holdRows = await db
    .select()
    .from(discoveries)
    .where(
      and(
        eq(discoveries.status, DiscoveryStatus.HOLD),
        lte(discoveries.revisitDate, now),
        eq(discoveries.tenantId, ctx.tenantId)
      )
    );

  const holdList = await Promise.all(
    holdRows.map(async (d) => {
      const owner = d.ownerId
        ? await db.query.users.findFirst({
            where: eq(users.id, d.ownerId),
          })
        : null;

      const daysSinceRevisit = d.revisitDate
        ? Math.floor(
            (now.getTime() - new Date(d.revisitDate).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        : 0;

      return {
        id: d.id,
        title: d.title,
        ownerName: owner?.name ?? null,
        triggerType: d.notNowTriggerType,
        triggerCondition: d.notNowTriggerCondition,
        revisitDate: d.revisitDate,
        daysSinceRevisit,
      };
    })
  );

  holdList.sort((a, b) => {
    const dateA = a.revisitDate ? new Date(a.revisitDate).getTime() : 0;
    const dateB = b.revisitDate ? new Date(b.revisitDate).getTime() : 0;
    return dateA - dateB;
  });

  // Failure Pattern 집계
  const patternCounts: Record<string, { count: number; discoveryIds: string[] }> = {};
  for (const d of deadEndList) {
    for (const p of d.failurePatterns) {
      if (!patternCounts[p]) {
        patternCounts[p] = { count: 0, discoveryIds: [] };
      }
      patternCounts[p].count++;
      patternCounts[p].discoveryIds.push(d.id);
    }
  }

  const patternStats = Object.entries(patternCounts)
    .map(([id, { count, discoveryIds }]) => ({
      id,
      label: PATTERN_LABEL_MAP[id] ?? id,
      count,
      discoveryIds,
    }))
    .sort((a, b) => b.count - a.count);

  return json({
    deadEnds: deadEndList,
    holds: holdList,
    patternStats,
  });
}

function getElapsedColor(days: number): string {
  if (days < 7) return "text-[var(--axis-badge-success-text)]";
  if (days < 30) return "text-[var(--axis-badge-warning-text)]";
  return "text-[var(--axis-text-error)]";
}

function getElapsedBg(days: number): string {
  if (days < 7) return "";
  if (days < 30) return "bg-[var(--axis-badge-warning-bg)]";
  return "bg-[var(--axis-surface-error)]";
}

export default function DashboardFailureReplay() {
  const { deadEnds, holds, patternStats } = useLoaderData<typeof loader>();

  return (
    <>
      <PageHeader
        title="Monthly Failure Replay"
        description="Dead End 큐레이션 + Not Now 재검토 (월간 운영 미팅 지원)"
      />

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4 text-center">
          <div className="text-sm text-[var(--axis-text-tertiary)]">
            Dead End
          </div>
          <div className="mt-1 text-2xl font-bold text-[var(--axis-text-primary)]">
            {deadEnds.length}건
          </div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-sm text-[var(--axis-text-tertiary)]">
            HOLD 재검토 대상
          </div>
          <div className="mt-1 text-2xl font-bold text-[var(--axis-text-primary)]">
            {holds.length}건
          </div>
        </Card>
        <Card className="p-4 text-center">
          <div className="text-sm text-[var(--axis-text-tertiary)]">
            Failure Pattern 종류
          </div>
          <div className="mt-1 text-2xl font-bold text-[var(--axis-text-primary)]">
            {patternStats.length}개
          </div>
        </Card>
      </div>

      {/* 섹션 1: Dead End 큐레이션 */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-[var(--axis-text-primary)]">
          Dead End 큐레이션 (최근 30일)
        </h2>

        {deadEnds.length === 0 ? (
          <AlertBanner variant="info" title="데이터 없음">
            최근 30일 내 Dead End(DROP) 상태 Discovery가 없습니다.
          </AlertBanner>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="space-y-3 sm:hidden">
              {deadEnds.map((d) => (
                <Link
                  key={d.id}
                  to={`/discoveries/${d.id}`}
                  className="block rounded-lg bg-[var(--axis-surface-default)] p-4 shadow"
                >
                  <h3 className="text-sm font-medium text-[var(--axis-text-primary)]">
                    {d.title}
                  </h3>
                  <div className="mt-2 space-y-1 text-xs text-[var(--axis-text-tertiary)]">
                    <p>{d.ownerName || "미지정"}</p>
                    {d.decidedAt && <p>결정일: {formatDate(d.decidedAt)}</p>}
                    {d.failurePatterns.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {d.failurePatterns.map((p) => (
                          <Badge key={p} variant="destructive">
                            {PATTERN_LABEL_MAP[p] ?? p}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">제목</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>결정일</TableHead>
                    <TableHead>Failure Pattern</TableHead>
                    <TableHead className="pr-6">근거 요약</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deadEnds.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="max-w-xs truncate pl-6 font-medium text-[var(--axis-text-primary)]">
                        <Link
                          to={`/discoveries/${d.id}`}
                          className="hover:text-[var(--axis-text-brand)]"
                        >
                          {d.title}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {d.ownerName || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {d.decidedAt ? formatDate(d.decidedAt) : "—"}
                      </TableCell>
                      <TableCell>
                        {d.failurePatterns.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {d.failurePatterns.map((p) => (
                              <Badge key={p} variant="destructive">
                                {PATTERN_LABEL_MAP[p] ?? p}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[var(--axis-text-tertiary)]">
                            미지정
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-xs truncate pr-6">
                        {d.evidenceReason || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>

      {/* 섹션 2: Not Now 재검토 */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-[var(--axis-text-primary)]">
          Not Now 재검토 (revisitDate 도래)
        </h2>

        {holds.length === 0 ? (
          <AlertBanner variant="info" title="데이터 없음">
            재검토 날짜가 도래한 HOLD 상태 Discovery가 없습니다.
          </AlertBanner>
        ) : (
          <>
            {/* Mobile Cards */}
            <div className="space-y-3 sm:hidden">
              {holds.map((d) => (
                <Link
                  key={d.id}
                  to={`/discoveries/${d.id}`}
                  className={`block rounded-lg p-4 shadow ${getElapsedBg(d.daysSinceRevisit)}`}
                >
                  <h3 className="text-sm font-medium text-[var(--axis-text-primary)]">
                    {d.title}
                  </h3>
                  <div className="mt-2 space-y-1 text-xs text-[var(--axis-text-tertiary)]">
                    <p>{d.ownerName || "미지정"}</p>
                    {d.revisitDate && (
                      <p>
                        재검토: {formatDate(d.revisitDate)}
                        {d.daysSinceRevisit > 0 &&
                          ` (${d.daysSinceRevisit}일 경과)`}
                      </p>
                    )}
                    {d.triggerType && (
                      <p>
                        {TRIGGER_TYPE_LABELS[d.triggerType] || d.triggerType}
                      </p>
                    )}
                  </div>
                </Link>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">제목</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Trigger Type</TableHead>
                    <TableHead>조건</TableHead>
                    <TableHead>재검토일</TableHead>
                    <TableHead className="pr-6">경과일수</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {holds.map((d) => (
                    <TableRow key={d.id} className={getElapsedBg(d.daysSinceRevisit)}>
                      <TableCell className="max-w-xs truncate pl-6 font-medium text-[var(--axis-text-primary)]">
                        <Link
                          to={`/discoveries/${d.id}`}
                          className="hover:text-[var(--axis-text-brand)]"
                        >
                          {d.title}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {d.ownerName || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {d.triggerType
                          ? TRIGGER_TYPE_LABELS[d.triggerType] || d.triggerType
                          : "—"}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {d.triggerCondition || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {d.revisitDate ? formatDate(d.revisitDate) : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap pr-6">
                        <span
                          className={`font-semibold ${getElapsedColor(d.daysSinceRevisit)}`}
                        >
                          {d.daysSinceRevisit}일
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>

      {/* 섹션 3: Failure Pattern 분포 */}
      <section className="mt-10">
        <h2 className="mb-4 text-lg font-semibold text-[var(--axis-text-primary)]">
          Failure Pattern 분포
        </h2>

        {patternStats.length === 0 ? (
          <AlertBanner variant="info" title="데이터 없음">
            Failure Pattern 데이터가 없습니다. Dead End 결정 시 패턴을 태깅하면
            여기에 표시됩니다.
          </AlertBanner>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {patternStats.map((stat) => (
              <Card key={stat.id}>
                <CardHeader>
                  <CardTitle className="text-sm">{stat.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-[var(--axis-text-primary)]">
                    {stat.count}건
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {stat.discoveryIds.map((did) => (
                      <Link
                        key={did}
                        to={`/discoveries/${did}`}
                        className="text-xs text-[var(--axis-text-brand)] hover:underline"
                      >
                        {did.slice(0, 8)}…
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* 운영 가이드 */}
      <AlertBanner
        variant="purple"
        title="Monthly Failure Replay 진행 가이드"
        className="mt-8"
      >
        <ul className="mt-2 space-y-1">
          <li>
            Curator가 Dead End 3개 + Revisit 도래 Not Now를 큐레이션합니다
          </li>
          <li>
            Failure Pattern을 정제합니다 (태그/요약/근거 링크 확인)
          </li>
          <li>
            Not Now 재결정: Next / Dead End / Not Now(날짜 갱신) 중 선택합니다
          </li>
          <li>
            목표: 30분 내 완료
          </li>
        </ul>
      </AlertBanner>
    </>
  );
}
