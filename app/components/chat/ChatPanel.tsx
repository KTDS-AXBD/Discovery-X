import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "~/components/ui/Input";
import { Button } from "~/components/ui/Button";
import { MessageBubble } from "./MessageBubble";
import { ToolExecution } from "./ToolExecution";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "tool_use" | "tool_result";
  content: string;
  toolName?: string | null;
  toolInput?: Record<string, unknown> | null;
  toolResult?: Record<string, unknown> | null;
  createdAt?: string | null;
}

interface SSEToolCall {
  type: "tool_call";
  name: string;
  input: Record<string, unknown>;
  result: Record<string, unknown>;
}

interface ChatPanelProps {
  conversationId: string | null;
  initialMessages: ChatMessage[];
  isLoadingMessages?: boolean;
}

interface BudgetWarning {
  tokensUsedToday: number;
  dailyTokenBudget: number;
  percentUsed: number;
}

export function ChatPanel({ conversationId, initialMessages, isLoadingMessages }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingToolCalls, setPendingToolCalls] = useState<SSEToolCall[]>([]);
  const [budgetWarning, setBudgetWarning] = useState<BudgetWarning | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
    setPendingToolCalls([]);
  }, [initialMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingToolCalls]);

  const sendMessageWithContent = useCallback(async (userMessage: string) => {
    if (!userMessage.trim() || !conversationId || isLoading) return;

    setIsLoading(true);
    setPendingToolCalls([]);
    setSendError(null);
    setLastFailedMessage(null);

    // Optimistic add user message
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMessage,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    // Setup abort controller
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, message: userMessage }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const error = await response.json() as { error: string };
        throw new Error(error.error || "Chat request failed");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";
      const streamingMsgId = crypto.randomUUID();
      let streamingStarted = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6)) as {
              type: string;
              content?: string;
              name?: string;
              input?: Record<string, unknown>;
              result?: Record<string, unknown>;
              message?: string;
            };

            if (event.type === "text_delta" && event.content) {
              if (!streamingStarted) {
                // Create streaming assistant message
                streamingStarted = true;
                setMessages((prev) => [
                  ...prev,
                  {
                    id: streamingMsgId,
                    role: "assistant" as const,
                    content: event.content!,
                    createdAt: new Date().toISOString(),
                  },
                ]);
              } else {
                // Append delta to existing streaming message
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamingMsgId
                      ? { ...m, content: m.content + event.content }
                      : m
                  )
                );
              }
            } else if (event.type === "tool_start") {
              setPendingToolCalls((prev) => [
                ...prev,
                {
                  type: "tool_call",
                  name: event.name!,
                  input: {},
                  result: {},
                } as SSEToolCall & { _running?: boolean },
              ]);
            } else if (event.type === "tool_call") {
              // Replace the running tool_start with completed result
              setPendingToolCalls((prev) => {
                const idx = prev.findIndex((tc) => tc.name === event.name && Object.keys(tc.result).length === 0);
                if (idx >= 0) {
                  const updated = [...prev];
                  updated[idx] = {
                    type: "tool_call",
                    name: event.name!,
                    input: event.input!,
                    result: event.result!,
                  };
                  return updated;
                }
                return [
                  ...prev,
                  {
                    type: "tool_call",
                    name: event.name!,
                    input: event.input!,
                    result: event.result!,
                  },
                ];
              });
              // Reset streaming state for next text after tool calls
              streamingStarted = false;
            } else if (event.type === "budget_warning") {
              setBudgetWarning({
                tokensUsedToday: (event as unknown as BudgetWarning).tokensUsedToday,
                dailyTokenBudget: (event as unknown as BudgetWarning).dailyTokenBudget,
                percentUsed: (event as unknown as BudgetWarning).percentUsed,
              });
            } else if (event.type === "error") {
              const errorMsg: ChatMessage = {
                id: crypto.randomUUID(),
                role: "assistant",
                content: `오류: ${event.message}`,
                createdAt: new Date().toISOString(),
              };
              setMessages((prev) => [...prev, errorMsg]);
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        // User cancelled
      } else {
        const errMessage = error instanceof Error ? error.message : "알 수 없는 오류";
        setSendError(errMessage);
        setLastFailedMessage(userMessage);
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
      inputRef.current?.focus();
    }
  }, [conversationId, isLoading]);

  const sendMessage = useCallback(async () => {
    if (!input.trim()) return;
    const msg = input.trim();
    setInput("");
    await sendMessageWithContent(msg);
  }, [input, sendMessageWithContent]);

  const handleRetry = useCallback(() => {
    if (lastFailedMessage) {
      setSendError(null);
      // Remove the last user message (which failed)
      setMessages((prev) => prev.slice(0, -1));
      sendMessageWithContent(lastFailedMessage);
    }
  }, [lastFailedMessage, sendMessageWithContent]);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  if (!conversationId) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-[var(--axis-text-primary)]">
            Discovery-X Agent
          </h2>
          <p className="mt-2 text-sm text-[var(--axis-text-secondary)]">
            새 대화를 시작하세요
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto max-w-3xl space-y-4">
          {isLoadingMessages && (
            <div className="flex items-center justify-center py-12">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--axis-border-default)] border-t-[var(--axis-text-brand)]" />
              <span className="ml-2 text-sm text-[var(--axis-text-tertiary)]">대화 불러오는 중...</span>
            </div>
          )}

          {!isLoadingMessages && messages.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-lg font-medium text-[var(--axis-text-primary)]">
                무엇을 도와드릴까요?
              </p>
              <p className="mt-2 text-sm text-[var(--axis-text-tertiary)]">
                Discovery 생성, 실험 설계, 근거 분석, 상태 전환 등을 요청해보세요
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {[
                  "새 디스커버리 만들어줘",
                  "현재 진행 중인 디스커버리 보여줘",
                  "Radar에서 수집된 아이템 확인해줘",
                  "전체 지표 요약해줘",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    className="rounded-full border border-[var(--axis-border-default)] px-3 py-1.5 text-xs text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-secondary)] transition-colors"
                    onClick={() => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Send error + retry */}
          {sendError && (
            <div className="flex items-center gap-2 rounded-md border border-[var(--axis-border-error)] bg-red-50 p-3 text-sm dark:bg-red-950/20">
              <span className="text-[var(--axis-text-error)]">전송 실패: {sendError}</span>
              <button
                onClick={handleRetry}
                className="ml-auto rounded bg-[var(--axis-button-bg-default)] px-2 py-1 text-xs text-[var(--axis-button-text-default)] hover:bg-[var(--axis-button-bg-hover)]"
              >
                재시도
              </button>
            </div>
          )}

          {messages
            .filter((m) => m.role === "user" || m.role === "assistant")
            .map((msg, _idx, arr) => (
              <MessageBubble
                key={msg.id}
                role={msg.role as "user" | "assistant"}
                content={msg.content}
                timestamp={msg.createdAt}
                streaming={isLoading && msg.role === "assistant" && msg === arr[arr.length - 1]}
              />
            ))}

          {/* Pending tool calls */}
          {pendingToolCalls.map((tc, i) => (
            <ToolExecution
              key={`tool-${i}`}
              toolName={tc.name}
              input={tc.input}
              result={tc.result}
              isRunning={Object.keys(tc.result).length === 0}
            />
          ))}

          {isLoading && pendingToolCalls.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-[var(--axis-text-tertiary)]">
              <div className="h-2 w-2 animate-pulse rounded-full bg-[var(--axis-text-brand)]" />
              Agent가 처리 중...
              <button
                onClick={handleCancel}
                className="ml-2 text-xs text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-error)]"
              >
                취소
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Budget warning banner */}
      {budgetWarning && (
        <div className="border-t border-[var(--axis-border-warning)] bg-amber-50 px-4 py-2 dark:bg-amber-950/20">
          <div className="mx-auto flex max-w-3xl items-center justify-between text-xs">
            <span className="text-amber-800 dark:text-amber-200">
              토큰 예산 {budgetWarning.percentUsed}% 사용 ({budgetWarning.tokensUsedToday.toLocaleString()} / {budgetWarning.dailyTokenBudget.toLocaleString()})
            </span>
            <button
              onClick={() => setBudgetWarning(null)}
              className="text-amber-600 hover:text-amber-800 dark:text-amber-400"
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Input area */}
      <div className="border-t border-[var(--axis-border-default)] bg-[var(--axis-surface-default)] p-4">
        <div className="mx-auto flex max-w-3xl gap-2">
          <Input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="메시지를 입력하세요..."
            disabled={isLoading}
            className="flex-1"
          />
          <Button
            onClick={sendMessage}
            disabled={isLoading || !input.trim()}
          >
            전송
          </Button>
        </div>
      </div>
    </div>
  );
}
