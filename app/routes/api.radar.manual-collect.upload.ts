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

  if (intent !== "file") {
    return json({ error: "Unknown intent" }, { status: 400 });
  }

  const title = String(formData.get("title") || "").trim();
  const content = String(formData.get("content") || "").trim();
  const fileName = String(formData.get("fileName") || "").trim();
  const fileType = String(formData.get("fileType") || "").trim();
  const fileSize = parseInt(String(formData.get("fileSize") || "0"), 10);

  if (!title) {
    return json({ error: "제목은 필수예요." }, { status: 400 });
  }
  if (!content) {
    return json({ error: "추출된 내용이 비어있어요." }, { status: 400 });
  }
  if (!fileName) {
    return json({ error: "파일명이 필요해요." }, { status: 400 });
  }

  const service = new RadarService(db);

  try {
    const result = await service.collectFromFile({
      title,
      content,
      fileName,
      fileType,
      fileSize,
      userId: ctx.user.id,
      tenantId: ctx.tenantId,
    });

    if (result.isDuplicate) {
      return json({ error: "동일한 내용의 파일이 이미 등록되어 있어요.", item: result.item });
    }

    return json({ success: true, item: result.item });
  } catch (e) {
    const message = e instanceof Error ? e.message : "파일 수집에 실패했어요.";
    return json({ error: message }, { status: 500 });
  }
}
