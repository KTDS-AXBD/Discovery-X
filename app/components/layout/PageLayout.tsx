import type { ReactNode } from "react";
import { MainNav } from "./MainNav";

interface PageLayoutProps {
  user: { id: string; email: string; name: string; role?: string };
  children: ReactNode;
}

export function PageLayout({ user, children }: PageLayoutProps) {
  return (
    <div className="min-h-screen bg-[var(--dx-surface-deep,var(--axis-surface-secondary))]">
      <MainNav user={user} />
      <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
