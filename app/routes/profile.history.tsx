/**
 * /profile/history — Graph 버전 이력 + 롤백 UI
 *
 * - 이벤트 타임라인 리스트
 * - Diff 패널 (JSON-LD 변경 전/후 비교)
 * - 원클릭 롤백 (확인 다이얼로그)
 */

import { useState, useCallback } from "react";
import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useRevalidator, Link } from "@remix-run/react";
import { getDb } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { GraphStore } from "~/lib/graph/store";
import type { GraphEvent } from "~/lib/graph/types";
import { AppShell } from "~/components/layout/AppShell";
import { Card, CardContent } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { Badge } from "~/components/ui/Badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "~/components/ui/Dialog";

// ─── Loader ─────────────────────────────────────────────────────────────

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await requireUser(request, db, secret);

  const store = new GraphStore(db);
  const scopeId = String(user.id);
  const graph = await store.getByScopeId("user", scopeId);

  let events: GraphEvent[] = [];
  if (graph) {
    events = await store.getHistory(graph.id, 50);
  }

  return json({
    user: {
      id: String(user.id),
      email: user.email,
      name: user.name,
      role: user.role ?? undefined,
    },
    graphId: graph?.id ?? null,
    currentVersion: graph?.version ?? 0,
    events: events.map((e) => ({
      ...e,
      // Date → ISO string (직렬화)
      createdAt: e.createdAt instanceof Date ? e.createdAt.toISOString() : e.createdAt,
    })),
  });
}

// ─── 유틸 ────────────────────────────────────────────────────────────────

interface SerializedEvent {
  id: number;
  graphId: string;
  actorId: string;
  actorType: string;
  action: string;
  diffJson?: string;
  reason?: string;
  prevVersion?: number;
  newVersion?: number;
  createdAt: string;
}

