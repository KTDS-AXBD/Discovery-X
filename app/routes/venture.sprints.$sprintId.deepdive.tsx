/**
 * Venture Sprint Deep Dive 탭
 * /venture/sprints/:sprintId/deepdive
 */

import { useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, Link, useLoaderData, useNavigation } from "@remix-run/react";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { getSprintById } from "~/features/venture/repositories/sprint.repository";
import {
  listOpportunitiesBySprint,
  listAssumptionsByOpportunity,
  listPremortemsByOpportunity,
  listArtifactsByOpportunity,
  updateAssumption,
  updatePremortem,
  createAssumption,
  createPremortem,
  createArtifact,
  updateArtifact,
} from "~/features/venture/repositories/opportunity.repository";
import { enqueueTask } from "~/features/venture/repositories/task-queue.repository";
import { createWorkEvent } from "~/features/venture/repositories/analytics.repository";
import {
  createAssumptionSchema,
  updateAssumptionSchema,
  createPremortemSchema,
  updatePremortemSchema,
  leanCanvasContentSchema,
  type LeanCanvasContent,
} from "~/features/venture/schemas/opportunity.schema";
import { LeanCanvasEditor, LeanCanvasViewer } from "~/features/venture/ui/LeanCanvasEditor";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return redirect("/login");

  const { sprintId } = params;
  if (!sprintId) {
    return redirect("/venture/sprints");
  }

  const sprint = await getSprintById(db, sprintId);
  if (!sprint) {
    throw new Response("Sprint not found", { status: 404 });
  }

  // Shortlist된 기회만 조회
  const opportunities = await listOpportunitiesBySprint(db, sprintId, { shortlistedOnly: true });

  // 각 기회별 Deep Dive 데이터 로드
  const opportunitiesWithDeepDive = await Promise.all(
    opportunities.map(async (opp) => {
      const [assumptions, premortems, artifacts] = await Promise.all([
        listAssumptionsByOpportunity(db, opp.id),
        listPremortemsByOpportunity(db, opp.id),
        listArtifactsByOpportunity(db, opp.id),
      ]);

      const leanCanvasArtifact = artifacts.find((a) => a.artifactType === "LEAN_CANVAS");

      return {
        ...opp,
        assumptions,
        premortems,
        artifacts,
        hasLeanCanvas: !!leanCanvasArtifact,
        leanCanvas: leanCanvasArtifact
          ? {
              id: leanCanvasArtifact.id,
              content: leanCanvasArtifact.content as LeanCanvasContent | null,
            }
          : null,
      };
    })
  );

  return json({ sprint, opportunities: opportunitiesWithDeepDive });
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return json({ error: "Unauthorized" }, { status: 401 });
  const user = ctx.user;

  const { sprintId } = params;
  if (!sprintId) {
    return json({ error: "Sprint ID required" }, { status: 400 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // 가정(Assumption) 추가
  if (intent === "addAssumption") {
    const opportunityId = formData.get("opportunityId") as string;
    const statement = formData.get("statement") as string;
    const criticality = formData.get("criticality") ? Number(formData.get("criticality")) : undefined;
    const validationMethod = formData.get("validationMethod") as string;

    const parseResult = createAssumptionSchema.safeParse({
      statement,
      criticality,
      validationMethod: validationMethod || undefined,
    });

    if (!parseResult.success) {
      return json({ error: parseResult.error.errors[0].message }, { status: 400 });
    }

    await createAssumption(db, opportunityId, parseResult.data);

    await createWorkEvent(db, sprintId, {
      eventType: "assumption_create",
      actorType: "human",
      actorId: user.id,
      entityType: "assumption",
    });

    return json({ success: true });
  }

  // 가정(Assumption) 수정
  if (intent === "updateAssumption") {
    const assumptionId = formData.get("assumptionId") as string;
    const statement = formData.get("statement") as string;
    const criticality = formData.get("criticality") ? Number(formData.get("criticality")) : undefined;
    const validationMethod = formData.get("validationMethod") as string;
    const status = formData.get("status") as string;

    const parseResult = updateAssumptionSchema.safeParse({
      statement: statement || undefined,
      criticality,
      validationMethod: validationMethod || undefined,
      status: status || undefined,
    });

    if (!parseResult.success) {
      return json({ error: parseResult.error.errors[0].message }, { status: 400 });
    }

    await updateAssumption(db, assumptionId, parseResult.data);

    await createWorkEvent(db, sprintId, {
      eventType: "assumption_update",
      actorType: "human",
      actorId: user.id,
      entityType: "assumption",
      entityId: assumptionId,
    });

    return json({ success: true });
  }

  // Pre-mortem 추가
  if (intent === "addPremortem") {
    const opportunityId = formData.get("opportunityId") as string;
    const failureScenario = formData.get("failureScenario") as string;
    const probability = formData.get("probability") ? Number(formData.get("probability")) : undefined;
    const impact = formData.get("impact") ? Number(formData.get("impact")) : undefined;
    const mitigationStrategy = formData.get("mitigationStrategy") as string;

    const parseResult = createPremortemSchema.safeParse({
      failureScenario,
      probability,
      impact,
      mitigationStrategy: mitigationStrategy || undefined,
    });

    if (!parseResult.success) {
      return json({ error: parseResult.error.errors[0].message }, { status: 400 });
    }

    await createPremortem(db, opportunityId, parseResult.data);

    await createWorkEvent(db, sprintId, {
      eventType: "premortem_create",
      actorType: "human",
      actorId: user.id,
      entityType: "premortem",
    });

    return json({ success: true });
  }

  // Pre-mortem 수정
  if (intent === "updatePremortem") {
    const premortemId = formData.get("premortemId") as string;
    const failureScenario = formData.get("failureScenario") as string;
    const probability = formData.get("probability") ? Number(formData.get("probability")) : undefined;
    const impact = formData.get("impact") ? Number(formData.get("impact")) : undefined;
    const mitigationStrategy = formData.get("mitigationStrategy") as string;

    const parseResult = updatePremortemSchema.safeParse({
      failureScenario: failureScenario || undefined,
      probability,
      impact,
      mitigationStrategy: mitigationStrategy || undefined,
    });

    if (!parseResult.success) {
      return json({ error: parseResult.error.errors[0].message }, { status: 400 });
    }

    await updatePremortem(db, premortemId, parseResult.data);

    await createWorkEvent(db, sprintId, {
      eventType: "premortem_update",
      actorType: "human",
      actorId: user.id,
      entityType: "premortem",
      entityId: premortemId,
    });

    return json({ success: true });
  }

  // Deep Dive AI 분석 트리거
  if (intent === "triggerDeepDive") {
    const opportunityIds = formData.getAll("opportunityIds") as string[];

    if (opportunityIds.length === 0) {
      return json({ error: "기회를 선택해주세요" }, { status: 400 });
    }

    const task = await enqueueTask(db, sprintId, {
      taskType: "GENERATE_DEEPDIVE",
      input: { sprintId, opportunityIds },
      dedupeKey: `deepdive-${sprintId}-${opportunityIds.sort().join("-")}`,
    });

    await createWorkEvent(db, sprintId, {
      eventType: "task_enqueue",
      actorType: "human",
      actorId: user.id,
      entityType: "task",
      entityId: task.id,
      metadata: { taskType: "GENERATE_DEEPDIVE", opportunityIds },
    });

    return json({ success: true, taskId: task.id });
  }

  // Lean Canvas 생성
  if (intent === "createLeanCanvas") {
    const opportunityId = formData.get("opportunityId") as string;
    const contentStr = formData.get("content") as string;

    if (!opportunityId) {
      return json({ error: "기회 ID가 필요합니다" }, { status: 400 });
    }

    let content: LeanCanvasContent;
    try {
      content = leanCanvasContentSchema.parse(JSON.parse(contentStr));
    } catch {
      return json({ error: "유효하지 않은 Lean Canvas 형식입니다" }, { status: 400 });
    }

    const artifact = await createArtifact(db, opportunityId, {
      artifactType: "LEAN_CANVAS",
      title: "Lean Canvas",
      content,
    });

    await createWorkEvent(db, sprintId, {
      eventType: "artifact_create",
      actorType: "human",
      actorId: user.id,
      entityType: "artifact",
      entityId: artifact.id,
      metadata: { artifactType: "LEAN_CANVAS" },
    });

    return json({ success: true, artifactId: artifact.id });
  }

  // Lean Canvas 수정
  if (intent === "updateLeanCanvas") {
    const artifactId = formData.get("artifactId") as string;
    const contentStr = formData.get("content") as string;

    if (!artifactId) {
      return json({ error: "Artifact ID가 필요합니다" }, { status: 400 });
    }

    let content: LeanCanvasContent;
    try {
      content = leanCanvasContentSchema.parse(JSON.parse(contentStr));
    } catch {
      return json({ error: "유효하지 않은 Lean Canvas 형식입니다" }, { status: 400 });
    }

    const artifact = await updateArtifact(db, artifactId, { content });

    if (!artifact) {
      return json({ error: "Artifact를 찾을 수 없습니다" }, { status: 404 });
    }

    await createWorkEvent(db, sprintId, {
      eventType: "artifact_update",
      actorType: "human",
      actorId: user.id,
      entityType: "artifact",
      entityId: artifactId,
      metadata: { artifactType: "LEAN_CANVAS" },
    });

    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}

export default function VentureSprintDeepDive() {
  const { sprint, opportunities } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [editingCanvasOppId, setEditingCanvasOppId] = useState<string | null>(null);

  if (opportunities.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-12 text-center">
        <p className="text-[var(--axis-text-tertiary)]">
          선별된 기회가 없습니다. 후보 목록에서 기회를 선별 목록에 추가하세요.
        </p>
        <Link
          to={`/venture/sprints/${sprint.id}/longlist`}
          className="mt-4 inline-block text-sm text-[var(--axis-text-brand)] hover:underline"
        >
          후보 목록으로 이동
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI 분석 트리거 섹션 */}
      <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-[var(--axis-text-primary)]">AI 분석 생성</h3>
            <p className="text-sm text-[var(--axis-text-tertiary)]">
              선택된 기회에 대해 가정, 프리모템 초안을 AI가 생성합니다.
            </p>
          </div>
          <Form method="post">
            <input type="hidden" name="intent" value="triggerDeepDive" />
            {opportunities.map((opp) => (
              <input key={opp.id} type="hidden" name="opportunityIds" value={opp.id} />
            ))}
            <Button type="submit" disabled={isSubmitting || opportunities.length === 0}>
              {isSubmitting ? "생성 중..." : `AI 분석 생성 (${opportunities.length}개)`}
            </Button>
          </Form>
        </div>
      </div>

      <p className="text-sm text-[var(--axis-text-tertiary)]">
        선별된 기회에 대해 가정 맵, 프리모템, 린 캔버스를 작성합니다.
      </p>

      {opportunities.map((opp) => (
        <div
          key={opp.id}
          className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)]"
        >
          {/* 기회 헤더 */}
          <div className="border-b border-[var(--axis-border-default)] p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[var(--axis-text-primary)]">
                    {opp.title}
                  </span>
                  {opp.isFinal === 1 && <Badge variant="info">최종 선정</Badge>}
                </div>
                {opp.description && (
                  <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
                    {opp.description.length > 100
                      ? `${opp.description.slice(0, 100)}...`
                      : opp.description}
                  </p>
                )}
              </div>
              <div className="flex gap-2 text-xs">
                <span
                  className={`rounded-full px-2 py-1 ${
                    opp.assumptions.length >= 5
                      ? "bg-[var(--axis-badge-success-bg)] text-[var(--axis-badge-success-text)]"
                      : "bg-[var(--axis-badge-warning-bg)] text-[var(--axis-badge-warning-text)]"
                  }`}
                >
                  가정 {opp.assumptions.length}/5
                </span>
                <span
                  className={`rounded-full px-2 py-1 ${
                    opp.premortems.length >= 5
                      ? "bg-[var(--axis-badge-success-bg)] text-[var(--axis-badge-success-text)]"
                      : "bg-[var(--axis-badge-warning-bg)] text-[var(--axis-badge-warning-text)]"
                  }`}
                >
                  실패시나리오 {opp.premortems.length}/5
                </span>
                <span
                  className={`rounded-full px-2 py-1 ${
                    opp.hasLeanCanvas
                      ? "bg-[var(--axis-badge-success-bg)] text-[var(--axis-badge-success-text)]"
                      : "bg-[var(--axis-badge-warning-bg)] text-[var(--axis-badge-warning-text)]"
                  }`}
                >
                  {opp.hasLeanCanvas ? "린 캔버스" : "캔버스 없음"}
                </span>
              </div>
            </div>
          </div>

          <div className="grid gap-4 p-4 md:grid-cols-3">
            {/* Assumption Map */}
            <div className="rounded-md border border-[var(--axis-border-default)] p-4">
              <h4 className="mb-3 font-medium text-[var(--axis-text-primary)]">
                가정 맵
              </h4>
              {opp.assumptions.length === 0 ? (
                <p className="text-sm text-[var(--axis-text-tertiary)]">
                  등록된 가정이 없습니다.
                </p>
              ) : (
                <ul className="space-y-2">
                  {opp.assumptions.slice(0, 5).map((assumption) => (
                    <li
                      key={assumption.id}
                      className="border-l-2 border-[var(--axis-border-default)] pl-2 text-sm"
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-[var(--axis-text-secondary)]">
                          {assumption.statement}
                        </span>
                        <Form method="post" className="ml-2 shrink-0">
                          <input type="hidden" name="intent" value="updateAssumption" />
                          <input type="hidden" name="assumptionId" value={assumption.id} />
                          <select
                            name="status"
                            defaultValue={assumption.status}
                            onChange={(e) => e.target.form?.requestSubmit()}
                            className="rounded border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-1 py-0.5 text-xs"
                          >
                            <option value="OPEN">미검증</option>
                            <option value="VALIDATED">검증됨</option>
                            <option value="INVALIDATED">무효</option>
                          </select>
                        </Form>
                      </div>
                      {assumption.criticality && (
                        <div className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                          중요도: {assumption.criticality}/5
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {/* 가정 추가 폼 */}
              <Form method="post" className="mt-3 space-y-2 border-t border-[var(--axis-border-default)] pt-3">
                <input type="hidden" name="intent" value="addAssumption" />
                <input type="hidden" name="opportunityId" value={opp.id} />
                <input
                  type="text"
                  name="statement"
                  placeholder="새 가정 입력..."
                  required
                  maxLength={1000}
                  className="w-full rounded border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-2 py-1 text-sm"
                />
                <div className="flex gap-2">
                  <select
                    name="criticality"
                    className="rounded border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-2 py-1 text-xs"
                  >
                    <option value="">중요도</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                  <Button type="submit" size="sm" variant="secondary" disabled={isSubmitting}>
                    추가
                  </Button>
                </div>
              </Form>
            </div>

            {/* Pre-mortem */}
            <div className="rounded-md border border-[var(--axis-border-default)] p-4">
              <h4 className="mb-3 font-medium text-[var(--axis-text-primary)]">프리모템</h4>
              {opp.premortems.length === 0 ? (
                <p className="text-sm text-[var(--axis-text-tertiary)]">
                  등록된 실패 시나리오가 없습니다.
                </p>
              ) : (
                <ul className="space-y-2">
                  {opp.premortems.slice(0, 5).map((premortem) => (
                    <li
                      key={premortem.id}
                      className="border-l-2 border-[var(--axis-badge-destructive-border)] pl-2 text-sm"
                    >
                      <div className="text-[var(--axis-text-secondary)]">
                        {premortem.failureScenario}
                      </div>
                      <div className="mt-1 flex gap-2 text-xs text-[var(--axis-text-tertiary)]">
                        {premortem.probability !== null && (
                          <span>확률: {premortem.probability}%</span>
                        )}
                        {premortem.impact !== null && (
                          <span>영향: {premortem.impact}/5</span>
                        )}
                      </div>
                      {premortem.mitigationStrategy && (
                        <div className="mt-1 text-xs text-[var(--axis-badge-success-text)]">
                          완화: {premortem.mitigationStrategy}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {/* Pre-mortem 추가 폼 */}
              <Form method="post" className="mt-3 space-y-2 border-t border-[var(--axis-border-default)] pt-3">
                <input type="hidden" name="intent" value="addPremortem" />
                <input type="hidden" name="opportunityId" value={opp.id} />
                <input
                  type="text"
                  name="failureScenario"
                  placeholder="실패 시나리오..."
                  required
                  maxLength={1000}
                  className="w-full rounded border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-2 py-1 text-sm"
                />
                <div className="flex gap-2">
                  <select
                    name="probability"
                    className="rounded border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-2 py-1 text-xs"
                  >
                    <option value="">확률%</option>
                    <option value="10">10%</option>
                    <option value="25">25%</option>
                    <option value="50">50%</option>
                    <option value="75">75%</option>
                    <option value="90">90%</option>
                  </select>
                  <select
                    name="impact"
                    className="rounded border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-2 py-1 text-xs"
                  >
                    <option value="">영향</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                  </select>
                  <Button type="submit" size="sm" variant="secondary" disabled={isSubmitting}>
                    추가
                  </Button>
                </div>
              </Form>
            </div>

            {/* Lean Canvas */}
            <div className="rounded-md border border-[var(--axis-border-default)] p-4">
              <h4 className="mb-3 font-medium text-[var(--axis-text-primary)]">Lean Canvas</h4>
              {editingCanvasOppId === opp.id ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                  <div className="h-[90vh] w-[95vw] max-w-[1400px] overflow-hidden rounded-lg bg-[var(--axis-surface-primary)] shadow-xl">
                    <LeanCanvasEditor
                      artifactId={opp.leanCanvas?.id}
                      opportunityId={opp.id}
                      initialContent={opp.leanCanvas?.content ?? undefined}
                      onClose={() => setEditingCanvasOppId(null)}
                    />
                  </div>
                </div>
              ) : !opp.hasLeanCanvas ? (
                <div className="space-y-2">
                  <p className="text-sm text-[var(--axis-text-tertiary)]">
                    Lean Canvas가 아직 없습니다.
                  </p>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setEditingCanvasOppId(opp.id)}
                  >
                    Canvas 작성
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {opp.leanCanvas?.content && (
                    <LeanCanvasViewer
                      content={opp.leanCanvas.content}
                      onEdit={() => setEditingCanvasOppId(opp.id)}
                    />
                  )}
                  {!opp.leanCanvas?.content && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--axis-text-tertiary)]">
                        Lean Canvas가 작성되었습니다.
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setEditingCanvasOppId(opp.id)}
                      >
                        편집
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
