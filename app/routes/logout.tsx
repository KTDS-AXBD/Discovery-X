import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { redirect } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { destroySession, getSessionSecret } from "~/lib/auth/session.server";

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);

  return redirect("/login", {
    headers: {
      "Set-Cookie": await destroySession(request, db, secret),
    },
  });
}

export async function loader() {
  return redirect("/");
}
