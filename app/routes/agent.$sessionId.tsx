import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { getDb, agentSessionsV2, messages, projections, chatWidgets } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { ChatPanel } from "~/features/chat/ui/ChatPanel";
import { ProjectionStatus } from "~/features/chat/ui/ProjectionStatus";
import { ChatSessionService } from "~/features/chat/service";

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

  // 세션에 연결된 conversation 조회/생성
  const service = new ChatSessionService(db);
  const conversationId = await service.findOrCreateConversation(user.id, sessionId);

  // 메시지 로드
  const messageList = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(sql`rowid`))
    .limit(100);

  // 최신순 → 오래된순으로 뒤집기
  messageList.reverse();

  // 위젯 캐시 로드 — 대화 재진입 시 DB에 저장된 위젯 복원 (F48)
  const cachedWidgets = await db
    .select()
    .from(chatWidgets)
    .where(eq(chatWidgets.conversationId, conversationId))
    .limit(5);

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

  const formattedWidgets = cachedWidgets.map((w) => ({
    widgetId: w.id,
    widgetType: w.widgetType,
    title: w.title,
    code: w.code,
    data: w.data,
    description: w.description ?? undefined,
  }));

  return json({
    session: {
      id: session.id,
      startedAt: sessionStartedAt,
      tokenCount: session.tokenCount,
      summary: session.summary,
    },
    conversationId,
    messages: formattedMessages,
    widgets: formattedWidgets,
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
  const { session, conversationId, messages: initialMessages, widgets: initialWidgets, projectionStatus } =
    useLoaderData<typeof loader>();

  return (
    <div className="flex h-full flex-col">
      {/* 세션 헤더 */}
      <header className="flex items-center justify-between border-b border-line bg-surface-panel px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-fg-tertiary">
            {formatDateTime(session.startedAt)}
          </span>
          <span className="inline-flex items-center rounded-full bg-surface-secondary px-2 py-0.5 text-[10px] font-mono text-fg-secondary">
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
          initialWidgets={initialWidgets}
        />
      </div>
    </div>
  );
}
