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

      {/* Bottom bar */}
      <div className="flex items-center justify-between border-t border-[var(--axis-border-default)] px-3 py-2">
        {/* Model label button */}
        <button
          type="button"
          className="rounded-full border border-[var(--axis-border-default)] px-2.5 py-0.5 text-[10px] text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-secondary)]"
          title="모델 변경 (준비 중)"
        >
          Claude Sonnet 4.5
        </button>

        {/* Action icons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--axis-text-tertiary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-secondary)]"
            title="첨부 (준비 중)"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--axis-text-tertiary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-secondary)]"
            title="설정 (준비 중)"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
