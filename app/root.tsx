import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
} from "@remix-run/react";
import { useState, useCallback, useEffect, lazy, Suspense } from "react";
import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { discoveries, alerts, conversations, tenants, tenantMembers } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { getFeatureFlags } from "~/lib/feature-flags";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { DiscoveryStatus } from "~/db";
import { ACTIVE_STATUSES } from "~/lib/constants/status";
import { ThemeProvider } from "@axis-ds/theme";
import { OnboardingModal } from "~/components/onboarding/OnboardingModal";
import stylesheet from "~/styles/tailwind.css?url";

// Agentation: 개발 환경 전용 UI 어노테이션 도구 (SSR 안전 lazy 로딩)
const AgentationDev = import.meta.env.DEV
  ? lazy(() => import("agentation").then((m) => ({ default: m.Agentation })))
  : null;

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
];

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    const env = context.cloudflare.env as unknown as Record<string, string | undefined>;
    const flags = getFeatureFlags(env);

    if (!ctx) {
      return json({ notifications: null, conversations: [], tenant: null, tenantList: [], simplifiedNav: flags.simplifiedNav, onboardingCompleted: null });
    }
    const user = ctx.user;

    const nowUnix = Math.floor(Date.now() / 1000);
    const threeDaysUnix = nowUnix + 3 * 24 * 60 * 60;

    const [overdueResult, dueSoonResult, recallResult, pendingResult, alertResult] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(discoveries).where(
        and(
          inArray(discoveries.status, [...ACTIVE_STATUSES]),
          sql`${discoveries.dueDate} < ${nowUnix}`
        )
      ),
      db.select({ count: sql<number>`count(*)` }).from(discoveries).where(
        and(
          inArray(discoveries.status, [...ACTIVE_STATUSES]),
          sql`${discoveries.dueDate} >= ${nowUnix}`,
          sql`${discoveries.dueDate} <= ${threeDaysUnix}`
        )
      ),
      db.select({ count: sql<number>`count(*)` }).from(discoveries).where(
        and(
          eq(discoveries.status, DiscoveryStatus.HOLD),
          sql`${discoveries.revisitDate} <= ${nowUnix}`
        )
      ),
      db.select({ count: sql<number>`count(*)` }).from(discoveries).where(
        and(
          eq(discoveries.approvalStatus, "PENDING"),
          eq(discoveries.reviewerId, user.id)
        )
      ),
      db.select({ count: sql<number>`count(*)` }).from(alerts).where(eq(alerts.acknowledged, 0)),
    ]);

    const overdueOpen = overdueResult[0]?.count ?? 0;
    const dueSoon = dueSoonResult[0]?.count ?? 0;
    const recallDue = recallResult[0]?.count ?? 0;
    const pendingApproval = pendingResult[0]?.count ?? 0;
    const unacknowledgedAlerts = alertResult[0]?.count ?? 0;

    // Conversations for sidebar
    const convs = await db
      .select({
        id: conversations.id,
        title: conversations.title,
        updatedAt: conversations.updatedAt,
      })
      .from(conversations)
      .where(eq(conversations.userId, user.id))
      .orderBy(desc(conversations.updatedAt))
      .limit(50);

    const sanitizedConvs = convs.map((c) => ({
      id: c.id,
      title: c.title?.replace(/\uFFFD/g, "").trim() || "새 대화",
      updatedAt: c.updatedAt ? new Date(c.updatedAt as unknown as number * 1000).toISOString() : null,
    }));

    // Tenant data for TenantSwitcher
    const currentTenant = await db.query.tenants.findFirst({
      where: eq(tenants.id, ctx.tenantId),
    });

    const userMemberships = await db
      .select({
        tenantId: tenantMembers.tenantId,
        tenantName: tenants.name,
        tenantSlug: tenants.slug,
      })
      .from(tenantMembers)
      .innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id))
      .where(eq(tenantMembers.userId, user.id));

    return json({
      notifications: { overdueOpen, dueSoon, recallDue, pendingApproval, unacknowledgedAlerts },
      conversations: sanitizedConvs,
      tenant: currentTenant ? { id: currentTenant.id, name: currentTenant.name, slug: currentTenant.slug } : null,
      tenantList: userMemberships.map((m) => ({ id: m.tenantId, name: m.tenantName, slug: m.tenantSlug })),
      simplifiedNav: flags.simplifiedNav,
      onboardingCompleted: user.onboardingCompleted === 1,
    });
  } catch {
    return json({ notifications: null, conversations: [], tenant: null, tenantList: [], onboardingCompleted: null });
  }
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("dx-theme");if(t==="dark"||t==="light"){document.documentElement.setAttribute("data-theme",t);document.documentElement.classList.add(t)}else if(window.matchMedia("(prefers-color-scheme:dark)").matches){document.documentElement.setAttribute("data-theme","dark");document.documentElement.classList.add("dark")}}catch(e){}})()`,
          }}
        />
        <link
          rel="stylesheet"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <Meta />
        <Links />
      </head>
      <body className="bg-surface-deep">
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  const data = useRouteLoaderData<typeof loader>("root");
  const [showOnboarding, setShowOnboarding] = useState(
    data?.onboardingCompleted === false
  );

  const handleOnboardingDone = useCallback(async () => {
    setShowOnboarding(false);
    if (!data?.onboardingCompleted) {
      await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
    }
  }, [data?.onboardingCompleted]);

  const handleOnboardingSkip = useCallback(async () => {
    setShowOnboarding(false);
    if (!data?.onboardingCompleted) {
      await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "complete" }),
      });
    }
  }, [data?.onboardingCompleted]);

  // "사용법 가이드" 재열기 이벤트 리스너
  useEffect(() => {
    function handleOpenGuide() {
      setShowOnboarding(true);
    }
    window.addEventListener("dx:open-guide", handleOpenGuide);
    return () => window.removeEventListener("dx:open-guide", handleOpenGuide);
  }, []);

  return (
    <ThemeProvider defaultTheme="system" storageKey="dx-theme">
      <Outlet />
      {showOnboarding && (
        <OnboardingModal
          open={showOnboarding}
          onComplete={handleOnboardingDone}
          onSkip={handleOnboardingSkip}
        />
      )}
      {AgentationDev && (
        <Suspense fallback={null}>
          <AgentationDev />
        </Suspense>
      )}
    </ThemeProvider>
  );
}
