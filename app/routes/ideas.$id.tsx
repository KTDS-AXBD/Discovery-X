import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { radarItems } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { IdeaGadgetTabs } from "~/components/ideas/IdeaGadgetTabs";

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    const ctx = await getSessionContext(request, db, secret);

    if (!ctx) {
      return redirect("/login");
    }

    const item = await db.select().from(radarItems).where(eq(radarItems.id, params.id!)).get();

    if (!item) {
      throw new Response("Not Found", { status: 404 });
    }

    return json({ item });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[ideas.$id.loader] Error:", error instanceof Error ? error.message : error);
    return redirect("/login");
  }
}

export default function IdeaDetail() {
  const { item } = useLoaderData<typeof loader>();

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center justify-between border-b border-[var(--axis-border-default)] px-6 py-4">
        <h1 className="truncate text-lg font-semibold text-[var(--axis-text-primary)]">
          {item.titleKo || item.title}
        </h1>
        <button
          type="button"
          className="shrink-0 rounded-lg bg-[var(--axis-surface-brand)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
        >
          새 아이디어
        </button>
      </div>

      {/* Gadget Tabs */}
      <IdeaGadgetTabs item={item} />
    </div>
  );
}