const ACTION_STYLES: Record<string, { label: string; color: string }> = {
  create: {
    label: "생성",
    color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  update: {
    label: "수정",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  },
  rollback: {
    label: "롤백",
    color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  },
  delete: {
    label: "삭제",
    color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  },
  suggest: {
    label: "제안",
    color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${h}:${min}`;
}

/** 간단한 줄 단위 diff 비교 */
function computeLineDiff(
  prevText: string,
  nextText: string,
): Array<{ type: "same" | "added" | "removed"; line: string }> {
  const prevLines = prevText.split("\n");
  const nextLines = nextText.split("\n");
  const result: Array<{ type: "same" | "added" | "removed"; line: string }> = [];

  // 간단한 줄 비교 (LCS 대신 순차 비교)
  const prevSet = new Set(prevLines);
  const nextSet = new Set(nextLines);

  // removed: prev에만 있는 줄
  for (const line of prevLines) {
    if (!nextSet.has(line)) {
      result.push({ type: "removed", line });
    }
  }

  // next 줄 순서대로: 동일하면 same, prev에 없으면 added
  for (const line of nextLines) {
    if (prevSet.has(line)) {
      result.push({ type: "same", line });
    } else {
      result.push({ type: "added", line });
    }
  }

  return result;
}

// ─── 컴포넌트 ────────────────────────────────────────────────────────────

function DiffPanel({ diffJson }: { diffJson: string }) {
  let prev: unknown;
  let next: unknown;

  try {
    const parsed = JSON.parse(diffJson) as { prev: unknown; next: unknown };
    prev = parsed.prev;
    next = parsed.next;
  } catch {
    return (
      <p className="text-sm text-[var(--axis-text-secondary)]">
        Diff 데이터를 파싱할 수 없습니다.
      </p>
    );
  }

  const prevText = JSON.stringify(prev, null, 2);
  const nextText = JSON.stringify(next, null, 2);
  const lines = computeLineDiff(prevText, nextText);

  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-[var(--dx-border-subtle,var(--axis-border-default))] bg-[var(--axis-surface-secondary)] dark:bg-[var(--axis-surface-tertiary)]">
      <pre className="p-3 text-xs leading-5 font-mono">
        {lines.map((l, i) => {
          const bgClass =
            l.type === "added"
              ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-900 dark:text-emerald-300"
              : l.type === "removed"
                ? "bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-300"
                : "text-[var(--axis-text-secondary)]";
          const prefix =
            l.type === "added" ? "+" : l.type === "removed" ? "-" : " ";
          return (
            <div key={i} className={`${bgClass} px-2`}>
              <span className="select-none opacity-50 mr-2">{prefix}</span>
              {l.line}
            </div>
          );
        })}
      </pre>
    </div>
  );
}

function EventItem({
  event,
  currentVersion,
  graphId,
  onRollbackSuccess,
}: {
  event: SerializedEvent;
  currentVersion: number;
  graphId: string;
  onRollbackSuccess: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rolling, setRolling] = useState(false);

  const actionStyle = ACTION_STYLES[event.action] ?? {
    label: event.action,
    color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  };

  // 롤백 가능 여부: 현재 버전보다 낮은 버전 + newVersion이 있어야
  const canRollback =
    event.newVersion != null &&
    event.newVersion < currentVersion;

  const handleRollback = useCallback(async () => {
    if (!event.newVersion) return;
    setRolling(true);
    try {
      const res = await fetch(`/api/graph/${graphId}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetVersion: event.newVersion }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (data.success) {
        setDialogOpen(false);
        onRollbackSuccess();
      } else {
        alert(data.error ?? "롤백에 실패했습니다.");
      }
    } catch {
      alert("네트워크 오류가 발생했습니다.");
    } finally {
      setRolling(false);
    }
  }, [event.newVersion, graphId, onRollbackSuccess]);

  return (
    <Card className="transition-colors hover:border-[var(--axis-border-focus)]">
      <CardContent className="p-4">
        {/* 헤더 행 */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {/* 버전 배지 */}
            {event.newVersion != null && (
              <span className="flex-shrink-0 inline-flex items-center justify-center h-6 min-w-[2rem] px-1.5 rounded-md bg-[var(--axis-surface-tertiary)] text-xs font-mono font-medium text-[var(--axis-text-primary)]">
                v{event.newVersion}
              </span>
            )}

            {/* 액션 배지 */}
            <span
              className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${actionStyle.color}`}
            >
              {actionStyle.label}
            </span>

            {/* 이유 */}
            {event.reason && (
              <span className="truncate text-sm text-[var(--axis-text-secondary)]">
                {event.reason}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-[var(--axis-text-tertiary)]">
              {formatTime(event.createdAt)}
            </span>

            {event.diffJson && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded((v) => !v)}
              >
                {expanded ? "접기" : "Diff"}
              </Button>
            )}

            {canRollback && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDialogOpen(true)}
              >
                이 버전으로 롤백
              </Button>
            )}
          </div>
        </div>

        {/* Diff 패널 */}
        {expanded && event.diffJson && <DiffPanel diffJson={event.diffJson} />}

        {/* 롤백 확인 다이얼로그 */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>버전 롤백 확인</DialogTitle>
              <DialogDescription>
                v{event.newVersion} 상태로 롤백하시겠습니까? 현재 프로필이 해당
                시점의 상태로 변경됩니다.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="ghost">취소</Button>
              </DialogClose>
              <Button
                variant="destructive"
                loading={rolling}
                onClick={handleRollback}
              >
                롤백 실행
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ─── 페이지 ──────────────────────────────────────────────────────────────

export default function ProfileHistory() {
  const data = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();

  const handleRollbackSuccess = useCallback(() => {
    revalidator.revalidate();
  }, [revalidator]);

  return (
    <AppShell user={data.user} hideSidebar>
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--axis-text-primary)]">
            프로필 변경 이력
          </h1>
          <p className="mt-1 text-sm text-[var(--axis-text-secondary)]">
            Graph 버전 히스토리를 확인하고 이전 버전으로 롤백할 수 있습니다.
          </p>
        </div>
        <Link
          to="/profile"
          className="text-sm text-[var(--axis-text-secondary)] hover:text-[var(--axis-text-primary)] hover:underline"
        >
          ← 프로필로 돌아가기
        </Link>
      </div>

      {/* 현재 버전 정보 */}
      {data.currentVersion > 0 && (
        <div className="mt-4 flex items-center gap-2 text-sm text-[var(--axis-text-secondary)]">
          <span>현재 버전:</span>
          <Badge variant="subtle">v{data.currentVersion}</Badge>
          <span>·</span>
          <span>총 {data.events.length}건의 변경 기록</span>
        </div>
      )}

      {/* 이벤트 리스트 */}
      <div className="mt-6 space-y-3">
        {data.events.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-[var(--axis-text-secondary)]">
              아직 변경 이력이 없습니다. 프로필을 편집하면 이력이 기록됩니다.
            </CardContent>
          </Card>
        ) : (
          data.events.map((event) => (
            <EventItem
              key={event.id}
              event={event as unknown as SerializedEvent}
              currentVersion={data.currentVersion}
              graphId={data.graphId!}
              onRollbackSuccess={handleRollbackSuccess}
            />
          ))
        )}
      </div>
    </AppShell>
  );
}
