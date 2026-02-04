import { useState, useRef, useEffect } from "react";
import { Form, Link, useLocation } from "@remix-run/react";
import { useTheme } from "@axis-ds/theme";
import { cn } from "~/lib/utils/cn";
import { Badge } from "~/components/ui/Badge";

interface UserMenuProps {
  user: { id: string; email: string; name: string; role?: string };
  /** Mobile mode renders inline list instead of floating dropdown */
  mobile?: boolean;
  onNavigate?: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  GATEKEEPER: "Gatekeeper",
  USER: "User",
  PENDING: "Pending",
};

const ROLE_VARIANTS: Record<string, "default" | "info" | "success" | "warning" | "destructive"> = {
  ADMIN: "destructive",
  GATEKEEPER: "info",
  USER: "default",
  PENDING: "warning",
};

export function UserMenu({ user, mobile, onNavigate }: UserMenuProps) {
  // Track which pathname the menu was opened on — auto-close on navigation
  const [openAt, setOpenAt] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const { resolvedTheme, setTheme } = useTheme();
  const location = useLocation();

  const open = openAt !== null && openAt === location.pathname;
  const setOpen = (v: boolean) => setOpenAt(v ? location.pathname : null);

  const role = user.role || "USER";
  const initial = user.name.charAt(0).toUpperCase();

  // Close on outside click (desktop only)
  useEffect(() => {
    if (mobile || !open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpenAt(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open, mobile]);

  const menuItems = [
    { to: "/docs", label: "문서", show: true },
    { to: "/settings", label: "설정", show: true },
    { to: "/admin/users", label: "관리", show: role === "ADMIN" },
  ];

  // ---- Mobile: inline section ----
  if (mobile) {
    return (
      <div className="border-t border-[var(--axis-border-default)] px-4 py-3">
        {/* User info */}
        <div className="flex items-center gap-3 pb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--axis-surface-brand)] text-xs font-bold text-[var(--axis-text-brand)]">
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-[var(--axis-text-primary)]">{user.name}</p>
            <div className="flex items-center gap-1.5">
              <p className="truncate text-xs text-[var(--axis-text-tertiary)]">{user.email}</p>
              <Badge variant={ROLE_VARIANTS[role]} className="text-[10px] px-1.5 py-0">{ROLE_LABELS[role]}</Badge>
            </div>
          </div>
        </div>
        {/* Links */}
        <div className="flex flex-col gap-0.5">
          {menuItems.filter((i) => i.show).map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={onNavigate}
              className={cn(
                "rounded-lg px-3 py-2 text-sm transition-colors",
                location.pathname.startsWith(item.to)
                  ? "font-medium text-[var(--axis-text-brand)]"
                  : "text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-secondary)]",
              )}
            >
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => {
              setTheme(resolvedTheme === "dark" ? "light" : "dark");
              onNavigate?.();
            }}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-secondary)]"
          >
            {resolvedTheme === "dark" ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>
            )}
            {resolvedTheme === "dark" ? "라이트 모드" : "다크 모드"}
          </button>
          <Form method="post" action="/logout">
            <button
              type="submit"
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--axis-text-error)] hover:bg-[var(--axis-surface-secondary)]"
            >
              로그아웃
            </button>
          </Form>
        </div>
      </div>
    );
  }

  // ---- Desktop: avatar + floating dropdown ----
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--axis-surface-brand)] text-xs font-bold text-[var(--axis-text-brand)] transition-opacity hover:opacity-80"
        aria-label="사용자 메뉴"
        aria-expanded={open}
      >
        {initial}
      </button>

      {open && (
        <div className="dx-panel dx-animate-scale-in absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden">
          {/* Header: name + role */}
          <div className="border-b border-[var(--dx-card-border-subtle)] px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-[var(--axis-text-primary)]">{user.name}</p>
              <Badge variant={ROLE_VARIANTS[role]} className="text-[10px] px-1.5 py-0">{ROLE_LABELS[role]}</Badge>
            </div>
            <p className="mt-0.5 text-xs text-[var(--axis-text-tertiary)]">{user.email}</p>
          </div>

          {/* Menu items */}
          <div className="p-1.5">
            {menuItems.filter((i) => i.show).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                  location.pathname.startsWith(item.to)
                    ? "bg-[var(--axis-surface-brand)] font-medium text-[var(--axis-text-brand)]"
                    : "text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-secondary)]",
                )}
              >
                {item.to === "/docs" && (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                )}
                {item.to === "/settings" && (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                )}
                {item.to === "/admin/users" && (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18" /></svg>
                )}
                {item.label}
              </Link>
            ))}

            {/* Divider */}
            <div className="my-1 border-t border-[var(--dx-card-border-subtle)]" />

            {/* Theme toggle */}
            <button
              type="button"
              onClick={() => {
                setTheme(resolvedTheme === "dark" ? "light" : "dark");
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-secondary)]"
            >
              {resolvedTheme === "dark" ? (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" /></svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" /></svg>
              )}
              {resolvedTheme === "dark" ? "라이트 모드" : "다크 모드"}
            </button>

            {/* Logout */}
            <Form method="post" action="/logout">
              <button
                type="submit"
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--axis-text-error)] hover:bg-[var(--axis-surface-secondary)]"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" /></svg>
                로그아웃
              </button>
            </Form>
          </div>
        </div>
      )}
    </div>
  );
}
