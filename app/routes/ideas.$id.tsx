import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { eq, desc, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { radarItems } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { SimilarSources } from "~/components/ideas/SimilarSources";
import { findSimilarRadarItems, type SimilarItemsEnv, type SimilarItem } from "~/lib/embeddings/similar-items";

export async function loader({ params, request, context }: LoaderFunctionArgs) {
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

  // Similar sources recommendation
  let similarSources: SimilarItem[] = [];
  let similarSource: "vectorize" | "fallback" | "none" = "none";

  const env = context.cloudflare.env as unknown as Record<string, unknown>;

  if (env.VECTORIZE_RADAR && env.OPENAI_API_KEY) {
    try {
      const results = await findSimilarRadarItems(
        env as unknown as SimilarItemsEnv,
        item,
        db,
        { limit: 3, minScore: 0.7 },
      );
      if (results.length > 0) {
        similarSources = results;
        similarSource = "vectorize";
      }
    } catch {
      // Vectorize failure → fall through to fallback
    }
  }

  // Fallback: relevanceScore proximity (when Vectorize unavailable or returned nothing)
  if (similarSources.length === 0 && item.relevanceScore) {
    const score = item.relevanceScore;
    const fallbackItems = await db
      .select({
        id: radarItems.id,
        title: radarItems.title,
        titleKo: radarItems.titleKo,
        summaryKo: radarItems.summaryKo,
        url: radarItems.url,
        relevanceScore: radarItems.relevanceScore,
      })
      .from(radarItems)
      .where(
        sql`${radarItems.id} != ${item.id}
          AND ${radarItems.relevanceScore} BETWEEN ${score - 20} AND ${score + 20}
          AND ${radarItems.relevanceScore} IS NOT NULL`
      )
      .orderBy(desc(radarItems.relevanceScore))
      .limit(3);

    similarSources = fallbackItems.map((fi) => ({
      id: fi.id,
      title: fi.titleKo || fi.title,
      summaryKo: fi.summaryKo,
      url: fi.url,
      score: fi.relevanceScore
        ? Math.round((1 - Math.abs(fi.relevanceScore - score) / 100) * 100) / 100
        : 0,
    }));
    similarSource = similarSources.length > 0 ? "fallback" : "none";
  }

  return json({ item, similarSources, similarSource });
}

export default function IdeaDetail() {
  const { item, similarSources, similarSource } = useLoaderData<typeof loader>();

  return (
    <div className="mx-auto max-w-3xl px-6 py-6">
      {/* Title + Action */}
      <div className="mb-6 flex items-start justify-between">
        <h1 className="text-2xl font-bold text-[var(--axis-text-primary)]">
          {item.titleKo || item.title}
        </h1>
        <button
          type="button"
          className="shrink-0 rounded-lg bg-[var(--axis-surface-brand)] px-4 py-2 text-sm font-medium text-white"
        >
          새 아이디어 생성
        </button>
      </div>

      {/* Document content */}
      <div className="mb-8 space-y-4 text-sm leading-relaxed text-[var(--axis-text-secondary)]">
        {item.summaryKo && <p>{item.summaryKo}</p>}
        {item.keyPoints && (Array.isArray(item.keyPoints) ? item.keyPoints : []).length > 0 && (
          <ol className="list-decimal list-inside space-y-2">
            {(Array.isArray(item.keyPoints) ? item.keyPoints : []).map((point: string, i: number) => (
              <li key={i}>{point}</li>
            ))}
          </ol>
        )}
      </div>

      {/* Similar Sources — collapsible, hidden by default */}
      {similarSources.length > 0 && (
        <details className="mb-4">
          <summary className="cursor-pointer text-xs text-[var(--axis-text-tertiary)] hover:text-[var(--axis-text-secondary)]">
            관련 소스 ({similarSources.length})
          </summary>
          <div className="mt-2">
            <SimilarSources sources={similarSources} source={similarSource} />
          </div>
        </details>
      )}

      {/* AI Analysis footer */}
      <div className="mt-8 text-right">
        <span className="text-xs text-[var(--axis-text-tertiary)]">GPT 4o-mini Floating</span>
      </div>
    </div>
  );
}
