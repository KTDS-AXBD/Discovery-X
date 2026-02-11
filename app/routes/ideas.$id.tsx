import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { radarItems } from "~/db/schema";
import { ideas, ideaSources } from "~/features/ideas/db/schema";
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

    const ideaId = params.id!;

    // Try loading as idea first
    const idea = await db.select().from(ideas).where(eq(ideas.id, ideaId)).get();

    if (idea) {
      // Fetch linked sources
      const sources = await db
        .select({
          id: radarItems.id,
          title: radarItems.title,
          titleKo: radarItems.titleKo,
          summaryKo: radarItems.summaryKo,
          url: radarItems.url,
          keyPoints: radarItems.keyPoints,
          memo: radarItems.memo,
        })
        .from(ideaSources)
        .innerJoin(radarItems, eq(ideaSources.radarItemId, radarItems.id))
        .where(eq(ideaSources.ideaId, ideaId));

      return json({
        type: "idea" as const,
        idea,
        sources,
        item: null,
      });
    }

    // Fallback: try loading as radarItem (backward compatibility)
    const item = await db.select().from(radarItems).where(eq(radarItems.id, ideaId)).get();

    if (!item) {
      throw new Response("Not Found", { status: 404 });
    }

    return json({
      type: "radarItem" as const,
      idea: null,
      sources: [],
      item,
    });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[ideas.$id.loader] Error:", error instanceof Error ? error.message : error);
    return redirect("/login");
  }
}

export default function IdeaDetail() {
  const data = useLoaderData<typeof loader>();

  // Build sections from idea analysis data or from sources
  const sections: Record<string, { title: string; content: string; sources?: string[] } | null> = {
    industry_example: null,
    regulation: null,
    market_research: null,
    customer_research: null,
    feasibility: null,
    differentiation: null,
  };

  if (data.type === "idea" && data.idea) {
    // Parse analysisData if available
    const analysis = data.idea.analysisData as Record<string, { title?: string; content?: string; sources?: string[] }> | null;
    if (analysis) {
      for (const key of Object.keys(sections)) {
        if (analysis[key]) {
          sections[key] = {
            title: analysis[key].title || key,
            content: analysis[key].content || "",
            sources: analysis[key].sources,
          };
        }
      }
    }

    // If no analysis yet but has sources, show first source's summary
    if (!analysis && data.sources.length > 0) {
      const firstSource = data.sources[0];
      const keyPoints = Array.isArray(firstSource.keyPoints) ? (firstSource.keyPoints as string[]) : null;
      const summaryText = ((firstSource.summaryKo || "") as string);

      if (keyPoints?.length || summaryText) {
        sections.industry_example = {
          title: "산업별 사업 예시",
          content: keyPoints?.length
            ? keyPoints.map((p: string, i: number) => `${i + 1}. ${p}`).join("\n\n")
            : summaryText,
          sources: firstSource.url ? [firstSource.url] : undefined,
        };
      }
    }
  } else if (data.type === "radarItem" && data.item) {
    // Legacy radarItem display
    const item = data.item;
    const keyPoints = Array.isArray(item.keyPoints) ? (item.keyPoints as string[]) : null;
    const summaryText = ((item.summaryKo || item.summary || "") as string);

    if (keyPoints?.length || summaryText) {
      sections.industry_example = {
        title: "산업별 사업 예시",
        content: keyPoints?.length
          ? keyPoints.map((p: string, i: number) => `${i + 1}. ${p}`).join("\n\n")
          : summaryText,
        sources: item.url ? [item.url] : undefined,
      };
    }
  }

  const title = data.type === "idea"
    ? data.idea?.title
    : (data.item?.titleKo ?? data.item?.title);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center justify-between border-b border-[var(--axis-border-default)] px-6 py-4">
        <h1 className="truncate text-lg font-semibold text-[var(--axis-text-primary)]">
          {title || "아이디어"}
        </h1>
      </div>

      {/* Gadget Tabs */}
      <IdeaGadgetTabs sections={sections} />
    </div>
  );
}
