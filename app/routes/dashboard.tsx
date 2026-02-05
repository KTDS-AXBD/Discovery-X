import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, Outlet, useLoaderData, useLocation } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { cn } from "~/lib/utils/cn";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const user = await getUserFromSession(request, db, secret);

    if (!user) {
      return redirect("/login");
    }

    return json({ user });
  } catch (error) {
    console.error("[dashboard.loader] Error:", error instanceof Error ? error.message : error);
    return redirect("/login");
  }
}

const PipelineIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="2" width="3.5" height="12" rx="1" fill="currentColor" opacity="0.3" />
    <rect x="6.25" y="4" width="3.5" height="10" rx="1" fill="currentColor" opacity="0.5" />
    <rect x="11.5" y="6" width="3.5" height="8" rx="1" fill="currentColor" opacity="0.7" />
  </svg>
);

const MetricsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="9" width="3" height="5" rx="0.5" fill="currentColor" opacity="0.5" />
    <rect x="5.5" y="5" width="3" height="9" rx="0.5" fill="currentColor" opacity="0.7" />
    <rect x="10" y="2" width="3" height="12" rx="0.5" fill="currentColor" />
  </svg>
);

const HealthIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 14s-5.5-3.5-5.5-7.5C2.5 4 4.5 2 6.5 2c1.2 0 2.3.8 3 1.5C10.2 2.8 11.3 2 12.5 2c2 0 3 2 3 4.5S8 14 8 14z" fill="currentColor" opacity="0.6" />
    <path d="M4 8h2l1-2 2 4 1-2h2" stroke="white" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const AlertsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 1.5L1 13.5h14L8 1.5z" fill="currentColor" opacity="0.5" />
    <rect x="7.25" y="6" width="1.5" height="4" rx="0.5" fill="white" />
    <circle cx="8" cy="11.5" r="0.75" fill="white" />
  </svg>
);

const AuditLogIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="2" y="1" width="12" height="14" rx="1.5" fill="currentColor" opacity="0.3" />
    <line x1="5" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <line x1="5" y1="8" x2="11" y2="8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    <line x1="5" y1="11" x2="9" y2="11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const ReviewIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
    <path d="M8 4v4l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const RecallIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3.5 2v4h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M3.5 6A5.5 5.5 0 1 1 2.5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
  </svg>
);

const AssetsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M8 1L2 4v4c0 4 2.5 6 6 7 3.5-1 6-3 6-7V4L8 1z" fill="currentColor" opacity="0.4" />
    <path d="M6 8l1.5 1.5L10 6" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const tabs = [
  { to: "/dashboard", label: "파이프라인", end: true, icon: <PipelineIcon /> },
  { to: "/dashboard/metrics", label: "지표", icon: <MetricsIcon /> },
  { to: "/dashboard/health", label: "건강도", icon: <HealthIcon /> },
  { to: "/dashboard/alerts", label: "알림", icon: <AlertsIcon /> },
  { to: "/dashboard/audit-log", label: "활동 기록", end: true, icon: <AuditLogIcon /> },
  { to: "/dashboard/review", label: "주간 리뷰", end: true, icon: <ReviewIcon /> },
  { to: "/dashboard/recall", label: "리콜 큐", end: true, icon: <RecallIcon /> },
  { to: "/dashboard/assets", label: "지식 자산", end: true, icon: <AssetsIcon /> },
];

export default function DashboardLayout() {
  const { user } = useLoaderData<typeof loader>();
  const location = useLocation();

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8">
        {/* Tab navigation — flat text style */}
        <div className="mb-6 flex gap-6 overflow-x-auto border-b border-[var(--dx-border-subtle,var(--axis-border-default))]" role="tablist">
          {tabs.map((tab) => {
            const isActive = tab.end
              ? location.pathname === tab.to
              : location.pathname.startsWith(tab.to);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                role="tab"
                aria-selected={isActive}
                className={cn(
                  "whitespace-nowrap pb-3 text-sm font-medium transition-colors duration-[var(--dx-transition-normal)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--axis-button-border-focus)] focus-visible:ring-offset-1",
                  isActive
                    ? "text-[var(--axis-text-primary)] font-semibold border-b-2 border-[var(--axis-text-brand)]"
                    : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]"
                )}
              >
                <span className="flex items-center gap-1.5">
                  {tab.icon}
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
        <Outlet />
      </div>
    </AppShell>
  );
}
