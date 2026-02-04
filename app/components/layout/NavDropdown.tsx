import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "@remix-run/react";
import { cn } from "~/lib/utils/cn";

interface NavDropdownItem {
  to: string;
  label: string;
}

interface NavDropdownProps {
  label: string;
  items: NavDropdownItem[];
  /** Mobile mode renders as accordion instead of floating dropdown */
  mobile?: boolean;
  onNavigate?: () => void;
}

export function NavDropdown({ label, items, mobile, onNavigate }: NavDropdownProps) {
  // Track which pathname the menu was opened on — auto-close on navigation
  const [openAt, setOpenAt] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const open = openAt !== null && openAt === location.pathname;
  const setOpen = (v: boolean) => setOpenAt(v ? location.pathname : null);

  const isGroupActive = items.some((item) => location.pathname.startsWith(item.to));

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

  // ---- Mobile accordion ----
  if (mobile) {
    return (
      <div>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={cn(
            "flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
            isGroupActive
              ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-brand)]"
              : "text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-secondary)]",
          )}
          aria-expanded={open}
        >
          {label}
          <svg
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>
        {open && (
          <div className="ml-3 mt-1 flex flex-col gap-0.5 border-l-2 border-[var(--axis-border-default)] pl-3">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm transition-colors",
                  location.pathname.startsWith(item.to)
                    ? "font-medium text-[var(--axis-text-brand)]"
                    : "text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-primary)]",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ---- Desktop dropdown ----
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-1 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-[var(--dx-transition-normal)]",
          isGroupActive
            ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-brand)]"
            : "text-[var(--axis-text-tertiary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-primary)]",
        )}
        aria-expanded={open}
      >
        {label}
        <svg
          className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth="2.5"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="dx-panel dx-animate-scale-in absolute left-0 top-full z-50 mt-2 w-48 overflow-hidden">
          <div className="p-1.5">
            {items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center rounded-lg px-3 py-2 text-sm transition-colors",
                  location.pathname.startsWith(item.to)
                    ? "bg-[var(--axis-surface-brand)] font-medium text-[var(--axis-text-brand)]"
                    : "text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-secondary)] hover:text-[var(--axis-text-primary)]",
                )}
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
