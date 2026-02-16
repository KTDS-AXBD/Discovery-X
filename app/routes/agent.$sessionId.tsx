import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDb, agentSessionsV2, conversations, messages, projections } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { ChatPanel } from "~/components/chat/ChatPanel";
import { ProjectionStatus } from "~/components/agent/ProjectionStatus";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await requireUser(request, db, secret);

  const sessionId = params.sessionId;
  if (!sessionId) {
    throw json({ error: "세션 ID가 필요합니다" }, { status: 400 });
  }

  // 세션 조회
  const session = await db.query.agentSessionsV2.findFirst({
    where: and(
      eq(agentSessionsV2.id, sessionId),
      eq(agentSessionsV2.userId, user.id),
    ),
  });

  if (!session) {
    throw json({ error: "세션을 찾을 수 없습니다" }, { status: 404 });
  }

  // 세션에 연결된 conversation 조회 (title 패턴으로 매칭)
  const agentTitle = `[agent:${sessionId}]`;
  const conversation = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.userId, user.id),
      eq(conversations.title, agentTitle),
    ),
  });

  let conversationId: string;

  if (conversation) {
    conversationId = conversation.id;
  } else {
    // conversation이 없으면 새로 생성
    conversationId = crypto.randomUUID();
    const now = new Date();
    await db.insert(conversations).values({
      id: conversationId,
      userId: user.id,
      title: agentTitle,
      createdAt: now,
      updatedAt: now,
    });
  }

  // 메시지 로드
  const messageList = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(sql`rowid`))
    .limit(100);

  // 최신순 → 오래된순으로 뒤집기
  messageList.reverse();

  // Projection 상태 조회 (user 스코프)
  const userProjections = await db
    .select({ projType: projections.projType })
    .from(projections)
    .where(
      and(
        eq(projections.scopeType, "user"),
        eq(projections.scopeId, user.id),
      ),
    );

  const projTypes = new Set(userProjections.map((p) => p.projType));
  const projectionStatus = {
    soul: projTypes.has("SOUL.md"),
    user: projTypes.has("USER.md"),
    topic: projTypes.has("TOPIC.md"),
    briefing: projTypes.has("BRIEFING.md"),
  };

  const formattedMessages = messageList.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant" | "tool_use" | "tool_result",
    content: m.content,
    toolName: m.toolName,
    toolInput: m.toolInput,
    toolResult: m.toolResult,
    createdAt: m.createdAt
      ? new Date(
          typeof m.createdAt === "number"
            ? m.createdAt * 1000
            : m.createdAt,
        ).toISOString()
      : null,
  }));

  const sessionStartedAt = session.startedAt
    ? new Date(
        typeof session.startedAt === "number"
          ? session.startedAt * 1000
          : session.startedAt,
      ).toISOString()
    : new Date().toISOString();

  return json({
    session: {
      id: session.id,
      startedAt: sessionStartedAt,
      tokenCount: session.tokenCount,
      summary: session.summary,
    },
    conversationId,
    messages: formattedMessages,
    projectionStatus,
  });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

function formatTokenBadge(count: number): string {
  if (count < 1000) return `${count} tok`;
  return `${(count / 1000).toFixed(1)}k tok`;
}

export default function AgentSession() {
  const { session, conversationId, messages: initialMessages, projectionStatus } =
    useLoaderData<typeof loader>();

  return (
    <div className="flex h-full flex-col">
      {/* 세션 헤더 */}
      <header className="flex items-center justify-between border-b border-[var(--axis-border-default)] bg-[var(--dx-surface-panel,var(--axis-surface-default))] px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-[var(--axis-text-tertiary)]">
            {formatDateTime(session.startedAt)}
          </span>
          <span className="inline-flex items-center rounded-full bg-[var(--axis-surface-secondary)] px-2 py-0.5 text-[10px] font-mono text-[var(--axis-text-secondary)]">
            {formatTokenBadge(session.tokenCount)}
          </span>
        </div>
        <ProjectionStatus projections={projectionStatus} />
      </header>

      {/* 채팅 영역 — ChatPanel 재사용 */}
      <div className="flex-1 overflow-hidden">
        <ChatPanel
          conversationId={conversationId}
          initialMessages={initialMessages}
        />
      </div>
    </div>
  );
}
