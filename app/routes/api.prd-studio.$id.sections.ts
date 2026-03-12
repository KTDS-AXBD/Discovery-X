import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { PrdStudioService } from "~/features/prd-studio/service/prd-studio.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = new PrdStudioService(db);
    const sections = await service.getSections(params.id!);

    return json({ sections });
  } catch (error) {
    console.error("[api.prd-studio.sections.loader] Error:", error instanceof Error ? error.message : error);
    return json({ error: "Internal server error", sections: [] }, { status: 500 });
  }
}

export async function action({ params, request, context }: ActionFunctionArgs) {
  if (request.method !== "PUT") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = request.headers.get("Content-Type") || "";
  let body: Record<string, unknown>;
  if (contentType.includes("application/json")) {
    body = (await request.json()) as Record<string, unknown>;
  } else {
    const formData = await request.formData();
    body = Object.fromEntries(formData);
  }

  const type = body.type as string | undefined;
  const answer = body.answer as string | undefined;

  if (!type) {
    return json({ error: "섹션 타입이 필요해요." }, { status: 400 });
  }

  const service = new PrdStudioService(db);
  await service.saveSectionAnswer(params.id!, type, answer ?? "");

  return json({ ok: true });
}
