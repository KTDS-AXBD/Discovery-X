import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, users } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { PageLayout } from "~/components/layout/PageLayout";
import { PageHeader } from "~/components/layout/PageHeader";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "~/components/ui/Table";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { Card } from "~/components/ui/Card";
import { eq, and, lte } from "drizzle-orm";
import { DiscoveryStatus, TriggerType } from "~/db/schema";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  // Get all NOT_NOW discoveries where revisitDate <= today
  const now = new Date();
  const notNowDiscoveries = await db
    .select()
    .from(discoveries)
    .where(
      and(
        eq(discoveries.status, DiscoveryStatus.NOT_NOW),
        lte(discoveries.revisitDate, now)
      )
    );

  // Enrich with owner info
  const discoveryList = await Promise.all(
    notNowDiscoveries.map(async (discovery) => {
      const owner = discovery.ownerId
        ? await db.query.users.findFirst({
            where: eq(users.id, discovery.ownerId),
          })
        : null;

      // Calculate days since revisit date was supposed to trigger
      const daysSinceRevisit = discovery.revisitDate
        ? Math.floor(
            (Date.now() - new Date(discovery.revisitDate).getTime()) / (1000 * 60 * 60 * 24)
          )
        : 0;

      return {
        ...discovery,
        ownerName: owner?.name,
        daysSinceRevisit,
      };
    })
  );

  // Sort by revisitDate ascending (oldest first)
  discoveryList.sort((a, b) => {
    const dateA = a.revisitDate ? new Date(a.revisitDate).getTime() : 0;
    const dateB = b.revisitDate ? new Date(b.revisitDate).getTime() : 0;
    return dateA - dateB;
  });

  return json({ user, discoveries: discoveryList });
}

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  [TriggerType.TECHNOLOGY_MATURITY]: "기술 성숙도",
  [TriggerType.POLICY_REGULATION]: "정책/규제",
  [TriggerType.CUSTOMER_BEHAVIOR]: "고객 행동",
  [TriggerType.INTERNAL_CAPABILITY]: "내부 역량",
};

