import { useState, useCallback, useEffect } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData, useRouteError, isRouteErrorResponse } from "@remix-run/react";
import { getDb } from "~/db";
import { conversations } from "~/db/schema";
import { eq, desc } from "drizzle-orm";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { ConversationList } from "~/components/chat/ConversationList";
import { ChatPanel } from "~/components/chat/ChatPanel";
import { ContextPanel, extractContextItems, type ContextItem } from "~/components/chat/ContextPanel";

function sanitizeTitle(raw: string | null): string {
  if (!raw) return "새 대화";
  const cleaned = raw.replace(/\uFFFD/g, "").trim();
  return cleaned.length > 0 ? cleaned : "새 대화";
}

export const meta: MetaFunction = () => {
  return [
    { title: "Discovery-X — Agent Chat" },
    { name: "description", content: "AI Agent 중심 대화형 시스템" },
  ];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const user = await getUserFromSession(request, db, secret);

    if (!user) {
      return redirect("/login");
    }

    const convs = await db
      .select()
      .from(conversations)
      .where(eq(conversations.userId, user.id))
      .orderBy(desc(conversations.updatedAt))
      .limit(50);

    return json({
      user,
      conversations: convs.map((c) => ({
        id: c.id,
        title: sanitizeTitle(c.title),
        updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
      })),
    });
  } catch (error) {
    console.error("[_index.loader] Error:", error instanceof Error ? error.message : error);
    return redirect("/login");
  }
}

interface ConversationData {
  id: string;
  title: string;
  updatedAt: string | null;
}

interface ChatMessageData {
  id: string;
  role: "user" | "assistant" | "tool_use" | "tool_result";
  content: string;
  toolName?: string | null;
  toolInput?: Record<string, unknown> | null;
  toolResult?: Record<string, unknown> | null;
  createdAt?: string | null;
}

