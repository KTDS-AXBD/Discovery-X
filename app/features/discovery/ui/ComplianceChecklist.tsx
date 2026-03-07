/**
 * 규제 준수 체크리스트 컴포넌트 (Strategic Evolution F5)
 */

import { cn } from "~/lib/utils/cn";
import { Progress } from "~/components/ui/Progress";

interface ComplianceCheck {
  requirement: string;
  ruleType: string;
  status: "pass" | "fail" | "warning";
  suggestion?: string;
}

interface ComplianceChecklistProps {
  checks: ComplianceCheck[];
  industry?: string;
  overallCompliance?: number;
}

const STATUS_CONFIG = {
  pass: {
    icon: "✓",
    bgColor: "bg-emerald-500/10",
    textColor: "text-emerald-600 dark:text-emerald-400",
    label: "충족",
  },
  fail: {
    icon: "✕",
    bgColor: "bg-red-500/10",
    textColor: "text-red-600 dark:text-red-400",
    label: "미충족",
  },
  warning: {
    icon: "!",
    bgColor: "bg-amber-500/10",
    textColor: "text-amber-600 dark:text-amber-400",
    label: "주의",
  },
};

export default function ComplianceChecklist({
  checks,
  industry,
  overallCompliance,
}: ComplianceChecklistProps) {
  const passCount = checks.filter((c) => c.status === "pass").length;
  const failCount = checks.filter((c) => c.status === "fail").length;
  const warnCount = checks.filter((c) => c.status === "warning").length;

  return (
    <div className="space-y-4">
      {/* 요약 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {industry && (
            <span className="text-sm text-fg-secondary">
              {industry}
            </span>
          )}
          <div className="flex gap-2 text-xs">
            <span className="text-emerald-600 dark:text-emerald-400">{passCount} 충족</span>
            {failCount > 0 && (
              <span className="text-red-600 dark:text-red-400">{failCount} 미충족</span>
            )}
            {warnCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400">{warnCount} 주의</span>
            )}
          </div>
        </div>
        {overallCompliance !== undefined && (
          <div className="flex items-center gap-2">
            <Progress
              value={overallCompliance}
              variant={overallCompliance >= 80 ? "success" : overallCompliance >= 50 ? "warning" : "destructive"}
              size="sm"
              className="w-24"
            />
            <span className="text-sm font-medium text-fg">
              {overallCompliance}%
            </span>
          </div>
        )}
      </div>

      {/* 체크리스트 */}
      <div className="space-y-1">
        {checks.map((check, i) => {
          const config = STATUS_CONFIG[check.status];
          return (
            <div
              key={i}
              className={cn(
                "flex items-start gap-3 rounded-md px-3 py-2",
                config.bgColor
              )}
            >
              <span className={cn("mt-0.5 text-sm font-bold", config.textColor)}>
                {config.icon}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-fg">
                    {check.requirement}
                  </span>
                  <span className="text-xs text-fg-tertiary">
                    ({check.ruleType})
                  </span>
                </div>
                {check.suggestion && (
                  <p className="mt-0.5 text-xs text-fg-secondary">
                    {check.suggestion}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {checks.length === 0 && (
        <div className="py-6 text-center text-sm text-fg-tertiary">
          체크 항목이 없습니다.
        </div>
      )}
    </div>
  );
}
