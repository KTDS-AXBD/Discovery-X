import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { proposalComments } from "~/features/proposals/db/schema";
import { users } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const comments = await db
    .select({
      id: proposalComments.id,
      authorId: proposalComments.authorId,
      content: proposalComments.content,
      createdAt: proposalComments.createdAt,
      authorName: users.name,
    })
    .from(proposalComments)
    .leftJoin(users, eq(proposalComments.authorId, users.id))
    .where(eq(proposalComments.proposalId, params.id!));

  return json({ comments });
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.method === "POST") {
    const formData = await request.formData();
    const content = String(formData.get("content") || "").trim();

    if (!content) {
      return json({ error: "Content is required" }, { status: 400 });
    }

    await db.insert(proposalComments).values({
      proposalId: params.id!,
      authorId: ctx.user.id,
      content,
    });

    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
}
