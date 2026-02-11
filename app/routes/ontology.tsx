import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Outlet, NavLink, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";

const TABS = [
  { to: "/ontology", label: "요약", end: true },
  { to: "/ontology/graph", label: "글로벌 그래프", end: false },
  { to: "/ontology/analysis", label: "분석", end: false },
  { to: "/ontology/simulation", label: "시뮬레이션", end: false },
  { to: "/ontology/review", label: "검토 큐", end: false },
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
    console.error("[ontology.loader] Error:", error instanceof Error ? error.message : error);
    return redirect("/login");
  }
}

export default function OntologyLayout() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <AppShell user={user} hideSidebar>
      <div className="mx-auto max-w-5xl px-6 py-6">
        <h1 className="text-xl font-bold text-[var(--axis-text-primary)]">온톨로지 인텔리전스</h1>
        <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
          엔티티 그래프, 분석, 검토를 관리합니다.
        </p>

        <nav className="mt-4 flex gap-1 border-b border-[var(--axis-border-default)]">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "border-b-2 border-[var(--axis-surface-brand)] text-[var(--axis-text-primary)]"
                    : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-secondary)]"
                }`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-6">
          <Outlet />
        </div>
      </div>
    </AppShell>
  );
}
