import type { ReactNode } from "react";
import { Link } from "@remix-run/react";
import { cn } from "~/lib/utils/cn";

interface BreadcrumbItem {
  label: string;
  to?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  className?: string;
}

export function PageHeader({ title, description, actions, breadcrumbs, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-8", className)}>
      {/* Breadcrumbs */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-2 flex items-center gap-1.5 text-xs text-[var(--axis-text-tertiary)]" aria-label="breadcrumb">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.label} className="flex items-center gap-1.5">
              {i > 0 && (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              )}
              {crumb.to ? (
                <Link to={crumb.to} className="hover:text-[var(--axis-text-primary)] transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-[var(--axis-text-secondary)]">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* Title + Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="font-bold text-[var(--axis-text-primary)]"
            style={{ fontSize: "var(--dx-text-page-title)" }}
          >
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-[var(--axis-text-secondary)]">{description}</p>
          )}
        </div>
        {actions && <div className="flex items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}
