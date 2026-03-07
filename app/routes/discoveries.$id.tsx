import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { DiscoveryStatus } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { DiscoveryService } from "~/features/discovery/service";
import { AppShell } from "~/components/layout/AppShell";
import { StatusBadge } from "~/components/ui/StatusBadge";
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "~/components/ui/Select";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { cn } from "~/lib/utils/cn";
import { KpiCard } from "~/features/dashboard/ui/KpiCard";
import { RelatedDiscoveries } from "~/features/discovery/ui/RelatedDiscoveries";
import { ExperimentGantt } from "~/components/charts/ExperimentGantt";
import { formatDate, formatDateTime, isOverdue as checkOverdue } from "~/lib/format-date";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }
  const user = ctx.user;

  const { id } = params;
  if (!id) {
    throw new Response("Not Found", { status: 404 });
  }

  const service = new DiscoveryService(db);

  // 코어 데이터: Discovery + Owner + Reviewer + Gatekeeper + Experiments + Evidence
  const detail = await service.getDetail(id);
  if (!detail) {
    throw new Response("Not Found", { status: 404 });
  }
  const { discovery, owner, reviewer, gatekeeper, experiments: discoveryExperiments, evidence: discoveryEvidence } = detail;

  // 병렬로 부가 데이터 조회 (서비스 레이어 위임)
  const [allUsers, kpiWithMeasurements, { allLinks, linkedDiscoveries }, activityLogs] =
    await Promise.all([
      service.getAllUsers(),
      service.getKpisWithMeasurements(id),
      service.getLinksWithDiscoveries(id),
      service.getActivityLogsWithActors(id),
    ]);

  // Related discoveries via embeddings (CF env 의존 → 라우트에서 처리)
  let relatedDiscoveries: Array<{ id: string; score: number; title?: string }> = [];
  try {
    const cfEnv = context.cloudflare.env as unknown as Record<string, unknown>;
    const embeddingEnv = {
      OPENAI_API_KEY: cfEnv.OPENAI_API_KEY as string,
      VECTORIZE_DISCOVERIES: cfEnv.VECTORIZE_DISCOVERIES as import("~/lib/embeddings/embedding-service").EmbeddingEnv["VECTORIZE_DISCOVERIES"],
    };
    const { findSimilarDiscoveries } = await import("~/lib/embeddings/embedding-service");
    const queryText = `${discovery.title}\n${discovery.seedSummary || ""}`;
    relatedDiscoveries = (await findSimilarDiscoveries(embeddingEnv, queryText, id, 5))
      .filter((r) => r.score >= 0.7);
  } catch {
    // Vectorize 미응답 시 빈 배열 유지
  }

  // isOverdue 계산 (서버에서 수행하여 hydration 불일치 방지)
  const isActive =
    discovery.status === DiscoveryStatus.IDEA_CARD ||
    discovery.status === DiscoveryStatus.HYPOTHESIS;
  const isDiscoveryOverdue = isActive && checkOverdue(discovery.dueDate);

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
    linkedDiscoveries,
    activityLogs,
    isOverdue: isDiscoveryOverdue,
    relatedDiscoveries,
    serverNow: Date.now(),
  });
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }
  const user = ctx.user;

  const { id } = params;
  if (!id) {
    throw new Response("Not Found", { status: 404 });
  }

  const service = new DiscoveryService(db);
  const formData = await request.formData();
  const intent = formData.get("intent");

  try {
    if (intent === "changeOwner") {
      const newOwnerId = formData.get("ownerId");
      if (!newOwnerId) {
        return json({ error: "Owner를 선택해주세요" }, { status: 400 });
      }
      const handoverNote = formData.get("handoverNote");
      if (!handoverNote || String(handoverNote).trim().length < 10) {
        return json({ error: "인수인계 메모는 필수입니다. 진행 상황과 다음 결정 사항을 작성해주세요." }, { status: 400 });
      }
      await service.changeOwner({
        discoveryId: id,
        newOwnerId: String(newOwnerId),
        actorId: user.id,
        handoverNote: String(handoverNote),
      });
      return redirect(`/discoveries/${id}`);
    }

    if (intent === "changeGatekeeper") {
      const newGatekeeperId = formData.get("gatekeeperId") || null;
      await service.changeGatekeeper({
        discoveryId: id,
        newGatekeeperId: newGatekeeperId ? String(newGatekeeperId) : null,
        actorId: user.id,
      });
      return redirect(`/discoveries/${id}`);
    }

    if (intent === "changeReviewer") {
      const newReviewerId = formData.get("reviewerId") || null;
      await service.changeReviewer({
        discoveryId: id,
        newReviewerId: newReviewerId ? String(newReviewerId) : null,
        actorId: user.id,
      });
      return redirect(`/discoveries/${id}`);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "처리 중 오류가 발생했습니다";
    return json({ error: message }, { status: 400 });
  }

  return json({ error: "알 수 없는 요청입니다" }, { status: 400 });
}


