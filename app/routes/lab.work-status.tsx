import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { RequirementsQueryService } from "~/features/requests/service";
import { WORK_PLAN_STATUS_LABELS, STEP_STATUS_LABELS } from "~/features/requests/constants";
import type { WorkPlanWithContext } from "~/features/requests/types";
import { Card, CardContent } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "success" | "destructive"> = {
  DRAFT: "secondary",
  APPROVED: "default",
  IN_PROGRESS: "default",
  COMPLETED: "success",
  CANCELLED: "destructive",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "높음",
  medium: "보통",
  low: "낮음",
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
  const [workPlans, statusCounts] = await Promise.all([
    queryService.listWorkPlansWithContext(),
    queryService.countWorkPlansByStatus(),
  ]);

  return json({ workPlans, statusCounts });
}

export default function WorkStatusPage() {
  const { workPlans, statusCounts } = useLoaderData<typeof loader>();
  const typedPlans = workPlans as WorkPlanWithContext[];

  const statuses = ["DRAFT", "APPROVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

  return (
    <div>
      {/* 상태별 카운트 배지 */}
      <div className="mb-6 flex flex-wrap gap-2">
        {statuses.map((s) => (
          <div
            key={s}
            className="flex items-center gap-2 rounded-md border border-line bg-surface-card px-3 py-2"
          >
            <span className="text-xs text-fg-tertiary font-mono-dx">{WORK_PLAN_STATUS_LABELS[s]}</span>
            <Badge variant={STATUS_BADGE_VARIANT[s]} className="font-mono-dx">
              {statusCounts[s] ?? 0}
            </Badge>
          </div>
        ))}
      </div>

      {/* 작업계획 카드 목록 */}
      {typedPlans.length === 0 ? (
        <div className="py-16 text-center">
          <svg className="mx-auto mb-3 h-12 w-12 text-fg-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth="1" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
          </svg>
          <p className="text-sm text-fg-tertiary font-mono-dx">등록된 작업 계획이 없습니다.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {typedPlans.map((plan) => (
            <Card key={plan.id}>
              <CardContent className="p-4">
                {/* 제목 + 상태 */}
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-fg line-clamp-2">{plan.title}</h3>
                  <Badge variant={STATUS_BADGE_VARIANT[plan.status]} className="shrink-0 text-[10px] font-mono-dx">
                    {WORK_PLAN_STATUS_LABELS[plan.status] ?? plan.status}
                  </Badge>
                </div>

                {/* 원본 요구사항 */}
                <p className="mb-3 text-xs text-fg-tertiary line-clamp-1">
                  <span className="text-fg-quaternary">요구사항:</span> {plan.requestTitle}
                </p>

                {/* 우선순위 + 예상 공수 */}
                <div className="mb-3 flex items-center gap-2 text-xs">
                  <span className="rounded bg-surface-secondary px-1.5 py-0.5 text-fg-secondary font-mono-dx">
                    {PRIORITY_LABELS[plan.requestPriority] ?? plan.requestPriority}
                  </span>
                  {plan.estimatedEffort && (
                    <span className="text-fg-tertiary font-mono-dx">
                      {plan.estimatedEffort}
                    </span>
                  )}
                </div>

                {/* 진행률 바 */}
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

                {/* 단계별 체크리스트 */}
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
    </div>
  );
}
