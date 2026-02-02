import { useState } from "react";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
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

  return (
    <div className="flex h-full flex-col">
      <div className="p-3 space-y-2">
        <Button onClick={onNew} className="w-full" size="sm">
          + 새 대화
        </Button>
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="대화 검색..."
          className="text-xs"
        />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <div className="space-y-1">
          {filtered.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                "group flex cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm transition-colors",
                activeId === conv.id
                  ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-brand)]"
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
                  <span className="truncate flex-1">{conv.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setPendingDeleteId(conv.id);
                    }}
                    className="ml-2 hidden text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-error)] group-hover:inline"
                    aria-label={`${conv.title} 대화 삭제`}
                  >
                    ×
                  </button>
                </>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-[var(--axis-text-tertiary)]">
              {searchQuery ? "검색 결과 없음" : "대화가 없습니다"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
