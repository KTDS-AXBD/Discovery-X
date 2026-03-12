import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { PrdStudioService } from "~/features/prd-studio/service/prd-studio.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  // ideaId가 있으면 아이디어 데이터 로드
  const url = new URL(request.url);
  const ideaId = url.searchParams.get("ideaId");
  let idea: { id: string; title: string } | null = null;

  if (ideaId) {
    try {
      const { IdeaService } = await import("~/lib/services");
      const ideaService = new IdeaService(db);
      const found = await ideaService.getById(ideaId);
      if (found) {
        idea = { id: found.id, title: found.title };
      }
    } catch {
      // 아이디어 로드 실패 시 무시
    }
  }

  return json({ idea });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }

  const formData = await request.formData();
  const title = String(formData.get("title") || "").trim();
  const sourceIdeaId = String(formData.get("sourceIdeaId") || "").trim() || undefined;

  if (!title) {
    return json({ error: "제목은 필수예요." }, { status: 400 });
  }

  if (title.length > 200) {
    return json({ error: "제목은 200자 이내여야 해요." }, { status: 400 });
  }

  const service = new PrdStudioService(db);
  const prdId = await service.create({
    tenantId: ctx.tenantId,
    title,
    createdBy: ctx.user.id,
    sourceIdeaId,
  });

  return redirect(`/prd-studio/${prdId}`);
}

export default function PrdStudioNew() {
  const { idea } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="mx-auto max-w-lg p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-fg">새 PRD 작성</h1>
        <p className="mt-2 text-sm text-fg-tertiary">
          인터뷰 형식으로 8개 섹션을 작성하면 AI가 PRD를 생성해요.
        </p>
      </div>

      <Form method="post" className="space-y-6">
        {/* 아이디어 연결 (있는 경우) */}
        {idea && (
          <>
            <input type="hidden" name="sourceIdeaId" value={idea.id} />
            <div className="rounded-lg border border-border bg-surface-secondary/50 p-3">
              <p className="text-xs text-fg-tertiary">연결된 아이디어</p>
              <p className="mt-1 text-sm font-medium text-fg">{idea.title}</p>
            </div>
          </>
        )}

        {/* 제목 입력 */}
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-fg">
            PRD 제목
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            defaultValue={idea?.title ?? ""}
            placeholder="예: 사내 실험 관리 시스템 MVP"
            className="mt-2 w-full rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-fg placeholder:text-fg-tertiary focus:border-accent-fg focus:outline-none focus:ring-1 focus:ring-accent-fg"
          />
          {actionData?.error && (
            <p className="mt-2 text-sm text-red-500">{actionData.error}</p>
          )}
        </div>

        {/* 제출 */}
        <button
          type="submit"
          className="w-full rounded-lg bg-btn-bg px-4 py-2.5 text-sm font-medium text-btn-text transition-colors hover:bg-btn-bg-hover"
        >
          PRD 시작
        </button>
      </Form>
    </div>
  );
}
