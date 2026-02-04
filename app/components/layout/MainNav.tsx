import { useState } from "react";
import { Link, useLocation, useRouteLoaderData } from "@remix-run/react";
import { IconButton } from "~/components/ui/IconButton";
import { cn } from "~/lib/utils/cn";
import { NavDropdown } from "./NavDropdown";
import { UserMenu } from "./UserMenu";

interface MainNavProps {
  user: { id: string; email: string; name: string; role?: string };
}

interface RootLoaderData {
  notifications: {
    overdueOpen: number;
    dueSoon: number;
    recallDue: number;
    pendingApproval: number;
    unacknowledgedAlerts: number;
  } | null;
}

const MARKET_ITEMS = [
  { to: "/radar", label: "레이더" },
  { to: "/evidence/duplicates", label: "맥락 그래프" },
];

const BUSINESS_ITEMS = [
  { to: "/discoveries", label: "Discovery 목록" },
  { to: "/venture", label: "Venture Sprint" },
  { to: "/methods", label: "방법론" },
];

export function MainNav({ user }: MainNavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const rootData = useRouteLoaderData("root") as RootLoaderData | undefined;
  const notifications = rootData?.notifications;

  const totalAlerts =
    (notifications?.overdueOpen || 0) +
    (notifications?.dueSoon || 0) +
    (notifications?.recallDue || 0) +
    (notifications?.pendingApproval || 0) +
    (notifications?.unacknowledgedAlerts || 0);

  const closeMobile = () => setMobileMenuOpen(false);

  const isDashboardActive = location.pathname.startsWith("/dashboard");

  return (
    <nav className="border-b border-[var(--dx-border-muted,var(--axis-border-default))] bg-[var(--dx-surface-panel,var(--axis-surface-default))]" style={{ height: "var(--dx-nav-height)" }}>
      <div className="mx-auto flex h-full max-w-[1400px] items-center justify-between px-4 sm:px-6">
        {/* Left: Logo + Navigation */}
        <div className="flex items-center gap-8">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 text-[var(--axis-text-primary)]">
            <svg className="h-6 w-6 text-[var(--axis-text-brand)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
            <span className="text-base font-bold">DX</span>
          </Link>

          {/* Desktop nav — 3 menu items */}
          <div className="hidden items-center gap-1 sm:flex">
            {/* 1. 대시보드 — direct link */}
            <Link
              to="/dashboard"
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-colors duration-[var(--dx-transition-normal)]",
                isDashboardActive
                  ? "text-[var(--axis-text-primary)] font-semibold"
                  : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]",
              )}
            >
              대시보드
            </Link>

            {/* 2. 시장 탐색 — dropdown */}
            <NavDropdown label="시장 탐색" items={MARKET_ITEMS} />

            {/* 3. 사업 발굴 — dropdown */}
            <NavDropdown label="사업 발굴" items={BUSINESS_ITEMS} />
          </div>
        </div>

        {/* Right: Notification bell + Avatar + Mobile hamburger */}
        <div className="flex items-center gap-2">
          {/* Notification bell */}
          <Link to="/dashboard/alerts" className="relative">
            <IconButton label="알림" size="sm">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
            </IconButton>
            {totalAlerts > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--axis-button-destructive-bg-default)] px-1 text-[10px] font-bold text-white">
                {totalAlerts > 99 ? "99+" : totalAlerts}
              </span>
            )}
          </Link>

          {/* User avatar dropdown (desktop) */}
          <div className="hidden sm:block">
            <UserMenu user={user} />
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg p-2 text-[var(--axis-icon-secondary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-icon-default)] sm:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
            aria-expanded={mobileMenuOpen}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
              {mobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="border-t border-[var(--dx-border-muted,var(--axis-border-default))] bg-[var(--dx-surface-panel,var(--axis-surface-default))] sm:hidden dx-animate-slide-left">
          <div className="flex flex-col gap-1 px-4 py-3">
            {/* 대시보드 — direct link */}
            <Link
              to="/dashboard"
              onClick={closeMobile}
              className={cn(
                "rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isDashboardActive
                  ? "text-[var(--axis-text-primary)] font-semibold"
                  : "text-[var(--axis-text-secondary)] hover:text-[var(--axis-text-primary)]",
              )}
            >
              대시보드
            </Link>

            {/* 시장 탐색 — accordion */}
            <NavDropdown label="시장 탐색" items={MARKET_ITEMS} mobile onNavigate={closeMobile} />

            {/* 사업 발굴 — accordion */}
            <NavDropdown label="사업 발굴" items={BUSINESS_ITEMS} mobile onNavigate={closeMobile} />
          </div>

          {/* User section at bottom */}
          <UserMenu user={user} mobile onNavigate={closeMobile} />
        </div>
      )}
    </nav>
  );
}
