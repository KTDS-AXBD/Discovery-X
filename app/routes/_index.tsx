import { useState, useCallback, useEffect } from "react";
import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { conversations } from "~/db/schema";
import { eq, desc } from "drizzle-orm";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { ConversationList } from "~/components/chat/ConversationList";
import { ChatPanel } from "~/components/chat/ChatPanel";

export const meta: MetaFunction = () => {
  return [
    { title: "Discovery-X — Agent Chat" },
    { name: "description", content: "AI Agent 중심 대화형 시스템" },
  ];
};

export async function loader({ request, context }: LoaderFunctionArgs) {
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
      title: c.title || "새 대화",
      updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
    })),
  });
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
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Fetch messages when conversation changes
  useEffect(() => {
    if (!activeConversationId) return;

    let cancelled = false;
    fetch(`/api/conversations/${activeConversationId}/messages`)
      .then((res) => res.json() as Promise<{ messages: ChatMessageData[] }>)
      .then((data) => {
        if (!cancelled) setChatMessages(data.messages || []);
      })
      .catch(() => {
        if (!cancelled) setChatMessages([]);
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
    } catch {
      // Silently fail
    }
  }, []);

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
    <div className="flex h-screen flex-col bg-[var(--axis-surface-secondary)]">
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
          } fixed inset-y-0 left-0 top-16 z-40 w-64 border-r border-[var(--axis-border-default)] bg-[var(--axis-surface-default)] transition-transform sm:static sm:translate-x-0`}
        >
          <ConversationList
            conversations={convList}
            activeId={activeConversationId}
            onSelect={(id) => {
              setActiveConversationId(id);
              setSidebarOpen(false);
            }}
            onNew={handleNewConversation}
            onDelete={handleDeleteConversation}
          />
        </div>

        {/* Chat area */}
        <div className="flex-1 bg-[var(--axis-surface-default)]">
          <ChatPanel
            conversationId={activeConversationId}
            initialMessages={chatMessages}
          />
        </div>
      </div>
    </div>
  );
}
