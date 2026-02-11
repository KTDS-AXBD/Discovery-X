import { Link, useLocation, useRouteLoaderData } from "@remix-run/react";
import { useTheme } from "@axis-ds/theme";
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
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    to: "/ideas",
    label: "아이디어",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 001.5-.189m-1.5.189a6.01 6.01 0 01-1.5-.189m3.75 7.478a12.06 12.06 0 01-4.5 0m3.75 2.383a14.406 14.406 0 01-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 10-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
      </svg>
    ),
  },
  {
    to: "/proposals",
    label: "사업제안",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    to: "/ontology",
    label: "온톨로지",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.185 2.25 2.25 0 00-3.933 2.185z" />
      </svg>
    ),
  },
];

export function TopNav({ user }: TopNavProps) {
  const location = useLocation();
  const rootData = useRouteLoaderData("root") as RootLoaderData | undefined;
  const tenant = rootData?.tenant;
  const tenantList = rootData?.tenantList ?? [];
  const { toggle } = useSidebar();
  const { resolvedTheme, setTheme } = useTheme();

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

          {/* Tenant Switcher — only show when multiple tenants exist */}
          {tenant && tenantList.length > 1 && (
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

        {/* Right: theme toggle + settings + user name */}
        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="rounded-md p-1.5 text-[var(--axis-icon-secondary)] transition-colors hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-icon-default)]"
            aria-label={resolvedTheme === "dark" ? "라이트 모드" : "다크 모드"}
          >
            {resolvedTheme === "dark" ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>
            )}
          </button>

          {/* Settings */}
          <Link
            to="/settings"
            className="rounded-md p-1.5 text-[var(--axis-icon-secondary)] transition-colors hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-icon-default)]"
            aria-label="설정"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
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
