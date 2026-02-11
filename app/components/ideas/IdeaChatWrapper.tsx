import { ChatPanel } from "~/components/chat/ChatPanel";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool_use" | "tool_result";
  content: string;
  toolName?: string | null;
  toolInput?: Record<string, unknown> | null;
  toolResult?: Record<string, unknown> | null;
  createdAt?: string | null;
}

interface IdeaChatWrapperProps {
  conversationId: string | null;
  messages: ChatMessage[];
  isLoadingMessages: boolean;
  onToolResult?: (toolName: string, result: Record<string, unknown>) => void;
}

export function IdeaChatWrapper({
  conversationId,
  messages,
  isLoadingMessages,
  onToolResult,
}: IdeaChatWrapperProps) {
  return (
    <div className="hidden w-80 shrink-0 flex-col border-l border-[var(--dx-border-subtle,var(--axis-border-default))] bg-[var(--dx-surface-panel,var(--axis-surface-default))] lg:flex">
      {/* Header */}
      <div className="border-b border-[var(--axis-border-default)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--axis-text-primary)]">채팅</h2>
      </div>

      {/* Chat content */}
      <div className="flex-1 overflow-hidden">
        {conversationId ? (
          <ChatPanel
            conversationId={conversationId}
            initialMessages={messages}
            isLoadingMessages={isLoadingMessages}
            onToolResult={onToolResult}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-4">
            <p className="text-center text-sm text-[var(--axis-text-tertiary)]">
              소스를 선택하면 AI와 대화할 수 있습니다.
            </p>
          </div>
        )}
      </div>

      {/* Model label */}
      <div className="border-t border-[var(--axis-border-default)] px-4 py-2">
        <span className="text-[10px] text-[var(--axis-text-tertiary)]">GPT 4o-mini</span>
      </div>
    </div>
  );
}
