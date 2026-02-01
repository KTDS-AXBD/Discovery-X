import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import { cn } from "~/lib/utils/cn";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: string | null;
  streaming?: boolean;
}

export function MessageBubble({ role, content, timestamp, streaming }: MessageBubbleProps) {
  const isUser = role === "user";

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div className={cn("max-w-[80%]", isUser ? "items-end" : "items-start")}>
        <div className="mb-1 flex items-center gap-2">
          <Badge variant={isUser ? "default" : "info"} className="text-xs">
            {isUser ? "You" : "Agent"}
          </Badge>
          {timestamp && (
            <span className="text-xs text-[var(--axis-text-tertiary)]">
              {new Date(timestamp).toLocaleTimeString("ko-KR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
        <Card
          className={cn(
            isUser
              ? "bg-[var(--axis-surface-brand)] border-transparent"
              : "bg-[var(--axis-surface-default)]"
          )}
        >
          <CardContent className="p-3">
            {isUser ? (
              <div className="whitespace-pre-wrap text-sm text-[var(--axis-text-brand)]">
                {content}
              </div>
            ) : (
              <div className="prose prose-sm max-w-none text-[var(--axis-text-primary)] prose-headings:text-[var(--axis-text-primary)] prose-strong:text-[var(--axis-text-primary)] prose-code:text-[var(--axis-text-primary)] prose-code:bg-[var(--axis-surface-secondary)] prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:before:content-none prose-code:after:content-none prose-pre:bg-[var(--axis-surface-secondary)] prose-pre:border prose-pre:border-[var(--axis-border-default)] prose-th:text-[var(--axis-text-primary)] prose-td:text-[var(--axis-text-primary)] prose-a:text-[var(--axis-text-brand)]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {content}
                </ReactMarkdown>
                {streaming && (
                  <span className="inline-block h-4 w-0.5 animate-pulse bg-[var(--axis-text-brand)]" />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
