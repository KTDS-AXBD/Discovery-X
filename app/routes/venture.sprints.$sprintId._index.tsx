/**
 * Venture Sprint 개요 탭
 * /venture/sprints/:sprintId (기본)
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useLoaderData, useNavigation, useOutletContext } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { Button } from "~/components/ui/Button";
import { Badge } from "~/components/ui/Badge";
import {
  getSprintById,
  getSprintScopes,
  updateSprintStatus,
  toggleScopeSelection,
  getSelectedScopeCount,
} from "~/features/venture/repositories/sprint.repository";
import {
  getOpportunityCount,
  getShortlistCount,
  getFinalCount,
} from "~/features/venture/repositories/opportunity.repository";
import { getPendingDecisionCount } from "~/features/venture/repositories/decision.repository";
import { getRecentEvents } from "~/features/venture/repositories/analytics.repository";
import {
  VD_SPRINT_STATUS_CONFIG,
  VD_SPRINT_ALLOWED_TRANSITIONS,
} from "~/features/venture/constants/sprint-status";
import {
  validateTransition,
  getSprintProgressSummary,
  getCurrentDayInfo,
  type SprintTransitionContext,
} from "~/features/venture/domain/sprint-state-machine";
import type { VdSprintStatusType, VdSprint, VdSprintScope } from "~/features/venture/types";

interface OutletContextType {
  sprint: VdSprint;
  scopes: VdSprintScope[];
  stats: {
    opportunityCount: number;
    shortlistCount: number;
    finalCount: number;
    pendingDecisionCount: number;
  };
  user: { id: string; name: string | null };
}

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

  const [scopes, recentEvents, selectedScopeCount, opportunityCount, shortlistCount, finalCount, pendingDecisionCount] =
    await Promise.all([
      getSprintScopes(db, sprintId),
      getRecentEvents(db, sprintId, 10),
      getSelectedScopeCount(db, sprintId),
      getOpportunityCount(db, sprintId),
      getShortlistCount(db, sprintId),
      getFinalCount(db, sprintId),
      getPendingDecisionCount(db, sprintId),
    ]);

  // 전환 컨텍스트
  const transitionContext: SprintTransitionContext = {
    currentStatus: sprint.status as VdSprintStatusType,
    selectedScopeCount,
    opportunityCount,
    shortlistCount,
    finalCount,
    pendingDecisionCount,
  };

  const progressSummary = getSprintProgressSummary(transitionContext);
  const dayInfo = getCurrentDayInfo(sprint.status as VdSprintStatusType);

  // 다음 상태 전환 가능 여부
  const nextTransitions = VD_SPRINT_ALLOWED_TRANSITIONS[sprint.status as VdSprintStatusType]
    .filter((s) => s !== "ARCHIVED")
    .map((targetStatus) => ({
      status: targetStatus,
      label: VD_SPRINT_STATUS_CONFIG[targetStatus].label,
      validation: validateTransition(transitionContext, targetStatus),
    }));

  return json({
    sprint,
    scopes,
    recentEvents,
    progressSummary,
    dayInfo,
    nextTransitions,
    transitionContext,
  });
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
    return redirect("/venture/sprints");
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "toggleScope") {
    const scopeId = formData.get("scopeId") as string;
    const selected = formData.get("selected") === "true";
    await toggleScopeSelection(db, scopeId, selected);
    return json({ success: true });
  }

  if (intent === "transition") {
    const targetStatus = formData.get("targetStatus") as VdSprintStatusType;

    // 검증
    const sprint = await getSprintById(db, sprintId);
    if (!sprint) {
      return json({ error: "Sprint not found" }, { status: 404 });
    }

    const [selectedScopeCount, opportunityCount, shortlistCount, finalCount, pendingDecisionCount] =
      await Promise.all([
        getSelectedScopeCount(db, sprintId),
        getOpportunityCount(db, sprintId),
        getShortlistCount(db, sprintId),
        getFinalCount(db, sprintId),
        getPendingDecisionCount(db, sprintId),
      ]);

    const transitionContext: SprintTransitionContext = {
      currentStatus: sprint.status as VdSprintStatusType,
      selectedScopeCount,
      opportunityCount,
      shortlistCount,
      finalCount,
      pendingDecisionCount,
    };

    const validation = validateTransition(transitionContext, targetStatus);
    if (!validation.allowed) {
      return json({ error: validation.errors.join(", ") }, { status: 400 });
    }

    await updateSprintStatus(db, sprintId, targetStatus);
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}

export default function VentureSprintOverview() {
  const { sprint, scopes, recentEvents, progressSummary, dayInfo, nextTransitions, transitionContext } =
    useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const statusConfig = VD_SPRINT_STATUS_CONFIG[sprint.status as VdSprintStatusType];

  return (
    <div className="space-y-6">
      {/* Day 정보 (진행 중인 경우) */}
      {dayInfo && (
        <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-brand-subtle)] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--axis-surface-brand)] text-[var(--axis-text-on-brand)] font-bold">
              {dayInfo.day}
            </div>
            <div>
              <div className="font-semibold text-[var(--axis-text-primary)]">
                {dayInfo.name}
              </div>
              <div className="text-sm text-[var(--axis-text-tertiary)]">
                {dayInfo.description}
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {dayInfo.activities.map((activity, i) => (
              <span
                key={i}
                className="rounded-full bg-[var(--axis-surface-primary)] px-3 py-1 text-xs text-[var(--axis-text-secondary)]"
              >
                {activity}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 범위 선택 */}
        <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
          <h2 className="mb-4 font-semibold text-[var(--axis-text-primary)]">탐색 범위</h2>
          <div className="space-y-2">
            {scopes.map((scope) => (
              <Form key={scope.id} method="post">
                <input type="hidden" name="intent" value="toggleScope" />
                <input type="hidden" name="scopeId" value={scope.id} />
                <input type="hidden" name="selected" value={scope.selected ? "false" : "true"} />
                <button
                  type="submit"
                  disabled={isSubmitting || sprint.status !== "DRAFT"}
                  className={`flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors ${
                    scope.selected
                      ? "border-[var(--axis-text-brand)] bg-[var(--axis-surface-brand-subtle)]"
                      : "border-[var(--axis-border-default)] hover:border-[var(--axis-border-hover)]"
                  } ${sprint.status !== "DRAFT" ? "cursor-not-allowed opacity-60" : ""}`}
                >
                  <div>
                    <div className="font-medium text-[var(--axis-text-primary)]">
                      {scope.industry}
                    </div>
                    {(scope.function || scope.technology) && (
                      <div className="text-xs text-[var(--axis-text-tertiary)]">
                        {[scope.function, scope.technology].filter(Boolean).join(" / ")}
                      </div>
                    )}
                  </div>
                  {scope.selected && (
                    <Badge variant="success">선택됨</Badge>
                  )}
                </button>
              </Form>
            ))}
          </div>
          {sprint.status === "DRAFT" && (
            <p className="mt-3 text-xs text-[var(--axis-text-tertiary)]">
              스프린트 시작 전 탐색할 산업을 선택하세요.
            </p>
          )}
        </div>

        {/* 상태 전환 */}
        <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
          <h2 className="mb-4 font-semibold text-[var(--axis-text-primary)]">상태 관리</h2>
          <div className="mb-4">
            <div className="text-sm text-[var(--axis-text-tertiary)]">현재 상태</div>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={statusConfig?.variant || "secondary"} className="text-base">
                {statusConfig?.label || sprint.status}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-[var(--axis-text-tertiary)]">
              {statusConfig?.description}
            </p>
          </div>

          {nextTransitions.length > 0 && !progressSummary.isTerminal && (
            <div className="space-y-2">
              <div className="text-sm text-[var(--axis-text-tertiary)]">다음 단계</div>
              {nextTransitions.map(({ status, label, validation }) => (
                <Form key={status} method="post">
                  <input type="hidden" name="intent" value="transition" />
                  <input type="hidden" name="targetStatus" value={status} />
                  <Button
                    type="submit"
                    variant={validation.allowed ? "default" : "secondary"}
                    disabled={!validation.allowed || isSubmitting}
                    className="w-full justify-start"
                  >
                    {label}로 전환
                    {validation.errors.length > 0 && (
                      <span className="ml-2 text-xs opacity-70">
                        ({validation.errors[0]})
                      </span>
                    )}
                  </Button>
                  {validation.warnings.length > 0 && (
                    <p className="mt-1 text-xs text-[var(--axis-badge-warning-text)]">
                      {validation.warnings[0]}
                    </p>
                  )}
                </Form>
              ))}
            </div>
          )}

          {progressSummary.isTerminal && (
            <p className="text-sm text-[var(--axis-text-tertiary)]">
              스프린트가 종료되었습니다.
            </p>
          )}
        </div>
      </div>

      {/* 최근 활동 */}
      <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
        <h2 className="mb-4 font-semibold text-[var(--axis-text-primary)]">최근 활동</h2>
        {recentEvents.length === 0 ? (
          <p className="text-sm text-[var(--axis-text-tertiary)]">아직 활동 기록이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {recentEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-start gap-3 border-b border-[var(--axis-border-default)] pb-3 last:border-0 last:pb-0"
              >
                <div
                  className={`mt-1 h-2 w-2 rounded-full ${
                    event.actorType === "agent"
                      ? "bg-[var(--axis-badge-purple-bg)]"
                      : "bg-[var(--axis-badge-success-bg)]"
                  }`}
                />
                <div className="flex-1">
                  <div className="text-sm text-[var(--axis-text-primary)]">
                    {event.eventType.replace(/_/g, " ")}
                  </div>
                  <div className="text-xs text-[var(--axis-text-tertiary)]">
                    {event.actorType === "agent" ? "Agent" : "User"} ·{" "}
                    {new Date(event.createdAt).toLocaleString("ko-KR")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
