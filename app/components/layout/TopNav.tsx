import { Link, useLocation, useRouteLoaderData } from "@remix-run/react";
import { cn } from "~/lib/utils/cn";
import { useSidebar } from "~/lib/context/sidebar-context";
import { TenantSwitcher } from "~/components/tenant/TenantSwitcher";

interface TopNavProps {
  user: { id: string; email: string; name: string; role?: string };
}

interface TenantInfo {
  id: string;
  name: string;
  slug: string;
}

interface RootLoaderData {
  notifications: {
    overdueOpen: number;
    dueSoon: number;
    recallDue: number;
    pendingApproval: number;
    unacknowledgedAlerts: number;
  } | null;
  tenant: TenantInfo | null;
  tenantList: TenantInfo[];
}

const NAV_TABS = [
  {
    to: "/dashboard",
    label: "대시보드",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    to: "/radar",
    label: "시장 탐색",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
  },
  {
    to: "/discoveries",
    label: "사업 발굴",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
      </svg>
    ),
  },
  {
    to: "/settings",
    label: "수집 관리",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
      </svg>
    ),
  },
];

export function TopNav({ user }: TopNavProps) {
  const location = useLocation();
  const rootData = useRouteLoaderData("root") as RootLoaderData | undefined;
  const notifications = rootData?.notifications;
  const tenant = rootData?.tenant;
  const tenantList = rootData?.tenantList ?? [];
  const { toggle } = useSidebar();

  const totalAlerts =
    (notifications?.overdueOpen || 0) +
    (notifications?.dueSoon || 0) +
    (notifications?.recallDue || 0) +
    (notifications?.pendingApproval || 0) +
    (notifications?.unacknowledgedAlerts || 0);

  return (
    <nav
      className="shrink-0 border-b border-[var(--dx-border-muted,var(--axis-border-default))] bg-[var(--dx-surface-panel,var(--axis-surface-default))]"
      style={{ height: "var(--dx-nav-height)" }}
    >
      <div className="flex h-full items-center justify-between px-4">
        {/* Left: hamburger (mobile) + Logo + Tabs */}
        <div className="flex items-center gap-6">
          {/* Mobile hamburger */}
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-lg p-1.5 text-[var(--axis-icon-secondary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-icon-default)] sm:hidden"
            onClick={toggle}
            aria-label="사이드바 토글"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 text-[var(--axis-text-primary)]">
            <svg className="h-5 w-5 text-[var(--axis-text-brand)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
            </svg>
            <span className="text-sm font-bold tracking-tight">Discovery-X</span>
          </Link>

          {/* Tenant Switcher */}
          {tenant && (
            <>
              <span className="hidden text-[var(--axis-text-tertiary)] sm:inline">/</span>
              <TenantSwitcher currentTenantId={tenant.id} tenants={tenantList} />
            </>
          )}

          {/* Desktop tab navigation */}
          <div className="hidden items-center gap-1 sm:flex">
            {NAV_TABS.map((tab) => {
              const isActive = location.pathname === tab.to || location.pathname.startsWith(tab.to + "/");
              return (
                <Link
                  key={tab.to}
                  to={tab.to}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors duration-[var(--dx-transition-normal)]",
                    isActive
                      ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-brand)]"
                      : "text-[var(--axis-text-tertiary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-primary)]",
                  )}
                >
                  {tab.icon}
                  <span className="hidden md:inline">{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right: notification bell + settings + user name */}
        <div className="flex items-center gap-3">
          {/* Notification bell */}
          <Link
            to="/dashboard/alerts"
            className="relative rounded-md p-1.5 text-[var(--axis-icon-secondary)] transition-colors hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-icon-default)]"
            aria-label="알림"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
            {totalAlerts > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--axis-button-destructive-bg-default)] px-1 text-[10px] font-bold text-white">
                {totalAlerts > 99 ? "99+" : totalAlerts}
              </span>
            )}
          </Link>

          {/* User name */}
          <span className="hidden text-sm text-[var(--axis-text-secondary)] sm:inline">
            {user.name}
          </span>
        </div>
      </div>
    </nav>
  );
}
