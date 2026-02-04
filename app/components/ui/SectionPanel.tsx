import type { ReactNode } from "react";
import { cn } from "~/lib/utils/cn";

interface SectionPanelProps {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function SectionPanel({ title, children, action, className }: SectionPanelProps) {
  return (
    <div className={cn("py-3", className)}>
      <div className="mb-2 flex items-center justify-between px-3">
        <h4 className="dx-section-title">{title}</h4>
        {action}
      </div>
      <div className="px-3">{children}</div>
    </div>
  );
}
