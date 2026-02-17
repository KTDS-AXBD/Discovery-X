/**
 * PATCH /api/radar/items/:id/reaction — 사용자별 Radar 아이템 반응 (좋아요/싫어요)
 */
import type { ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq, and } from "drizzle-orm";
import { getDb } from "~/db";
import { radarItems, radarItemUserStatus } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";

type Reaction = "like" | "dislike" | null;

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

    const body = (await request.json()) as { reaction: string | null };
    const reaction = body.reaction as Reaction;
    if (reaction !== null && reaction !== "like" && reaction !== "dislike") {
      return json(
        { error: "reaction은 like, dislike, null 중 하나여야 합니다." },
        { status: 400 },
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

    // UPSERT
    const existing = await db
      .select()
      .from(radarItemUserStatus)
      .where(
        and(
          eq(radarItemUserStatus.userId, user.id),
          eq(radarItemUserStatus.itemId, itemId),
        ),
      )
      .limit(1);

    if (existing[0]) {
      await db
        .update(radarItemUserStatus)
        .set({ reaction })
        .where(eq(radarItemUserStatus.id, existing[0].id));
    } else {
      await db.insert(radarItemUserStatus).values({
        id: crypto.randomUUID(),
        userId: user.id,
        itemId,
        status: "new",
        reaction,
      });
    }

    return json({ success: true, itemId, reaction });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.radar.items.$id.reaction] error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
