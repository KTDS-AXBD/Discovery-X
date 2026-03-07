import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { users } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await requireUser(request, db, secret);

  const body = (await request.json()) as { action: "complete" | "restart" };

  if (body.action === "complete") {
    await db
      .update(users)
      .set({
        onboardingCompleted: 1,
        onboardingCompletedAt: new Date(),
      })
      .where(eq(users.id, user.id));
  } else if (body.action === "restart") {
    await db
      .update(users)
      .set({
        onboardingCompleted: 0,
        onboardingCompletedAt: null,
      })
      .where(eq(users.id, user.id));
  }

  return json({ ok: true });
}
