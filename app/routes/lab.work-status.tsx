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

const LIFECYCLE_STATUSES = ["PLANNED", "IN_PROGRESS", "DONE"] as const;
const PLAN_STATUSES = ["DRAFT", "APPROVED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const;

/** Status display order: in-progress first (most actionable) */
const STATUS_DISPLAY_ORDER = ["IN_PROGRESS", "PLANNED", "DONE"] as const;

const STATUS_DOT_COLOR: Record<string, string> = {
  PLANNED: "bg-amber-400",
  IN_PROGRESS: "bg-lab-accent animate-pulse",
  DONE: "bg-emerald-500",
};

const STATUS_LANE_BORDER: Record<string, string> = {
  PLANNED: "border-l-amber-400/60",
  IN_PROGRESS: "border-l-lab-accent/80",
  DONE: "border-l-emerald-500/40",
};

const STATUS_LANE_BG: Record<string, string> = {
  PLANNED: "bg-amber-400/5",
  IN_PROGRESS: "bg-lab-accent/5",
  DONE: "bg-emerald-500/5",
};

const PRIORITY_STYLE: Record<string, string> = {
  P0: "text-red-400 bg-red-400/10 border-red-400/30",
  P1: "text-amber-400 bg-amber-400/10 border-amber-400/30",
  P2: "text-sky-400 bg-sky-400/10 border-sky-400/30",
  P3: "text-fg-quaternary bg-surface-secondary border-line-subtle",
};

const PLAN_STATUS_DOT: Record<string, string> = {
  DRAFT: "bg-fg-quaternary",
  APPROVED: "bg-sky-400",
  IN_PROGRESS: "bg-lab-accent animate-pulse",
  COMPLETED: "bg-emerald-500",
  CANCELLED: "bg-red-400/50",
};

const STEP_STATUS_DOT: Record<string, string> = {
  todo: "border-fg-quaternary bg-transparent",
  doing: "bg-lab-accent animate-pulse",
  done: "bg-emerald-500",
  blocked: "bg-red-400",
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

  const lifecycleRequests = allRequests.filter(
    (r) => LIFECYCLE_STATUSES.includes(r.status as typeof LIFECYCLE_STATUSES[number]),
  );
  const lifecycleCounts: Record<string, number> = {};
  for (const r of lifecycleRequests) {
    lifecycleCounts[r.status] = (lifecycleCounts[r.status] ?? 0) + 1;
  }

  return json({ workPlans, planStatusCounts, lifecycleRequests, lifecycleCounts });
}

/* ── Summary Counter ── */
function SummaryCounter({
  label,
  count,
  dotColor,
  active,
}: {
  label: string;
  count: number;
  dotColor: string;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-md border px-3.5 py-2.5 transition-colors ${
        active
          ? "border-lab-accent/40 bg-lab-accent/8"
          : "border-line-subtle bg-surface-card/60"
      }`}
    >
      <span className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`} />
      <span className="text-xs text-fg-secondary">{label}</span>
      <span className={`text-sm font-bold font-mono-dx tabular-nums ${
        active ? "text-lab-accent" : "text-fg"
      }`}>
        {count}
      </span>
    </div>
  );
}

