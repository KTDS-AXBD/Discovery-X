import { useState } from "react";
import { Link, useLocation, useFetcher } from "@remix-run/react";
import { Form } from "@remix-run/react";
import { useTheme } from "@axis-ds/theme";
import { SearchInput } from "~/components/ui/SearchInput";
import { useSidebar } from "~/lib/context/sidebar-context";
import { ArchiveFolderList } from "./ArchiveFolderList";
import type { ArchiveFolder } from "./ArchiveFolderList";
import { cn } from "~/lib/utils/cn";

interface Conversation {
  id: string;
  title: string;
  updatedAt: string | null;
}

interface SidebarPanelProps {
  user: { id: string; email: string; name: string; role?: string };
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation?: (id: string) => void;
  onNewConversation?: () => void;
  onDeleteConversation?: (id: string) => void;
  mode?: "chat" | "proposals";
  folders?: ArchiveFolder[];
}

function groupByDate(conversations: Conversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterday = today - 86400000;
  const weekAgo = today - 7 * 86400000;

  const groups: { label: string; items: Conversation[] }[] = [
    { label: "오늘", items: [] },
    { label: "어제", items: [] },
    { label: "이번 주", items: [] },
    { label: "이전", items: [] },
  ];

  for (const conv of conversations) {
    const ts = conv.updatedAt ? new Date(conv.updatedAt).getTime() : 0;
    if (ts >= today) groups[0].items.push(conv);
    else if (ts >= yesterday) groups[1].items.push(conv);
    else if (ts >= weekAgo) groups[2].items.push(conv);
    else groups[3].items.push(conv);
  }

  return groups.filter((g) => g.items.length > 0);
}

