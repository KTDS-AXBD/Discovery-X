import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { RadarService } from "~/lib/services";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";

const MAX_MEMO_LENGTH = 5000;

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
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

    const service = new RadarService(db);
    const item = await service.getItemMemo(itemId);

    if (!item) {
      return json({ error: "아이템을 찾을 수 없습니다." }, { status: 404 });
    }

    return json({ itemId, memo: item.memo ?? null });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.ideas.memo] loader error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
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

    const service = new RadarService(db);
    const exists = await service.itemExists(body.itemId);

    if (!exists) {
      return json({ error: "아이템을 찾을 수 없습니다." }, { status: 404 });
    }

    await service.updateItemMemo(body.itemId, body.memo ?? null);

    return json({ success: true, itemId: body.itemId });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.ideas.memo] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
