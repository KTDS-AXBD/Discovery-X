import type { ReactNode } from "react";
import { cn } from "~/lib/utils/cn";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-8 flex items-center justify-between", className)}>
      <div>
        <h1 className="text-2xl font-bold text-[var(--axis-text-primary)]">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-[var(--axis-text-secondary)]">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}