export function SidebarPanel({
  user,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  mode: _mode = "chat",
  folders = [],
}: SidebarPanelProps) {
  const { open, close } = useSidebar();
  const location = useLocation();
  const { resolvedTheme, setTheme } = useTheme();
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [activeFolderId, setActiveFolderId] = useState<string | undefined>();

  const folderFetcher = useFetcher();

  const handleCreateFolder = (name: string) => {
    folderFetcher.submit(
      { name },
      { method: "POST", action: "/api/folders", encType: "application/json" },
    );
  };

  const handleRenameFolder = (id: string, name: string) => {
    folderFetcher.submit(
      { name },
      { method: "PATCH", action: `/api/folders/${id}`, encType: "application/json" },
    );
  };

  const handleDeleteFolder = (id: string) => {
    folderFetcher.submit(
      null,
      { method: "DELETE", action: `/api/folders/${id}` },
    );
    if (activeFolderId === id) setActiveFolderId(undefined);
  };

  const handleDropItem = (folderId: string, itemType: string, itemId: string) => {
    folderFetcher.submit(
      { itemType, itemId },
      { method: "POST", action: `/api/folders/${folderId}/items`, encType: "application/json" },
    );
  };

  const filtered = searchQuery.trim()
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  const groups = groupByDate(filtered);
  const isOnChat = location.pathname === "/";

  const handleSelect = (id: string) => {
    if (isOnChat && onSelectConversation) {
      onSelectConversation(id);
    }
    if (window.innerWidth < 640) close();
  };

  const handleNew = () => {
    if (isOnChat && onNewConversation) {
      onNewConversation();
    }
    if (window.innerWidth < 640) close();
  };

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 sm:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "flex h-full flex-col border-r border-[var(--dx-border-subtle,var(--axis-border-default))] bg-[var(--dx-surface-panel,var(--axis-surface-default))] transition-transform duration-200",
          "fixed inset-y-0 left-0 z-50 sm:static sm:z-auto",
          open ? "translate-x-0" : "-translate-x-full sm:translate-x-0 sm:hidden",
        )}
        style={{ width: "var(--dx-sidebar-width)", top: "var(--dx-nav-height)" }}
      >
        {/* New chat button */}
        <div className="px-3 pt-3">
          {isOnChat ? (
            <button
              onClick={handleNew}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--axis-button-bg-default)] px-4 py-2 text-sm font-medium text-[var(--axis-button-text-default)] transition-colors hover:bg-[var(--axis-button-bg-hover)]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              새 채팅
            </button>
          ) : (
            <Link
              to="/"
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--axis-button-bg-default)] px-4 py-2 text-sm font-medium text-[var(--axis-button-text-default)] transition-colors hover:bg-[var(--axis-button-bg-hover)]"
              onClick={() => { if (window.innerWidth < 640) close(); }}
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              새 채팅
            </Link>
          )}
        </div>

        {/* Search */}
        <div className="px-3 pt-2 pb-1">
          <SearchInput
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="채팅 검색..."
          />
        </div>

        {/* Archive folders */}
        <ArchiveFolderList
          folders={folders}
          activeFolderId={activeFolderId}
          onCreateFolder={handleCreateFolder}
          onRenameFolder={handleRenameFolder}
          onDeleteFolder={handleDeleteFolder}
          onDropItem={handleDropItem}
          onSelectFolder={setActiveFolderId}
        />

        {/* Chat history section label */}
        <div className="mt-2 px-5 pb-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--axis-text-tertiary)]">채팅</span>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {groups.map((group) => (
            <div key={group.label} className="mb-2">
              <div className="mb-0.5 px-2 text-[11px] font-medium text-[var(--axis-text-tertiary)]">{group.label}</div>
              <div className="space-y-0.5">
                {group.items.map((conv) => {
                  const isActive = isOnChat && activeConversationId === conv.id;
                  return (
                    <div
                      key={conv.id}
                      draggable="true"
                      onDragStart={(e) => {
                        e.dataTransfer.setData(
                          "application/json",
                          JSON.stringify({ itemType: "conversation", itemId: conv.id }),
                        );
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      className={cn(
                        "group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm transition-all duration-[var(--dx-transition-normal)]",
                        isActive
                          ? "bg-[var(--dx-surface-card,var(--axis-surface-brand))] text-[var(--axis-text-primary)]"
                          : "text-[var(--axis-text-secondary)] hover:bg-[var(--dx-surface-card-hover,var(--axis-surface-secondary))]"
                      )}
                      onClick={() => handleSelect(conv.id)}
                    >
                      {pendingDeleteId === conv.id ? (
                        <div className="flex w-full items-center gap-1 text-xs" onClick={(e) => e.stopPropagation()}>
                          <span className="text-[var(--axis-text-error)]">삭제?</span>
                          <button
                            onClick={() => {
                              onDeleteConversation?.(conv.id);
                              setPendingDeleteId(null);
                            }}
                            className="rounded bg-[var(--axis-button-destructive-bg-default)] px-1.5 py-0.5 text-[var(--axis-button-destructive-text-default)] hover:bg-[var(--axis-button-destructive-bg-hover)]"
                          >
                            확인
                          </button>
                          <button
                            onClick={() => setPendingDeleteId(null)}
                            className="rounded bg-[var(--axis-surface-secondary)] px-1.5 py-0.5 text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-tertiary)]"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex min-w-0 items-center gap-2">
                            <svg className="h-3.5 w-3.5 shrink-0 text-[var(--axis-text-tertiary)]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                            </svg>
                            <span className="truncate flex-1">{conv.title}</span>
                          </div>
                          {isOnChat && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingDeleteId(conv.id);
                              }}
                              className="ml-1 hidden shrink-0 rounded p-0.5 text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-error)] group-hover:inline"
                              aria-label={`${conv.title} 삭제`}
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-8 text-center text-sm text-[var(--axis-text-tertiary)]">
              {searchQuery ? "검색 결과 없음" : "대화가 없습니다"}
            </p>
          )}
        </div>

        {/* Bottom: user profile */}
        <div className="border-t border-[var(--dx-border-subtle,var(--axis-border-default))] px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--axis-surface-brand)] text-xs font-bold text-[var(--axis-text-brand)]">
              {user.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-[var(--axis-text-primary)]">{user.name}</p>
              <p className="truncate text-[10px] text-[var(--axis-text-tertiary)]">AX팀</p>
            </div>
            <div className="flex items-center gap-1">
              {/* Theme toggle */}
              <button
                type="button"
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                className="rounded p-1 text-[var(--axis-text-tertiary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-primary)]"
                aria-label={resolvedTheme === "dark" ? "라이트 모드" : "다크 모드"}
              >
                {resolvedTheme === "dark" ? (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>
                )}
              </button>
              {/* Logout */}
              <Form method="post" action="/logout">
                <button
                  type="submit"
                  className="rounded p-1 text-[var(--axis-text-tertiary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-error)]"
                  aria-label="로그아웃"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>
                </button>
              </Form>
            </div>
          </div>
          <p className="mt-1 text-center text-[9px] text-[var(--axis-text-tertiary)]">Discovery-X v4.2</p>
        </div>
      </aside>
    </>
  );
}
