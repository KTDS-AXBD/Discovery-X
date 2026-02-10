import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { useLoaderData, useNavigate } from "@remix-run/react";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { radarItems } from "~/db/schema";
import { getSessionSecret, getSessionContext } from "~/lib/auth/session.server";
import { MarketAnalysisTabs } from "~/components/market/MarketAnalysisTabs";

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const { id } = params;
  if (!id) throw new Response("Not Found", { status: 404 });

  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return json({ item: null });

  const [item] = await db
    .select()
    .from(radarItems)
    .where(eq(radarItems.id, id))
    .limit(1);

  if (!item) throw new Response("Not Found", { status: 404 });

  return json({ item });
}

export default function MarketItemDetail() {
  const { item } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  if (!item) return null;

  const sections = {
    market: item.keyPoints && item.keyPoints.length > 0
      ? {
          title: "시장 현황 분석",
          content: item.keyPoints.map((p: string, i: number) => `${i + 1}. ${p}`).join("\n\n"),
          sources: item.url ? [item.url] : undefined,
        }
      : item.summaryKo
        ? { title: "시장 현황 요약", content: item.summaryKo, sources: item.url ? [item.url] : undefined }
        : null,
    customer: null,
    data: null,
    competition: null,
    regulation: null,
  };

  return (
    <MarketAnalysisTabs
      itemTitle={item.titleKo || item.title}
      summary={item.summaryKo || item.summary}
      keyPoints={item.keyPoints}
      sections={sections}
      onBack={() => navigate("/market")}
    />
  );
}
