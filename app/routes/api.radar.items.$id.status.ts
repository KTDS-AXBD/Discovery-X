/**
 * PATCH /api/radar/items/:id/status — 사용자별 Radar 아이템 열람 상태 변경
 * BD팀 PoC FR-02
 */
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq, and } from "drizzle-orm";
import { getDb } from "~/db";
import { radarItems, radarItemUserStatus } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";

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

    // 아이템 존재 확인
    const item = await db
      .select({ id: radarItems.id })
      .from(radarItems)
      .where(eq(radarItems.id, itemId))
      .limit(1);

    if (!item[0]) {
      return json({ error: "아이템을 찾을 수 없습니다." }, { status: 404 });
    }

    // UPSERT: 기존 레코드가 있으면 업데이트, 없으면 삽입
    const existing = await db
      .select()
      .from(radarItemUserStatus)
      .where(
        and(
          eq(radarItemUserStatus.userId, user.id),
          eq(radarItemUserStatus.itemId, itemId)
        )
      )
      .limit(1);

    const now = new Date();
    const newStatus = body.status as ItemUserStatus;

    if (existing[0]) {
      const updates: Record<string, unknown> = { status: newStatus };
      if (newStatus === "viewed") updates.viewedAt = now;
      if (newStatus === "archived") updates.archivedAt = now;

      await db
        .update(radarItemUserStatus)
        .set(updates)
        .where(eq(radarItemUserStatus.id, existing[0].id));
    } else {
      await db.insert(radarItemUserStatus).values({
        id: crypto.randomUUID(),
        userId: user.id,
        itemId,
        status: newStatus,
        viewedAt: newStatus === "viewed" ? now : null,
        archivedAt: newStatus === "archived" ? now : null,
      });
    }

    return json({
      success: true,
      itemId,
      status: newStatus,
      viewedAt: newStatus === "viewed" ? now.toISOString() : null,
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.radar.items.$id.status] error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
