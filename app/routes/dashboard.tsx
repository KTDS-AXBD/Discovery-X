import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, Outlet, useLoaderData, useLocation } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { cn } from "~/lib/utils/cn";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  return json({ user });
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

const tabs = [
  { to: "/dashboard", label: "Pipeline", end: true, icon: <PipelineIcon /> },
  { to: "/dashboard/metrics", label: "Metrics", icon: <MetricsIcon /> },
  { to: "/dashboard/health", label: "Health", icon: <HealthIcon /> },
  { to: "/dashboard/alerts", label: "Alerts", icon: <AlertsIcon /> },
];

export default function DashboardLayout() {
  const { user } = useLoaderData<typeof loader>();
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[var(--axis-surface-secondary)]">
      <MainNav user={user} />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Tab navigation */}
        <div className="mb-6 flex gap-1 border-b border-[var(--axis-border-default)]">
          {tabs.map((tab) => {
            const isActive = tab.end
              ? location.pathname === tab.to
              : location.pathname.startsWith(tab.to);
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  "px-4 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "border-b-2 border-[var(--axis-text-brand)] text-[var(--axis-text-brand)]"
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
    </div>
  );
}
