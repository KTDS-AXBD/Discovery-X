import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { Outlet } from "@remix-run/react";
import { getDb } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const db = getDb(env.DB);
  const secret = getSessionSecret(env);
  try {
    await requireUser(request, db, secret);
  } catch (e) {
    if (e instanceof Response) throw e;
    return redirect("/login");
  }
  return null;
}

export default function BriefingLayout() {
  return (
    <div className="h-full overflow-y-auto">
      <Outlet />
    </div>
  );
}