export default function DiscoveryDetail() {
  const {
    user, discovery, owner, reviewer, gatekeeper, experiments, evidence, allUsers,
    kpiWithMeasurements, allLinks, linkedDiscoveries, activityLogs, isOverdue, relatedDiscoveries, serverNow,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  const canPromoteToOpen = discovery.status === DiscoveryStatus.DISCOVERY;
  const canEdit =
    discovery.status === DiscoveryStatus.DISCOVERY || discovery.status === DiscoveryStatus.IDEA_CARD;
  const canChangeOwnership = canEdit;
  const isAiCreated = discovery.createdByAgent === 1;
  const canClaim = isAiCreated && discovery.ownerId !== user.id;
  const isActive =
    discovery.status === DiscoveryStatus.IDEA_CARD ||
    discovery.status === DiscoveryStatus.HYPOTHESIS;
  const completedExperiments = experiments.filter((e) => e.completedAt);
  const maxExperiments =
    discovery.status === DiscoveryStatus.HYPOTHESIS ? 3 : 2;

  return (
    <AppShell user={user}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-fg">{discovery.title}</h1>
              <StatusBadge status={discovery.status} size="md" />
              {discovery.createdByAgent === 1 && (
                <Badge variant="outline" className="border-violet-300 text-violet-600 dark:border-violet-700 dark:text-violet-400">AI 생성</Badge>
              )}
            </div>
            <div className="mt-2 flex items-center space-x-4 text-sm text-fg-tertiary">
              <span>Owner: {owner?.name || "미지정"}</span>
              <span>Reviewer: {reviewer?.name || "미지정"}</span>
              <span>Gatekeeper: {gatekeeper?.name || "미지정"}</span>
              <span>생성: {formatDate(discovery.createdAt)}</span>
              {discovery.dueDate && (
                <span className="text-fg-error">
                  마감: {formatDate(discovery.dueDate)}
                </span>
              )}
            </div>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:mt-0">
            {/* 주요 액션 */}
            <div className="flex flex-wrap gap-2">
              {canClaim && (
                <Form method="post">
                  <input type="hidden" name="intent" value="changeOwner" />
                  <input type="hidden" name="ownerId" value={user.id} />
                  <input type="hidden" name="handoverNote" value={`AI 동료가 생성한 Discovery를 ${user.name}이(가) 인수합니다.`} />
                  <Button type="submit" variant="default">인수하기</Button>
                </Form>
              )}
              {canPromoteToOpen && (
                <Button asChild>
                  <Link to={`/discoveries/${discovery.id}/promote`}>OPEN으로 승격</Link>
                </Button>
              )}
              {(discovery.status === DiscoveryStatus.IDEA_CARD ||
                discovery.status === DiscoveryStatus.HYPOTHESIS) &&
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
            <dt className="text-sm font-medium text-fg-tertiary">요약</dt>
            <dd className="mt-1 text-sm text-fg">{discovery.seedSummary}</dd>
          </div>
          {discovery.seedLinks && discovery.seedLinks.length > 0 && (
            <div>
              <dt className="text-sm font-medium text-fg-tertiary">참고 링크</dt>
              <dd className="mt-1 space-y-1">
                {discovery.seedLinks.map((link, idx) => (
                  <a
                    key={idx}
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-sm text-fg-brand hover:underline"
                  >
                    {link}
                  </a>
                ))}
              </dd>
            </div>
          )}
          <div>
            <dt className="text-sm font-medium text-fg-tertiary">출처 유형</dt>
            <dd className="mt-1 text-sm text-fg">{discovery.sourceType}</dd>
          </div>
        </CardContent>
      </Card>

      {/* BD Idea Template (IDEA_CARD 이상) */}
      {(discovery.status === "IDEA_CARD" || discovery.status === "HYPOTHESIS" || discovery.status === "EXPERIMENT") && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">아이디어 템플릿</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <dt className="text-sm font-medium text-fg-tertiary">가설</dt>
              <dd className="mt-1 text-sm text-fg">
                {discovery.seedSummary || <span className="italic text-fg-tertiary">미입력</span>}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-fg-tertiary">타겟 고객/시장</dt>
              <dd className="mt-1 text-sm text-fg">
                {discovery.targetSegment || <span className="italic text-fg-tertiary">미입력</span>}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-fg-tertiary">가치 제안</dt>
              <dd className="mt-1 text-sm text-fg">
                {discovery.valueProposition || <span className="italic text-fg-tertiary">미입력</span>}
              </dd>
            </div>
          </CardContent>
        </Card>
      )}

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
              <Form method="post" className="sm:col-span-3">
                <input type="hidden" name="intent" value="changeOwner" />
                <label className="block text-sm font-medium text-fg-secondary">Owner</label>
                <div className="mt-1 flex space-x-2">
                  <Select name="ownerId" defaultValue={discovery.ownerId || undefined}>
                    <SelectTrigger>
                      <SelectValue placeholder="미지정" />
                    </SelectTrigger>
                    <SelectContent>
                      {allUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="submit" size="sm">변경</Button>
                </div>
                <div className="mt-2">
                  <label className="block text-sm font-medium text-fg-secondary">
                    인수인계 메모 (필수)
                  </label>
                  <textarea
                    name="handoverNote"
                    required
                    minLength={10}
                    placeholder="지금까지 진행한 내용과 다음에 해야 할 결정을 간단히 작성해주세요."
                    className="mt-1 w-full rounded-md border border-line bg-surface-primary px-3 py-2 text-sm text-fg placeholder:text-fg-tertiary focus:border-line-focus focus:outline-none focus:ring-1 focus:ring-focus-ring"
                    rows={3}
                  />
                </div>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="changeReviewer" />
                <label className="block text-sm font-medium text-fg-secondary">Reviewer</label>
                <div className="mt-1 flex space-x-2">
                  <Select name="reviewerId" defaultValue={discovery.reviewerId || undefined}>
                    <SelectTrigger>
                      <SelectValue placeholder="없음" />
                    </SelectTrigger>
                    <SelectContent>
                      {allUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="submit" size="sm">변경</Button>
                </div>
              </Form>
              <Form method="post">
                <input type="hidden" name="intent" value="changeGatekeeper" />
                <label className="block text-sm font-medium text-fg-secondary">Gatekeeper</label>
                <div className="mt-1 flex space-x-2">
                  <Select name="gatekeeperId" defaultValue={discovery.gatekeeperId || undefined}>
                    <SelectTrigger>
                      <SelectValue placeholder="없음" />
                    </SelectTrigger>
                    <SelectContent>
                      {allUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
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
              <p className="mt-1 text-xs text-fg-tertiary">
                {completedExperiments.length}/{experiments.length} 완료
              </p>
            )}
          </div>
          {((discovery.status === DiscoveryStatus.IDEA_CARD && experiments.length < 2) ||
            (discovery.status === DiscoveryStatus.HYPOTHESIS &&
              experiments.length < 3)) && (
            <Button size="sm" asChild>
              <Link to={`/discoveries/${discovery.id}/add-experiment`}>실험 추가</Link>
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {experiments.length === 0 ? (
            <p className="text-sm text-fg-tertiary">
              아직 실험이 없습니다.
              {canPromoteToOpen && " OPEN으로 승격하면서 첫 실험을 등록하세요."}
            </p>
          ) : (
            <div className="space-y-4">
              <ExperimentGantt experiments={experiments} now={serverNow} />
              {experiments.map((exp) => (
                <div
                  key={exp.id}
                  className={cn(
                    "border-l-4 pl-4",
                    exp.completedAt
                      ? "border-line-success"
                      : "border-line-focus"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-fg">가설: {exp.hypothesis}</h3>
                      <p className="mt-1 text-sm text-fg-secondary">행동: {exp.minimalAction}</p>
                      <p className="mt-1 text-sm text-fg-tertiary">
                        예상 근거: {exp.expectedEvidence}
                      </p>
                      <p className="mt-1 text-xs text-fg-tertiary">
                        마감: {formatDate(exp.deadline)}
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
                    <p className="mt-2 text-sm text-fg-secondary">결과: {exp.resultSummary}</p>
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
            <p className="text-sm text-fg-tertiary">아직 근거가 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {evidence.map((ev) => (
                <div
                  key={ev.id}
                  className={cn(
                    "rounded-md border p-3",
                    ev.type === "ASSUMPTION"
                      ? "border-[var(--axis-yellow-200)] bg-surface-warning"
                      : "border-line"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-semibold text-fg-tertiary">{ev.type}</span>
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
                      <p className="mt-1 text-sm text-fg">{ev.content}</p>
                      {ev.linkOrAttachment && (
                        <a
                          href={ev.linkOrAttachment}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 block text-xs text-fg-brand hover:underline"
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
            <p className="text-sm text-fg-tertiary">
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
            <p className="text-sm text-fg-tertiary">연결된 Discovery가 없습니다.</p>
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
                    className="flex items-center justify-between rounded-md border border-line p-3"
                  >
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/discoveries/${linked.id}`}
                        className="text-sm font-medium text-fg-brand hover:underline"
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

      {/* Related Discoveries */}
      <RelatedDiscoveries items={relatedDiscoveries} />

      {/* Activity Timeline */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">{"\uD65C\uB3D9 \uB0B4\uC5ED"}</CardTitle>
        </CardHeader>
        <CardContent>
          {activityLogs.length === 0 ? (
            <p className="text-sm text-fg-tertiary">{"\uD65C\uB3D9 \uB0B4\uC5ED\uC774 \uC5C6\uC2B5\uB2C8\uB2E4."}</p>
          ) : (
            <div className="relative space-y-0">
              {activityLogs.map((log, i) => {
                const isLast = i === activityLogs.length - 1;
                return (
                  <div key={log.id} className="relative flex gap-3 pb-4">
                    {/* Timeline line */}
                    {!isLast && (
                      <div className="absolute left-[7px] top-4 bottom-0 w-px bg-line" />
                    )}
                    {/* Dot */}
                    <div className="relative z-10 mt-1.5 h-[15px] w-[15px] shrink-0 rounded-full border-2 border-line bg-surface-primary" />
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          {log.eventType}
                        </Badge>
                        <span className="text-sm font-medium text-fg">
                          {log.actorName}
                        </span>
                        <span className="text-xs text-fg-tertiary">
                          {formatDateTime(log.timestamp)}
                        </span>
                      </div>
                      {log.metadata && Object.keys(log.metadata).length > 0 && (
                        <p className="mt-0.5 text-xs text-fg-tertiary truncate">
                          {Object.entries(log.metadata)
                            .filter(([, v]) => v != null)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
