import * as React from "react";

import { Label } from "~/components/ui/Label";
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
      <Label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-fg"
      >
        {label}
        {required && <span className="text-fg-error ml-0.5">*</span>}
      </Label>
      {children}
      {hint && !error && (
        <p className="text-xs text-fg-tertiary">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-fg-error">{error}</p>
      )}
    </div>
  );
}
