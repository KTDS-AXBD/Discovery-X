import { useState } from "react";
import { Form, Link, useRouteLoaderData } from "@remix-run/react";

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

  const navLinks = (
    <>
      <Link
        to="/discoveries"
        className="inline-flex items-center gap-1 border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
        onClick={() => setMobileMenuOpen(false)}
      >
        Discoveries
        {approvalBadge > 0 && (
          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-purple-500 px-1.5 text-xs font-bold text-white">
            {approvalBadge}
          </span>
        )}
      </Link>
      <Link
        to="/review"
        className="inline-flex items-center gap-1 border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
        onClick={() => setMobileMenuOpen(false)}
      >
        Weekly Review
        {reviewBadge > 0 && (
          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
            {reviewBadge}
          </span>
        )}
      </Link>
      <Link
        to="/recall"
        className="inline-flex items-center gap-1 border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
        onClick={() => setMobileMenuOpen(false)}
      >
        Recall Queue
        {recallBadge > 0 && (
          <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-blue-500 px-1.5 text-xs font-bold text-white">
            {recallBadge}
          </span>
        )}
      </Link>
      <Link
        to="/metrics"
        className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
        onClick={() => setMobileMenuOpen(false)}
      >
        Metrics
      </Link>
      <Link
        to="/radar"
        className="inline-flex items-center border-b-2 border-transparent px-1 pt-1 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
        onClick={() => setMobileMenuOpen(false)}
      >
        Radar
      </Link>
    </>
  );

  return (
    <nav className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          <div className="flex">
            <Link
              to="/"
              className="flex items-center text-xl font-bold text-gray-900"
            >
              Discovery-X
            </Link>
            {/* Desktop nav */}
            <div className="ml-10 hidden space-x-8 sm:flex">
              {navLinks}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <span className="hidden text-sm text-gray-700 sm:inline">{user.name}</span>
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200"
              >
                로그아웃
              </button>
            </Form>
            {/* Mobile hamburger */}
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-500 sm:hidden"
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
      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="border-t border-gray-200 sm:hidden">
          <div className="flex flex-col space-y-1 px-4 pb-3 pt-2">
            {navLinks}
          </div>
          <div className="border-t border-gray-200 px-4 pb-3 pt-2">
            <p className="text-sm text-gray-700">{user.name}</p>
          </div>
        </div>
      )}
    </nav>
  );
}
