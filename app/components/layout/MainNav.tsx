import { useState } from "react";
import { Form, Link, useRouteLoaderData } from "@remix-run/react";
import { Button } from "~/components/ui/Button";
import { ToggleButton } from "~/components/ui/ToggleButton";
import { useTheme } from "@axis-ds/theme";

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

export function MainNav({ user }: MainNavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const rootData = useRouteLoaderData("root") as RootLoaderData | undefined;
  const notifications = rootData?.notifications;
  const isAdmin = user.role === "admin";

  const reviewBadge =
    notifications && (notifications.overdueOpen + notifications.dueSoon) > 0
      ? notifications.overdueOpen + notifications.dueSoon
      : 0;
  const recallBadge = notifications?.recallDue || 0;
  const approvalBadge = notifications?.pendingApproval || 0;

  const systemAlerts = notifications?.unacknowledgedAlerts || 0;
  const totalAlerts = reviewBadge + recallBadge + approvalBadge + systemAlerts;

  const navLinks = (
    <>
      <Link
        to="/dashboard"
        className="inline-flex items-center gap-1 border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-[var(--axis-text-tertiary)] hover:border-[var(--axis-border-secondary)] hover:text-[var(--axis-text-primary)]"
        onClick={() => setMobileMenuOpen(false)}
      >
        현황판
        {totalAlerts > 0 && (
          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-[var(--axis-button-destructive-bg-default)] px-1.5 text-xs font-bold text-white">
            {totalAlerts}
          </span>
        )}
      </Link>
      <Link
        to="/venture"
        className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-[var(--axis-text-tertiary)] hover:border-[var(--axis-border-secondary)] hover:text-[var(--axis-text-primary)]"
        onClick={() => setMobileMenuOpen(false)}
      >
        사업 탐색
      </Link>
      <Link
        to="/methods"
        className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-[var(--axis-text-tertiary)] hover:border-[var(--axis-border-secondary)] hover:text-[var(--axis-text-primary)]"
        onClick={() => setMobileMenuOpen(false)}
      >
        방법론
      </Link>
      <Link
        to="/evidence/duplicates"
        className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-[var(--axis-text-tertiary)] hover:border-[var(--axis-border-secondary)] hover:text-[var(--axis-text-primary)]"
        onClick={() => setMobileMenuOpen(false)}
      >
        맥락 그래프
      </Link>
      <Link
        to="/radar"
        className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-[var(--axis-text-tertiary)] hover:border-[var(--axis-border-secondary)] hover:text-[var(--axis-text-primary)]"
        onClick={() => setMobileMenuOpen(false)}
      >
        레이더
      </Link>
      <Link
        to="/docs"
        className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-[var(--axis-text-tertiary)] hover:border-[var(--axis-border-secondary)] hover:text-[var(--axis-text-primary)]"
        onClick={() => setMobileMenuOpen(false)}
      >
        문서
      </Link>
      {isAdmin && (
        <Link
          to="/settings"
          className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-[var(--axis-text-tertiary)] hover:border-[var(--axis-border-secondary)] hover:text-[var(--axis-text-primary)]"
          onClick={() => setMobileMenuOpen(false)}
        >
          설정
        </Link>
      )}
      {isAdmin && (
        <Link
          to="/admin/users"
          className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-[var(--axis-text-tertiary)] hover:border-[var(--axis-border-secondary)] hover:text-[var(--axis-text-primary)]"
          onClick={() => setMobileMenuOpen(false)}
        >
          관리
        </Link>
      )}
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
            <ToggleButton
              pressed={resolvedTheme === "dark"}
              onPressedChange={(pressed) => setTheme(pressed ? "dark" : "light")}
              aria-label={resolvedTheme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
            >
              {resolvedTheme === "dark" ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
                </svg>
              )}
            </ToggleButton>
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
