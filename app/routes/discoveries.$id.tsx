import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, experiments, evidence, users, eventLogs, discoveryKpis, kpiMeasurements, discoveryLinks } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { PageLayout } from "~/components/layout/PageLayout";
import { StatusBadge } from "~/components/ui/StatusBadge";
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Select } from "~/components/ui/Select";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { cn } from "~/lib/utils/cn";
import { eq, desc } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import { KpiCard } from "~/components/dashboard/KpiCard";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const { id } = params;
  if (!id) {
    throw new Response("Not Found", { status: 404 });
  }

  // Get discovery
  const discovery = await db.query.discoveries.findFirst({
    where: eq(discoveries.id, id),
  });

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  // Get owner and reviewer
  const owner = discovery.ownerId
    ? await db.query.users.findFirst({ where: eq(users.id, discovery.ownerId) })
    : null;

  const reviewer = discovery.reviewerId
    ? await db.query.users.findFirst({ where: eq(users.id, discovery.reviewerId) })
    : null;

  const gatekeeper = discovery.gatekeeperId
    ? await db.query.users.findFirst({ where: eq(users.id, discovery.gatekeeperId) })
    : null;

  // Get experiments
  const discoveryExperiments = await db
    .select()
    .from(experiments)
    .where(eq(experiments.discoveryId, id));

  // Get evidence
  const discoveryEvidence = await db
    .select()
    .from(evidence)
    .where(eq(evidence.discoveryId, id));

  // Get all users for Owner selection
  const allUsers = await db.select().from(users);

  // Get KPIs + recent measurements
  const kpis = await db
    .select()
    .from(discoveryKpis)
    .where(eq(discoveryKpis.discoveryId, id));

  const kpiWithMeasurements = await Promise.all(
    kpis.map(async (kpi) => {
      const measurements = await db
        .select()
        .from(kpiMeasurements)
        .where(eq(kpiMeasurements.kpiId, kpi.id))
        .orderBy(desc(kpiMeasurements.measuredAt))
        .limit(5);
      return {
        kpi,
        measurements: measurements.map((m) => ({
          id: m.id,
          value: m.value,
          measuredAt: m.measuredAt.toISOString(),
        })),
      };
    })
  );

  // Get discovery links (from and to)
  const linksFrom = await db
    .select()
    .from(discoveryLinks)
    .where(eq(discoveryLinks.fromDiscoveryId, id));
  const linksTo = await db
    .select()
    .from(discoveryLinks)
    .where(eq(discoveryLinks.toDiscoveryId, id));

  const linkedDiscoveryIds = [
    ...linksFrom.map((l) => l.toDiscoveryId),
    ...linksTo.map((l) => l.fromDiscoveryId),
  ];
  const linkedDiscoveries = linkedDiscoveryIds.length > 0
    ? await Promise.all(
        linkedDiscoveryIds.map((lid) =>
          db.query.discoveries.findFirst({ where: eq(discoveries.id, lid) })
        )
      )
    : [];

  const allLinks = [
    ...linksFrom.map((l) => ({ ...l, direction: "from" as const })),
    ...linksTo.map((l) => ({ ...l, direction: "to" as const })),
  ];

  return json({
    user,
    discovery,
    owner,
    reviewer,
    gatekeeper,
    experiments: discoveryExperiments,
    evidence: discoveryEvidence,
    allUsers,
    kpiWithMeasurements,
    allLinks,
    linkedDiscoveries: linkedDiscoveries.filter(Boolean),
  });
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const { id } = params;
  if (!id) {
    throw new Response("Not Found", { status: 404 });
  }

  const discovery = await db.query.discoveries.findFirst({
    where: eq(discoveries.id, id),
  });

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "changeOwner") {
    if (discovery.status !== DiscoveryStatus.DISCOVERY && discovery.status !== DiscoveryStatus.IDEA_CARD) {
      return json({ error: "INBOX/OPEN 상태에서만 Owner를 변경할 수 있습니다" }, { status: 400 });
    }
    const newOwnerId = formData.get("ownerId");
    if (!newOwnerId) {
      return json({ error: "Owner를 선택해주세요" }, { status: 400 });
    }
    await db
      .update(discoveries)
      .set({ ownerId: String(newOwnerId), updatedAt: new Date() })
      .where(eq(discoveries.id, id));

    await db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId: user.id,
      discoveryId: id,
      eventType: "CHANGE_OWNER",
      metadata: { previousOwnerId: discovery.ownerId, newOwnerId: String(newOwnerId) },
    });

    return redirect(`/discoveries/${id}`);
  }

  if (intent === "changeGatekeeper") {
    const newGatekeeperId = formData.get("gatekeeperId") || null;
    await db
      .update(discoveries)
      .set({ gatekeeperId: newGatekeeperId ? String(newGatekeeperId) : null, updatedAt: new Date() })
      .where(eq(discoveries.id, id));

    return redirect(`/discoveries/${id}`);
  }

  if (intent === "changeReviewer") {
    if (discovery.status !== DiscoveryStatus.DISCOVERY && discovery.status !== DiscoveryStatus.IDEA_CARD) {
      return json({ error: "INBOX/OPEN 상태에서만 Reviewer를 변경할 수 있습니다" }, { status: 400 });
    }
    const newReviewerId = formData.get("reviewerId") || null;
    await db
      .update(discoveries)
      .set({ reviewerId: newReviewerId ? String(newReviewerId) : null, updatedAt: new Date() })
      .where(eq(discoveries.id, id));

    return redirect(`/discoveries/${id}`);
  }

  return json({ error: "알 수 없는 요청입니다" }, { status: 400 });
}


