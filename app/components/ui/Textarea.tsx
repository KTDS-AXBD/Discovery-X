import * as React from "react";
import { cn } from "~/lib/utils/cn";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-md border px-3 py-2 text-sm transition-colors",
          "bg-input-bg text-input-text",
          "border-input-border",
          "placeholder:text-input-placeholder",
          "hover:border-input-border-hover",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-input-border-focus focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-input-bg-disabled",
          error && "border-input-border-error focus-visible:ring-input-border-error",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
