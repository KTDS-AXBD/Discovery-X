import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { IdeaService } from "~/lib/services";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = new IdeaService(db);
  const ideaList = await service.list(ctx.tenantId);

  return json({ ideas: ideaList });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST" && request.method !== "DELETE" && request.method !== "PATCH") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = new IdeaService(db);

  if (request.method === "PATCH") {
    const body = (await request.json()) as { id?: string; title?: string };
    if (!body.id) {
      return json({ error: "id가 필요합니다." }, { status: 400 });
    }
    const title = body.title?.trim();
    if (!title || title.length === 0) {
      return json({ error: "제목이 필요합니다." }, { status: 400 });
    }
    if (title.length > 200) {
      return json({ error: "제목은 200자 이내여야 합니다." }, { status: 400 });
    }

    await service.updateTitle(body.id, title);
    return json({ ok: true, title });
  }

  if (request.method === "POST") {
    const body = (await request.json()) as { title?: string };
    const title = body.title?.trim() || "새 아이디어";

    const id = await service.create(ctx.tenantId, ctx.user.id, title);
    return redirect(`/ideas/${id}`);
  }

  if (request.method === "DELETE") {
    const body = (await request.json()) as { id?: string };
    if (!body.id) {
      return json({ error: "id가 필요합니다." }, { status: 400 });
    }

    await service.delete(body.id);
    return json({ ok: true });
  }

  return json({ error: "Unknown method" }, { status: 400 });
}
