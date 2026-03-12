import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { PrdStudioService } from "~/features/prd-studio/service/prd-studio.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return json({ error: "Unauthorized" }, { status: 401 });

  const service = new PrdStudioService(db);
  const prd = await service.getById(params.id!, ctx.tenantId);
  if (!prd) {
    return json({ error: "PRD를 찾을 수 없어요.", versions: [] }, { status: 404 });
  }
  const versions = await service.listVersions(params.id!);
  return json({ versions });
}
