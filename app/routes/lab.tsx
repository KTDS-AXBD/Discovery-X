import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Outlet, NavLink, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";

const TABS = [
  { to: "/lab", label: "개요", end: true },
  { to: "/lab/analysis", label: "분석", end: false },
  { to: "/lab/review", label: "검토 큐", end: false },
  { to: "/lab/methods", label: "방법론", end: false },
  { to: "/lab/matrix", label: "매트릭스", end: false },
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
            <p className="mt-1 text-xs tracking-wide text-lab-accent font-mono-dx">
              Knowledge Graph Intelligence Laboratory
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
                  `px-4 py-2 text-xs font-medium uppercase tracking-wider transition-colors ${
                    isActive
                      ? "border-b-2 border-lab-accent text-lab-accent"
                      : "text-fg-tertiary hover:text-fg-secondary"
                  }`
                }
                style={{ fontFamily: "var(--dx-font-mono)" }}
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
