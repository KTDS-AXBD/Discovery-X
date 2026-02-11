import { Link, useLocation } from "@remix-run/react";
import { PROPOSAL_TABS } from "~/features/proposals/constants";
import { cn } from "~/lib/utils/cn";

export function ProposalTabNav() {
  const location = useLocation();

  function isActive(tab: typeof PROPOSAL_TABS[number]) {
    if (tab.id === "overview") {
      return location.pathname === "/proposals" || location.pathname === "/proposals/";
    }
    if (tab.id === "new") {
      return location.pathname === "/proposals/new";
    }
    return location.pathname.startsWith(tab.path);
  }

  return (
    <nav className="flex gap-1 border-b border-[var(--axis-border-default)] px-4">
      {PROPOSAL_TABS.map((tab) => {
        const active = isActive(tab);
        return (
          <Link
            key={tab.id}
            to={tab.path}
            className={cn(
              "relative px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "text-[var(--axis-text-brand)]"
                : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-secondary)]",
            )}
          >
            {tab.label}
            {active && (
              <div className="absolute inset-x-0 bottom-0 h-0.5 bg-[var(--axis-text-brand)]" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
