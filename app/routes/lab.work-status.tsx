import { useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { RequirementsQueryService } from "~/features/requests/service";
import {
  WORK_PLAN_STATUS_LABELS,
  STEP_STATUS_LABELS,
  STATUS_LABELS,
  TYPE_LABELS,
  DOMAIN_LABELS,
} from "~/features/requests/constants";
import type { WorkPlanWithContext, RequestWithReview } from "~/features/requests/types";
import { Card, CardContent } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";

const LIFECYCLE_STATUSES = ["PLANNED", "IN_PROGRESS", "DONE"] as const;
const PLAN_STATUSES = ["DRAFT", "APPROVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

const LIFECYCLE_BADGE_VARIANT: Record<string, "default" | "secondary" | "success" | "destructive"> = {
  PLANNED: "secondary",
  IN_PROGRESS: "default",
  DONE: "success",
};

const PLAN_BADGE_VARIANT: Record<string, "default" | "secondary" | "success" | "destructive"> = {
  DRAFT: "secondary",
  APPROVED: "default",
  IN_PROGRESS: "default",
  COMPLETED: "success",
  CANCELLED: "destructive",
};

const STEP_STATUS_ICON: Record<string, string> = {
  todo: "[ ]",
  doing: "[~]",
  done: "[x]",
  blocked: "[!]",
};

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) throw new Response("Unauthorized", { status: 401 });

  const queryService = new RequirementsQueryService(db);
  const [workPlans, planStatusCounts, allRequests] = await Promise.all([
    queryService.listWorkPlansWithContext(),
    queryService.countWorkPlansByStatus(),
    queryService.listWithReviews(),
  ]);

  // 표준 라이프사이클 상태 요구사항 (PLANNED/IN_PROGRESS/DONE)
  const lifecycleRequests = allRequests.filter(
    (r) => LIFECYCLE_STATUSES.includes(r.status as typeof LIFECYCLE_STATUSES[number]),
  );
  const lifecycleCounts: Record<string, number> = {};
  for (const r of lifecycleRequests) {
    lifecycleCounts[r.status] = (lifecycleCounts[r.status] ?? 0) + 1;
  }

  return json({ workPlans, planStatusCounts, lifecycleRequests, lifecycleCounts });
}

