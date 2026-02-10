import type { ReactNode } from "react";

interface ContextPanelProps {
  children: ReactNode;
}

export function ContextPanel({ children }: ContextPanelProps) {
  return (
    <aside
      className="hidden shrink-0 overflow-y-auto border-l border-[var(--dx-border-subtle,var(--axis-border-default))] bg-[var(--dx-surface-panel,var(--axis-surface-default))] lg:block"
      style={{ width: "var(--dx-context-panel-width)" }}
    >
      {children}
    </aside>
  );
}
