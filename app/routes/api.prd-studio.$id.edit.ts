import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq, and } from "drizzle-orm";
import { getDb } from "~/db";
import { prdSections, PrdStatus } from "~/features/prd-studio/db/schema";
import { PrdStudioService } from "~/features/prd-studio/service/prd-studio.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

const EDITABLE_STATUSES: Set<string> = new Set([
  PrdStatus.GENERATED, PrdStatus.IN_REVIEW, PrdStatus.REVIEWED, PrdStatus.FINALIZED,
]);

export async function action({ params, request, context }: ActionFunctionArgs) {
  if (request.method !== "PUT") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  // 인증
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return json({ error: "Unauthorized" }, { status: 401 });

  const id = params.id!;
  const service = new PrdStudioService(db);
  const prd = await service.getById(id);
  if (!prd) return json({ error: "PRD를 찾을 수 없어요." }, { status: 404 });
  if (!EDITABLE_STATUSES.has(prd.status)) {
    return json({ error: "생성된 PRD만 편집할 수 있어요." }, { status: 400 });
  }

  const body = (await request.json()) as {
    sections?: Array<{ type: string; content: string }>;
    changeNote?: string;
  };

  if (!body.sections || body.sections.length === 0) {
    return json({ error: "수정할 섹션이 필요해요." }, { status: 400 });
  }

  // 각 섹션 editedContent 업데이트
  for (const sec of body.sections) {
    await db.update(prdSections)
      .set({ editedContent: sec.content })
      .where(and(eq(prdSections.prdId, id), eq(prdSections.type, sec.type)));
  }

  // 버전 스냅샷 생성
  const newVersion = await service.createVersion(id, ctx.user.id, body.changeNote);

  // 이벤트 기록
  await service.logEvent({
    prdId: id,
    tenantId: ctx.tenantId,
    eventType: "prd_edited",
    actorId: ctx.user.id,
    payload: { version: newVersion, sectionsEdited: body.sections.length },
  });

  return json({ ok: true, version: newVersion });
}
