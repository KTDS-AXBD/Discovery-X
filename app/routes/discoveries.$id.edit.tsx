import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { eq } from "drizzle-orm";
import { DiscoveryStatus, SourceType } from "~/db/schema";
import { CreateDiscoverySchema } from "~/lib/validation/discovery-rules";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const { id } = params;
  if (!id) {
    throw new Response("Not Found", { status: 404 });
  }

  const discovery = await db.query.discoveries.findFirst({
    where: eq(discoveries.id, id),
  });

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  // Only INBOX/OPEN can be edited
  if (discovery.status !== DiscoveryStatus.INBOX && discovery.status !== DiscoveryStatus.OPEN) {
    return redirect(`/discoveries/${id}`);
  }

  return json({ user, discovery });
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const { id } = params;
  if (!id) {
    throw new Response("Not Found", { status: 404 });
  }

  const discovery = await db.query.discoveries.findFirst({
    where: eq(discoveries.id, id),
  });

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  if (discovery.status !== DiscoveryStatus.INBOX && discovery.status !== DiscoveryStatus.OPEN) {
    return json({ error: "INBOX/OPEN 상태에서만 편집할 수 있습니다" }, { status: 400 });
  }

  const formData = await request.formData();
  const title = formData.get("title");
  const seedSummary = formData.get("seedSummary");
  const seedLinksRaw = formData.get("seedLinks");
  const sourceType = formData.get("sourceType");

  const seedLinks = seedLinksRaw
    ? String(seedLinksRaw)
        .split(",")
        .map((link) => link.trim())
        .filter(Boolean)
    : undefined;

  try {
    const validated = CreateDiscoverySchema.parse({
      title,
      seedSummary,
      seedLinks,
      sourceType,
    });

    await db
      .update(discoveries)
      .set({
        title: validated.title,
        seedSummary: validated.seedSummary,
        seedLinks: validated.seedLinks || null,
        sourceType: validated.sourceType,
        updatedAt: new Date(),
      })
      .where(eq(discoveries.id, id));

    return redirect(`/discoveries/${id}`);
  } catch (error: any) {
    return json({ error: error.message || "입력값이 유효하지 않습니다" }, { status: 400 });
  }
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  [SourceType.ARTICLE]: "외부 아티클",
  [SourceType.ISSUE]: "이슈/버그",
  [SourceType.INTERNAL_PAIN]: "내부 Pain Point",
  [SourceType.MEETING_NOTE]: "회의 노트",
  [SourceType.OTHER]: "기타",
};

export default function EditDiscovery() {
  const { user, discovery } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav user={user} />

      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Discovery 편집</h1>
          <p className="mt-2 text-sm text-gray-600">
            Seed 정보를 수정합니다
          </p>
        </div>

        {actionData?.error && (
          <div className="mb-6 rounded-md bg-red-50 p-4">
            <p className="text-sm text-red-800">{actionData.error}</p>
          </div>
        )}

        <Form method="post" className="space-y-6 bg-white p-6 shadow sm:rounded-lg">
          {/* Title */}
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-gray-700"
            >
              제목 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              name="title"
              id="title"
              required
              maxLength={80}
              defaultValue={discovery.title}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="80자 이내"
            />
            <p className="mt-1 text-xs text-gray-500">
              Discovery를 한 줄로 표현합니다
            </p>
          </div>

          {/* Seed Summary */}
          <div>
            <label
              htmlFor="seedSummary"
              className="block text-sm font-medium text-gray-700"
            >
              Seed 요약 <span className="text-red-500">*</span>
            </label>
            <textarea
              name="seedSummary"
              id="seedSummary"
              required
              maxLength={400}
              rows={5}
              defaultValue={discovery.seedSummary}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="400자 이내"
            />
            <p className="mt-1 text-xs text-gray-500">
              관찰한 내용, 문제 정의, 기회 요약 등
            </p>
          </div>

          {/* Source Type */}
          <div>
            <label
              htmlFor="sourceType"
              className="block text-sm font-medium text-gray-700"
            >
              출처 유형 <span className="text-red-500">*</span>
            </label>
            <select
              name="sourceType"
              id="sourceType"
              required
              defaultValue={discovery.sourceType}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            >
              <option value="">선택하세요</option>
              {Object.entries(SOURCE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Seed Links */}
          <div>
            <label
              htmlFor="seedLinks"
              className="block text-sm font-medium text-gray-700"
            >
              참고 링크 (선택)
            </label>
            <input
              type="text"
              name="seedLinks"
              id="seedLinks"
              defaultValue={discovery.seedLinks?.join(", ") || ""}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="https://example.com/article, https://..."
            />
            <p className="mt-1 text-xs text-gray-500">
              여러 링크는 쉼표(,)로 구분합니다
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 border-t border-gray-200 pt-6">
            <a
              href={`/discoveries/${discovery.id}`}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              취소
            </a>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              저장
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
