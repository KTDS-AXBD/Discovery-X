/**
 * Venture Sprint Packaging 탭
 * /venture/sprints/:sprintId/packaging
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, Link, useLoaderData, useNavigation } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { getSprintById, updateSprintStatus } from "~/features/venture/repositories/sprint.repository";
import {
  listOpportunitiesBySprint,
  listArtifactsByOpportunity,
  updateArtifact,
  createArtifact,
  updateOpportunity,
} from "~/features/venture/repositories/opportunity.repository";
import { enqueueTask } from "~/features/venture/repositories/task-queue.repository";
import { createWorkEvent } from "~/features/venture/repositories/analytics.repository";
import { createArtifactSchema, updateArtifactSchema } from "~/features/venture/schemas/opportunity.schema";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const { sprintId } = params;
  if (!sprintId) {
    return redirect("/venture/sprints");
  }

  const sprint = await getSprintById(db, sprintId);
  if (!sprint) {
    throw new Response("Sprint not found", { status: 404 });
  }

  // Final 기회만 조회
  const opportunities = await listOpportunitiesBySprint(db, sprintId, { finalOnly: true });

  // 각 기회별 산출물 로드
  const opportunitiesWithArtifacts = await Promise.all(
    opportunities.map(async (opp) => {
      const artifacts = await listArtifactsByOpportunity(db, opp.id);
      return {
        ...opp,
        artifacts,
        hasPitchDeck: artifacts.some((a) => a.artifactType === "PITCH_DECK"),
        hasOnePager: artifacts.some((a) => a.artifactType === "ONE_PAGER"),
        hasExecutiveSummary: artifacts.some((a) => a.artifactType === "EXECUTIVE_SUMMARY"),
      };
    })
  );

  return json({ sprint, opportunities: opportunitiesWithArtifacts });
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const { sprintId } = params;
  if (!sprintId) {
    return json({ error: "Sprint ID required" }, { status: 400 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // Artifact 추가
  if (intent === "addArtifact") {
    const opportunityId = formData.get("opportunityId") as string;
    const artifactType = formData.get("artifactType") as string;
    const title = formData.get("title") as string;

    const parseResult = createArtifactSchema.safeParse({
      artifactType,
      title,
    });

    if (!parseResult.success) {
      return json({ error: parseResult.error.errors[0].message }, { status: 400 });
    }

    await createArtifact(db, opportunityId, parseResult.data);

    await createWorkEvent(db, sprintId, {
      eventType: "artifact_create",
      actorType: "human",
      actorId: user.id,
      entityType: "artifact",
    });

    return json({ success: true });
  }

  // Artifact 수정
  if (intent === "updateArtifact") {
    const artifactId = formData.get("artifactId") as string;
    const title = formData.get("title") as string;
    const contentJson = formData.get("content") as string;

    let content;
    if (contentJson) {
      try {
        content = JSON.parse(contentJson);
      } catch {
        return json({ error: "유효하지 않은 JSON 형식입니다" }, { status: 400 });
      }
    }

    const parseResult = updateArtifactSchema.safeParse({
      title: title || undefined,
      content,
    });

    if (!parseResult.success) {
      return json({ error: parseResult.error.errors[0].message }, { status: 400 });
    }

    await updateArtifact(db, artifactId, parseResult.data);

    await createWorkEvent(db, sprintId, {
      eventType: "artifact_update",
      actorType: "human",
      actorId: user.id,
      entityType: "artifact",
      entityId: artifactId,
    });

    return json({ success: true });
  }

  // 산출물 생성 AI 트리거
  if (intent === "triggerPackaging") {
    const opportunityIds = formData.getAll("opportunityIds") as string[];
    const artifactTypes = formData.getAll("artifactTypes") as string[];

    if (opportunityIds.length === 0) {
      return json({ error: "기회를 선택해주세요" }, { status: 400 });
    }

    const types = artifactTypes.length > 0 ? artifactTypes : ["PITCH_DECK", "ONE_PAGER", "EXECUTIVE_SUMMARY"];

    const task = await enqueueTask(db, sprintId, {
      taskType: "GENERATE_ARTIFACTS",
      input: { sprintId, opportunityIds, artifactTypes: types },
      dedupeKey: `artifacts-${sprintId}-${opportunityIds.sort().join("-")}-${types.sort().join("-")}`,
    });

    await createWorkEvent(db, sprintId, {
      eventType: "task_enqueue",
      actorType: "human",
      actorId: user.id,
      entityType: "task",
      entityId: task.id,
      metadata: { taskType: "GENERATE_ARTIFACTS", opportunityIds, artifactTypes: types },
    });

    return json({ success: true, taskId: task.id });
  }

  // Shortlist 기회들을 Final로 마킹 (테스트용)
  if (intent === "markShortlistAsFinal") {
    const shortlistedOpportunities = await listOpportunitiesBySprint(db, sprintId, { shortlistedOnly: true });
    for (const opp of shortlistedOpportunities) {
      await updateOpportunity(db, opp.id, { isFinal: true });
    }

    await createWorkEvent(db, sprintId, {
      eventType: "opportunity_final",
      actorType: "human",
      actorId: user.id,
      entityType: "opportunity",
      metadata: { count: shortlistedOpportunities.length },
    });

    return json({ success: true, count: shortlistedOpportunities.length });
  }

  // 스프린트 완료
  if (intent === "completeSprint") {
    const sprint = await getSprintById(db, sprintId);
    if (!sprint) {
      return json({ error: "스프린트를 찾을 수 없습니다" }, { status: 404 });
    }

    if (sprint.status !== "RUNNING") {
      return json({ error: "실행 중인 스프린트만 완료할 수 있습니다" }, { status: 400 });
    }

    await updateSprintStatus(db, sprintId, "COMPLETED");

    await createWorkEvent(db, sprintId, {
      eventType: "sprint_complete",
      actorType: "human",
      actorId: user.id,
      entityType: "sprint",
      entityId: sprintId,
    });

    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}

export default function VentureSprintPackaging() {
  const { sprint, opportunities } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  if (opportunities.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-12 text-center">
        <p className="text-[var(--axis-text-tertiary)]">
          Final 기회가 없습니다. Gate 2에서 Final을 선정하세요.
        </p>
        <div className="mt-4 flex items-center justify-center gap-4">
          <Link
            to={`/venture/sprints/${sprint.id}/gate`}
            className="text-sm text-[var(--axis-text-brand)] hover:underline"
          >
            Gate로 이동
          </Link>
          {sprint.status === "GATE2_PENDING" && (
            <Form method="post" className="inline">
              <input type="hidden" name="intent" value="markShortlistAsFinal" />
              <Button type="submit" variant="secondary" disabled={isSubmitting}>
                {isSubmitting ? "처리 중..." : "Shortlist를 Final로 마킹"}
              </Button>
            </Form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* AI 문서 생성 트리거 섹션 */}
      <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-medium text-[var(--axis-text-primary)]">AI 문서 생성</h3>
            <p className="text-sm text-[var(--axis-text-tertiary)]">
              Final 기회에 대해 피치 덱, 1-Pager, Executive Summary를 AI가 생성합니다.
            </p>
          </div>
          <Form method="post">
            <input type="hidden" name="intent" value="triggerPackaging" />
            {opportunities.map((opp) => (
              <input key={opp.id} type="hidden" name="opportunityIds" value={opp.id} />
            ))}
            <input type="hidden" name="artifactTypes" value="PITCH_DECK" />
            <input type="hidden" name="artifactTypes" value="ONE_PAGER" />
            <input type="hidden" name="artifactTypes" value="EXECUTIVE_SUMMARY" />
            <Button type="submit" disabled={isSubmitting || opportunities.length === 0}>
              {isSubmitting ? "생성 중..." : `문서 생성 (${opportunities.length}개)`}
            </Button>
          </Form>
        </div>
      </div>

      <p className="text-sm text-[var(--axis-text-tertiary)]">
        Final 기회에 대해 피치 덱, 1-pager, 요약 문서를 작성합니다.
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
                  <Badge variant="info">Final</Badge>
                  <span className="font-semibold text-[var(--axis-text-primary)]">
                    {opp.title}
                  </span>
                  {opp.rank && (
                    <span className="text-sm text-[var(--axis-text-tertiary)]">
                      #{opp.rank}
                    </span>
                  )}
                </div>
                {opp.description && (
                  <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
                    {opp.description.length > 150
                      ? `${opp.description.slice(0, 150)}...`
                      : opp.description}
                  </p>
                )}
              </div>
              <div className="flex gap-2 text-xs">
                {opp.potentialScore !== null && (
                  <span className="rounded-full bg-[var(--axis-surface-tertiary)] px-2 py-1">
                    잠재력 {opp.potentialScore}
                  </span>
                )}
                {opp.confidenceScore !== null && (
                  <span className="rounded-full bg-[var(--axis-surface-tertiary)] px-2 py-1">
                    신뢰도 {opp.confidenceScore}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* 산출물 목록 */}
          <div className="p-4">
            <h4 className="mb-3 font-medium text-[var(--axis-text-primary)]">산출물</h4>
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Pitch Deck */}
              <div
                className={`rounded-md border p-4 ${
                  opp.hasPitchDeck
                    ? "border-[var(--axis-badge-success-border)] bg-[var(--axis-badge-success-bg)]"
                    : "border-[var(--axis-border-default)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--axis-text-primary)]">
                    Pitch Deck
                  </span>
                  <Badge variant={opp.hasPitchDeck ? "success" : "secondary"}>
                    {opp.hasPitchDeck ? "완료" : "미작성"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                  5~7장 슬라이드 구성
                </p>
                {!opp.hasPitchDeck && (
                  <Form method="post" className="mt-2">
                    <input type="hidden" name="intent" value="triggerPackaging" />
                    <input type="hidden" name="opportunityIds" value={opp.id} />
                    <input type="hidden" name="artifactTypes" value="PITCH_DECK" />
                    <Button type="submit" variant="secondary" size="sm" disabled={isSubmitting}>
                      생성
                    </Button>
                  </Form>
                )}
              </div>

              {/* One Pager */}
              <div
                className={`rounded-md border p-4 ${
                  opp.hasOnePager
                    ? "border-[var(--axis-badge-success-border)] bg-[var(--axis-badge-success-bg)]"
                    : "border-[var(--axis-border-default)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--axis-text-primary)]">
                    One Pager
                  </span>
                  <Badge variant={opp.hasOnePager ? "success" : "secondary"}>
                    {opp.hasOnePager ? "완료" : "미작성"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                  1페이지 요약 문서
                </p>
                {!opp.hasOnePager && (
                  <Form method="post" className="mt-2">
                    <input type="hidden" name="intent" value="triggerPackaging" />
                    <input type="hidden" name="opportunityIds" value={opp.id} />
                    <input type="hidden" name="artifactTypes" value="ONE_PAGER" />
                    <Button type="submit" variant="secondary" size="sm" disabled={isSubmitting}>
                      생성
                    </Button>
                  </Form>
                )}
              </div>

              {/* Executive Summary */}
              <div
                className={`rounded-md border p-4 ${
                  opp.hasExecutiveSummary
                    ? "border-[var(--axis-badge-success-border)] bg-[var(--axis-badge-success-bg)]"
                    : "border-[var(--axis-border-default)]"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-[var(--axis-text-primary)]">
                    Executive Summary
                  </span>
                  <Badge variant={opp.hasExecutiveSummary ? "success" : "secondary"}>
                    {opp.hasExecutiveSummary ? "완료" : "미작성"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                  경영진용 2페이지 요약
                </p>
                {!opp.hasExecutiveSummary && (
                  <Form method="post" className="mt-2">
                    <input type="hidden" name="intent" value="triggerPackaging" />
                    <input type="hidden" name="opportunityIds" value={opp.id} />
                    <input type="hidden" name="artifactTypes" value="EXECUTIVE_SUMMARY" />
                    <Button type="submit" variant="secondary" size="sm" disabled={isSubmitting}>
                      생성
                    </Button>
                  </Form>
                )}
              </div>
            </div>

            {/* 기존 산출물 목록 */}
            {opp.artifacts.length > 0 && (
              <div className="mt-4">
                <h5 className="mb-2 text-sm font-medium text-[var(--axis-text-tertiary)]">
                  작성된 산출물
                </h5>
                <div className="space-y-2">
                  {opp.artifacts.map((artifact) => (
                    <div
                      key={artifact.id}
                      className="flex items-center justify-between rounded-md bg-[var(--axis-surface-secondary)] p-3"
                    >
                      <div>
                        <span className="font-medium text-[var(--axis-text-primary)]">
                          {artifact.title}
                        </span>
                        <span className="ml-2 text-xs text-[var(--axis-text-tertiary)]">
                          v{artifact.version}
                        </span>
                      </div>
                      <div className="text-xs text-[var(--axis-text-tertiary)]">
                        {new Date(artifact.updatedAt).toLocaleDateString("ko-KR")}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ))}

      {/* Export 섹션 */}
      <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
        <h3 className="mb-4 font-semibold text-[var(--axis-text-primary)]">Export</h3>
        <p className="mb-4 text-sm text-[var(--axis-text-tertiary)]">
          Final 기회와 산출물을 파일로 내보냅니다.
        </p>
        <div className="flex flex-wrap gap-3">
          <a
            href={`/api/venture/export/${sprint.id}?format=markdown`}
            download
            className="inline-flex items-center gap-2 rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] px-4 py-2 text-sm font-medium text-[var(--axis-text-primary)] hover:bg-[var(--axis-surface-tertiary)] transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Markdown 다운로드
          </a>
          <a
            href={`/api/venture/export/${sprint.id}?format=json`}
            download
            className="inline-flex items-center gap-2 rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-secondary)] px-4 py-2 text-sm font-medium text-[var(--axis-text-primary)] hover:bg-[var(--axis-surface-tertiary)] transition-colors"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            JSON 다운로드
          </a>
          <Button variant="secondary" disabled>
            PDF 다운로드 (준비중)
          </Button>
        </div>
      </div>

      {/* 스프린트 완료 섹션 */}
      {sprint.status === "RUNNING" && (
        <div className="rounded-lg border border-[var(--axis-badge-success-border)] bg-[var(--axis-badge-success-bg)] p-6">
          <h3 className="mb-2 font-semibold text-[var(--axis-text-primary)]">스프린트 완료</h3>
          <p className="mb-4 text-sm text-[var(--axis-text-tertiary)]">
            모든 산출물이 준비되었다면 스프린트를 완료할 수 있습니다.
          </p>
          <Form method="post">
            <input type="hidden" name="intent" value="completeSprint" />
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "완료 처리 중..." : "스프린트 완료"}
            </Button>
          </Form>
        </div>
      )}

      {sprint.status === "COMPLETED" && (
        <div className="rounded-lg border border-[var(--axis-badge-success-border)] bg-[var(--axis-badge-success-bg)] p-6">
          <div className="flex items-center gap-2">
            <Badge variant="success">완료됨</Badge>
            <span className="text-sm text-[var(--axis-text-primary)]">
              이 스프린트는 완료되었습니다.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
