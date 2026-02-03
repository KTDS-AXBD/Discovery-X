/**
 * Theme Cluster 컴포넌트
 *
 * 테마별 기회 분포 시각화
 */

import { Badge } from "~/components/ui/Badge";
import type { VdOpportunity } from "../types";

interface ThemeData {
  id: string;
  name: string;
  count: number;
  depthScore?: number;
  opportunities?: VdOpportunity[];
}

interface ThemeClusterProps {
  themes: ThemeData[];
  onThemeClick?: (themeId: string) => void;
  className?: string;
}

export function ThemeCluster({ themes, onThemeClick, className = "" }: ThemeClusterProps) {
  if (themes.length === 0) {
    return (
      <div className={`text-sm text-[var(--axis-text-tertiary)] ${className}`}>
        테마가 없습니다.
      </div>
    );
  }

  const maxCount = Math.max(...themes.map((t) => t.count), 1);

  return (
    <div className={`space-y-3 ${className}`}>
      {themes.map((theme) => {
        const widthPercent = (theme.count / maxCount) * 100;

        return (
          <div
            key={theme.id}
            className={`group ${onThemeClick ? "cursor-pointer" : ""}`}
            onClick={() => onThemeClick?.(theme.id)}
          >
            <div className="mb-1 flex items-center justify-between">
              <span
                className={`text-sm font-medium text-[var(--axis-text-primary)] ${
                  onThemeClick ? "group-hover:underline" : ""
                }`}
              >
                {theme.name}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-[var(--axis-text-tertiary)]">{theme.count}개</span>
                {theme.depthScore !== undefined && theme.depthScore > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    깊이 {theme.depthScore}
                  </Badge>
                )}
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-[var(--axis-surface-tertiary)]">
              <div
                className="h-full rounded-full bg-[var(--axis-surface-brand)] transition-all group-hover:bg-[var(--axis-badge-info-bg)]"
                style={{ width: `${widthPercent}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface ThemeTagsProps {
  themes: Array<{ id: string; name: string }>;
  selectedId?: string;
  onSelect?: (themeId: string | undefined) => void;
  className?: string;
}

export function ThemeTags({ themes, selectedId, onSelect, className = "" }: ThemeTagsProps) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {onSelect && (
        <button
          type="button"
          onClick={() => onSelect(undefined)}
          className={`rounded-full px-3 py-1 text-sm transition-colors ${
            !selectedId
              ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-on-brand)]"
              : "bg-[var(--axis-surface-secondary)] text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-tertiary)]"
          }`}
        >
          전체
        </button>
      )}
      {themes.map((theme) => (
        <button
          key={theme.id}
          type="button"
          onClick={() => onSelect?.(theme.id)}
          className={`rounded-full px-3 py-1 text-sm transition-colors ${
            selectedId === theme.id
              ? "bg-[var(--axis-surface-brand)] text-[var(--axis-text-on-brand)]"
              : "bg-[var(--axis-surface-secondary)] text-[var(--axis-text-secondary)] hover:bg-[var(--axis-surface-tertiary)]"
          }`}
        >
          {theme.name}
        </button>
      ))}
    </div>
  );
}

interface ThemeTreemapProps {
  themes: ThemeData[];
  className?: string;
}

export function ThemeTreemap({ themes, className = "" }: ThemeTreemapProps) {
  const totalCount = themes.reduce((sum, t) => sum + t.count, 0);

  if (totalCount === 0) {
    return (
      <div className={`text-sm text-[var(--axis-text-tertiary)] ${className}`}>
        데이터가 없습니다.
      </div>
    );
  }

  // 간단한 treemap 레이아웃 (flex 기반)
  return (
    <div className={`flex h-40 gap-1 ${className}`}>
      {themes
        .filter((t) => t.count > 0)
        .sort((a, b) => b.count - a.count)
        .map((theme, index) => {
          const percentage = (theme.count / totalCount) * 100;
          const colors = [
            "bg-[var(--axis-badge-info-bg)]",
            "bg-[var(--axis-badge-success-bg)]",
            "bg-[var(--axis-badge-warning-bg)]",
            "bg-[var(--axis-badge-purple-bg)]",
            "bg-[var(--axis-surface-brand)]",
          ];
          const color = colors[index % colors.length];

          return (
            <div
              key={theme.id}
              className={`flex flex-col items-center justify-center rounded-md p-2 ${color}`}
              style={{ flex: percentage }}
              title={`${theme.name}: ${theme.count}개 (${percentage.toFixed(0)}%)`}
            >
              <span className="text-xs font-medium text-[var(--axis-text-primary)] line-clamp-2 text-center">
                {theme.name}
              </span>
              <span className="text-sm font-bold text-[var(--axis-text-primary)]">
                {theme.count}
              </span>
            </div>
          );
        })}
    </div>
  );
}
