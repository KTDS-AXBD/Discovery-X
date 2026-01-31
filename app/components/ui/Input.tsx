import * as React from "react";
import { cn } from "~/lib/utils/cn";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border px-3 py-2 text-sm transition-colors",
          "bg-[var(--axis-input-bg-default)] text-[var(--axis-input-text-default)]",
          "border-[var(--axis-input-border-default)]",
          "placeholder:text-[var(--axis-input-text-placeholder)]",
          "hover:border-[var(--axis-input-border-hover)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--axis-input-border-focus)] focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-[var(--axis-input-bg-disabled)]",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          error && "border-[var(--axis-input-border-error)] focus-visible:ring-[var(--axis-input-border-error)]",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