export default function WorkStatusPage() {
  const { workPlans, planStatusCounts, lifecycleRequests, lifecycleCounts } =
    useLoaderData<typeof loader>();
  const typedPlans = workPlans as WorkPlanWithContext[];
  const typedLifecycle = lifecycleRequests as RequestWithReview[];
  const [showDone, setShowDone] = useState(false);

  const activeItems = typedLifecycle.filter((r) => r.status !== "DONE");
  const doneItems = typedLifecycle.filter((r) => r.status === "DONE");

  return (
    <div className="space-y-8">
      {/* ── 표준 라이프사이클 현황 ── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-fg font-mono-dx">
          개발 라이프사이클
        </h2>

        {/* 상태 카운트 */}
        <div className="mb-4 flex flex-wrap gap-2">
          {LIFECYCLE_STATUSES.map((s) => (
            <div
              key={s}
              className="flex items-center gap-2 rounded-md border border-line bg-surface-card px-3 py-2"
            >
              <span className="text-xs text-fg-tertiary font-mono-dx">{STATUS_LABELS[s]}</span>
              <Badge variant={LIFECYCLE_BADGE_VARIANT[s]} className="font-mono-dx">
                {lifecycleCounts[s] ?? 0}
              </Badge>
            </div>
          ))}
        </div>

        {/* 활성 항목 (PLANNED + IN_PROGRESS) */}
        {activeItems.length === 0 && doneItems.length === 0 ? (
          <div className="py-8 text-center text-xs text-fg-tertiary font-mono-dx">
            계획/진행/완료된 요구사항이 없어요. 칸반에서 반영→계획으로 전환해 보세요.
          </div>
        ) : (
          <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {activeItems.map((r) => (
              <Card key={r.id}>
                <CardContent className="p-4">
                  {/* REQ 코드 + 상태 */}
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {r.reqCode && (
                        <span className="mr-1.5 text-[10px] font-medium text-lab-accent font-mono-dx">
                          {r.reqCode}
                        </span>
                      )}
                      <h3 className="text-sm font-semibold text-fg line-clamp-2">{r.title}</h3>
                    </div>
                    <Badge variant={LIFECYCLE_BADGE_VARIANT[r.status]} className="shrink-0 text-[10px] font-mono-dx">
                      {STATUS_LABELS[r.status]}
                    </Badge>
                  </div>

                  {/* 분류 태그 */}
                  <div className="mb-2 flex flex-wrap gap-1">
                    {r.type && (
                      <span className="rounded bg-surface-secondary px-1.5 py-0.5 text-[10px] text-fg-tertiary font-mono-dx">
                        {TYPE_LABELS[r.type] ?? r.type}
                      </span>
                    )}
                    {r.domain && (
                      <span className="rounded bg-surface-secondary px-1.5 py-0.5 text-[10px] text-fg-tertiary font-mono-dx">
                        {DOMAIN_LABELS[r.domain] ?? r.domain}
                      </span>
                    )}
                    {r.priorityLevel && (
                      <span className="rounded bg-accent/10 px-1.5 py-0.5 text-[10px] font-bold text-accent font-mono-dx">
                        {r.priorityLevel}
                      </span>
                    )}
                  </div>

                  {/* SPEC + 마일스톤 */}
                  <div className="flex items-center gap-3 text-[10px] text-fg-tertiary font-mono-dx">
                    {r.specItemId && <span>SPEC: {r.specItemId}</span>}
                    {r.milestoneVersion && <span>v{r.milestoneVersion}</span>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* 완료 항목 접기 토글 */}
          {doneItems.length > 0 && (
            <div className="mt-4">
              <button
                type="button"
                onClick={() => setShowDone(!showDone)}
                className="flex items-center gap-2 text-xs text-fg-tertiary hover:text-fg-secondary transition-colors font-mono-dx"
              >
                <svg className={`h-3 w-3 transition-transform ${showDone ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                완료 항목 ({doneItems.length}건) {showDone ? "접기" : "펼치기"}
              </button>

              {showDone && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {doneItems.map((r) => (
                    <div key={r.id} className="rounded-lg border border-line bg-surface-card/50 p-3 opacity-70">
                      <div className="mb-1 flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] text-fg-tertiary font-mono-dx">{r.specItemId}</span>
                          <h4 className="text-xs text-fg-secondary line-clamp-1">{r.title}</h4>
                        </div>
                        <Badge variant="success" className="shrink-0 text-[9px] font-mono-dx">완료</Badge>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {r.type && (
                          <span className="rounded bg-surface-secondary px-1 py-0.5 text-[9px] text-fg-tertiary font-mono-dx">
                            {TYPE_LABELS[r.type] ?? r.type}
                          </span>
                        )}
                        {r.domain && (
                          <span className="rounded bg-surface-secondary px-1 py-0.5 text-[9px] text-fg-tertiary font-mono-dx">
                            {DOMAIN_LABELS[r.domain] ?? r.domain}
                          </span>
                        )}
                        {r.milestoneVersion && (
                          <span className="text-[9px] text-fg-quaternary font-mono-dx">v{r.milestoneVersion}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          </>
        )}
      </section>

      {/* ── 작업계획 (기존) ── */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-fg font-mono-dx">
          작업계획
        </h2>

        <div className="mb-4 flex flex-wrap gap-2">
          {PLAN_STATUSES.map((s) => (
            <div
              key={s}
              className="flex items-center gap-2 rounded-md border border-line bg-surface-card px-3 py-2"
            >
              <span className="text-xs text-fg-tertiary font-mono-dx">{WORK_PLAN_STATUS_LABELS[s]}</span>
              <Badge variant={PLAN_BADGE_VARIANT[s]} className="font-mono-dx">
                {planStatusCounts[s] ?? 0}
              </Badge>
            </div>
          ))}
        </div>

        {typedPlans.length === 0 ? (
          <div className="py-8 text-center text-xs text-fg-tertiary font-mono-dx">
            등록된 작업 계획이 없어요.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {typedPlans.map((plan) => (
              <Card key={plan.id}>
                <CardContent className="p-4">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-fg line-clamp-2">{plan.title}</h3>
                    <Badge variant={PLAN_BADGE_VARIANT[plan.status]} className="shrink-0 text-[10px] font-mono-dx">
                      {WORK_PLAN_STATUS_LABELS[plan.status] ?? plan.status}
                    </Badge>
                  </div>

                  <p className="mb-3 text-xs text-fg-tertiary line-clamp-1">
                    <span className="text-fg-quaternary">요구사항:</span> {plan.requestTitle}
                  </p>

                  <div className="mb-3">
                    <div className="mb-1 flex items-center justify-between text-[10px] text-fg-tertiary font-mono-dx">
                      <span>진행률</span>
                      <span>{plan.progress}%</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-secondary">
                      <div
                        className="h-full rounded-full bg-lab-accent transition-all"
                        style={{ width: `${Math.min(plan.progress, 100)}%` }}
                      />
                    </div>
                  </div>

                  {plan.steps && plan.steps.length > 0 && (
                    <div className="space-y-1 border-t border-line pt-2">
                      {plan.steps.map((step) => (
                        <div key={step.id} className="flex items-center gap-2 text-xs">
                          <span className={`font-mono-dx text-[10px] ${
                            step.status === "done" ? "text-badge-success-text" :
                            step.status === "doing" ? "text-lab-accent" :
                            step.status === "blocked" ? "text-btn-destructive-bg" :
                            "text-fg-tertiary"
                          }`}>
                            {STEP_STATUS_ICON[step.status] ?? "[ ]"}
                          </span>
                          <span className={`truncate ${step.status === "done" ? "text-fg-tertiary line-through" : "text-fg-secondary"}`}>
                            {step.title}
                          </span>
                          <span className="ml-auto shrink-0 text-[10px] text-fg-quaternary font-mono-dx">
                            {STEP_STATUS_LABELS[step.status] ?? step.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
