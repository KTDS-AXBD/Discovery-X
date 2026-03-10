import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { RadarService } from "~/lib/services";

export async function action({ request, params, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const itemId = params.id;
  if (!itemId) {
    return json({ error: "아이템 ID는 필수예요." }, { status: 400 });
  }

  const service = new RadarService(db);

  try {
    const result = await service.sendToIdea({
      itemId,
      userId: ctx.user.id,
      tenantId: ctx.tenantId,
    });
    return json({ success: true, ideaId: result.ideaId });
  } catch (e) {
    const message = e instanceof Error ? e.message : "아이디어 생성에 실패했어요.";
    return json({ error: message }, { status: 500 });
  }
}
