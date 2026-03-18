import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "~/components/ui/Input";
import { Button } from "~/components/ui/Button";
import { SuggestionChip } from "~/components/ui/SuggestionChip";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { MessageBubble } from "./MessageBubble";
import { ToolExecution } from "./ToolExecution";
import { WidgetRenderer } from "./WidgetRenderer";
import type { WidgetType } from "~/features/chat/lib/widget-protocol";

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

interface SSEWidget {
  widgetId: string;
  widgetType: WidgetType;
  title: string;
  code: string;
  data: Record<string, unknown>;
  description?: string;
}

/** 대화당 최대 위젯 동시 렌더링 수 (Design §4.3 Layer 6) */
const MAX_WIDGETS_PER_CONVERSATION = 5;

interface ChatPanelProps {
  conversationId: string | null;
  initialMessages: ChatMessage[];
  initialWidgets?: SSEWidget[];
  isLoadingMessages?: boolean;
  onToolResult?: (toolName: string, result: Record<string, unknown>) => void;
  autoMessage?: string | null;
  purpose?: "chat" | "analysis";
}

interface BudgetWarning {
  tokensUsedToday: number;
  dailyTokenBudget: number;
  percentUsed: number;
}

function isOverBudget(warning: BudgetWarning | null): boolean {
  return warning !== null && warning.percentUsed >= 100;
}

// Parse <!-- SUGGESTIONS: [...] --> from end of message content
function parseSuggestions(content: string): { cleanContent: string; suggestions: string[] } {
  const match = content.match(/<!--\s*SUGGESTIONS:\s*(\[.*?\])\s*-->\s*$/s);
  if (!match) return { cleanContent: content, suggestions: [] };
  try {
    const suggestions = JSON.parse(match[1]) as string[];
    return {
      cleanContent: content.slice(0, match.index).trimEnd(),
      suggestions: suggestions.filter((s) => typeof s === "string" && s.length > 0).slice(0, 4),
    };
  } catch {
    return { cleanContent: content, suggestions: [] };
  }
}

