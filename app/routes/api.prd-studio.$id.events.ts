import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { PrdStudioService } from "~/features/prd-studio/service/prd-studio.service";
import { PrdEventType } from "~/features/prd-studio/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

const VALID_EVENT_TYPES: Set<string> = new Set(Object.values(PrdEventType));

export async function action({ params, request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as Record<string, unknown>;
  const eventType = body.eventType as string;

  if (!eventType || !VALID_EVENT_TYPES.has(eventType)) {
    return json({ error: "\uC720\uD6A8\uD558\uC9C0 \uC54A\uC740 \uC774\uBCA4\uD2B8 \uD0C0\uC785\uC774\uC5D0\uC694." }, { status: 400 });
  }

  const service = new PrdStudioService(db);
  const prd = await service.getById(params.id!, ctx.tenantId);
  if (!prd) {
    return json({ error: "PRD를 찾을 수 없어요." }, { status: 404 });
  }
  await service.logEvent({
    prdId: params.id!,
    tenantId: ctx.tenantId,
    eventType,
    actorId: ctx.user.id,
    payload: (body.payload as Record<string, unknown>) ?? undefined,
  });

  return json({ ok: true });
}
