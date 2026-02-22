/**
 * 추출된 패턴 카드 컴포넌트 (Strategic Evolution F3)
 */

import { cn } from "~/lib/utils/cn";

interface PatternData {
  id: string;
  patternType: string;
  name: string;
  description?: string;
  frequency: number;
  confidenceScore?: number;
  validatedAt?: string;
  createdAt: string;
}

interface PatternCardProps {
  pattern: PatternData;
  onClick?: (id: string) => void;
}

const PATTERN_TYPE_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  success: { color: "#10B981", label: "성공", icon: "↑" },
  failure: { color: "#EF4444", label: "실패", icon: "↓" },
  decision: { color: "#3B82F6", label: "의사결정", icon: "◆" },
  workflow: { color: "#8B5CF6", label: "워크플로우", icon: "→" },
};

export default function PatternCard({ pattern, onClick }: PatternCardProps) {
  const config = PATTERN_TYPE_CONFIG[pattern.patternType] || PATTERN_TYPE_CONFIG.decision;

  return (
    <div
      className={cn(
        "rounded-lg border border-line-subtle p-4 transition-colors",
        "bg-surface-card",
        onClick && "cursor-pointer hover:border-fg-brand"
      )}
      onClick={onClick ? () => onClick(pattern.id) : undefined}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className="text-sm font-bold"
            style={{ color: config.color }}
          >
            {config.icon}
          </span>
          <span
            className="text-xs font-medium rounded px-1.5 py-0.5"
            style={{ color: config.color, backgroundColor: `${config.color}15` }}
          >
            {config.label}
          </span>
        </div>
        {pattern.confidenceScore !== undefined && (
          <span
            className={cn(
              "text-xs font-medium",
              pattern.confidenceScore >= 80
                ? "text-emerald-600 dark:text-emerald-400"
                : pattern.confidenceScore >= 50
                ? "text-amber-600 dark:text-amber-400"
                : "text-red-600 dark:text-red-400"
            )}
          >
            {pattern.confidenceScore}%
          </span>
        )}
      </div>

      {/* 이름 */}
      <h3 className="mt-2 text-sm font-medium text-fg">
        {pattern.name}
      </h3>

      {/* 설명 */}
      {pattern.description && (
        <p className="mt-1 text-xs text-fg-secondary line-clamp-2">
          {pattern.description}
        </p>
      )}

      {/* 메타 */}
      <div className="mt-3 flex items-center gap-3 text-xs text-fg-tertiary">
        <span>빈도: {pattern.frequency}회</span>
        {pattern.validatedAt && <span>검증됨</span>}
        <span>{new Date(pattern.createdAt).toLocaleDateString("ko-KR")}</span>
      </div>
    </div>
  );
}
