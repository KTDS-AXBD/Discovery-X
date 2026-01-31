import { useState } from "react";
import { Form, Link, useRouteLoaderData } from "@remix-run/react";
import { Button } from "~/components/ui/Button";

interface MainNavProps {
  user: { id: string; email: string; name: string };
}

interface RootLoaderData {
  notifications: {
    overdueOpen: number;
    dueSoon: number;
    recallDue: number;
    pendingApproval: number;
  } | null;
}

export function MainNav({ user }: MainNavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const rootData = useRouteLoaderData("root") as RootLoaderData | undefined;
  const notifications = rootData?.notifications;

  const reviewBadge =
    notifications && (notifications.overdueOpen + notifications.dueSoon) > 0
      ? notifications.overdueOpen + notifications.dueSoon
      : 0;
  const recallBadge = notifications?.recallDue || 0;
  const approvalBadge = notifications?.pendingApproval || 0;

  const totalAlerts = reviewBadge + recallBadge + approvalBadge;

  const navLinks = (
    <>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-[var(--axis-text-tertiary)] hover:border-[var(--axis-border-secondary)] hover:text-[var(--axis-text-primary)]"
        onClick={() => setMobileMenuOpen(false)}
      >
        Dashboard
        {totalAlerts > 0 && (
          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--axis-button-destructive-bg-default)] px-1.5 text-xs font-bold text-white">
            {totalAlerts}
          </span>
        )}
      </Link>
      <Link
        to="/radar"
        className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-[var(--axis-text-tertiary)] hover:border-[var(--axis-border-secondary)] hover:text-[var(--axis-text-primary)]"
        onClick={() => setMobileMenuOpen(false)}
      >
        Radar
      </Link>
      <Link
        to="/settings"
        className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-[var(--axis-text-tertiary)] hover:border-[var(--axis-border-secondary)] hover:text-[var(--axis-text-primary)]"
        onClick={() => setMobileMenuOpen(false)}
      >
        Settings
      </Link>
    </>
  );

  return (
    <nav className="border-b border-[var(--axis-border-default)] bg-[var(--axis-surface-default)]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          <div className="flex">
            <Link
              to="/"
              className="flex items-center text-xl font-bold text-[var(--axis-text-primary)]"
            >
              Discovery-X
            </Link>
            <div className="ml-10 hidden space-x-8 sm:flex">
              {navLinks}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="hidden text-sm text-[var(--axis-text-secondary)] sm:inline">{user.name}</span>
            <Form method="post" action="/logout">
              <Button type="submit" variant="secondary" size="sm">
                로그아웃
              </Button>
            </Form>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 text-[var(--axis-icon-secondary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-icon-default)] sm:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "메뉴 닫기" : "메뉴 열기"}
              aria-expanded={mobileMenuOpen}
            >
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" aria-hidden="true">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>
      {mobileMenuOpen && (
        <div className="border-t border-[var(--axis-border-default)] sm:hidden">
          <div className="flex flex-col space-y-1 px-4 pb-3 pt-2">
            {navLinks}
          </div>
          <div className="border-t border-[var(--axis-border-default)] px-4 pb-3 pt-2">
            <p className="text-sm text-[var(--axis-text-secondary)]">{user.name}</p>
          </div>
        </div>
      )}
    </nav>
  );
}
