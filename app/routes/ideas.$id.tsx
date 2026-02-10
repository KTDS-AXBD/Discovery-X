import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { eq, desc, sql } from "drizzle-orm";
import { getDb } from "~/db";
import { radarItems } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { Card, CardContent } from "~/components/ui/Card";
import { SimilarSources } from "~/components/ideas/SimilarSources";
import { formatDateLocalTime } from "~/lib/format-date";
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
      {/* Black header bar */}
      <div className="mb-6 flex items-center justify-between rounded-lg bg-[var(--dx-surface-card,#18181B)] px-4 py-3">
        <div className="flex items-center gap-3">
          <Badge variant={item.relevanceScore && item.relevanceScore >= 60 ? "success" : "secondary"}>
            {item.relevanceScore ?? "-"}점
          </Badge>
          <Badge variant="info">{item.status}</Badge>
        </div>
        <Button variant="default" size="sm">
          아이디어로 전환
        </Button>
      </div>

      {/* Title */}
      <h1 className="mb-2 text-xl font-bold text-[var(--axis-text-primary)]">
        {item.titleKo || item.title}
      </h1>

      {/* Meta */}
      <div className="mb-6 flex items-center gap-4 text-xs text-[var(--axis-text-tertiary)]">
        {item.collectedAt && <span>{formatDateLocalTime(item.collectedAt)}</span>}
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate hover:text-[var(--axis-text-brand)]"
        >
          {item.url}
        </a>
      </div>

      {/* Summary */}
      {item.summaryKo && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-[var(--axis-text-primary)]">요약</h3>
            <p className="text-sm leading-relaxed text-[var(--axis-text-secondary)]">
              {item.summaryKo}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Key Points */}
      {item.keyPoints && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <h3 className="mb-2 text-sm font-semibold text-[var(--axis-text-primary)]">핵심 포인트</h3>
            <ul className="list-inside list-disc space-y-1 text-sm text-[var(--axis-text-secondary)]">
              {(Array.isArray(item.keyPoints) ? item.keyPoints : []).map((point: string, i: number) => (
                <li key={i}>{point}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Similar Sources */}
      <SimilarSources sources={similarSources} source={similarSource} />

      {/* AI Analysis footer */}
      <div className="mt-8 flex items-center gap-2 text-xs text-[var(--axis-text-tertiary)]">
        <span className="rounded bg-[var(--axis-surface-secondary)] px-2 py-0.5">GPT 4o-mini</span>
        <span>|</span>
        <span className={item.status === "SCORED" ? "text-green-500" : "text-[var(--axis-text-tertiary)]"}>
          {item.status === "SCORED" ? "Passing" : item.status}
        </span>
      </div>
    </div>
  );
}
