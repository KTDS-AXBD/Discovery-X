import { Link, useLocation } from "@remix-run/react";
import { useTheme } from "@axis-ds/theme";
import { cn } from "~/lib/utils/cn";

const NAV_TABS = [
  { to: "/dashboard", label: "대시보드" },
  { to: "/ideas", label: "아이디어" },
  { to: "/proposals", label: "사업제안" },
  { to: "/lab", label: "실험실" },
];

interface IdeaPageHeaderProps {
  user: { id: string; name: string; email: string };
  showProposalButton?: boolean;
  onOpenProposalModal?: () => void;
}

export function IdeaPageHeader({ user, showProposalButton, onOpenProposalModal }: IdeaPageHeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const location = useLocation();

  return (
    <nav
      className="shrink-0 border-b border-line-muted bg-surface-panel"
      style={{ height: "var(--dx-nav-height)" }}
    >
      <div className="flex h-full items-center justify-between px-4">
        {/* Left: logo + GNB tabs */}
        <div className="flex items-center gap-3">
          {/* Logo link */}
          <Link to="/dashboard" className="flex items-center gap-1.5 text-fg">
            <svg className="h-4 w-4 text-fg-brand" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
          </Link>

          <span className="text-fg-tertiary">/</span>

          {/* GNB nav tabs */}
          <div className="hidden items-center gap-1 sm:flex">
            {NAV_TABS.map((tab) => {
              const isActive = location.pathname === tab.to || location.pathname.startsWith(tab.to + "/");
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-surface-brand text-fg-brand"
                      : "text-fg-tertiary hover:bg-surface-secondary hover:text-fg",
                  )}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>

          {/* Mobile: title */}
          <h1 className="truncate text-sm font-semibold text-fg sm:hidden">
            아이디어
          </h1>
        </div>

        {/* Right: proposal button + theme + user */}
        <div className="flex items-center gap-2">
          {/* Share (placeholder) */}
          <button
            type="button"
            className="rounded-md p-1.5 text-icon-secondary transition-colors hover:bg-surface-secondary hover:text-icon"
            aria-label="공유"
            title="공유 (준비 중)"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 1 0 0 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186 9.566-5.314m-9.566 7.5 9.566 5.314m0 0a2.25 2.25 0 1 0 3.935 2.186 2.25 2.25 0 0 0-3.935-2.186Zm0-12.814a2.25 2.25 0 1 0 3.933-2.185 2.25 2.25 0 0 0-3.933 2.185Z" />
            </svg>
          </button>

          {/* Proposal button — only shown on detail page */}
          {showProposalButton && onOpenProposalModal && (
            <button
              type="button"
              onClick={onOpenProposalModal}
              className="rounded-lg bg-surface-brand px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            >
              사업 제안하기
            </button>
          )}

          {/* Theme toggle */}
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="rounded-md p-1.5 text-icon-secondary transition-colors hover:bg-surface-secondary hover:text-icon"
            aria-label={resolvedTheme === "dark" ? "라이트 모드" : "다크 모드"}
          >
            {resolvedTheme === "dark" ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>
            )}
          </button>

          {/* User name */}
          <span className="hidden text-sm text-fg-secondary sm:inline">
            {user.name}
          </span>
        </div>
      </div>
    </nav>
  );
}
