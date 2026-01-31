import * as React from "react";
import { cn } from "~/lib/utils/cn";

interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function FormField({ label, htmlFor, error, hint, required, className, children }: FormFieldProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-[var(--axis-text-primary)]"
      >
        {label}
        {required && <span className="text-[var(--axis-text-error)] ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs text-[var(--axis-text-tertiary)]">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-[var(--axis-text-error)]">{error}</p>
      )}
    </div>
  );
}
