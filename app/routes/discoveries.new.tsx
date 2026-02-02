import { useState, useEffect, useRef, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { PageLayout } from "~/components/layout/PageLayout";
import { PageHeader } from "~/components/layout/PageHeader";
import { CreateDiscoverySchema } from "~/lib/validation/discovery-rules";
import { getFormErrorMessage } from "~/lib/utils/form-error";
import { SourceType, DiscoveryStatus } from "~/db/schema";
import { StatusBadge } from "~/components/ui/StatusBadge";
import { Card, CardContent } from "~/components/ui/Card";
import { Input } from "~/components/ui/Input";
import { Textarea } from "~/components/ui/Textarea";
import { Select } from "~/components/ui/Select";
import { FormField } from "~/components/ui/FormField";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { Badge } from "~/components/ui/Badge";

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
      status: DiscoveryStatus.DISCOVERY,
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
    <AlertBanner variant="warning" title={`유사한 Discovery가 ${seeds.length}건 있습니다`}>
      <div className="mt-3 space-y-3">
        {seeds.map((seed) => (
          <Card key={seed.id} className="p-3">
            <div className="flex items-center justify-between">
              <Link
                to={`/discoveries/${seed.id}`}
                className="text-sm font-medium text-[var(--axis-text-brand)] hover:underline"
              >
                {seed.title}
              </Link>
              <StatusBadge status={seed.status} />
            </div>
            <p className="mt-1 text-xs text-[var(--axis-text-secondary)] line-clamp-2">{seed.seedSummary}</p>
            {seed.deadEndFailurePattern && seed.deadEndFailurePattern.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {seed.deadEndFailurePattern.map((p) => (
                  <Badge key={p} variant="destructive" className="text-xs">{p}</Badge>
                ))}
              </div>
            )}
            {seed.status === "HOLD" && seed.notNowTriggerCondition && (
              <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                트리거: {seed.notNowTriggerCondition}
              </p>
            )}
          </Card>
        ))}
      </div>
    </AlertBanner>
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
    <PageLayout user={user}>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="새 Discovery 만들기"
          description="Seed 정보를 입력하여 Discovery를 시작합니다 (상태: INBOX)"
        />

        {actionData?.error && (
          <AlertBanner variant="destructive" className="mb-6">
            <p>{actionData.error}</p>
          </AlertBanner>
        )}

        <Card>
          <CardContent className="pt-6">
            <Form method="post" className="space-y-6">
              <FormField label="제목" htmlFor="title" required hint="Discovery를 한 줄로 표현합니다">
                <Input
                  type="text"
                  name="title"
                  id="title"
                  required
                  maxLength={80}
                  placeholder="80자 이내"
                />
              </FormField>

              <FormField label="Seed 요약" htmlFor="seedSummary" required hint="관찰한 내용, 문제 정의, 기회 요약 등">
                <Textarea
                  name="seedSummary"
                  id="seedSummary"
                  required
                  maxLength={400}
                  rows={5}
                  value={seedSummary}
                  onChange={(e) => setSeedSummary(e.target.value)}
                  placeholder="400자 이내"
                />
                <SimilarSeedsPanel seeds={similarSeeds} />
              </FormField>

              <FormField label="출처 유형" htmlFor="sourceType" required>
                <Select name="sourceType" id="sourceType" required>
                  <option value="">선택하세요</option>
                  {Object.entries(SOURCE_TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </FormField>

              <FormField label="참고 링크 (선택)" htmlFor="seedLinks" hint="여러 링크는 쉼표(,)로 구분합니다">
                <Input
                  type="text"
                  name="seedLinks"
                  id="seedLinks"
                  placeholder="https://example.com/article, https://..."
                />
              </FormField>

              <div className="flex flex-col gap-2 border-t border-[var(--axis-border-default)] pt-6 sm:flex-row sm:justify-end sm:gap-3">
                <Button variant="outline" asChild>
                  <a href="/discoveries">취소</a>
                </Button>
                <Button type="submit">생성하기</Button>
              </div>
            </Form>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
