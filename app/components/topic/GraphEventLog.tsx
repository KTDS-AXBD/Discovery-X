import { useFetcher } from "@remix-run/react";
import { useEffect } from "react";

interface EventEntry {
  id: number;
  graphId: string;
  actorId: string;
  actorType: string;
  action: string;
  reason?: string | null;
  prevVersion?: number | null;
  newVersion?: number | null;
  createdAt: string;
}

function formatDate(ts: string): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

const actionStyles: Record<string, string> = {
  create:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  update:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  delete: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  suggest:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  rollback:
    "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  approve:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  reject:
    "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400",
};

function actionBadgeClass(action: string): string {
  return `inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${actionStyles[action] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"}`;
}

export function GraphEventLog({ topicId }: { topicId: string }) {
  const fetcher = useFetcher<{ events: EventEntry[] }>();

  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) {
      fetcher.load(`/api/topics/${topicId}/events`);
    }
  }, [topicId]); // eslint-disable-line react-hooks/exhaustive-deps

  const events = fetcher.data?.events ?? [];

  if (fetcher.state === "loading") {
    return (
      <p className="text-sm text-fg-tertiary">
        이력을 불러오는 중...
      </p>
    );
  }

  if (events.length === 0) {
    return (
      <p className="text-sm text-fg-tertiary">
        기록된 이력이 없습니다
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((e) => (
        <div key={e.id} className="flex items-start gap-3 text-xs">
          <span className="whitespace-nowrap text-fg-tertiary">
            {formatDate(e.createdAt)}
          </span>
          <span className={actionBadgeClass(e.action)}>{e.action}</span>
          <span className="text-fg-secondary">
            {e.actorType}:{e.actorId}
            {e.reason ? ` \u2014 ${e.reason}` : ""}
            {e.prevVersion != null && e.newVersion != null
              ? ` (v${e.prevVersion}\u2192v${e.newVersion})`
              : ""}
          </span>
        </div>
      ))}
    </div>
  );
}
