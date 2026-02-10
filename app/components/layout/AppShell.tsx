import type { ReactNode } from "react";
import { useRouteLoaderData } from "@remix-run/react";
import { SidebarProvider } from "~/lib/context/sidebar-context";
import { TopNav } from "./TopNav";
import { SidebarPanel } from "./SidebarPanel";
import { ContextPanel } from "./ContextPanel";

interface AppShellProps {
  user: { id: string; email: string; name: string; role?: string };
  children: ReactNode;
  /** Override conversations from root loader (for chat page local state) */
  conversations?: RootConversation[];
  /** Chat page passes these for interactive sidebar */
  activeConversationId?: string | null;
  onSelectConversation?: (id: string) => void;
  onNewConversation?: () => void;
  onDeleteConversation?: (id: string) => void;
  /** Right context panel content (page-specific) */
  contextPanel?: ReactNode;
  /** Sidebar display mode */
  sidebarMode?: "chat" | "proposals";
  /** Custom sidebar content (replaces default SidebarPanel) */
  sidebarContent?: ReactNode;
}

interface RootConversation {
  id: string;
  title: string;
  updatedAt: string | null;
}

interface RootLoaderData {
  notifications: unknown;
  conversations?: RootConversation[];
}

export function AppShell({
  user,
  children,
  conversations: conversationsProp,
  activeConversationId = null,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  contextPanel,
  sidebarMode = "chat",
  sidebarContent,
}: AppShellProps) {
  const rootData = useRouteLoaderData("root") as RootLoaderData | undefined;
  const conversations = conversationsProp ?? rootData?.conversations ?? [];

  return (
    <SidebarProvider>
      <div className="flex h-screen flex-col bg-[var(--dx-surface-deep,var(--axis-surface-secondary))]">
        <TopNav user={user} />
        <div className="flex flex-1 overflow-hidden">
          {sidebarContent ? (
            sidebarContent
          ) : (
            <SidebarPanel
              user={user}
              conversations={conversations}
              activeConversationId={activeConversationId}
              onSelectConversation={onSelectConversation}
              onNewConversation={onNewConversation}
              onDeleteConversation={onDeleteConversation}
              mode={sidebarMode}
            />
          )}
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
          {contextPanel && <ContextPanel>{contextPanel}</ContextPanel>}
        </div>
      </div>
    </SidebarProvider>
  );
}
