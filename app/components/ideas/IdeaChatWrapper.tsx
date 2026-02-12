import { ChatPanel } from "~/components/chat/ChatPanel";
import { PRIMARY_METHODOLOGIES } from "~/lib/constants/methodology";
import { AnalysisProgress } from "~/components/ideas/AnalysisProgress";
import type { CategoryState } from "~/components/ideas/AnalysisProgress";

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
  autoMessage?: string | null;
  selectedSourceCount?: number;
  totalSourceCount?: number;
  analysisRunning?: boolean;
  categoryStates?: Record<string, CategoryState>;
}

export function IdeaChatWrapper({
  conversationId,
  messages,
  isLoadingMessages,
  onToolResult,
  autoMessage,
  selectedSourceCount = 0,
  totalSourceCount = 0,
  analysisRunning = false,
  categoryStates = {},
}: IdeaChatWrapperProps) {
  const showProgress = analysisRunning || Object.keys(categoryStates).length > 0;

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden border-l border-[var(--dx-border-subtle,var(--axis-border-default))] bg-[var(--dx-surface-panel,var(--axis-surface-default))]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[var(--axis-border-default)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--axis-text-primary)]">채팅</h2>
        {totalSourceCount > 0 && (
          <span className="rounded-full bg-[var(--axis-surface-secondary)] px-2 py-0.5 text-[10px] text-[var(--axis-text-tertiary)]">
            {selectedSourceCount}/{totalSourceCount}개 소스
          </span>
        )}
      </div>

      {/* Analysis progress indicator */}
      {showProgress && (
        <AnalysisProgress
          categoryStates={categoryStates}
          isRunning={analysisRunning}
        />
      )}

      {/* Chat content */}
      <div className="flex-1 overflow-hidden">
        {conversationId ? (
          <ChatPanel
            conversationId={conversationId}
            initialMessages={messages}
            isLoadingMessages={isLoadingMessages}
            onToolResult={onToolResult}
            autoMessage={autoMessage}
            mode="ideas"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-6">
            {/* Empty state with speech bubble icon */}
            <div className="rounded-full bg-[var(--axis-surface-secondary)] p-3">
              <svg className="h-6 w-6 text-[var(--axis-text-tertiary)]" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 0 1-2.555-.337A5.972 5.972 0 0 1 5.41 20.97a5.969 5.969 0 0 1-.474-.065 4.48 4.48 0 0 0 .978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25Z" />
              </svg>
            </div>
            <p className="mt-3 text-center text-sm text-[var(--axis-text-secondary)]">
              에이전트와 함께 아이디어를 사업으로 발전시켜보세요.
            </p>

            {/* Research category checklist */}
            <div className="mt-4 w-full space-y-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--axis-text-tertiary)]">
                리서치 카테고리
              </p>
              {PRIMARY_METHODOLOGIES.map((cat) => (
                <label
                  key={cat.key}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-xs text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-secondary)]"
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-[var(--axis-border-default)] text-[var(--axis-text-brand)] focus:ring-[var(--axis-text-brand)]"
                    defaultChecked
                  />
                  {cat.label}
                </label>
              ))}
            </div>
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
