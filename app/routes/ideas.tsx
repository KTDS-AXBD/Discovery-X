import { useState, useCallback, useEffect } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useParams, useRevalidator } from "@remix-run/react";
import { desc, eq, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { radarItems } from "~/db/schema";
import { ideas } from "~/features/ideas/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { SidebarProvider } from "~/lib/context/sidebar-context";
import { IdeaPageHeader } from "~/components/ideas/IdeaPageHeader";
import { IdeaListDrawer } from "~/components/ideas/IdeaListDrawer";
import { SourceInputPanel } from "~/components/ideas/SourceInputPanel";
import { IdeaChatWrapper } from "~/components/ideas/IdeaChatWrapper";
import { ProposalCreationModal } from "~/components/ideas/ProposalCreationModal";

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

    // Fetch ideas list for drawer
    let ideaList: Array<{
      id: string;
      title: string;
      status: string;
      createdAt: Date | string | null;
    }> = [];

    try {
      ideaList = await db
        .select({
          id: ideas.id,
          title: ideas.title,
          status: ideas.status,
          createdAt: ideas.createdAt,
        })
        .from(ideas)
        .where(eq(ideas.tenantId, ctx.tenantId))
        .orderBy(desc(ideas.createdAt))
        .limit(50);
    } catch {
      // ideas table might not exist yet
    }

    // Fetch all radar items for source panel (legacy sources not yet linked to ideas)
    const tenantRunIds = sql`(SELECT id FROM radar_runs WHERE tenant_id = ${ctx.tenantId})`;

    let allItems: Array<{
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
      allItems = await db
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

    return json({ user: ctx.user, ideaList, allItems });
  } catch (error) {
    console.error("[ideas.loader] Error:", error instanceof Error ? error.message : error);
    return redirect("/login");
  }
}

export default function IdeasLayout() {
  const { user, ideaList, allItems } = useLoaderData<typeof loader>();
  const params = useParams();
  const selectedIdeaId = params.id;
  const revalidator = useRevalidator();

  // Chat state
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessageData[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [proposalModalOpen, setProposalModalOpen] = useState(false);

  // Source items for the selected idea (or all items if no idea selected)
  const [ideaSourceItems, setIdeaSourceItems] = useState(allItems);

  const isLoadingMessages = conversationId !== null && !messagesLoaded;

  const currentIdea = ideaList.find((i) => i.id === selectedIdeaId);

  // Fetch sources for selected idea
  useEffect(() => {
    if (!selectedIdeaId) {
      setIdeaSourceItems(allItems);
      return;
    }

    let cancelled = false;
    fetch(`/api/ideas/${selectedIdeaId}/sources`)
      .then((r) => r.json() as Promise<{ sources: typeof allItems }>)
      .then((data) => {
        if (!cancelled && data.sources) {
          setIdeaSourceItems(
            data.sources.map((s: Record<string, unknown>) => ({
              id: (s.radarItemId as string) || (s.id as string),
              title: (s.title as string) || "",
              titleKo: (s.titleKo as string) || null,
              summaryKo: (s.summaryKo as string) || null,
              url: (s.url as string) || "",
              relevanceScore: null,
              status: (s.status as string) || "COLLECTED",
              collectedAt: s.addedAt as string | null,
              memo: (s.memo as string) || null,
            }))
          );
        }
      })
      .catch(() => {
        if (!cancelled) setIdeaSourceItems([]);
      });

    return () => { cancelled = true; };
  }, [selectedIdeaId, allItems]);

  // Create conversation for the selected idea
  useEffect(() => {
    if (!selectedIdeaId) {
      setConversationId(null);
      setChatMessages([]);
      setMessagesLoaded(false);
      return;
    }

    let cancelled = false;
    fetch("/api/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: currentIdea?.title || "아이디어 분석",
        sourceItemId: selectedIdeaId,
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
  }, [selectedIdeaId, currentIdea?.title]);

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
    try {
      const endpoint = selectedIdeaId
        ? `/api/ideas/${selectedIdeaId}/sources`
        : "/api/ideas/sources";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inputs }),
      });
      const data = await res.json() as { created?: number; error?: string };
      if (!res.ok) {
        return { created: 0, error: data.error || "추가 실패" };
      }
      revalidator.revalidate();
      return { created: data.created ?? 0 };
    } catch {
      return { created: 0, error: "네트워크 오류" };
    } finally {
      setIsAdding(false);
    }
  }, [revalidator, selectedIdeaId]);

  const handleToolResult = useCallback(
    (_toolName: string, _result: Record<string, unknown>) => {
      // Future: extract context items from tool results
    },
    []
  );

  return (
    <SidebarProvider>
      <div className="flex h-screen flex-col bg-[var(--dx-surface-deep,var(--axis-surface-secondary))]">
        <IdeaPageHeader
          title={currentIdea?.title}
          user={user}
          onOpenProposalModal={() => setProposalModalOpen(true)}
        />
        <IdeaListDrawer ideas={ideaList} selectedIdeaId={selectedIdeaId} />
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Source Input Panel */}
          <SourceInputPanel
            items={ideaSourceItems}
            selectedItemId={undefined}
            onAddSources={handleAddSources}
            isAdding={isAdding}
            ideaId={selectedIdeaId}
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

        {/* Proposal modal */}
        <ProposalCreationModal
          open={proposalModalOpen}
          onOpenChange={setProposalModalOpen}
          ideaTitle={currentIdea?.title}
        />
      </div>
    </SidebarProvider>
  );
}
