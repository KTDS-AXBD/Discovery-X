import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { eq, desc } from "drizzle-orm";
import { getDb } from "~/db";
import { ideas } from "~/features/ideas/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const ideaList = await db
    .select({
      id: ideas.id,
      title: ideas.title,
      status: ideas.status,
      createdAt: ideas.createdAt,
    })
    .from(ideas)
    .where(eq(ideas.tenantId, ctx.tenantId))
    .orderBy(desc(ideas.createdAt))
    .limit(50);

  return json({ ideas: ideaList });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST" && request.method !== "DELETE") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.method === "POST") {
    const body = (await request.json()) as { title?: string };
    const title = body.title?.trim() || "새 아이디어";

    const id = crypto.randomUUID();
    await db.insert(ideas).values({
      id,
      tenantId: ctx.tenantId,
      ownerId: ctx.user.id,
      title,
    });

    return redirect(`/ideas/${id}`);
  }

  if (request.method === "DELETE") {
    const body = (await request.json()) as { id?: string };
    if (!body.id) {
      return json({ error: "id가 필요합니다." }, { status: 400 });
    }

    await db.delete(ideas).where(eq(ideas.id, body.id));
    return json({ ok: true });
  }

  return json({ error: "Unknown method" }, { status: 400 });
}
