import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, Form, useNavigation, useActionData } from "@remix-run/react";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { DiscoveryService } from "~/features/discovery/service";
import { DiscoveryEntityService } from "~/features/discovery/service/entity";
import { DiscoveryQueryExtraService } from "~/features/discovery/service/query-extra2";
import { AppShell } from "~/components/layout/AppShell";
import { PageHeader } from "~/components/layout/PageHeader";
import { Button } from "~/components/ui/Button";
import { Badge } from "~/components/ui/Badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "~/components/ui/Select";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { GatePackageEditor } from "~/features/discovery/ui/GatePackageEditor";
import { formatDate } from "~/lib/format-date";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env as unknown as Record<string, string>);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return redirect("/login");
  const user = ctx.user;

  const { id } = params;
  if (!id) throw new Response("Not Found", { status: 404 });

  const service = new DiscoveryService(db);
  const discovery = await service.getById(id);
  if (!discovery) throw new Response("Not Found", { status: 404 });

  const queryExtra = new DiscoveryQueryExtraService(db);
  const { packages, approvals, gatekeepers } = await queryExtra.getGatePageData(id);

  return json({ user, discovery, packages, approvals, gatekeepers });
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env as unknown as Record<string, string>);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return redirect("/login");
  const user = ctx.user;

  const { id } = params;
  if (!id) throw new Response("Not Found", { status: 404 });

  const formData = await request.formData();
  const intent = formData.get("intent");

  const entityService = new DiscoveryEntityService(db);

  if (intent === "draft") {
    const gateType = (formData.get("gateType") as string) || "GATE1";

    const service = new DiscoveryService(db);
    const discovery = await service.getById(id);
    if (!discovery) return json({ error: "Discovery를 찾을 수 없습니다." }, { status: 404 });

    await entityService.draftGatePackage(id, gateType, user.id);

    return redirect(`/discoveries/${id}/gate`);
  }

  if (intent === "request-approval") {
    const gatePackageId = formData.get("gatePackageId") as string;
    const reviewerId = formData.get("reviewerId") as string;

    if (!gatePackageId || !reviewerId) {
      return json({ error: "패키지와 리뷰어를 선택해주세요." }, { status: 400 });
    }

    // Verify reviewer is gatekeeper or admin
    const queryExtra = new DiscoveryQueryExtraService(db);
    const reviewer = await queryExtra.getReviewerForGate(reviewerId);
    if (!reviewer) {
      return json({ error: "Gatekeeper 또는 Admin만 리뷰어로 지정할 수 있습니다." }, { status: 400 });
    }

    await entityService.requestGateApproval(id, gatePackageId, reviewerId, user.id);

    return redirect(`/discoveries/${id}/gate`);
  }

  if (intent === "submit-approval") {
    const approvalId = formData.get("approvalId") as string;
    const decision = formData.get("decision") as string;
    const comment = (formData.get("comment") as string) || null;

    if (!approvalId || !decision) {
      return json({ error: "결정을 선택해주세요." }, { status: 400 });
    }

    try {
      await entityService.submitGateDecision(id, approvalId, decision, comment, user.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "알 수 없는 오류";
      return json({ error: message }, { status: 403 });
    }

    return redirect(`/discoveries/${id}/gate`);
  }

  return json({ error: "알 수 없는 요청" }, { status: 400 });
}