/* ── Collapsible Status Lane ── */
function StatusLane({
  status,
  items,
  defaultOpen = true,
}: {
  status: string;
  items: RequestWithReview[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (items.length === 0) return null;

  return (
    <div className={`rounded-lg border border-line-subtle/60 overflow-hidden ${STATUS_LANE_BG[status] ?? ""}`}>
      {/* Lane header */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left hover:bg-surface-card-hover/40 transition-colors"
      >
        <svg
          className={`h-3.5 w-3.5 shrink-0 text-fg-tertiary transition-transform duration-200 ${open ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2.5"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${STATUS_DOT_COLOR[status] ?? "bg-fg-quaternary"}`} />
        <span className="text-sm font-semibold text-fg">
          {STATUS_LABELS[status] ?? status}
        </span>
        <span className="text-xs text-fg-tertiary font-mono-dx tabular-nums">
          {items.length}
        </span>
        <div className="flex-1" />
        {/* Domain breakdown mini-tags */}
        <DomainBreakdown items={items} />
      </button>

      {/* Lane items */}
      {open && (
        <div className={`border-l-2 ml-3 ${STATUS_LANE_BORDER[status] ?? "border-l-line-subtle"}`}>
          {items.map((r, i) => (
            <LifecycleRow key={r.id} item={r} isLast={i === items.length - 1} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Domain breakdown mini-badges ── */
function DomainBreakdown({ items }: { items: RequestWithReview[] }) {
  const domainCounts: Record<string, number> = {};
  for (const r of items) {
    const d = r.domain ?? "etc";
    domainCounts[d] = (domainCounts[d] ?? 0) + 1;
  }
  const entries = Object.entries(domainCounts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;

  return (
    <div className="hidden sm:flex items-center gap-1.5">
      {entries.slice(0, 3).map(([domain, count]) => (
        <span
          key={domain}
          className="rounded bg-surface-secondary/80 px-1.5 py-0.5 text-[11px] text-fg-tertiary tabular-nums"
        >
          {DOMAIN_LABELS[domain] ?? domain} {count}
        </span>
      ))}
      {entries.length > 3 && (
        <span className="text-[11px] text-fg-tertiary">
          +{entries.length - 3}
        </span>
      )}
    </div>
  );
}

/* ── Single lifecycle item row ── */
function LifecycleRow({ item: r, isLast }: { item: RequestWithReview; isLast: boolean }) {
  return (
    <div
      className={`group flex items-center gap-2.5 px-3.5 py-2.5 hover:bg-surface-card-hover/50 transition-colors ${
        !isLast ? "border-b border-line-subtle/30" : ""
      }`}
    >
      {/* Req code */}
      {r.reqCode ? (
        <span className="shrink-0 w-[4rem] text-[11px] font-semibold text-lab-accent font-mono-dx truncate">
          {r.reqCode}
        </span>
      ) : (
        <span className="shrink-0 w-[4rem] text-[11px] text-fg-quaternary font-mono-dx">--</span>
      )}

      {/* Type + Domain compact tags */}
      <div className="hidden sm:flex shrink-0 items-center gap-1">
        {r.type && (
          <span className="rounded bg-surface-secondary/80 px-1.5 py-0.5 text-[11px] text-fg-secondary">
            {TYPE_LABELS[r.type] ?? r.type}
          </span>
        )}
        {r.domain && (
          <span className="rounded bg-surface-secondary/80 px-1.5 py-0.5 text-[11px] text-fg-secondary">
            {DOMAIN_LABELS[r.domain] ?? r.domain}
          </span>
        )}
      </div>

      {/* Priority badge */}
      {r.priorityLevel ? (
        <span
          className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-bold font-mono-dx tabular-nums ${
            PRIORITY_STYLE[r.priorityLevel] ?? PRIORITY_STYLE.P3
          }`}
        >
          {r.priorityLevel}
        </span>
      ) : (
        <span className="shrink-0 w-6" />
      )}

      {/* Title */}
      <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary group-hover:text-fg transition-colors">
        {r.title}
      </span>

      {/* SPEC + milestone (right-aligned, subtle) */}
      <div className="hidden lg:flex shrink-0 items-center gap-2 text-[11px] text-fg-tertiary font-mono-dx">
        {r.specItemId && <span>{r.specItemId}</span>}
        {r.milestoneVersion && <span>v{r.milestoneVersion}</span>}
      </div>
    </div>
  );
}

/* ── Work Plan compact row ── */
function WorkPlanRow({ plan, isLast }: { plan: WorkPlanWithContext; isLast: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const doneSteps = plan.steps?.filter((s) => s.status === "done") ?? [];
  const totalSteps = (plan.steps ?? []).length;

  return (
    <div className={!isLast ? "border-b border-line-subtle/30" : ""}>
      <button
        type="button"
        onClick={() => totalSteps > 0 && setExpanded(!expanded)}
        className="group flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left hover:bg-surface-card-hover/50 transition-colors"
      >
        {/* Status dot */}
        <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${PLAN_STATUS_DOT[plan.status] ?? "bg-fg-quaternary"}`} />

        {/* Status label */}
        <span className="shrink-0 w-14 text-xs text-fg-secondary">
          {WORK_PLAN_STATUS_LABELS[plan.status] ?? plan.status}
        </span>

        {/* Title */}
        <span className="min-w-0 flex-1 truncate text-sm text-fg-secondary group-hover:text-fg transition-colors">
          {plan.title}
        </span>

        {/* Inline progress bar */}
        <div className="hidden sm:flex shrink-0 items-center gap-2 w-32">
          <div className="flex-1 h-1.5 rounded-full bg-surface-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-lab-accent transition-all duration-500"
              style={{ width: `${Math.min(plan.progress, 100)}%` }}
            />
          </div>
          <span className="text-xs font-mono-dx tabular-nums text-fg-secondary w-9 text-right">
            {plan.progress}%
          </span>
        </div>

        {/* Steps count */}
        {totalSteps > 0 && (
          <span className="shrink-0 text-[11px] text-fg-tertiary font-mono-dx tabular-nums">
            {doneSteps.length}/{totalSteps}
          </span>
        )}

        {/* Expand chevron */}
        {totalSteps > 0 && (
          <svg
            className={`h-3.5 w-3.5 shrink-0 text-fg-tertiary transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        )}
      </button>

      {/* Expanded steps */}
      {expanded && plan.steps && plan.steps.length > 0 && (
        <div className="ml-7 mr-3 mb-2.5 border-l border-line-subtle/50 pl-3">
          {plan.steps.map((step) => (
            <div
              key={step.id}
              className="flex items-center gap-2.5 py-1.5 text-xs"
            >
              <span
                className={`h-2 w-2 rounded-full shrink-0 border ${
                  STEP_STATUS_DOT[step.status] ?? "border-fg-quaternary bg-transparent"
                }`}
              />
              <span
                className={`flex-1 truncate ${
                  step.status === "done"
                    ? "text-fg-quaternary line-through"
                    : step.status === "blocked"
                      ? "text-red-400"
                      : "text-fg-secondary"
                }`}
              >
                {step.title}
              </span>
              <span className="shrink-0 text-[11px] text-fg-tertiary font-mono-dx">
                {STEP_STATUS_LABELS[step.status] ?? step.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Main Page ── */
export default function WorkStatusPage() {
  const { workPlans, planStatusCounts, lifecycleRequests, lifecycleCounts } =
    useLoaderData<typeof loader>();
  const typedPlans = workPlans as WorkPlanWithContext[];
  const typedLifecycle = lifecycleRequests as RequestWithReview[];

  // Group by status
  const grouped: Record<string, RequestWithReview[]> = {};
  for (const r of typedLifecycle) {
    (grouped[r.status] ??= []).push(r);
  }

  // Sort work plans: IN_PROGRESS first, then by progress desc
  const planOrder: Record<string, number> = {
    IN_PROGRESS: 0,
    APPROVED: 1,
    DRAFT: 2,
    COMPLETED: 3,
    CANCELLED: 4,
  };
  const sortedPlans = [...typedPlans].sort(
    (a, b) => (planOrder[a.status] ?? 9) - (planOrder[b.status] ?? 9) || b.progress - a.progress,
  );

  const totalLifecycle = typedLifecycle.length;

  return (
    <div className="space-y-6">
      {/* ── Section: 개발 라이프사이클 ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">
            개발 라이프사이클
          </h2>
          <span className="text-xs text-fg-tertiary font-mono-dx tabular-nums">
            {totalLifecycle}건
          </span>
        </div>

        {/* Summary counters */}
        <div className="mb-4 flex flex-wrap gap-2">
          {LIFECYCLE_STATUSES.map((s) => (
            <SummaryCounter
              key={s}
              label={STATUS_LABELS[s]}
              count={lifecycleCounts[s] ?? 0}
              dotColor={STATUS_DOT_COLOR[s]}
              active={s === "IN_PROGRESS" && (lifecycleCounts[s] ?? 0) > 0}
            />
          ))}
        </div>

        {/* Status lanes */}
        {totalLifecycle === 0 ? (
          <div className="py-8 text-center text-xs text-fg-tertiary font-mono-dx">
            계획/진행/완료된 요구사항이 없어요. 칸반에서 반영 → 계획으로 전환해 보세요.
          </div>
        ) : (
          <div className="space-y-2">
            {STATUS_DISPLAY_ORDER.map((status) => (
              <StatusLane
                key={status}
                status={status}
                items={grouped[status] ?? []}
                defaultOpen={status !== "DONE"}
              />
            ))}
          </div>
        )}
      </section>

      {/* ── Section: 작업계획 ── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-fg">
            작업계획
          </h2>
          <span className="text-xs text-fg-tertiary font-mono-dx tabular-nums">
            {typedPlans.length}건
          </span>
        </div>

        {/* Plan summary counters */}
        <div className="mb-4 flex flex-wrap gap-2">
          {PLAN_STATUSES.map((s) => (
            <SummaryCounter
              key={s}
              label={WORK_PLAN_STATUS_LABELS[s]}
              count={planStatusCounts[s] ?? 0}
              dotColor={PLAN_STATUS_DOT[s]}
              active={s === "IN_PROGRESS" && (planStatusCounts[s] ?? 0) > 0}
            />
          ))}
        </div>

        {sortedPlans.length === 0 ? (
          <div className="py-8 text-center text-xs text-fg-tertiary font-mono-dx">
            등록된 작업 계획이 없어요.
          </div>
        ) : (
          <div className="rounded-lg border border-line-subtle/60 overflow-hidden bg-surface-card/30">
            {sortedPlans.map((plan, i) => (
              <WorkPlanRow
                key={plan.id}
                plan={plan}
                isLast={i === sortedPlans.length - 1}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
