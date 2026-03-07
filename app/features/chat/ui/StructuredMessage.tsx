import { useState, useMemo, useCallback, type ComponentProps, type HTMLAttributes } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface StructuredMessageProps {
  content: string;
  streaming?: boolean;
}

function extractHeadings(markdown: string): TocItem[] {
  const headings: TocItem[] = [];
  const lines = markdown.split("\n");
  let inCodeBlock = false;

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{2,3})\s+(.+)/);
    if (match) {
      const text = match[2].trim();
      const id = text
        .toLowerCase()
        .replace(/[^a-z0-9가-힣\s-]/g, "")
        .replace(/\s+/g, "-")
        .slice(0, 60);
      headings.push({
        id,
        text,
        level: match[1].length,
      });
    }
  }
  return headings;
}

function HeadingWithId({ level, children, ...props }: HTMLAttributes<HTMLHeadingElement> & { level: number }) {
  const text = typeof children === "string" ? children : String(children);
  const id = text
    .toLowerCase()
    .replace(/[^a-z0-9가-힣\s-]/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 60);

  const Tag = level === 2 ? "h2" : "h3";

  const className =
    level === 2
      ? "mt-6 mb-3 border-b border-line pb-2 text-base font-semibold text-fg scroll-mt-4"
      : "mt-4 mb-2 border-l-3 border-fg-brand pl-3 text-sm font-semibold text-fg scroll-mt-4";

  return (
    <Tag id={id} className={className} {...props}>
      {children}
    </Tag>
  );
}

function PreBlock({ children, ...props }: ComponentProps<"pre">) {
  return (
    <pre className="group relative rounded-lg border border-line bg-surface-code" {...props}>
      {children}
    </pre>
  );
}

function TableWrapper({ children, ...props }: ComponentProps<"table">) {
  return (
    <div className="my-3 overflow-x-auto rounded-lg border border-line">
      <table className="w-full" {...props}>{children}</table>
    </div>
  );
}

function TableRow({ children, ...props }: ComponentProps<"tr">) {
  return <tr className="border-b border-line-subtle-alt even:bg-surface-secondary" {...props}>{children}</tr>;
}

function TableHead({ children, ...props }: ComponentProps<"th">) {
  return <th className="bg-surface-secondary px-3 py-2 text-left text-xs font-semibold text-fg-secondary" {...props}>{children}</th>;
}

function TableCell({ children, ...props }: ComponentProps<"td">) {
  return <td className="px-3 py-2 text-sm" {...props}>{children}</td>;
}

function BlockquoteBlock({ children, ...props }: ComponentProps<"blockquote">) {
  return (
    <blockquote className="my-3 border-l-4 border-fg-brand bg-surface-secondary py-2 pl-4 pr-3 text-sm italic text-fg-secondary" {...props}>
      {children}
    </blockquote>
  );
}

export function StructuredMessage({ content, streaming }: StructuredMessageProps) {
  const [tocOpen, setTocOpen] = useState(true);
  const headings = useMemo(() => extractHeadings(content), [content]);

  const scrollToHeading = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <div>
      {/* Mini TOC */}
      {headings.length >= 2 && !streaming && (
        <div className="mb-4 rounded-lg border border-line bg-surface-secondary p-3">
          <button
            onClick={() => setTocOpen(!tocOpen)}
            className="flex w-full items-center justify-between text-xs font-semibold text-fg-secondary"
          >
            <span>목차 ({headings.length})</span>
            <span>{tocOpen ? "▲" : "▼"}</span>
          </button>
          {tocOpen && (
            <nav className="mt-2 space-y-1">
              {headings.map((h) => (
                <button
                  key={h.id}
                  onClick={() => scrollToHeading(h.id)}
                  className={`block w-full text-left text-xs hover:text-fg-brand transition-colors ${
                    h.level === 3 ? "pl-4" : ""
                  } text-fg-secondary`}
                >
                  {h.text}
                </button>
              ))}
            </nav>
          )}
        </div>
      )}

      {/* Content */}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          h2: (props) => <HeadingWithId level={2} {...props} />,
          h3: (props) => <HeadingWithId level={3} {...props} />,
          pre: PreBlock,
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
    </div>
  );
}

/** Check if content has 2+ headings and should use StructuredMessage */
export function shouldUseStructuredMessage(content: string): boolean {
  const headingMatches = content.match(/^#{2,3}\s+.+/gm);
  return (headingMatches?.length ?? 0) >= 2;
}
