import { useState, useEffect, useRef, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { CreateDiscoverySchema } from "~/lib/validation/discovery-rules";
import { getFormErrorMessage } from "~/lib/utils/form-error";
import { SourceType, DiscoveryStatus } from "~/db/schema";
import { StatusBadge } from "~/components/ui/StatusBadge";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  return json({ user });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const formData = await request.formData();
  const title = formData.get("title");
  const seedSummary = formData.get("seedSummary");
  const seedLinksRaw = formData.get("seedLinks");
  const sourceType = formData.get("sourceType");

  // Parse seed links (comma-separated)
  const seedLinks = seedLinksRaw
    ? String(seedLinksRaw)
        .split(",")
        .map((link) => link.trim())
        .filter(Boolean)
    : undefined;

  // Validate input
  try {
    const validated = CreateDiscoverySchema.parse({
      title,
      seedSummary,
      seedLinks,
      sourceType,
    });

    // Create discovery
    const discoveryId = crypto.randomUUID();
    await db.insert(discoveries).values({
      id: discoveryId,
      title: validated.title,
      seedSummary: validated.seedSummary,
      seedLinks: validated.seedLinks || null,
      sourceType: validated.sourceType,
      status: DiscoveryStatus.INBOX,
      ownerId: user.id, // Set creator as default owner
    });

    return redirect(`/discoveries/${discoveryId}`);
  } catch (error: unknown) {
    return json({ error: getFormErrorMessage(error) }, { status: 400 });
  }
}

const SOURCE_TYPE_LABELS: Record<string, string> = {
  [SourceType.ARTICLE]: "외부 아티클",
  [SourceType.ISSUE]: "이슈/버그",
  [SourceType.INTERNAL_PAIN]: "내부 Pain Point",
  [SourceType.MEETING_NOTE]: "회의 노트",
  [SourceType.OTHER]: "기타",
};

interface SimilarSeed {
  id: string;
  title: string;
  seedSummary: string;
  status: string;
  deadEndFailurePattern: string[] | null;
  notNowTriggerType: string | null;
  notNowTriggerCondition: string | null;
}

function SimilarSeedsPanel({ seeds }: { seeds: SimilarSeed[] }) {
  if (seeds.length === 0) return null;

  return (
    <div className="rounded-lg border-2 border-yellow-300 bg-yellow-50 p-4">
      <h3 className="text-sm font-semibold text-yellow-800">
        유사한 Discovery가 {seeds.length}건 있습니다
      </h3>
      <div className="mt-3 space-y-3">
        {seeds.map((seed) => (
          <div key={seed.id} className="rounded-md bg-white p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <Link
                to={`/discoveries/${seed.id}`}
                className="text-sm font-medium text-blue-600 hover:text-blue-800"
              >
                {seed.title}
              </Link>
              <StatusBadge status={seed.status} />
            </div>
            <p className="mt-1 text-xs text-gray-600 line-clamp-2">{seed.seedSummary}</p>
            {seed.deadEndFailurePattern && seed.deadEndFailurePattern.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {seed.deadEndFailurePattern.map((p) => (
                  <span key={p} className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700">
                    {p}
                  </span>
                ))}
              </div>
            )}
            {seed.status === "NOT_NOW" && seed.notNowTriggerCondition && (
              <p className="mt-1 text-xs text-gray-500">
                트리거: {seed.notNowTriggerCondition}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function NewDiscovery() {
  const { user } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const [seedSummary, setSeedSummary] = useState("");
  const [similarSeeds, setSimilarSeeds] = useState<SimilarSeed[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchSimilarSeeds = useCallback(async (query: string) => {
    if (query.length < 5) {
      setSimilarSeeds([]);
      return;
    }
    try {
      const res = await fetch(`/api/similar-seeds?q=${encodeURIComponent(query)}&limit=5`);
      if (res.ok) {
        const data = await res.json() as { results: SimilarSeed[] };
        setSimilarSeeds(data.results);
      }
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSimilarSeeds(seedSummary);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [seedSummary, fetchSimilarSeeds]);

  return (
    <div className="min-h-screen bg-gray-50">
      <MainNav user={user} />

      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">새 Discovery 만들기</h1>
          <p className="mt-2 text-sm text-gray-600">
            Seed 정보를 입력하여 Discovery를 시작합니다 (상태: INBOX)
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
              value={seedSummary}
              onChange={(e) => setSeedSummary(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="400자 이내"
            />
            <p className="mt-1 text-xs text-gray-500">
              관찰한 내용, 문제 정의, 기회 요약 등
            </p>

            {/* Similar Seeds Panel */}
            <SimilarSeedsPanel seeds={similarSeeds} />
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
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              placeholder="https://example.com/article, https://..."
            />
            <p className="mt-1 text-xs text-gray-500">
              여러 링크는 쉼표(,)로 구분합니다
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3">
            <a
              href="/discoveries"
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 hover:bg-gray-50"
            >
              취소
            </a>
            <button
              type="submit"
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              생성하기
            </button>
          </div>
        </Form>
      </div>
    </div>
  );
}
