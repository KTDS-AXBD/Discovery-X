import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { radarItems } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";

const MAX_MEMO_LENGTH = 5000;

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const itemId = url.searchParams.get("itemId");

  if (!itemId) {
    return json({ error: "itemId는 필수입니다." }, { status: 400 });
  }

  const item = await db
    .select({ id: radarItems.id, memo: radarItems.memo })
    .from(radarItems)
    .where(eq(radarItems.id, itemId))
    .limit(1);

  if (!item[0]) {
    return json({ error: "아이템을 찾을 수 없습니다." }, { status: 404 });
  }

  return json({ itemId, memo: item[0].memo ?? null });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "PUT") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json()) as { itemId?: string; memo?: string };

  if (!body.itemId) {
    return json({ error: "itemId는 필수입니다." }, { status: 400 });
  }

  if (body.memo && body.memo.length > MAX_MEMO_LENGTH) {
    return json({ error: `메모는 ${MAX_MEMO_LENGTH}자 이내여야 합니다.` }, { status: 400 });
  }

  const item = await db
    .select({ id: radarItems.id })
    .from(radarItems)
    .where(eq(radarItems.id, body.itemId))
    .limit(1);

  if (!item[0]) {
    return json({ error: "아이템을 찾을 수 없습니다." }, { status: 404 });
  }

  await db
    .update(radarItems)
    .set({ memo: body.memo ?? null })
    .where(eq(radarItems.id, body.itemId));

  return json({ success: true, itemId: body.itemId });
}
