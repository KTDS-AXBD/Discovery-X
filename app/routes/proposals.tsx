import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useLocation } from "@remix-run/react";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { ProposalTabNav } from "~/features/proposals/ui/ProposalTabNav";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  return json({ user: ctx.user });
}

export default function ProposalsLayout() {
  const { user } = useLoaderData<typeof loader>();
  const location = useLocation();

  // Hide tabs on detail pages (proposals/:id or proposals/:id/edit)
  const isDetailPage = /^\/proposals\/[^/]+/.test(location.pathname)
    && location.pathname !== "/proposals/new"
    && location.pathname !== "/proposals/formalization"
    && location.pathname !== "/proposals/validation"
    && location.pathname !== "/proposals/completed";

  return (
    <AppShell user={user} hideSidebar>
      <div className="flex h-full flex-col">
        {!isDetailPage && <ProposalTabNav />}
        <div className={`flex-1 ${isDetailPage ? "overflow-hidden" : "overflow-y-auto"}`}>
          <Outlet />
        </div>
      </div>
    </AppShell>
  );
}