export default function DiscoveryDetail() {
  const {
    user, discovery, owner, reviewer, gatekeeper, experiments, evidence, allUsers,
    kpiWithMeasurements, allLinks, linkedDiscoveries,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const canPromoteToOpen = discovery.status === DiscoveryStatus.DISCOVERY;
  const canEdit =
    discovery.status === DiscoveryStatus.DISCOVERY || discovery.status === DiscoveryStatus.IDEA_CARD;
  const canChangeOwnership = canEdit;
  const isActive =
    discovery.status === DiscoveryStatus.IDEA_CARD ||
    discovery.status === DiscoveryStatus.IDEA_CARD;
  const completedExperiments = experiments.filter((e) => e.completedAt);
  const maxExperiments =
    discovery.status === DiscoveryStatus.IDEA_CARD ? 3 : 2;
  const isOverdue =
    isActive && discovery.dueDate && new Date(discovery.dueDate) < new Date();

  return (
    <PageLayout user={user}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-[var(--axis-text-primary)]">{discovery.title}</h1>
              <StatusBadge status={discovery.status} size="md" />
            </div>
            <div className="mt-2 flex items-center space-x-4 text-sm text-[var(--axis-text-tertiary)]">
              <span>Owner: {owner?.name || "미지정"}</span>
              <span>Reviewer: {reviewer?.name || "미지정"}</span>
              <span>Gatekeeper: {gatekeeper?.name || "미지정"}</span>
              <span>생성: {new Date(discovery.createdAt).toLocaleDateString("ko-KR")}</span>
              {discovery.dueDate && (
                <span className="text-[var(--axis-text-error)]">
                  마감: {new Date(discovery.dueDate).toLocaleDateString("ko-KR")}
                </span>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:mt-0">
            {/* 주요 액션 */}
            <div className="flex flex-wrap gap-2">
              {canPromoteToOpen && (
                <Button asChild>
                  <Link to={`/discoveries/${discovery.id}/promote`}>OPEN으로 승격</Link>
                </Button>
              )}
              {(discovery.status === DiscoveryStatus.IDEA_CARD ||
                discovery.status === DiscoveryStatus.IDEA_CARD) &&
                discovery.approvalStatus !== "PENDING" && (
                <>
                  {discovery.status === DiscoveryStatus.IDEA_CARD &&
                    experiments.length >= 2 && (
                      <Button variant="purple" asChild>
                        <Link to={`/discoveries/${discovery.id}/request-extension`}>연장 요청</Link>
                      </Button>
                    )}
                  <Button variant="success" asChild>
                    <Link to={`/discoveries/${discovery.id}/decide-next`}>NEXT 결정</Link>
                  </Button>
                  <Button variant="secondary" asChild>
                    <Link to={`/discoveries/${discovery.id}/decide-not-now`}>NOT NOW 결정</Link>
                  </Button>
                  <Button variant="destructive" asChild>
                    <Link to={`/discoveries/${discovery.id}/decide-dead-end`}>DEAD END 결정</Link>
                  </Button>
                </>
              )}
            </div>
            {/* 보조 액션 */}
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {canEdit && (
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/discoveries/${discovery.id}/edit`}>편집</Link>
                </Button>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link to={`/discoveries/${discovery.id}/graph`}>그래프</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/discoveries/${discovery.id}/methods`}>방법론</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to={`/discoveries/${discovery.id}/gate`}>Gate</Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href={`/api/export/brief/${discovery.id}`} download>Brief 다운로드</a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link to="/discoveries">목록으로</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Approval Status Banners */}
      {discovery.approvalStatus === "PENDING" && (
        <AlertBanner variant="purple" className="mb-6 border-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">
              승인 대기 중 — {discovery.pendingDecision} 결정이 Reviewer 검토를 기다리고 있습니다
            </p>
            {discovery.reviewerId === user.id && (
              <Button variant="purple" size="sm" asChild>
                <Link to={`/discoveries/${discovery.id}/approve`}>승인/거부 처리</Link>
              </Button>
            )}
          </div>
        </AlertBanner>
      )}

      {discovery.approvalStatus === "REJECTED" && (
        <AlertBanner variant="destructive" className="mb-6 border-2">
          <p className="text-sm font-semibold">결정이 거부되었습니다</p>
          {discovery.approvalComment && (
            <p className="mt-1 text-sm">사유: {discovery.approvalComment}</p>
          )}
        </AlertBanner>
      )}

      {/* Overdue Warning */}
      {isOverdue && (
        <AlertBanner variant="destructive" className="mb-6 border-2">
          <p className="text-sm font-semibold">기한 초과. 결정을 내려주세요.</p>
        </AlertBanner>
      )}

      {/* Auto-closed Banner */}
      {discovery.status === DiscoveryStatus.DROP &&
        Array.isArray(discovery.deadEndFailurePattern) &&
        discovery.deadEndFailurePattern.includes("time_constraint") && (
        <AlertBanner variant="warning" className="mb-6 border-2">
          <p className="text-sm font-semibold">자동 종료됨 (기한 초과)</p>
          <p className="mt-1 text-sm">이 Discovery는 기한 내 결정되지 않아 시스템에 의해 자동 DEAD END 처리되었습니다.</p>
        </AlertBanner>
      )}

      {/* Seed Information */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Seed 정보</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <dt className="text-sm font-medium text-[var(--axis-text-tertiary)]">요약</dt>
            <dd className="mt-1 text-sm text-[var(--axis-text-primary)]">{discovery.seedSummary}</dd>
          </div>
          {discovery.seedLinks && discovery.seedLinks.length > 0 && (
            <div>
              <dt className="text-sm font-medium text-[var(--axis-text-tertiary)]">참고 링크</dt>
              <dd className="mt-1 space-y-1">
                {discovery.seedLinks.map((link, idx) => (
                  <a
                    key={idx}
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-[var(--axis-text-brand)] hover:underline"
                  >
                    {link}
                  </a>
                ))}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-sm font-medium text-[var(--axis-text-tertiary)]">출처 유형</dt>
            <dd className="mt-1 text-sm text-[var(--axis-text-primary)]">{discovery.sourceType}</dd>
          </div>
        </CardContent>
      </Card>

      {/* Owner/Reviewer Management */}
      {canChangeOwnership && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">담당자 관리</CardTitle>
          </CardHeader>
          <CardContent>
            {actionData?.error && (
              <AlertBanner variant="destructive" className="mb-4">
                <p>{actionData.error}</p>
              </AlertBanner>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Form method="post">
                <input type="hidden" name="intent" value="changeOwner" />
                <label className="block text-sm font-medium text-[var(--axis-text-secondary)]">Owner</label>
                <div className="mt-1 flex space-x-2">
                  <Select name="ownerId" defaultValue={discovery.ownerId || ""}>
                    <option value="">미지정</option>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </Select>
                  <Button type="submit" size="sm">변경</Button>
                </div>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="changeReviewer" />
                <label className="block text-sm font-medium text-[var(--axis-text-secondary)]">Reviewer</label>
                <div className="mt-1 flex space-x-2">
                  <Select name="reviewerId" defaultValue={discovery.reviewerId || ""}>
                    <option value="">없음</option>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </Select>
                  <Button type="submit" size="sm">변경</Button>
                </div>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="changeGatekeeper" />
                <label className="block text-sm font-medium text-[var(--axis-text-secondary)]">Gatekeeper</label>
                <div className="mt-1 flex space-x-2">
                  <Select name="gatekeeperId" defaultValue={discovery.gatekeeperId || ""}>
                    <option value="">없음</option>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </Select>
                  <Button type="submit" size="sm">변경</Button>
                </div>
              </Form>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Experiments */}
      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">
              Experiments ({experiments.length}/{maxExperiments})
            </CardTitle>
            {experiments.length > 0 && (
              <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                {completedExperiments.length}/{experiments.length} 완료
              </p>
            )}
          </div>
          {((discovery.status === DiscoveryStatus.IDEA_CARD && experiments.length < 2) ||
            (discovery.status === DiscoveryStatus.IDEA_CARD &&
              experiments.length < 3)) && (
            <Button size="sm" asChild>
              <Link to={`/discoveries/${discovery.id}/add-experiment`}>실험 추가</Link>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {experiments.length === 0 ? (
            <p className="text-sm text-[var(--axis-text-tertiary)]">
              아직 실험이 없습니다.
              {canPromoteToOpen && " OPEN으로 승격하면서 첫 실험을 등록하세요."}
            </p>
          ) : (
            <div className="space-y-4">
              {experiments.map((exp) => (
                <div
                  key={exp.id}
                  className={cn(
                    "border-l-4 pl-4",
                    exp.completedAt
                      ? "border-[var(--axis-border-success)]"
                      : "border-[var(--axis-border-focus)]"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-[var(--axis-text-primary)]">가설: {exp.hypothesis}</h3>
                      <p className="mt-1 text-sm text-[var(--axis-text-secondary)]">행동: {exp.minimalAction}</p>
                      <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
                        예상 근거: {exp.expectedEvidence}
                      </p>
                      <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                        마감: {new Date(exp.deadline).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                    <div className="ml-3 flex flex-col items-end gap-1">
                      {exp.completedAt ? (
                        <Badge variant="success">완료</Badge>
                      ) : (
                        isActive && (
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/discoveries/${discovery.id}/complete-experiment?experimentId=${exp.id}`}>
                              결과 기록
                            </Link>
                          </Button>
                        )
                      )}
                    </div>
                  </div>
                  {exp.resultSummary && (
                    <p className="mt-2 text-sm text-[var(--axis-text-secondary)]">결과: {exp.resultSummary}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Evidence */}
      <Card className="mb-6">
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-lg">Evidence ({evidence.length})</CardTitle>
          {discovery.status !== DiscoveryStatus.DISCOVERY && (
            <Button size="sm" asChild>
              <Link to={`/discoveries/${discovery.id}/add-evidence`}>근거 추가</Link>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {evidence.length === 0 ? (
            <p className="text-sm text-[var(--axis-text-tertiary)]">아직 근거가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {evidence.map((ev) => (
                <div
                  key={ev.id}
                  className={cn(
                    "rounded-md border p-3",
                    ev.type === "ASSUMPTION"
                      ? "border-[var(--axis-yellow-200)] bg-[var(--axis-surface-warning)]"
                      : "border-[var(--axis-border-default)]"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-semibold text-[var(--axis-text-tertiary)]">{ev.type}</span>
                        <Badge
                          variant={
                            ev.strength === "A" ? "success"
                              : ev.strength === "B" ? "info"
                              : ev.strength === "C" ? "warning"
                              : "destructive"
                          }
                        >
                          {ev.strength}급
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-[var(--axis-text-primary)]">{ev.content}</p>
                      {ev.linkOrAttachment && (
                        <a
                          href={ev.linkOrAttachment}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 block text-xs text-[var(--axis-text-brand)] hover:underline"
                        >
                          {ev.linkOrAttachment}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI 추적 */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">KPI 추적</CardTitle>
        </CardHeader>
        <CardContent>
          {kpiWithMeasurements.length === 0 ? (
            <p className="text-sm text-[var(--axis-text-tertiary)]">
              KPI가 등록되지 않았습니다. Agent에게 KPI 등록을 요청하세요.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {kpiWithMeasurements.map(({ kpi, measurements }) => (
                <KpiCard key={kpi.id} kpi={kpi} measurements={measurements} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 연결된 Discovery */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">연결된 Discovery</CardTitle>
        </CardHeader>
        <CardContent>
          {allLinks.length === 0 ? (
            <p className="text-sm text-[var(--axis-text-tertiary)]">연결된 Discovery가 없습니다.</p>
          ) : (
            <div className="space-y-2">
              {allLinks.map((link) => {
                const targetId = link.direction === "from" ? link.toDiscoveryId : link.fromDiscoveryId;
                const linked = linkedDiscoveries.find((d) => d?.id === targetId);
                if (!linked) return null;
                const relationLabel =
                  link.linkType === "predecessor" ? "선행"
                    : link.linkType === "successor" ? "후행"
                    : link.linkType === "similar" ? "유사"
                    : link.linkType === "alternative" ? "대안"
                    : link.linkType;
                return (
                  <div
                    key={link.id}
                    className="flex items-center justify-between rounded-md border border-[var(--axis-border-default)] p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/discoveries/${linked.id}`}
                        className="text-sm font-medium text-[var(--axis-text-brand)] hover:underline"
                      >
                        {linked.title}
                      </Link>
                      <StatusBadge status={linked.status} size="sm" />
                    </div>
                    <Badge variant="secondary">{relationLabel}</Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </PageLayout>
  );
}
