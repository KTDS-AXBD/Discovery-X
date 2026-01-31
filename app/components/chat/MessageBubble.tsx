import { Card, CardContent } from "~/components/ui/Card";
import { Badge } from "~/components/ui/Badge";
import { cn } from "~/lib/utils/cn";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp?: string | null;
}

export function MessageBubble({ role, content, timestamp }: MessageBubbleProps) {
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
            <div
              className={cn(
                "whitespace-pre-wrap text-sm",
                isUser
                  ? "text-[var(--axis-text-brand)]"
                  : "text-[var(--axis-text-primary)]"
              )}
            >
              {content}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
