import { useState, useCallback, useEffect } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useParams, useRevalidator } from "@remix-run/react";
import { desc, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { radarItems } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { SourceInputPanel } from "~/components/ideas/SourceInputPanel";
import { IdeaChatWrapper } from "~/components/ideas/IdeaChatWrapper";

interface ChatMessageData {
  id: string;
  role: "user" | "assistant" | "tool_use" | "tool_result";
  content: string;
  toolName?: string | null;
  toolInput?: Record<string, unknown> | null;
  toolResult?: Record<string, unknown> | null;
  createdAt?: string | null;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return redirect("/login");
    }

    // Tenant scoping
    const tenantRunIds = sql`(SELECT id FROM radar_runs WHERE tenant_id = ${ctx.tenantId})`;

  let totalCount = 0;
  let items: Array<{
    id: string;
    title: string;
    titleKo: string | null;
    summaryKo: string | null;
    url: string;
    relevanceScore: number | null;
    status: string;
    collectedAt: Date | string | null;
    memo: string | null;
  }> = [];

  try {
    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(radarItems)
      .where(sql`${radarItems.runId} IN ${tenantRunIds}`);
    totalCount = countResult[0]?.count ?? 0;

    items = await db
      .select({
        id: radarItems.id,
        title: radarItems.title,
        titleKo: radarItems.titleKo,
        summaryKo: radarItems.summaryKo,
        url: radarItems.url,
        relevanceScore: radarItems.relevanceScore,
        status: radarItems.status,
        collectedAt: radarItems.collectedAt,
        memo: radarItems.memo,
      })
      .from(radarItems)
      .where(sql`${radarItems.runId} IN ${tenantRunIds}`)
      .orderBy(desc(radarItems.collectedAt))
      .limit(100);
  } catch {
    // Radar tables might not exist
  }

    return json({ user: ctx.user, items, totalCount });
  } catch (error) {
    console.error("[ideas.loader] Error:", error instanceof Error ? error.message : error);
    return redirect("/login");
  }
}

export default function IdeasLayout() {
  const { user, items } = useLoaderData<typeof loader>();
  const params = useParams();
  const selectedId = params.id;
  const revalidator = useRevalidator();

  // Chat state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessageData[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addResult, setAddResult] = useState<{ created: number; error?: string } | null>(null);

  const isLoadingMessages = conversationId !== null && !messagesLoaded;

  // Create conversation for the selected item
  useEffect(() => {
    if (!selectedId) {
      setConversationId(null);
      setChatMessages([]);
      setMessagesLoaded(false);
      return;
    }

    // Create or find conversation for this item
    let cancelled = false;
    fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: items.find((i) => i.id === selectedId)?.titleKo || "아이디어 분석",
        sourceItemId: selectedId,
      }),
    })
      .then((r) => r.json() as Promise<{ id: string }>)
      .then((data) => {
        if (!cancelled) {
          setConversationId(data.id);
          setMessagesLoaded(false);
        }
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [selectedId, items]);

  // Fetch messages when conversation changes
  useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;
    fetch(`/api/conversations/${conversationId}/messages`)
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
  }, [conversationId]);

  const handleAddSources = useCallback(async (inputs: string[]): Promise<{ created: number; error?: string }> => {
    setIsAdding(true);
    setAddResult(null);
    try {
      const res = await fetch("/api/ideas/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs }),
      });
      const data = await res.json() as { created?: number; error?: string };
      if (!res.ok) {
        const result = { created: 0, error: data.error || "추가 실패" };
        setAddResult(result);
        return result;
      }
      const result = { created: data.created ?? 0 };
      setAddResult(result);
      revalidator.revalidate();
      return result;
    } catch {
      const result = { created: 0, error: "네트워크 오류" };
      setAddResult(result);
      return result;
    } finally {
      setIsAdding(false);
    }
  }, [revalidator]);

  const handleToolResult = useCallback(
    (_toolName: string, _result: Record<string, unknown>) => {
      // Future: extract context items from tool results
    },
    []
  );

  return (
    <AppShell user={user} hideSidebar>
      <div className="flex h-full overflow-hidden">
        {/* Left: Source Input Panel */}
        <SourceInputPanel
          items={items}
          selectedItemId={selectedId}
          onAddSources={handleAddSources}
          isAdding={isAdding}
          addResult={addResult}
        />

        {/* Center: Detail / Gadget Tabs */}
        <div className="flex-1 overflow-y-auto">
          <Outlet />
        </div>

        {/* Right: Chat Panel */}
        <IdeaChatWrapper
          conversationId={conversationId}
          messages={chatMessages}
          isLoadingMessages={isLoadingMessages}
          onToolResult={handleToolResult}
        />
      </div>
    </AppShell>
  );
}
