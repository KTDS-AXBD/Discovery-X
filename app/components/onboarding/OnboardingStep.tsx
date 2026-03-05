import type { ReactNode } from "react";

interface OnboardingStepProps {
  stepNumber: number;
  title: string;
  children: ReactNode;
}

export function OnboardingStep({ stepNumber, title, children }: OnboardingStepProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--axis-color-primary)] text-xs font-bold text-white">
          {stepNumber}
        </span>
        <h3 className="text-base font-semibold text-[var(--axis-text-primary)]">
          {title}
        </h3>
      </div>
      <div className="text-sm text-[var(--axis-text-secondary)] leading-relaxed">
        {children}
      </div>
    </div>
  );
}
