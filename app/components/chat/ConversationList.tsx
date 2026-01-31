import { Button } from "~/components/ui/Button";
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
  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <Button onClick={onNew} className="w-full" size="sm">
          + 새 대화
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <div className="space-y-1">
          {conversations.map((conv) => (
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
              <span className="truncate flex-1">{conv.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(conv.id);
                }}
                className="ml-2 hidden text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-error)] group-hover:inline"
                title="대화 삭제"
              >
                ×
              </button>
            </div>
          ))}
          {conversations.length === 0 && (
            <p className="px-3 py-4 text-center text-sm text-[var(--axis-text-tertiary)]">
              대화가 없습니다
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
