import { useState, useCallback, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "~/lib/utils/cn";

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
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
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

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export function MarkdownViewer({ content, className }: MarkdownViewerProps) {
  return (
    <div
      className={cn(
        "prose prose-sm md:prose-base max-w-none",
        "text-[var(--axis-text-primary)]",
        "prose-headings:text-[var(--axis-text-primary)]",
        "prose-strong:text-[var(--axis-text-primary)]",
        "prose-code:text-[var(--axis-text-primary)]",
        "prose-code:bg-[var(--axis-surface-secondary)]",
        "prose-code:rounded prose-code:px-1 prose-code:py-0.5",
        "prose-code:before:content-none prose-code:after:content-none",
        "prose-pre:bg-[var(--axis-surface-secondary)]",
        "prose-pre:border prose-pre:border-[var(--axis-border-default)]",
        "prose-th:text-[var(--axis-text-primary)]",
        "prose-td:text-[var(--axis-text-primary)]",
        "prose-a:text-[var(--axis-text-brand)]",
        "prose-li:text-[var(--axis-text-primary)]",
        "prose-p:text-[var(--axis-text-primary)]",
        className
      )}
    >
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
    </div>
  );
}
