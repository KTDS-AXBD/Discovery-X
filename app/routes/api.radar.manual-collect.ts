import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { RadarService } from "~/lib/services";

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const formData = await request.formData();
  const intent = String(formData.get("intent") || "").trim();
  const service = new RadarService(db);

  if (intent === "url") {
    const url = String(formData.get("url") || "").trim();
    if (!url) return json({ error: "URL은 필수예요." }, { status: 400 });
    try {
      new URL(url);
    } catch {
      return json({ error: "유효하지 않은 URL이에요." }, { status: 400 });
    }

    try {
      const result = await service.collectFromUrl({
        url,
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
      });

      if (result.isDuplicate) {
        return json({ error: "이미 수집된 URL이에요.", item: result.item });
      }

      return json({ success: true, item: result.item });
    } catch (e) {
      const message = e instanceof Error ? e.message : "URL 수집에 실패했어요.";
      return json({ error: message }, { status: 500 });
    }
  }

  if (intent === "text") {
    const title = String(formData.get("title") || "").trim();
    const content = String(formData.get("content") || "").trim();
    if (!title || !content) {
      return json({ error: "제목과 내용은 필수예요." }, { status: 400 });
    }

    try {
      const result = await service.collectFromText({
        title,
        content,
        userId: ctx.user.id,
        tenantId: ctx.tenantId,
      });

      if (result.isDuplicate) {
        return json({ error: "동일한 제목의 메모가 이미 존재해요.", item: result.item });
      }

      return json({ success: true, item: result.item });
    } catch (e) {
      const message = e instanceof Error ? e.message : "텍스트 수집에 실패했어요.";
      return json({ error: message }, { status: 500 });
    }
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}
