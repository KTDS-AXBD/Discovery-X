/**
 * PATCH /api/radar/items/:id/status — 사용자별 Radar 아이템 열람 상태 변경
 * BD팀 PoC FR-02
 */
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { RadarService } from "~/lib/services";

const VALID_STATUSES = ["new", "viewed", "archived"] as const;
type ItemUserStatus = (typeof VALID_STATUSES)[number];

export async function action({ request, params, context }: ActionFunctionArgs) {
  try {
    if (request.method !== "PATCH") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const user = await getUserFromSession(request, db, secret);

    if (!user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const itemId = params.id;
    if (!itemId) {
      return json({ error: "itemId는 필수입니다." }, { status: 400 });
    }

    const body = (await request.json()) as { status: string };
    if (!body.status || !VALID_STATUSES.includes(body.status as ItemUserStatus)) {
      return json(
        { error: `status는 ${VALID_STATUSES.join(", ")} 중 하나여야 합니다.` },
        { status: 400 }
      );
    }

    const service = new RadarService(db);

    // 아이템 존재 확인
    if (!(await service.itemExists(itemId))) {
      return json({ error: "아이템을 찾을 수 없습니다." }, { status: 404 });
    }

    const result = await service.upsertItemStatus({
      userId: user.id,
      itemId,
      status: body.status as ItemUserStatus,
    });

    return json({ success: true, ...result });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.radar.items.$id.status] error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
