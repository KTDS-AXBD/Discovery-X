import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { PageHeader } from "~/components/layout/PageHeader";
import { Card, CardContent } from "~/components/ui/Card";
import { Input } from "~/components/ui/Input";
import { Textarea } from "~/components/ui/Textarea";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "~/components/ui/Select";
import { FormField } from "~/components/ui/FormField";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { DiscoveryStatus, SourceType } from "~/db/schema";
import { CreateDiscoverySchema } from "~/features/discovery/validation/discovery-rules";
import { getFormErrorMessage } from "~/lib/utils/form-error";
import { DiscoveryService } from "~/features/discovery/service";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }
  const user = ctx.user;

  const { id } = params;
  if (!id) {
    throw new Response("Not Found", { status: 404 });
  }

  const service = new DiscoveryService(db);
  const discovery = await service.getById(id);
  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  // Only INBOX/OPEN can be edited
  if (discovery.status !== DiscoveryStatus.DISCOVERY && discovery.status !== DiscoveryStatus.IDEA_CARD) {
    return redirect(`/discoveries/${id}`);
  }

  return json({ user, discovery });
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }
  const user = ctx.user;

  const { id } = params;
  if (!id) {
    throw new Response("Not Found", { status: 404 });
  }

  const service = new DiscoveryService(db);
  const discovery = await service.getById(id);
  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  if (discovery.status !== DiscoveryStatus.DISCOVERY && discovery.status !== DiscoveryStatus.IDEA_CARD) {
    return json({ error: "INBOX/OPEN 상태에서만 편집할 수 있습니다" }, { status: 400 });
  }

  const formData = await request.formData();
  const title = formData.get("title");
  const seedSummary = formData.get("seedSummary");
  const seedLinksRaw = formData.get("seedLinks");
  const sourceType = formData.get("sourceType");
  const targetSegment = formData.get("targetSegment");
  const valueProposition = formData.get("valueProposition");

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

    await service.update(id, {
      title: validated.title,
      seedSummary: validated.seedSummary,
      seedLinks: validated.seedLinks,
      sourceType: validated.sourceType,
      targetSegment: targetSegment ? String(targetSegment).slice(0, 200) : null,
      valueProposition: valueProposition ? String(valueProposition).slice(0, 400) : null,
    }, user.id);

    return redirect(`/discoveries/${id}`);
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

export default function EditDiscovery() {
  const { user, discovery } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Discovery 편집"
          description="Seed 정보를 수정합니다"
        />

        {actionData?.error && (
          <AlertBanner variant="destructive" className="mb-6">
            <p>{actionData.error}</p>
          </AlertBanner>
        )}

        <Card>
          <CardContent className="pt-6">
            <Form method="post" className="space-y-6">
              {/* Title */}
              <FormField label="제목" htmlFor="title" required hint="Discovery를 한 줄로 표현합니다">
                <Input
                  type="text"
                  name="title"
                  id="title"
                  required
                  maxLength={80}
                  defaultValue={discovery.title}
                  placeholder="80자 이내"
                />
              </FormField>

              {/* Seed Summary */}
              <FormField label="Seed 요약" htmlFor="seedSummary" required hint="관찰한 내용, 문제 정의, 기회 요약 등">
                <Textarea
                  name="seedSummary"
                  id="seedSummary"
                  required
                  maxLength={400}
                  rows={5}
                  defaultValue={discovery.seedSummary}
                  placeholder="400자 이내"
                />
              </FormField>

              {/* Source Type */}
              <FormField label="출처 유형" htmlFor="sourceType" required>
                <Select name="sourceType" required defaultValue={discovery.sourceType}>
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

              {/* Seed Links */}
              <FormField label="참고 링크 (선택)" htmlFor="seedLinks" hint="여러 링크는 쉼표(,)로 구분합니다">
                <Input
                  type="text"
                  name="seedLinks"
                  id="seedLinks"
                  defaultValue={discovery.seedLinks?.join(", ") || ""}
                  placeholder="https://example.com/article, https://..."
                />
              </FormField>

              {/* Target Segment (BD PoC) */}
              <FormField label="타겟 고객/시장 (선택)" htmlFor="targetSegment" hint="이 아이디어가 노리는 고객 세그먼트나 시장">
                <Input
                  type="text"
                  name="targetSegment"
                  id="targetSegment"
                  maxLength={200}
                  defaultValue={discovery.targetSegment || ""}
                  placeholder="예: 중소 제조업체, 물류 스타트업"
                />
              </FormField>

              {/* Value Proposition (BD PoC) */}
              <FormField label="가치 제안 (선택)" htmlFor="valueProposition" hint="고객에게 제공하는 핵심 가치">
                <Textarea
                  name="valueProposition"
                  id="valueProposition"
                  maxLength={400}
                  rows={3}
                  defaultValue={discovery.valueProposition || ""}
                  placeholder="예: AI 기반 품질 검사로 불량률 50% 감소"
                />
              </FormField>

              {/* Actions */}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3 border-t border-line pt-6">
                <Button variant="outline" asChild>
                  <a href={`/discoveries/${discovery.id}`}>취소</a>
                </Button>
                <Button type="submit">저장</Button>
              </div>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
