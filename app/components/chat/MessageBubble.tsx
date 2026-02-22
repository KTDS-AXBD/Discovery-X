import { useState, useCallback, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { Card, CardContent } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import { cn } from "~/lib/utils/cn";
import { formatTime } from "~/lib/format-date";
import { StructuredMessage, shouldUseStructuredMessage } from "./StructuredMessage";

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
        className="absolute right-2 top-2 rounded bg-surface px-1.5 py-0.5 text-[10px] text-fg-secondary opacity-0 transition-opacity hover:text-fg group-hover:opacity-100"
      >
        {copied ? "복사됨" : "복사"}
      </button>
    </code>
  );
}

function PreBlock({ children, ...props }: ComponentProps<"pre">) {
  return (
    <pre className="group relative rounded-lg border border-line bg-surface-code" {...props}>
      {children}
    </pre>
  );
}

function Heading2({ children, ...props }: ComponentProps<"h2">) {
  return (
    <h2 className="mt-6 mb-3 border-b border-line pb-2 text-base font-semibold text-fg" {...props}>
      {children}
    </h2>
  );
}

function Heading3({ children, ...props }: ComponentProps<"h3">) {
  return (
    <h3 className="mt-4 mb-2 border-l-3 border-fg-brand pl-3 text-sm font-semibold text-fg" {...props}>
      {children}
    </h3>
  );
}

function TableWrapper({ children, ...props }: ComponentProps<"table">) {
  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-line">
      <table className="w-full" {...props}>
        {children}
      </table>
    </div>
  );
}

function TableRow({ children, ...props }: ComponentProps<"tr">) {
  return (
    <tr className="border-b border-line-subtle-alt even:bg-surface-secondary" {...props}>
      {children}
    </tr>
  );
}

function TableHead({ children, ...props }: ComponentProps<"th">) {
  return (
    <th className="bg-surface-secondary px-3 py-2 text-left text-xs font-semibold text-fg-secondary" {...props}>
      {children}
    </th>
  );
}

function TableCell({ children, ...props }: ComponentProps<"td">) {
  return (
    <td className="px-3 py-2 text-sm" {...props}>
      {children}
    </td>
  );
}

function BlockquoteBlock({ children, ...props }: ComponentProps<"blockquote">) {
  const text = typeof children === "string" ? children : String(children);
  const isSummary = text.includes("요약:");
  return (
    <blockquote
      className={cn(
        "my-3 border-l-4 pl-4 pr-3",
        isSummary
          ? "border-fg-brand bg-surface-card-hover rounded-r-lg py-2 text-sm font-medium not-italic"
          : "border-fg-brand bg-surface-secondary py-2 text-sm italic text-fg-secondary"
      )}
      {...props}
    >
      {children}
    </blockquote>
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
            <span className="text-xs text-fg-tertiary">
              {formatTime(timestamp)}
            </span>
          )}
        </div>
        <Card
          className={cn(
            isUser
              ? "bg-surface-brand border-transparent"
              : "bg-surface-card border-line-subtle"
          )}
        >
          <CardContent className="p-4">
            {isUser ? (
              <div className="whitespace-pre-wrap text-sm text-fg-brand">
                {content}
              </div>
            ) : (
              <div className="prose prose-base max-w-none text-fg prose-headings:text-fg prose-strong:text-fg prose-code:text-fg prose-code:bg-surface-secondary prose-code:rounded prose-code:px-1 prose-code:py-0.5 prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none prose-pre:bg-surface-code prose-pre:border-0 prose-pre:p-0 prose-th:text-fg prose-td:text-fg prose-a:text-fg-brand prose-li:my-0.5 prose-p:my-2 prose-ul:my-2 prose-ol:my-2">
                {shouldUseStructuredMessage(content) ? (
                  <StructuredMessage content={content} streaming={streaming} />
                ) : (
                  <>
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeHighlight]}
                      components={{
                        pre: PreBlock,
                        code: CodeBlock,
                        h2: Heading2,
                        h3: Heading3,
                        table: TableWrapper,
                        tr: TableRow,
                        th: TableHead,
                        td: TableCell,
                        blockquote: BlockquoteBlock,
                      }}
                    >
                      {content}
                    </ReactMarkdown>
                    {streaming && (
                      <span className="inline-flex gap-0.5 ml-1 items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-fg-brand animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-fg-brand animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 rounded-full bg-fg-brand animate-bounce [animation-delay:300ms]" />
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
