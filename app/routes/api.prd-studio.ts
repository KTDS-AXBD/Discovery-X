import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { PrdStudioService } from "~/features/prd-studio/service/prd-studio.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

/** FormData와 JSON 모두 지원하는 body 파싱 */
async function parseBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("Content-Type") || "";
  if (contentType.includes("application/json")) {
    return (await request.json()) as Record<string, unknown>;
  }
  const formData = await request.formData();
  return Object.fromEntries(formData);
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = new PrdStudioService(db);
    const prds = await service.list(ctx.tenantId);

    return json({ prds });
  } catch (error) {
    console.error("[api.prd-studio.loader] Error:", error instanceof Error ? error.message : error);
    return json({ error: "Internal server error", prds: [] }, { status: 500 });
  }
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

  const service = new PrdStudioService(db);

  if (request.method === "POST") {
    const body = await parseBody(request);
    const title = (body.title as string | undefined)?.trim();

    if (!title) {
      return json({ error: "제목이 필요해요." }, { status: 400 });
    }
    if (title.length > 200) {
      return json({ error: "제목은 200자 이내여야 해요." }, { status: 400 });
    }

    const id = await service.create({
      tenantId: ctx.tenantId,
      title,
      createdBy: ctx.user.id,
      sourceIdeaId: (body.sourceIdeaId as string | undefined)?.trim() || undefined,
    });

    return json({ id });
  }

  if (request.method === "DELETE") {
    const body = await parseBody(request);
    const id = body.id as string | undefined;

    if (!id) {
      return json({ error: "id가 필요해요." }, { status: 400 });
    }

    await service.delete(id, ctx.tenantId);
    return json({ ok: true });
  }

  return json({ error: "Unknown method" }, { status: 400 });
}
