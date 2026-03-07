import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { ChatSessionService } from "~/features/chat/service";

// GET: 세션 목록 (limit/offset)
export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const user = await requireUser(request, db, secret);

    const url = new URL(request.url);
    const limit = Math.min(Number(url.searchParams.get("limit") || "20"), 50);
    const offset = Math.max(Number(url.searchParams.get("offset") || "0"), 0);

    const service = new ChatSessionService(db);
    const sessionList = await service.listSessions(user.id, limit, offset);

    return json({ sessions: sessionList });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.agent.sessions] loader error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: 새 세션 생성 → { sessionId, conversationId }
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    if (request.method !== "POST") {
      return json({ error: "Method not allowed" }, { status: 405 });
    }

    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const user = await requireUser(request, db, secret);

    const service = new ChatSessionService(db);
    const result = await service.createSessionWithConversation(user.id);

    return json(result);
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.agent.sessions] action error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
}
