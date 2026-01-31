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
          "bg-[var(--axis-input-bg-default)] text-[var(--axis-input-text-default)]",
          "border-[var(--axis-input-border-default)]",
          "placeholder:text-[var(--axis-input-text-placeholder)]",
          "hover:border-[var(--axis-input-border-hover)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--axis-input-border-focus)] focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--axis-input-bg-disabled)]",
          error && "border-[var(--axis-input-border-error)] focus-visible:ring-[var(--axis-input-border-error)]",
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
