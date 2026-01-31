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

const tabs = [
  { to: "/dashboard", label: "Pipeline", end: true },
  { to: "/dashboard/metrics", label: "Metrics" },
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
                {tab.label}
              </Link>
            );
          })}
        </div>
        <Outlet />
      </div>
    </div>
  );
}
