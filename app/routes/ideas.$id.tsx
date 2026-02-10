import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { useLoaderData } from "@remix-run/react";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { radarItems } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { Badge } from "~/components/ui/Badge";
import { Button } from "~/components/ui/Button";
import { Card, CardContent } from "~/components/ui/Card";
import { formatDateLocalTime } from "~/lib/format-date";

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

  return json({ item });
}

export default function IdeaDetail() {
  const { item } = useLoaderData<typeof loader>();

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
