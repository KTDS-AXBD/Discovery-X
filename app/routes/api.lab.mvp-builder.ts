import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { desc, eq, and } from "drizzle-orm";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { mvpBuilds } from "~/db";
import type { MvpBuildProgress } from "~/features/lab/service/mvp-builder.service";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return json({ error: "인증이 필요합니다" }, { status: 401 });

  const url = new URL(request.url);
  const proposalId = url.searchParams.get("proposalId");
  if (!proposalId) return json({ error: "proposalId가 필요합니다" }, { status: 400 });

  const [build] = await db
    .select()
    .from(mvpBuilds)
    .where(and(eq(mvpBuilds.proposalId, proposalId), eq(mvpBuilds.tenantId, ctx.tenantId)))
    .orderBy(desc(mvpBuilds.createdAt))
    .limit(1);

  return json({ build: build ?? null });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) return json({ error: "인증이 필요합니다" }, { status: 401 });

  const body = (await request.json()) as {
    proposalId: string;
    stack?: string;
    sections?: string[];
  };

  if (!body.proposalId) {
    return json({ error: "proposalId가 필요합니다" }, { status: 400 });
  }

  const apiKey = (context.cloudflare.env as unknown as Record<string, string>).ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ error: "API 키가 설정되지 않았습니다" }, { status: 500 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: MvpBuildProgress) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }

      try {
        const { MvpBuilderService } = await import(
          "~/features/lab/service/mvp-builder.service"
        );
        const service = new MvpBuilderService(db);

        await service.generate({
          proposalId: body.proposalId,
          tenantId: ctx.tenantId,
          stack: body.stack || "nextjs",
          sections: body.sections || [],
          apiKey,
          db,
          fallbackCtx: { env: context.cloudflare.env as unknown as Record<string, string | undefined> },
          onProgress: send,
        });
      } catch (error) {
        send({
          type: "error",
          step: 0,
          message: error instanceof Error ? error.message : "MVP 빌드 중 오류 발생",
        });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
