import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Outlet, NavLink, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";

const TABS = [
  { to: "/lab", label: "요구사항", end: true },
  { to: "/lab/work-status", label: "작업 현황", end: false },
  { to: "/lab/methods", label: "방법론", end: false },
  { to: "/lab/mvp-builder", label: "MVP 빌더", end: false },
];

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
    console.error("[lab.loader] Error:", error instanceof Error ? error.message : error);
    return redirect("/login");
  }
}

export default function LabLayout() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <AppShell user={user} hideSidebar>
      <div className="lab-grid-bg min-h-[calc(100vh-var(--dx-nav-height))]">
        <div className="px-6 py-6">
          {/* Header */}
          <div className="mb-6">
            <h1 className="text-xl font-bold text-fg font-mono-dx">
              실험실
            </h1>
            <p className="mt-1.5 text-xs tracking-wide text-lab-accent font-mono-dx">
              Feature Requests & Work Management
            </p>
          </div>

          {/* Tab Navigation */}
          <nav className="mb-6 flex gap-1 border-b border-line-subtle">
            {TABS.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `px-4 py-2.5 text-sm font-medium tracking-wide transition-colors ${
                    isActive
                      ? "border-b-2 border-lab-accent text-lab-accent"
                      : "text-fg-tertiary hover:text-fg-secondary"
                  }`
                }
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>

          {/* Content */}
          <Outlet />
        </div>
      </div>
    </AppShell>
  );
}