export default function RecallQueue() {
  const { user, discoveries } = useLoaderData<typeof loader>();

  return (
    <PageLayout user={user}>
      <PageHeader
        title="Recall Queue"
        description="재검토 날짜가 도래한 NOT_NOW Discovery 목록"
        actions={
          <div className="text-sm text-[var(--axis-text-tertiary)]">
            총 <span className="font-semibold text-[var(--axis-text-primary)]">{discoveries.length}</span>개 재검토 대기
          </div>
        }
      />

      {/* Discovery List - Mobile Cards */}
      <div className="space-y-3 sm:hidden">
        {discoveries.length === 0 ? (
          <p className="py-12 text-center text-sm text-[var(--axis-text-tertiary)]">
            재검토 대기 중인 Discovery가 없습니다.
          </p>
        ) : (
          discoveries.map((discovery) => (
            <Link
              key={discovery.id}
              to={`/discoveries/${discovery.id}`}
              className={`block rounded-lg p-4 shadow ${
                discovery.daysSinceRevisit > 7
                  ? "bg-[var(--axis-badge-warning-bg)]"
                  : discovery.daysSinceRevisit > 0
                  ? "bg-[var(--axis-badge-info-bg)]"
                  : "bg-[var(--axis-surface-default)]"
              }`}
            >
              <h3 className="text-sm font-medium text-[var(--axis-text-primary)]">{discovery.title}</h3>
              <div className="mt-2 space-y-1 text-xs text-[var(--axis-text-tertiary)]">
                <p>{discovery.ownerName || "미지정"}</p>
                {discovery.revisitDate && (
                  <p>
                    재검토: {new Date(discovery.revisitDate).toLocaleDateString("ko-KR")}
                    {discovery.daysSinceRevisit > 0 && ` (${discovery.daysSinceRevisit}일 경과)`}
                  </p>
                )}
                {discovery.notNowTriggerType && (
                  <p>
                    {TRIGGER_TYPE_LABELS[discovery.notNowTriggerType] || discovery.notNowTriggerType}
                  </p>
                )}
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Discovery List - Desktop Table */}
      <div className="hidden flow-root sm:block">
        <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6">제목</TableHead>
                  <TableHead>Original Owner</TableHead>
                  <TableHead>재검토 날짜</TableHead>
                  <TableHead>트리거 유형</TableHead>
                  <TableHead>트리거 조건</TableHead>
                  <TableHead className="pr-6">
                    <span className="sr-only">액션</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {discoveries.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-12 text-center text-[var(--axis-text-tertiary)]"
                    >
                      재검토 대기 중인 Discovery가 없습니다.
                    </TableCell>
                  </TableRow>
                ) : (
                  discoveries.map((discovery) => (
                    <TableRow
                      key={discovery.id}
                      className={
                        discovery.daysSinceRevisit > 7
                          ? "bg-[var(--axis-badge-warning-bg)]"
                          : discovery.daysSinceRevisit > 0
                          ? "bg-[var(--axis-badge-info-bg)]"
                          : ""
                      }
                    >
                      <TableCell className="max-w-xs truncate pl-6 font-medium text-[var(--axis-text-primary)]">
                        <Link
                          to={`/discoveries/${discovery.id}`}
                          className="hover:text-[var(--axis-text-brand)]"
                        >
                          {discovery.title}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {discovery.ownerName || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {discovery.revisitDate ? (
                          <div>
                            <div>
                              {new Date(discovery.revisitDate).toLocaleDateString("ko-KR")}
                            </div>
                            {discovery.daysSinceRevisit > 0 && (
                              <span className="text-xs text-[var(--axis-text-tertiary)]">
                                ({discovery.daysSinceRevisit}일 경과)
                              </span>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {discovery.notNowTriggerType
                          ? TRIGGER_TYPE_LABELS[discovery.notNowTriggerType] ||
                            discovery.notNowTriggerType
                          : "—"}
                      </TableCell>
                      <TableCell className="max-w-xs truncate">
                        {discovery.notNowTriggerCondition || "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap pr-6 text-right font-medium">
                        <Link
                          to={`/discoveries/${discovery.id}`}
                          className="text-[var(--axis-text-brand)] hover:underline"
                        >
                          재평가하기
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Tips */}
      <AlertBanner variant="purple" title="💡 Recall Queue 사용법" className="mt-6">
        <ul className="mt-2 space-y-1">
          <li>• 가장 오래된 재검토 날짜(맨 위)부터 확인하세요</li>
          <li>• 트리거 조건이 충족되었는지 평가하세요</li>
          <li>• "재평가하기"를 클릭하여 NEXT, NOT_NOW(날짜 변경), DEAD_END 중 선택하세요</li>
          <li>• 노란색 배경: 재검토 날짜로부터 7일 이상 경과 (우선 처리 필요)</li>
        </ul>
      </AlertBanner>

      {/* Trigger Type Reference */}
      <Card className="mt-6 p-4">
        <h3 className="text-sm font-medium text-[var(--axis-text-primary)]">트리거 유형 참고</h3>
        <dl className="mt-2 grid grid-cols-2 gap-4 text-sm">
          {Object.entries(TRIGGER_TYPE_LABELS).map(([key, label]) => (
            <div key={key}>
              <dt className="font-medium text-[var(--axis-text-secondary)]">{label}</dt>
              <dd className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                {key === TriggerType.TECHNOLOGY_MATURITY &&
                  "새로운 기술/도구의 성숙도가 임계점에 도달"}
                {key === TriggerType.POLICY_REGULATION &&
                  "정책, 규제, 법률 변화가 발생"}
                {key === TriggerType.CUSTOMER_BEHAVIOR &&
                  "고객 행동 패턴이나 시장 트렌드 변화"}
                {key === TriggerType.INTERNAL_CAPABILITY &&
                  "내부 조직의 역량/리소스가 확보됨"}
              </dd>
            </div>
          ))}
        </dl>
      </Card>
    </PageLayout>
  );
}
