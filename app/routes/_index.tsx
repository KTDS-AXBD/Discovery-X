import { useState, useCallback, useEffect, useMemo } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Link, useLoaderData, useRouteError, isRouteErrorResponse, useRouteLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { ChatPanel } from "~/components/chat/ChatPanel";
import { ContextPanel, extractContextItems, type ContextItem } from "~/components/chat/ContextPanel";

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
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return redirect("/login");
    }
    const user = ctx.user;

    return json({ user });
  } catch (error) {
    console.error("[_index.loader] Error:", error instanceof Error ? error.message : error);
    return redirect("/login");
  }
}

interface RootConversation {
  id: string;
  title: string;
  updatedAt: string | null;
}

interface RootLoaderData {
  conversations?: RootConversation[];
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
  const { user } = useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData("root") as RootLoaderData | undefined;
  const rootConversations = useMemo(() => rootData?.conversations ?? [], [rootData?.conversations]);

  const [convList, setConvList] = useState<RootConversation[]>(rootConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    rootConversations[0]?.id || null
  );
  const [chatMessages, setChatMessages] = useState<ChatMessageData[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);

  // Sync when root conversations change
  useEffect(() => {
    setConvList(rootConversations);
  }, [rootConversations]);

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
      const newConv: RootConversation = {
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

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    setMessagesLoaded(false);
    setContextItems([]);
  }, []);

  return (
    <AppShell
      user={user}
      conversations={convList}
      activeConversationId={activeConversationId}
      onSelectConversation={handleSelectConversation}
      onNewConversation={handleNewConversation}
      onDeleteConversation={handleDeleteConversation}
    >
      <div className="flex h-full overflow-hidden">
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
    </AppShell>
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
