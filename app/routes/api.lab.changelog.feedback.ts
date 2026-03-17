import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq, and } from "drizzle-orm";
import { getDb } from "~/db";
import { getSessionContext } from "~/lib/auth/session.server";
import { changelogFeedback } from "~/features/lab/db/schema";
import { ALLOWED_EMOJI_LIST } from "~/features/lab/constants";

/** GET: 세션별 피드백 조회 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as {
    DB: D1Database;
    SESSION_SECRET: string;
  };
  const db = getDb(env.DB);
  const ctx = await getSessionContext(request, db, env.SESSION_SECRET);
  if (!ctx) return json({ error: "Unauthorized" }, 401);

  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");
  if (!sessionId) return json({ error: "sessionId required" }, 400);

  const feedbacks = await db
    .select()
    .from(changelogFeedback)
    .where(eq(changelogFeedback.sessionId, sessionId));

  return json({ feedbacks });
}

/** POST: 이모지 반응 토글 또는 코멘트 등록 */
export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as unknown as {
    DB: D1Database;
    SESSION_SECRET: string;
  };
  const db = getDb(env.DB);
  const ctx = await getSessionContext(request, db, env.SESSION_SECRET);
  if (!ctx) return json({ error: "Unauthorized" }, 401);

  const body = (await request.json()) as {
    sessionId: string;
    type: "emoji" | "comment";
    emoji?: string;
    comment?: string;
  };

  if (!body.sessionId || !body.type) {
    return json({ error: "sessionId and type required" }, 400);
  }

  if (body.type === "emoji") {
    if (!body.emoji || !ALLOWED_EMOJI_LIST.includes(body.emoji)) {
      return json({ error: `emoji must be one of: ${ALLOWED_EMOJI_LIST.join(", ")}` }, 400);
    }
    // 토글: 이미 같은 이모지가 있으면 삭제, 없으면 추가
    const existing = await db
      .select()
      .from(changelogFeedback)
      .where(
        and(
          eq(changelogFeedback.sessionId, body.sessionId),
          eq(changelogFeedback.userId, ctx.user.id),
          eq(changelogFeedback.type, "emoji"),
          eq(changelogFeedback.emoji, body.emoji)
        )
      );

    if (existing.length > 0) {
      await db
        .delete(changelogFeedback)
        .where(eq(changelogFeedback.id, existing[0].id));
      return json({ action: "removed", emoji: body.emoji });
    }

    await db.insert(changelogFeedback).values({
      sessionId: body.sessionId,
      userId: ctx.user.id,
      type: "emoji",
      emoji: body.emoji,
    });
    return json({ action: "added", emoji: body.emoji });
  }

  if (body.type === "comment") {
    if (!body.comment?.trim()) {
      return json({ error: "comment text required" }, 400);
    }
    await db.insert(changelogFeedback).values({
      sessionId: body.sessionId,
      userId: ctx.user.id,
      type: "comment",
      comment: body.comment.trim(),
    });
    return json({ action: "added", type: "comment" });
  }

  return json({ error: "type must be emoji or comment" }, 400);
}