export default function DiscoveryGatePage() {
  const { user, discovery, packages, approvals, gatekeepers } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Type-safe casting for gate package data
  type GatePackageData = Parameters<typeof GatePackageEditor>[0]["gatePackage"];

  const decisionBadge = (decision: string) => {
    switch (decision) {
      case "APPROVED": return <Badge variant="success">승인</Badge>;
      case "REJECTED": return <Badge variant="destructive">거부</Badge>;
      case "CONDITIONAL": return <Badge variant="warning">조건부</Badge>;
      default: return <Badge variant="secondary">대기</Badge>;
    }
  };

  return (
    <AppShell user={user}>
      <PageHeader
        title={`Gate 패키지 — ${discovery.title}`}
        description={`현재 단계: ${discovery.status}`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <a href={`/discoveries/${discovery.id}`}>상세로</a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`/discoveries/${discovery.id}/methods`}>방법론</a>
            </Button>
          </div>
        }
      />

      {actionData && "error" in actionData && (
        <AlertBanner variant="destructive" className="mb-4">
          {actionData.error}
        </AlertBanner>
      )}

      {/* Draft buttons */}
      <div className="mb-6 flex gap-3">
        <Form method="post">
          <input type="hidden" name="intent" value="draft" />
          <input type="hidden" name="gateType" value="GATE1" />
          <Button type="submit" variant="outline" disabled={isSubmitting}>
            Gate1 초안 {packages.some((p) => p.gateType === "GATE1") ? "갱신" : "생성"}
          </Button>
        </Form>
        <Form method="post">
          <input type="hidden" name="intent" value="draft" />
          <input type="hidden" name="gateType" value="GATE2" />
          <Button type="submit" variant="outline" disabled={isSubmitting}>
            Gate2 초안 {packages.some((p) => p.gateType === "GATE2") ? "갱신" : "생성"}
          </Button>
        </Form>
      </div>

      {/* Gate packages */}
      {packages.length === 0 ? (
        <AlertBanner variant="info">
          아직 Gate 패키지가 없습니다. 위 버튼으로 자동 초안을 생성하세요.
        </AlertBanner>
      ) : (
        <div className="space-y-8">
          {packages.map((pkg) => (
            <GatePackageEditor key={pkg.id} gatePackage={pkg as unknown as GatePackageData} />
          ))}
        </div>
      )}

      {/* 승인 현황 */}
      {packages.length > 0 && (
        <Card className="mt-8">
          <CardHeader>
            <CardTitle className="text-lg">승인 현황</CardTitle>
          </CardHeader>
          <CardContent>
            {/* 승인 요청 */}
            <div className="mb-6">
              <h3 className="mb-3 text-sm font-medium text-fg-secondary">승인 요청</h3>
              <Form method="post" className="flex flex-wrap items-end gap-3">
                <input type="hidden" name="intent" value="request-approval" />
                <div>
                  <label className="block text-xs text-fg-tertiary">Gate 패키지</label>
                  <Select name="gatePackageId" defaultValue={packages[0]?.id}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {packages.map((pkg) => (
                        <SelectItem key={pkg.id} value={pkg.id}>
                          {pkg.gateType} {pkg.decision === "PENDING" ? "(대기)" : `(${pkg.decision})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-xs text-fg-tertiary">리뷰어 (Gatekeeper)</label>
                  <Select name="reviewerId">
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="선택..." />
                    </SelectTrigger>
                    <SelectContent>
                      {gatekeepers.map((g) => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" size="sm" disabled={isSubmitting}>
                  승인 요청
                </Button>
              </Form>
            </div>

            {/* 승인 목록 */}
            {approvals.length === 0 ? (
              <p className="text-sm text-fg-tertiary">아직 승인 요청이 없습니다.</p>
            ) : (
              <div className="space-y-3">
                {approvals.map((a) => (
                  <div
                    key={a.id}
                    className="rounded-md border border-line p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-fg">
                          {a.reviewerName}
                        </span>
                        {decisionBadge(a.decision)}
                        {a.slaDeadline && a.decision === "PENDING" && (
                          <span className="text-xs text-fg-tertiary">
                            기한: {formatDate(a.slaDeadline)}
                          </span>
                        )}
                      </div>
                      {a.decidedAt && (
                        <span className="text-xs text-fg-tertiary">
                          {formatDate(a.decidedAt)}
                        </span>
                      )}
                    </div>
                    {a.comment && (
                      <p className="mt-1 text-sm text-fg-secondary">{a.comment}</p>
                    )}

                    {/* 본인이 리뷰어이고 아직 PENDING인 경우 승인/거부 폼 */}
                    {a.decision === "PENDING" && a.reviewerId === user.id && (
                      <Form method="post" className="mt-3 space-y-2 border-t border-line pt-3">
                        <input type="hidden" name="intent" value="submit-approval" />
                        <input type="hidden" name="approvalId" value={a.id} />
                        <textarea
                          name="comment"
                          placeholder="코멘트 (선택)"
                          rows={2}
                          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-fg placeholder-fg-tertiary"
                        />
                        <div className="flex gap-2">
                          <Button type="submit" name="decision" value="APPROVED" variant="success" size="sm" disabled={isSubmitting}>
                            승인
                          </Button>
                          <Button type="submit" name="decision" value="CONDITIONAL" variant="secondary" size="sm" disabled={isSubmitting}>
                            조건부
                          </Button>
                          <Button type="submit" name="decision" value="REJECTED" variant="destructive" size="sm" disabled={isSubmitting}>
                            거부
                          </Button>
                        </div>
                      </Form>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </AppShell>
  );
}
