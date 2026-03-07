import { useState, useEffect, useRef, useCallback } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, Link, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { SourceType } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { DiscoveryService } from "~/features/discovery/service";
import { AppShell } from "~/components/layout/AppShell";
import { PageHeader } from "~/components/layout/PageHeader";
import { CreateDiscoverySchema } from "~/features/discovery/validation/discovery-rules";
import { getFormErrorMessage } from "~/lib/utils/form-error";
import { StatusBadge } from "~/components/ui/StatusBadge";
import { Card, CardContent } from "~/components/ui/Card";
import { Input } from "~/components/ui/Input";
import { Textarea } from "~/components/ui/Textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "~/components/ui/Select";
import { FormField } from "~/components/ui/FormField";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { Badge } from "~/components/ui/Badge";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }
  const user = ctx.user;

  return json({ user });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }
  const user = ctx.user;

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

    const service = new DiscoveryService(db);
    const created = await service.create(
      {
        title: validated.title,
        seedSummary: validated.seedSummary,
        seedLinks: validated.seedLinks,
        sourceType: validated.sourceType,
        ownerId: user.id,
        tenantId: ctx.tenantId,
      },
      user.id,
    );

    return redirect(`/discoveries/${created.id}`);
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
  score?: number;
}

interface SimilarSeedsResponse {
  results: SimilarSeed[];
  source?: "vectorize" | "fts5";
}

const TRIGGER_TYPE_LABELS: Record<string, string> = {
  Technology_Maturity: "기술 성숙",
  Policy_Regulation: "정책/규제",
  Customer_Behavior: "고객 행동",
  Internal_Capability: "내부 역량",
};

function SimilarSeedsPanel({ seeds, source }: { seeds: SimilarSeed[]; source?: "vectorize" | "fts5" }) {
  if (seeds.length === 0) return null;

  return (
    <AlertBanner variant="warning" title={`유사한 Discovery가 ${seeds.length}건 있습니다`}>
      <div className="mt-1 flex items-center gap-2">
        {source === "vectorize" && (
          <Badge variant="purple" className="text-xs">AI 시맨틱</Badge>
        )}
        {source === "fts5" && (
          <Badge variant="subtle" className="text-xs">텍스트 매칭</Badge>
        )}
      </div>
      <div className="mt-3 space-y-3">
        {seeds.map((seed) => (
          <Card key={seed.id} className="p-3">
            <div className="flex items-center justify-between">
              <Link
                to={`/discoveries/${seed.id}`}
                className="text-sm font-medium text-fg-brand hover:underline"
              >
                {seed.title}
              </Link>
              <div className="flex items-center gap-2">
                {seed.score != null && (
                  <span className="text-xs text-fg-tertiary">
                    {Math.round(seed.score * 100)}%
                  </span>
                )}
                <StatusBadge status={seed.status} />
              </div>
            </div>
            <p className="mt-1 text-xs text-fg-secondary line-clamp-2">{seed.seedSummary}</p>
            {seed.deadEndFailurePattern && seed.deadEndFailurePattern.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {seed.deadEndFailurePattern.map((p) => (
                  <Badge key={p} variant="destructive" className="text-xs">{p}</Badge>
                ))}
              </div>
            )}
            {seed.status === "DROP" && (
              <p className="mt-1 text-xs text-fg-error">
                실패 사례 — 동일 패턴에 주의하세요
              </p>
            )}
            {seed.status === "HOLD" && seed.notNowTriggerCondition && (
              <p className="mt-1 text-xs text-fg-tertiary">
                트리거: {seed.notNowTriggerType ? `${TRIGGER_TYPE_LABELS[seed.notNowTriggerType] ?? seed.notNowTriggerType} — ` : ""}{seed.notNowTriggerCondition}
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
  const [title, setTitle] = useState("");
  const [seedSummary, setSeedSummary] = useState("");
  const [similarSeeds, setSimilarSeeds] = useState<SimilarSeed[]>([]);
  const [searchSource, setSearchSource] = useState<"vectorize" | "fts5" | undefined>();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchSimilarSeeds = useCallback(async (query: string) => {
    if (query.length < 5) {
      setSimilarSeeds([]);
      setSearchSource(undefined);
      return;
    }
    try {
      const res = await fetch(`/api/similar-seeds?q=${encodeURIComponent(query)}&limit=5`);
      if (res.ok) {
        const data = await res.json() as SimilarSeedsResponse;
        setSimilarSeeds(data.results);
        setSearchSource(data.source);
      }
    } catch {
      // Silently fail
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const query = seedSummary.length >= 5 ? seedSummary : title;
    debounceRef.current = setTimeout(() => {
      fetchSimilarSeeds(query);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [title, seedSummary, fetchSimilarSeeds]);

  return (
    <AppShell user={user}>
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
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
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
                <SimilarSeedsPanel seeds={similarSeeds} source={searchSource} />
              </FormField>

              <FormField label="출처 유형" htmlFor="sourceType" required>
                <Select name="sourceType" required>
                  <SelectTrigger id="sourceType">
                    <SelectValue placeholder="선택하세요" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(SOURCE_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
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

              <div className="flex flex-col gap-2 border-t border-line pt-6 sm:flex-row sm:justify-end sm:gap-3">
                <Button variant="outline" asChild>
                  <a href="/discoveries">취소</a>
                </Button>
                <Button type="submit">생성하기</Button>
              </div>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
