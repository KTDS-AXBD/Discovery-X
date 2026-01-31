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
import { discoveries } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { DiscoveryStatus } from "~/db/schema";
import stylesheet from "~/styles/tailwind.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
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
        d.status === DiscoveryStatus.OPEN ||
        d.status === DiscoveryStatus.EXTENSION_REQUESTED
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
        d.status === DiscoveryStatus.NOT_NOW &&
        d.revisitDate &&
        new Date(d.revisitDate) <= now
    ).length;

    return json({
      notifications: { overdueOpen, dueSoon, recallDue },
    });
  } catch {
    return json({ notifications: null });
  }
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
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
  return <Outlet />;
}
