import * as React from "react";

import {
  Alert,
  AlertDescription,
  AlertTitle,
  alertVariants,
} from "@axis-ds/ui-react";

import { cn } from "~/lib/utils/cn";

// DS Alert에 없는 purple variant 스타일
const PURPLE_CLASSES =
  "bg-[var(--axis-purple-100)] text-[var(--axis-purple-900)] border-[var(--axis-purple-200)]";

type AlertVariant = "default" | "info" | "success" | "warning" | "destructive" | "purple";

export interface AlertBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
}

/**
 * DS Alert 기반 AlertBanner 래퍼.
 * 기존 API 유지 + purple variant 확장.
 */
const AlertBanner = React.forwardRef<HTMLDivElement, AlertBannerProps>(
  ({ className, variant = "default", title, children, ...props }, ref) => {
    // purple은 DS에 없으므로 default + className 오버라이드
    const dsVariant = variant === "purple" ? "default" : variant;
    const purpleOverride = variant === "purple" ? PURPLE_CLASSES : undefined;

    return (
      <Alert
        ref={ref}
        variant={dsVariant}
        className={cn(purpleOverride, className)}
        {...props}
      >
        {title && <AlertTitle>{title}</AlertTitle>}
        {children && <AlertDescription>{children}</AlertDescription>}
      </Alert>
    );
  }
);
AlertBanner.displayName = "AlertBanner";

// 하위 호환: alertBannerVariants → DS alertVariants re-export
const alertBannerVariants = alertVariants;

export { AlertBanner, alertBannerVariants, AlertTitle, AlertDescription };
