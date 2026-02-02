import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, evidence, experiments, eventLogs } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { PageLayout } from "~/components/layout/PageLayout";
import { PageHeader } from "~/components/layout/PageHeader";
import { Card, CardContent } from "~/components/ui/Card";
import { Input } from "~/components/ui/Input";
import { Textarea } from "~/components/ui/Textarea";
import { Select } from "~/components/ui/Select";
import { FormField } from "~/components/ui/FormField";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { eq } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import { CreateEvidenceSchema } from "~/lib/validation/discovery-rules";
import { getFormErrorMessage } from "~/lib/utils/form-error";
import { EVIDENCE_TYPES, EVIDENCE_STRENGTHS } from "~/lib/constants/failure-patterns";

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

  // Get discovery
  const discovery = await db.query.discoveries.findFirst({
    where: eq(discoveries.id, id),
  });

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  // Cannot add evidence to INBOX
  if (discovery.status === DiscoveryStatus.DISCOVERY) {
    return redirect(`/discoveries/${id}`);
  }

  // Get experiments for linking
  const discoveryExperiments = await db
    .select()
    .from(experiments)
    .where(eq(experiments.discoveryId, id));

  return json({ user, discovery, experiments: discoveryExperiments });
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

  // Get discovery
  const discovery = await db.query.discoveries.findFirst({
    where: eq(discoveries.id, id),
  });

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  if (discovery.status === DiscoveryStatus.DISCOVERY) {
    return json({ error: "INBOX 상태에서는 Evidence를 추가할 수 없습니다" }, { status: 400 });
  }

  const formData = await request.formData();
  const type = formData.get("type");
  const strength = formData.get("strength");
  const content = formData.get("content");
  const linkOrAttachment = formData.get("linkOrAttachment") || undefined;
  const experimentId = formData.get("experimentId") || undefined;

  try {
    // Validate using Zod schema
    const validated = CreateEvidenceSchema.parse({
      type,
      strength,
      content,
      linkOrAttachment,
      experimentId,
    });

    // Create evidence
    const evidenceId = crypto.randomUUID();
    await db.insert(evidence).values({
      id: evidenceId,
      discoveryId: id,
      experimentId: validated.experimentId || null,
      type: validated.type,
      strength: validated.strength,
      content: validated.content,
      linkOrAttachment: validated.linkOrAttachment || null,
      createdById: user.id,
    });

    // Update discovery updatedAt
    await db
      .update(discoveries)
      .set({ updatedAt: new Date() })
      .where(eq(discoveries.id, id));

    await db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId: user.id,
      discoveryId: id,
      eventType: "ADD_EVIDENCE",
      metadata: { evidenceId, type: validated.type, strength: validated.strength },
    });

    return redirect(`/discoveries/${id}`);
  } catch (error: unknown) {
    return json(
      { error: getFormErrorMessage(error) },
      { status: 400 }
    );
  }
}

export default function AddEvidence() {
  const { user, discovery, experiments } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <PageLayout user={user}>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Evidence 추가"
          description="실험 결과나 관찰한 근거를 기록합니다"
        />

        {/* Discovery Info */}
        <AlertBanner variant="info" className="mb-6">
          <h2 className="text-lg font-semibold">{discovery.title}</h2>
          <p className="mt-2 text-sm">
            상태:{" "}
            <span className="font-semibold">
              {discovery.status === DiscoveryStatus.IDEA_CARD
                ? "진행 중"
                : discovery.status}
            </span>
          </p>
        </AlertBanner>

        {actionData?.error && (
          <AlertBanner variant="destructive" className="mb-6">
            <p>{actionData.error}</p>
          </AlertBanner>
        )}

        <Card>
          <CardContent className="pt-6">
            <Form method="post" className="space-y-6">
              {/* Evidence Type */}
              <FormField label="근거 유형" htmlFor="type" required>
                <Select
                  name="type"
                  id="type"
                  required
                >
                  <option value="">선택하세요</option>
                  {EVIDENCE_TYPES.map((evidenceType) => (
                    <option key={evidenceType.id} value={evidenceType.id}>
                      {evidenceType.label} - {evidenceType.description}
                    </option>
                  ))}
                </Select>
              </FormField>

              {/* Evidence Strength */}
              <FormField label="근거 강도" htmlFor="strength" required>
                <Select
                  name="strength"
                  id="strength"
                  required
                >
                  <option value="">선택하세요</option>
                  {EVIDENCE_STRENGTHS.map((str) => (
                    <option key={str.id} value={str.id}>
                      {str.label} - {str.description}
                    </option>
                  ))}
                </Select>
              </FormField>

              {/* Content */}
              <FormField label="내용" htmlFor="content" required hint="400자 이내">
                <Textarea
                  name="content"
                  id="content"
                  required
                  maxLength={400}
                  rows={4}
                  placeholder="근거 내용을 구체적으로 기술합니다"
                />
              </FormField>

              {/* Link or Attachment */}
              <FormField label="링크 또는 첨부 (선택)" htmlFor="linkOrAttachment" hint="데이터, 문서, 프로토타입 링크 등">
                <Input
                  type="url"
                  name="linkOrAttachment"
                  id="linkOrAttachment"
                  placeholder="https://..."
                />
              </FormField>

              {/* Experiment Link */}
              {experiments.length > 0 && (
                <FormField label="연결된 Experiment (선택)" htmlFor="experimentId">
                  <Select
                    name="experimentId"
                    id="experimentId"
                  >
                    <option value="">없음 (Discovery 직접 연결)</option>
                    {experiments.map((exp) => (
                      <option key={exp.id} value={exp.id}>
                        {exp.hypothesis.substring(0, 60)}
                        {exp.hypothesis.length > 60 ? "..." : ""}
                      </option>
                    ))}
                  </Select>
                </FormField>
              )}

              {/* Actions */}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3 border-t border-[var(--axis-border-default)] pt-6">
                <Button variant="outline" asChild>
                  <a href={`/discoveries/${discovery.id}`}>취소</a>
                </Button>
                <Button type="submit">Evidence 추가</Button>
              </div>
            </Form>
          </CardContent>
        </Card>

        {/* Helper */}
        <div className="mt-6 rounded-md bg-[var(--axis-surface-secondary)] p-4 text-sm text-[var(--axis-text-tertiary)]">
          <p className="font-semibold">Evidence 작성 팁:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              <strong>A급 (Hard):</strong> 재현 가능한 정량 데이터 (로그, A/B 테스트)
            </li>
            <li>
              <strong>B급 (Direct):</strong> 직접 관찰, 사용자 인터뷰
            </li>
            <li>
              <strong>C급 (Indirect):</strong> 경쟁사 사례, 논문, 벤치마크
            </li>
            <li>
              <strong>D급 (Intuition):</strong> 추론, 직관, 가정
            </li>
          </ul>
          <p className="mt-3 text-xs text-[var(--axis-badge-warning-text)]">
            NEXT 결정은 A/B급 Evidence 2개 이상 권장됩니다
          </p>
        </div>
      </div>
    </PageLayout>
  );
}
