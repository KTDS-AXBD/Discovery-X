import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { RadarService } from "~/features/radar/service/radar.service";

// GET: 도메인 목록
export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  const service = new RadarService(db);
  const domains = await service.listDomains(ctx.tenantId);

  return json({ domains });
}

// POST intent="create" | intent="delete"
export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return new Response("Unauthorized", { status: 401 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent");
  const service = new RadarService(db);

  if (intent === "create") {
    const name = String(formData.get("name") || "").trim();
    if (!name) {
      return json({ error: "name은 필수입니다." }, { status: 400 });
    }

    const description = String(formData.get("description") || "").trim() || undefined;
    const color = String(formData.get("color") || "").trim() || undefined;

    const id = await service.createDomain({
      name,
      description,
      color,
      tenantId: ctx.tenantId,
    });

    return json({ success: true, id });
  }

  if (intent === "delete") {
    const id = String(formData.get("id") || "");
    if (!id) {
      return json({ error: "id는 필수입니다." }, { status: 400 });
    }
    await service.deleteDomain(id);
    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}
