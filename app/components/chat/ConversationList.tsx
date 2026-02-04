import { useState } from "react";
import { IconButton } from "~/components/ui/IconButton";
import { SearchInput } from "~/components/ui/SearchInput";
import { cn } from "~/lib/utils/cn";

interface Conversation {
  id: string;
  title: string;
  updatedAt: string | null;
}

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
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

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: ConversationListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const filtered = searchQuery.trim()
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : conversations;

  const groups = groupByDate(filtered);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <span className="text-sm font-semibold text-[var(--axis-text-primary)]">대화</span>
        <IconButton label="새 대화" size="xs" onClick={onNew}>
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </IconButton>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <SearchInput
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="대화 검색..."
        />
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {groups.map((group) => (
          <div key={group.label} className="mb-3">
            <div className="dx-section-title mb-1 px-1">{group.label}</div>
            <div className="space-y-0.5">
              {group.items.map((conv) => (
                <div
                  key={conv.id}
                  className={cn(
                    "group flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm transition-all duration-[var(--dx-transition-normal)]",
                    activeId === conv.id
                      ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-brand)] shadow-sm"
                      : "text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-secondary)]"
                  )}
                  onClick={() => onSelect(conv.id)}
                >
                  {pendingDeleteId === conv.id ? (
                    <div className="flex w-full items-center gap-1 text-xs" onClick={(e) => e.stopPropagation()}>
                      <span className="text-[var(--axis-text-error)]">삭제?</span>
                      <button
                        onClick={() => {
                          onDelete(conv.id);
                          setPendingDeleteId(null);
                        }}
                        className="rounded bg-[var(--axis-button-destructive-bg-default)] px-1.5 py-0.5 text-[var(--axis-button-destructive-text-default)] hover:bg-[var(--axis-button-destructive-bg-hover)]"
                        aria-label="삭제 확인"
                      >
                        확인
                      </button>
                      <button
                        onClick={() => setPendingDeleteId(null)}
                        className="rounded bg-[var(--axis-surface-secondary)] px-1.5 py-0.5 text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-tertiary)]"
                        aria-label="삭제 취소"
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
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setPendingDeleteId(conv.id);
                        }}
                        className="ml-2 hidden shrink-0 rounded p-0.5 text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-error)] group-hover:inline"
                        aria-label={`${conv.title} 대화 삭제`}
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-[var(--axis-text-tertiary)]">
            {searchQuery ? "검색 결과 없음" : "대화가 없습니다"}
          </p>
        )}
      </div>
    </div>
  );
}
