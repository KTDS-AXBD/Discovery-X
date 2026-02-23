import * as React from "react";
import { Textarea as AxisTextarea } from "@axis-ds/ui-react";
import { cn } from "~/lib/utils/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

/**
 * DS Textarea 래퍼.
 * error prop으로 에러 상태 border 표시 확장.
 */
const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <AxisTextarea
      ref={ref}
      className={cn(
        error && "border-input-border-error focus-visible:ring-input-border-error",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";

export { Textarea };
