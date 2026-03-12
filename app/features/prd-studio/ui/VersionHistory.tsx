import { useState } from "react";

interface VersionHistoryProps {
  /** @deprecated 사용되지 않음 — 호출처 수정 후 제거 */
  prdId?: string;
  versions: Array<{
    id: string;
    version: number;
    changeNote: string | null;
    changedBy: string;
    createdAt: string | number | null;
  }>;
}

import { formatDateTime as formatDateTimeKST } from "~/lib/format-date";

function formatDateTime(ts: string | number | null) {
  if (!ts) return "-";
  const iso = typeof ts === "number" ? new Date(ts * 1000).toISOString() : ts;
  return formatDateTimeKST(iso);
}

export function VersionHistory({ versions }: VersionHistoryProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <span className="text-sm font-semibold text-fg">
          버전 기록 ({versions.length}개)
        </span>
        <span className="text-xs text-fg-tertiary">{open ? "접기" : "펼치기"}</span>
      </button>
      {open && (
        <div className="border-t border-border px-4 pb-4">
          {versions.length > 0 ? (
            <div className="divide-y divide-border">
              {versions.map((v) => (
                <div key={v.id} className="py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-fg">v{v.version}</span>
                    <span className="text-xs text-fg-tertiary">{formatDateTime(v.createdAt)}</span>
                  </div>
                  {v.changeNote && (
                    <p className="mt-1 text-xs text-fg-secondary">{v.changeNote}</p>
                  )}
                  {!v.changeNote && v.version === 1 && (
                    <p className="mt-1 text-xs text-fg-tertiary">(최초 생성)</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="py-3 text-sm text-fg-tertiary">아직 버전 기록이 없어요.</p>
          )}
        </div>
      )}
    </div>
  );
}
