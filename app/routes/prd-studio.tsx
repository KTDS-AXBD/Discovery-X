import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Outlet, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  return json({ user: ctx.user });
}

export default function PrdStudioLayout() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <AppShell user={user} hideSidebar>
      <div className="flex h-full flex-col overflow-y-auto">
        <Outlet />
      </div>
    </AppShell>
  );
}
