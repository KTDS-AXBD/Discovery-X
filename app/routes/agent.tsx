import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Outlet, useLoaderData, useNavigate, useNavigation } from "@remix-run/react";
import { useState, useCallback } from "react";
import { eq, desc } from "drizzle-orm";
import { getDb, agentSessionsV2 } from "~/db";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { SessionList } from "~/components/agent/SessionList";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);

  let user;
  try {
    user = await requireUser(request, db, secret);
  } catch (e) {
    if (e instanceof Response) throw e;
    return redirect("/login");
  }

  const sessionList = await db
    .select()
    .from(agentSessionsV2)
    .where(eq(agentSessionsV2.userId, user.id))
    .orderBy(desc(agentSessionsV2.startedAt))
    .limit(20);

  return json({ user, sessions: sessionList });
}

export default function AgentLayout() {
  const { user, sessions } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const [isCreating, setIsCreating] = useState(false);

  const handleNewSession = useCallback(async () => {
    setIsCreating(true);
    try {
      const res = await fetch("/api/agent/sessions", { method: "POST" });
      if (!res.ok) throw new Error("세션 생성 실패");
      const data = (await res.json()) as { sessionId: string };
      navigate(`/agent/${data.sessionId}`);
    } catch {
      // 에러 시 조용히 실패
    } finally {
      setIsCreating(false);
    }
  }, [navigate]);

  const formattedSessions = sessions.map((s) => ({
    id: s.id,
    startedAt: s.startedAt
      ? new Date(
          typeof s.startedAt === "number"
            ? s.startedAt * 1000
            : s.startedAt,
        ).toISOString()
      : new Date().toISOString(),
    tokenCount: s.tokenCount,
    summary: s.summary,
    isActive: !s.endedAt,
  }));

  const sidebar = (
    <aside className="hidden w-[280px] shrink-0 border-r border-[var(--axis-border-default)] bg-[var(--dx-surface-panel,var(--axis-surface-default))] sm:block">
      <SessionList
        sessions={formattedSessions}
        onNewSession={handleNewSession}
        isCreating={isCreating}
      />
    </aside>
  );

  return (
    <AppShell user={user} sidebarContent={sidebar}>
      <div className="flex h-full flex-col">
        {/* 모바일 헤더 */}
        <div className="flex items-center justify-between border-b border-[var(--axis-border-default)] px-4 py-2 sm:hidden">
          <span className="text-sm font-medium text-[var(--axis-text-primary)]">Agent</span>
          <button
            type="button"
            onClick={handleNewSession}
            disabled={isCreating}
            className="rounded-lg p-1.5 text-[var(--axis-icon-secondary)] hover:bg-[var(--axis-surface-secondary)]"
            aria-label="새 대화"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-hidden">
          {navigation.state === "loading" ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--axis-border-default)] border-t-[var(--axis-text-brand)]" />
            </div>
          ) : (
            <Outlet />
          )}
        </div>
      </div>
    </AppShell>
  );
}
