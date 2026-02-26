import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData, useSearchParams } from "@remix-run/react";
import { eq } from "drizzle-orm";

import { getDb } from "~/db";
import { tenantMembers } from "~/db/schema";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { SignalService } from "~/lib/services";
import { cn } from "~/lib/utils/cn";

// ─── Helpers ────────────────────────────────────────────────────────────────
function formatDate(raw: string): string {
  const date = new Date(raw);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getScoreColor(score: number): string {
  if (score >= 9) return "bg-red-100 text-red-800";
  if (score >= 7) return "bg-orange-100 text-orange-800";
  if (score >= 5) return "bg-amber-100 text-amber-800";
  return "bg-neutral-100 text-neutral-600";
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "pending": return "대기";
    case "reviewed": return "검토";
    case "actioned": return "실행";
    case "dismissed": return "보류";
    default: return status;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case "pending": return "bg-amber-100 text-amber-800";
    case "reviewed": return "bg-blue-100 text-blue-800";
    case "actioned": return "bg-emerald-100 text-emerald-800";
    case "dismissed": return "bg-neutral-100 text-neutral-600";
    default: return "bg-neutral-100 text-neutral-600";
  }
}

// ─── Loader ─────────────────────────────────────────────────────────────────
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const db = getDb(env.DB);
  const secret = getSessionSecret(env);

  let user;
  try {
    user = await requireUser(request, db, secret);
  } catch (e) {
    if (e instanceof Response) throw e;
    return redirect("/login");
  }

  const membership = await db.query.tenantMembers.findFirst({
    where: eq(tenantMembers.userId, user.id),
  });
  const teamId = membership?.tenantId ?? "";

  if (!teamId) {
    return json({ signals: [] });
  }

  const url = new URL(request.url);
  const topicId = url.searchParams.get("topicId") ?? "";
  const status = url.searchParams.get("status") ?? "";

  const service = new SignalService(db);
  const signals = await service.listWithDetails(teamId, {
    topicId: topicId || undefined,
    status: status || undefined,
  });

  return json({ signals });
}

// ─── Components ─────────────────────────────────────────────────────────────
type SerializedSignal = {
  id: number;
  contentSummary: string;
  score: number;
  status: string;
  topicId: string | null;
  topicName: string | null;
  sourceUserName: string | null;
  createdAt: string;
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        getStatusColor(status),
      )}
    >
      {getStatusLabel(status)}
    </span>
  );
}

function SignalCard({ signal }: { signal: SerializedSignal }) {
  return (
    <div className="rounded-lg border border-line bg-surface-panel p-4 transition-colors hover:border-line">
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums",
            getScoreColor(signal.score),
          )}
        >
          {signal.score.toFixed(1)}
        </span>
        <StatusBadge status={signal.status} />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-fg">
        {signal.contentSummary}
      </p>
      <div className="mt-3 flex items-center gap-2 text-xs text-fg-tertiary">
        {signal.topicName && (
          <span className="rounded bg-surface-secondary px-1.5 py-0.5">
            #{signal.topicName}
          </span>
        )}
        {signal.sourceUserName && <span>{signal.sourceUserName}</span>}
        <span className="tabular-nums">{formatDate(signal.createdAt)}</span>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────
export default function SignalsIndex() {
  const { signals } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const topicId = searchParams.get("topicId");
  const status = searchParams.get("status");

  if (signals.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-4">
        <svg className="h-12 w-12 text-fg-tertiary" fill="none" viewBox="0 0 24 24" strokeWidth="1" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
        </svg>
        <p className="text-sm text-fg-tertiary">
          {topicId || status ? "조건에 맞는 시그널이 없습니다" : "시그널이 없습니다"}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {signals.map((s) => (
          <SignalCard key={s.id} signal={s} />
        ))}
      </div>
    </div>
  );
}
