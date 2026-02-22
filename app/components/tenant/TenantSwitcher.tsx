import { useState, useRef, useEffect } from "react";
import { useFetcher, useNavigate } from "@remix-run/react";

interface TenantOption {
  id: string;
  name: string;
  slug: string;
}

interface TenantSwitcherProps {
  currentTenantId: string;
  tenants: TenantOption[];
}

export function TenantSwitcher({ currentTenantId, tenants }: TenantSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const fetcher = useFetcher();

  const current = tenants.find((t) => t.id === currentTenantId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (tenants.length <= 1) {
    return (
      <span className="text-sm font-medium text-fg-secondary">
        {current?.name || "Discovery-X"}
      </span>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-fg-secondary hover:bg-surface-tertiary transition-colors"
      >
        {current?.name || "Discovery-X"}
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] rounded-md border border-surface-tertiary bg-surface-primary py-1 shadow-lg">
          {tenants.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setOpen(false);
                if (t.id !== currentTenantId) {
                  fetcher.submit(
                    { tenantId: t.id },
                    { method: "post", action: "/api/tenant/switch" }
                  );
                }
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                t.id === currentTenantId
                  ? "bg-surface-secondary font-medium text-fg"
                  : "text-fg-secondary hover:bg-surface-secondary"
              }`}
            >
              {t.name}
              {t.id === currentTenantId && (
                <span className="ml-auto text-xs text-fg-tertiary">current</span>
              )}
            </button>
          ))}
          <div className="my-1 border-t border-surface-tertiary" />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate("/onboarding");
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-fg-tertiary hover:bg-surface-secondary"
          >
            + New Organization
          </button>
        </div>
      )}
    </div>
  );
}
