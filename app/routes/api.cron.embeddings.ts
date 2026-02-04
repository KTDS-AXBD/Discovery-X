import type { LoaderFunctionArgs } from "@remix-run/cloudflare";
import { getDb } from "~/db";
import { syncEmbeddings } from "~/lib/embeddings/sync";
import type { EmbeddingEnv } from "~/lib/embeddings/embedding-service";

interface CronEnv {
  DB: D1Database;
  OPENAI_API_KEY?: string;
  VECTORIZE_DISCOVERIES?: EmbeddingEnv["VECTORIZE_DISCOVERIES"];
  VECTORIZE_EVIDENCE?: EmbeddingEnv["VECTORIZE_EVIDENCE"];
  CRON_SECRET?: string;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as unknown as CronEnv;

  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");
  if (env.CRON_SECRET && secret !== env.CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }

  if (!env.OPENAI_API_KEY) {
    return new Response(
      JSON.stringify({ error: "OPENAI_API_KEY not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!env.VECTORIZE_DISCOVERIES && !env.VECTORIZE_EVIDENCE) {
    return new Response(
      JSON.stringify({ error: "Vectorize bindings not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const db = getDb(env.DB);
  const embeddingEnv: EmbeddingEnv = {
    OPENAI_API_KEY: env.OPENAI_API_KEY,
    VECTORIZE_DISCOVERIES: env.VECTORIZE_DISCOVERIES,
    VECTORIZE_EVIDENCE: env.VECTORIZE_EVIDENCE,
  };

  const batchSize = Number(url.searchParams.get("batch") || "10");
  const result = await syncEmbeddings(db, embeddingEnv, batchSize);

  return new Response(JSON.stringify(result, null, 2), {
    headers: { "Content-Type": "application/json" },
  });
}
