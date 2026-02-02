import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";
import type { LinksFunction, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { discoveries, alerts } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { eq } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import { ThemeProvider } from "@axis-ds/theme";
import stylesheet from "~/styles/tailwind.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
];

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const user = await getUserFromSession(request, db, secret);

    if (!user) {
      return json({ notifications: null });
    }

    const now = new Date();
    const threeDaysFromNow = new Date();
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    const allDiscoveries = await db.select().from(discoveries);

    const activeDiscoveries = allDiscoveries.filter(
      (d) =>
        d.status === DiscoveryStatus.IDEA_CARD ||
        d.status === DiscoveryStatus.IDEA_CARD
    );

    const overdueOpen = activeDiscoveries.filter(
      (d) => d.dueDate && new Date(d.dueDate) < now
    ).length;

    const dueSoon = activeDiscoveries.filter(
      (d) =>
        d.dueDate &&
        new Date(d.dueDate) >= now &&
        new Date(d.dueDate) <= threeDaysFromNow
    ).length;

    const recallDue = allDiscoveries.filter(
      (d) =>
        d.status === DiscoveryStatus.HOLD &&
        d.revisitDate &&
        new Date(d.revisitDate) <= now
    ).length;

    const pendingApproval = allDiscoveries.filter(
      (d) =>
        d.approvalStatus === "PENDING" &&
        d.reviewerId === user.id
    ).length;

    const unacknowledgedAlerts = (await db
      .select()
      .from(alerts)
      .where(eq(alerts.acknowledged, 0))
    ).length;

    return json({
      notifications: { overdueOpen, dueSoon, recallDue, pendingApproval, unacknowledgedAlerts },
    });
  } catch {
    return json({ notifications: null });
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
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function App() {
  return (
    <ThemeProvider defaultTheme="system" storageKey="dx-theme">
      <Outlet />
    </ThemeProvider>
  );
}
