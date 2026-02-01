import { useState, useCallback, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Card, CardContent } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import { cn } from "~/lib/utils/cn";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: string | null;
  streaming?: boolean;
}

function CodeBlock({ children, className, ...props }: ComponentProps<"code">) {
  const [copied, setCopied] = useState(false);
  const isInline = !className;

  const handleCopy = useCallback(() => {
    const text = typeof children === "string" ? children : String(children);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [children]);

  if (isInline) {
    return <code className={className} {...props}>{children}</code>;
  }

  return (
    <code className={className} {...props}>
      {children}
      <button
        onClick={handleCopy}
        className="absolute right-2 top-2 rounded bg-[var(--axis-surface-default)] px-1.5 py-0.5 text-[10px] text-[var(--axis-text-secondary)] opacity-0 transition-opacity hover:text-[var(--axis-text-primary)] group-hover:opacity-100"
      >
        {copied ? "복사됨" : "복사"}
      </button>
    </code>
  );
}

function PreBlock({ children, ...props }: ComponentProps<"pre">) {
  return (
    <pre className="group relative" {...props}>
      {children}
    </pre>
  );
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
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    pre: PreBlock,
                    code: CodeBlock,
                  }}
                >
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
