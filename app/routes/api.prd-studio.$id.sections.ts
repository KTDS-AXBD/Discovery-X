import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { PrdSectionType, PrdStatus } from "~/features/prd-studio/db/schema";
import { PrdStudioService } from "~/features/prd-studio/service/prd-studio.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

const VALID_SECTION_TYPES: Set<string> = new Set(Object.values(PrdSectionType));

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const service = new PrdStudioService(db);
    const prd = await service.getById(params.id!, ctx.tenantId);
    if (!prd) {
      return json({ error: "PRD를 찾을 수 없어요.", sections: [] }, { status: 404 });
    }

    return json({ sections: prd.sections });
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
  if (!VALID_SECTION_TYPES.has(type)) {
    return json({ error: "유효하지 않은 섹션 타입이에요." }, { status: 400 });
  }

  const service = new PrdStudioService(db);
  const prd = await service.getById(params.id!, ctx.tenantId);
  if (!prd) {
    return json({ error: "PRD를 찾을 수 없어요." }, { status: 404 });
  }
  if (prd.createdBy !== ctx.user.id) {
    return json({ error: "본인의 PRD만 수정할 수 있어요." }, { status: 403 });
  }
  if (prd.status !== PrdStatus.DRAFT) {
    return json({ error: "DRAFT 상태의 PRD만 인터뷰 답변을 수정할 수 있어요." }, { status: 400 });
  }
  await service.saveSectionAnswer(params.id!, type, answer ?? "");

  return json({ ok: true });
}
