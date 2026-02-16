/**
 * /knowledge — 지식 베이스 레이아웃
 * AppShell 내부에서 Outlet을 렌더링한다.
 */

import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Outlet, useLoaderData } from "@remix-run/react";

import { getDb } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const db = getDb(env.DB);
  const secret = getSessionSecret(env);
  const user = await requireUser(request, db, secret);

  return json({
    user: {
      id: String(user.id),
      email: user.email,
      name: user.name,
      role: user.role ?? undefined,
    },
  });
}

export default function KnowledgeLayout() {
  const { user } = useLoaderData<typeof loader>();

  return (
    <AppShell user={user} hideSidebar>
      <Outlet />
    </AppShell>
  );
}