export default function Index() {
  const { user, conversations: initialConversations } =
    useLoaderData<typeof loader>();

  const [convList, setConvList] = useState<ConversationData[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    initialConversations[0]?.id || null
  );
  const [chatMessages, setChatMessages] = useState<ChatMessageData[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);

  const isLoadingMessages = activeConversationId !== null && !messagesLoaded;

  // Fetch messages when conversation changes
  useEffect(() => {
    if (!activeConversationId) return;

    let cancelled = false;
    fetch(`/api/conversations/${activeConversationId}/messages`)
      .then((res) => res.json() as Promise<{ messages: ChatMessageData[] }>)
      .then((data) => {
        if (!cancelled) {
          setChatMessages(data.messages || []);
          setMessagesLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setChatMessages([]);
          setMessagesLoaded(true);
        }
      });

    return () => { cancelled = true; };
  }, [activeConversationId]);

  const handleNewConversation = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = (await res.json()) as { id: string; title: string };
      const newConv: ConversationData = {
        id: data.id,
        title: data.title,
        updatedAt: new Date().toISOString(),
      };
      setConvList((prev) => [newConv, ...prev]);
      setActiveConversationId(data.id);
      setChatMessages([]);
      setMessagesLoaded(true);
    } catch {
      // Silently fail
    }
  }, []);

  const handleToolResult = useCallback(
    (toolName: string, result: Record<string, unknown>) => {
      const newItems = extractContextItems(toolName, result);
      if (newItems.length > 0) {
        setContextItems((prev) => {
          const existing = new Set(prev.map((i) => `${i.type}-${i.id}`));
          const unique = newItems.filter((i) => !existing.has(`${i.type}-${i.id}`));
          const merged = [...prev, ...unique];
          return merged.length > 50 ? merged.slice(-50) : merged;
        });
        setContextPanelOpen(true);
      }
    },
    []
  );

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      try {
        await fetch("/api/conversations", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: id }),
        });
        setConvList((prev) => prev.filter((c) => c.id !== id));
        if (activeConversationId === id) {
          setActiveConversationId(null);
          setChatMessages([]);
        }
      } catch {
        // Silently fail
      }
    },
    [activeConversationId]
  );

  return (
    <div className="flex h-screen flex-col bg-[var(--dx-surface-deep,var(--axis-surface-secondary))]">
      <MainNav user={user} />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar toggle for mobile */}
        <button
          className="fixed bottom-4 left-4 z-50 rounded-full bg-[var(--axis-button-bg-default)] p-3 text-[var(--axis-button-text-default)] shadow-lg sm:hidden"
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          {sidebarOpen ? "×" : "☰"}
        </button>

        {/* Sidebar */}
        <div
          className={`${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } fixed inset-y-0 left-0 z-40 w-[var(--dx-sidebar-width)] border-r border-[var(--dx-border-subtle,var(--axis-border-default))] bg-[var(--dx-surface-panel,var(--axis-surface-default))] transition-transform sm:static sm:translate-x-0`}
          style={{ top: "var(--dx-nav-height)" }}
        >
          <ConversationList
            conversations={convList}
            activeId={activeConversationId}
            onSelect={(id) => {
              setActiveConversationId(id);
              setMessagesLoaded(false);
              setSidebarOpen(false);
              setContextItems([]);
            }}
            onNew={handleNewConversation}
            onDelete={handleDeleteConversation}
          />
        </div>

        {/* Chat area */}
        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 bg-[var(--dx-surface-panel,var(--axis-surface-default))]">
          {activeConversationId ? (
            <ChatPanel
              conversationId={activeConversationId}
              initialMessages={chatMessages}
              isLoadingMessages={isLoadingMessages}
              onToolResult={handleToolResult}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <div className="mx-auto max-w-2xl px-4">
                <h2 className="mb-6 text-center text-xl font-semibold text-[var(--axis-text-primary)]">
                  무엇을 하고 싶으신가요?
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Link to="/venture" className="dx-panel-flush dx-panel-hover group p-8 transition-all hover:border-[var(--axis-text-brand)]">
                    <h3 className="text-lg font-semibold text-[var(--axis-text-primary)]">사업 탐색</h3>
                    <p className="mt-2 text-sm text-[var(--axis-text-tertiary)]">AI가 산업을 분석하고 사업 기회를 발굴합니다</p>
                    <span className="mt-3 inline-block text-sm font-medium text-[var(--axis-text-brand)]">사업 탐색 시작 →</span>
                  </Link>
                  <Link to="/discoveries" className="dx-panel-flush dx-panel-hover group p-8 transition-all hover:border-[var(--axis-text-brand)]">
                    <h3 className="text-lg font-semibold text-[var(--axis-text-primary)]">아이디어 검증</h3>
                    <p className="mt-2 text-sm text-[var(--axis-text-tertiary)]">내가 가진 아이디어를 실험하고 검증합니다</p>
                    <span className="mt-3 inline-block text-sm font-medium text-[var(--axis-text-brand)]">Discovery 시작 →</span>
                  </Link>
                </div>
              </div>
            </div>
          )}
          </div>

          {/* Context panel */}
          {contextPanelOpen && contextItems.length > 0 && (
            <div className="hidden w-72 shrink-0 lg:block">
              <ContextPanel
                items={contextItems}
                onClose={() => setContextPanelOpen(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();

  let title = "오류가 발생했습니다";
  let message = "알 수 없는 오류가 발생했습니다.";

  if (isRouteErrorResponse(error)) {
    title = `${error.status} ${error.statusText}`;
    message = error.data?.message || "페이지를 불러올 수 없습니다.";
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div className="flex h-screen items-center justify-center bg-[var(--dx-surface-deep,var(--axis-surface-secondary))]">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-[var(--axis-text-primary)]">{title}</h1>
        <p className="mt-2 text-sm text-[var(--axis-text-secondary)]">{message}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-4 rounded-md bg-[var(--axis-button-bg-default)] px-4 py-2 text-sm text-[var(--axis-button-text-default)] hover:bg-[var(--axis-button-bg-hover)]"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}
