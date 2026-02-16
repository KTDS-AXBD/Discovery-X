import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq, desc } from "drizzle-orm";
import { getDb, agentSessionsV2, conversations } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";

// GET: 세션 목록 (limit/offset)
export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await requireUser(request, db, secret);

  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || "20"), 50);
  const offset = Math.max(Number(url.searchParams.get("offset") || "0"), 0);

  const sessionList = await db
    .select()
    .from(agentSessionsV2)
    .where(eq(agentSessionsV2.userId, user.id))
    .orderBy(desc(agentSessionsV2.startedAt))
    .limit(limit)
    .offset(offset);

  return json({ sessions: sessionList });
}

// POST: 새 세션 생성 → { sessionId, conversationId }
export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, { status: 405 });
  }

  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await requireUser(request, db, secret);

  const sessionId = crypto.randomUUID();
  const conversationId = crypto.randomUUID();
  const now = new Date();

  // 세션과 대화를 동시에 생성
  await db.insert(agentSessionsV2).values({
    id: sessionId,
    userId: user.id,
    startedAt: now,
    tokenCount: 0,
    tokenCost: 0,
    summary: null,
  });

  await db.insert(conversations).values({
    id: conversationId,
    userId: user.id,
    title: `[agent:${sessionId}]`,
    createdAt: now,
    updatedAt: now,
  });

  return json({ sessionId, conversationId });
}