export function ChatPanel({ conversationId, initialMessages, initialWidgets, isLoadingMessages, onToolResult, autoMessage, purpose = "chat" }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingToolCalls, setPendingToolCalls] = useState<SSEToolCall[]>([]);
  const [budgetWarning, setBudgetWarning] = useState<BudgetWarning | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const [dynamicSuggestions, setDynamicSuggestions] = useState<string[]>([]);
  const [widgets, setWidgets] = useState<SSEWidget[]>(initialWidgets ?? []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setMessages(initialMessages);
    setPendingToolCalls([]);
  }, [initialMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, pendingToolCalls, widgets]);

  const sendMessageWithContent = useCallback(async (userMessage: string) => {
    if (!userMessage.trim() || !conversationId || isLoading) return;

    setIsLoading(true);
    setPendingToolCalls([]);
    setWidgets([]);
    setSendError(null);
    setLastFailedMessage(null);
    setDynamicSuggestions([]);

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
        body: JSON.stringify({ conversationId, message: userMessage, purpose }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        if (response.status === 429) {
          const error = await response.json() as { error: string };
          throw new Error(error.error || "다른 탭에서 대화가 진행 중입니다. 잠시 후 다시 시도하세요.");
        }
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
              // widget fields (Generative UI — F48)
              widgetId?: string;
              widgetType?: string;
              title?: string;
              code?: string;
              data?: Record<string, unknown>;
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
              // Notify parent about tool result for context panel
              if (onToolResult && event.result && !("error" in event.result)) {
                onToolResult(event.name!, event.result);
              }
              // Generative UI — F48: render_widget tool_call → 위젯 변환
              if (event.name === "render_widget" && event.result && !("error" in event.result)) {
                const r = event.result as Record<string, unknown>;
                if (r.widgetId && r.code) {
                  setWidgets((prev) => {
                    if (prev.length >= MAX_WIDGETS_PER_CONVERSATION) return prev;
                    if (prev.some((w) => w.widgetId === r.widgetId)) return prev;
                    return [
                      ...prev,
                      {
                        widgetId: r.widgetId as string,
                        widgetType: (r.widgetType || "chart") as WidgetType,
                        title: (r.title || "Widget") as string,
                        code: r.code as string,
                        data: (r.data || {}) as Record<string, unknown>,
                        description: r.description as string | undefined,
                      },
                    ];
                  });
                }
              }
              // Append separator so next round's text is visually distinct
              if (streamingStarted) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === streamingMsgId
                      ? { ...m, content: m.content + "\n\n" }
                      : m
                  )
                );
              }
            } else if (event.type === "widget" && event.widgetId) {
              // Generative UI — F48: 전용 widget SSE 이벤트
              setWidgets((prev) => {
                if (prev.length >= MAX_WIDGETS_PER_CONVERSATION) return prev;
                if (prev.some((w) => w.widgetId === event.widgetId)) return prev;
                return [
                  ...prev,
                  {
                    widgetId: event.widgetId!,
                    widgetType: event.widgetType as WidgetType,
                    title: event.title || "Widget",
                    code: event.code || "",
                    data: event.data || {},
                    description: (event as Record<string, unknown>).description as string | undefined,
                  },
                ];
              });
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

      // Parse SUGGESTIONS from the last assistant message
      setMessages((prev) => {
        const lastAssistant = [...prev].reverse().find((m) => m.role === "assistant");
        if (!lastAssistant) return prev;
        const { cleanContent, suggestions } = parseSuggestions(lastAssistant.content);
        setDynamicSuggestions(suggestions);
        if (cleanContent !== lastAssistant.content) {
          return prev.map((m) =>
            m.id === lastAssistant.id ? { ...m, content: cleanContent } : m
          );
        }
        return prev;
      });
    }
  }, [conversationId, isLoading, onToolResult, purpose]);

  // Auto-send message (e.g., from "분석 시작" button)
  const autoMessageProcessed = useRef<string | null>(null);
  useEffect(() => {
    if (autoMessage && conversationId && !isLoading && autoMessage !== autoMessageProcessed.current) {
      autoMessageProcessed.current = autoMessage;
      sendMessageWithContent(autoMessage);
    }
  }, [autoMessage, conversationId, isLoading, sendMessageWithContent]);

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
          <h2 className="text-xl font-semibold text-fg">
            Discovery-X Agent
          </h2>
          <p className="mt-2 text-sm text-fg-secondary">
            새 대화를 시작하세요
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages area */}
      <div className={`flex-1 overflow-y-auto ${purpose === "analysis" ? "px-3 py-4" : "px-6 py-8"}`}>
        <div className={`${purpose === "analysis" ? "" : "mx-auto max-w-3xl"} space-y-6`}>
          {isLoadingMessages && (
            <div className="flex items-center justify-center py-12" role="status" aria-label="대화 불러오는 중">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-line border-t-fg-brand" />
              <span className="ml-2 text-sm text-fg-tertiary">대화 불러오는 중...</span>
            </div>
          )}

          {!isLoadingMessages && messages.length === 0 && (
            <div className="py-12 text-center">
              <p className="text-lg font-medium text-fg">
                무엇을 도와드릴까요?
              </p>
              <p className="mt-2 text-sm text-fg-tertiary">
                Discovery 생성, 실험 설계, 근거 분석, 상태 전환 등을 요청해보세요
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {[
                  "새 디스커버리 만들어줘",
                  "현재 진행 중인 디스커버리 보여줘",
                  "Radar에서 수집된 아이템 확인해줘",
                  "전체 지표 요약해줘",
                ].map((suggestion) => (
                  <SuggestionChip
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                  >
                    {suggestion}
                  </SuggestionChip>
                ))}
              </div>
            </div>
          )}

          {/* Send error + retry */}
          {sendError && (
            <AlertBanner variant="destructive">
              <div className="flex items-center gap-2">
                <span>전송 실패: {sendError}</span>
                <Button variant="secondary" size="sm" onClick={handleRetry} className="ml-auto">
                  재시도
                </Button>
              </div>
            </AlertBanner>
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

          {/* Generative UI widgets — F48 (최대 5개) */}
          {widgets.slice(0, MAX_WIDGETS_PER_CONVERSATION).map((w) => (
            <WidgetRenderer
              key={w.widgetId}
              widgetId={w.widgetId}
              widgetType={w.widgetType}
              title={w.title}
              code={w.code}
              data={w.data}
              onSendPrompt={sendMessageWithContent}
            />
          ))}

          {isLoading && pendingToolCalls.length === 0 && (
            <div className="flex items-center gap-2 text-sm text-fg-tertiary" role="status" aria-live="polite">
              <div className="h-2 w-2 animate-pulse rounded-full bg-fg-brand" />
              Agent가 처리 중...
              <button
                onClick={handleCancel}
                className="ml-2 text-xs text-fg-tertiary hover:text-fg-error"
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
        <div className="border-t border-line px-4 py-2">
          <div className={purpose === "analysis" ? "" : "mx-auto max-w-3xl"}>
            <AlertBanner variant={isOverBudget(budgetWarning) ? "destructive" : "warning"} className="py-2">
              <div className="flex items-center justify-between text-xs">
                <span>
                  {isOverBudget(budgetWarning)
                    ? `일일 토큰 예산 초과 — 내일 자정(UTC)에 초기화됩니다 (${budgetWarning.tokensUsedToday.toLocaleString()} / ${budgetWarning.dailyTokenBudget.toLocaleString()})`
                    : `토큰 예산 ${budgetWarning.percentUsed}% 사용 (${budgetWarning.tokensUsedToday.toLocaleString()} / ${budgetWarning.dailyTokenBudget.toLocaleString()})`}
                </span>
                <button
                  onClick={() => setBudgetWarning(null)}
                  className="ml-2 opacity-70 hover:opacity-100"
                >
                  &times;
                </button>
              </div>
            </AlertBanner>
          </div>
        </div>
      )}

      {/* Dynamic suggestions */}
      {dynamicSuggestions.length > 0 && !isLoading && (
        <div className={`border-t border-line-subtle-alt bg-surface pt-3 pb-0 ${purpose === "analysis" ? "px-3" : "px-4"}`}>
          <div className={`flex flex-wrap gap-2 ${purpose === "analysis" ? "" : "mx-auto max-w-3xl"}`}>
            {dynamicSuggestions.map((suggestion) => (
              <SuggestionChip
                key={suggestion}
                onClick={() => {
                  setDynamicSuggestions([]);
                  setInput("");
                  sendMessageWithContent(suggestion);
                }}
              >
                {suggestion}
              </SuggestionChip>
            ))}
          </div>
        </div>
      )}

      {/* Input area */}
      <div className={`border-t border-line-subtle bg-surface-panel ${purpose === "analysis" ? "p-3" : "p-4"}`}>
        <div className={purpose === "analysis" ? "" : "mx-auto max-w-3xl"}>
          <div className="flex items-center gap-2 rounded-xl border border-line-subtle bg-surface-card px-4 py-2 transition-colors focus-within:border-line-brand focus-within:ring-1 focus-within:ring-line-brand">
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
              placeholder={isOverBudget(budgetWarning) ? "일일 토큰 예산을 초과했습니다" : "메시지를 입력하세요..."}
              disabled={isLoading || isOverBudget(budgetWarning)}
              className="flex-1 border-0 bg-transparent p-0 shadow-none focus:ring-0 focus-visible:ring-0"
            />
            <button
              type="button"
              onClick={sendMessage}
              disabled={isLoading || !input.trim() || isOverBudget(budgetWarning)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-btn-bg text-btn-text transition-all hover:bg-btn-bg-hover disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="전송"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
