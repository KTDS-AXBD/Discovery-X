import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, experiments, eventLogs } from "~/db/schema";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { PageHeader } from "~/components/layout/PageHeader";
import { Card, CardContent } from "~/components/ui/Card";
import { Input } from "~/components/ui/Input";
import { FormField } from "~/components/ui/FormField";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { eq, count } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import { DiscoveryValidationRules, CreateExperimentSchema } from "~/lib/validation/discovery-rules";
import { getFormErrorMessage } from "~/lib/utils/form-error";
import { formatDate, getDefaultDeadline } from "~/lib/format-date";

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

  // Get discovery
  const discovery = await db.query.discoveries.findFirst({
    where: eq(discoveries.id, id),
  });

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  // Can only add experiments to OPEN or EXTENSION_REQUESTED discoveries
  if (
    discovery.status !== DiscoveryStatus.IDEA_CARD &&
    discovery.status !== DiscoveryStatus.IDEA_CARD
  ) {
    return redirect(`/discoveries/${id}`);
  }

  // Check experiment count
  const experimentCount = await db
    .select({ count: count() })
    .from(experiments)
    .where(eq(experiments.discoveryId, id));

  const currentCount = experimentCount[0]?.count || 0;
  const maxExperiments =
    discovery.status === DiscoveryStatus.IDEA_CARD ? 3 : 2;

  if (currentCount >= maxExperiments) {
    return redirect(`/discoveries/${id}`);
  }

  // 서버에서 계산하여 hydration 불일치 방지
  const defaultDeadlineStr = getDefaultDeadline();
  const dueDateFormatted = formatDate(discovery.dueDate);

  return json({ user, discovery, currentCount, maxExperiments, defaultDeadlineStr, dueDateFormatted });
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

  // Get discovery
  const discovery = await db.query.discoveries.findFirst({
    where: eq(discoveries.id, id),
  });

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  if (
    discovery.status !== DiscoveryStatus.IDEA_CARD &&
    discovery.status !== DiscoveryStatus.IDEA_CARD
  ) {
    return json(
      { error: "OPEN 또는 EXTENSION_REQUESTED 상태의 Discovery만 실험을 추가할 수 있습니다" },
      { status: 400 }
    );
  }

  // Validate experiment limit (max 2, or max 3 if EXTENSION_REQUESTED)
  if (discovery.status === DiscoveryStatus.IDEA_CARD) {
    const expCount = await db
      .select({ count: count() })
      .from(experiments)
      .where(eq(experiments.discoveryId, id));
    if ((expCount[0]?.count || 0) >= 3) {
      return json(
        { error: "연장 상태에서도 최대 3개 실험만 가능합니다." },
        { status: 400 }
      );
    }
  } else {
    try {
      await DiscoveryValidationRules.validateExperimentLimit(db, id);
    } catch (error: unknown) {
      return json({ error: getFormErrorMessage(error, "실험 제한 초과") }, { status: 400 });
    }
  }

  const formData = await request.formData();
  const hypothesis = formData.get("hypothesis");
  const minimalAction = formData.get("minimalAction");
  const deadlineStr = formData.get("deadline");
  const expectedEvidence = formData.get("expectedEvidence");

  try {
    // Parse deadline
    const deadline = deadlineStr ? new Date(String(deadlineStr)) : null;
    if (!deadline) {
      throw new Error("실험 마감일을 입력해주세요");
    }

    // Validate using Zod schema
    const validated = CreateExperimentSchema.parse({
      hypothesis,
      minimalAction,
      deadline,
      expectedEvidence,
    });

    // Create experiment
    const experimentId = crypto.randomUUID();
    await db.insert(experiments).values({
      id: experimentId,
      discoveryId: id,
      hypothesis: validated.hypothesis,
      minimalAction: validated.minimalAction,
      deadline: validated.deadline,
      expectedEvidence: validated.expectedEvidence,
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
      eventType: "ADD_EXPERIMENT",
      metadata: { experimentId, hypothesis: validated.hypothesis },
    });

    return redirect(`/discoveries/${id}`);
  } catch (error: unknown) {
    return json(
      { error: getFormErrorMessage(error) },
      { status: 400 }
    );
  }
}

export default function AddExperiment() {
  const { user, discovery, currentCount, maxExperiments, defaultDeadlineStr, dueDateFormatted } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="Experiment 추가"
          description={`실험을 등록합니다 (현재: ${currentCount}/${maxExperiments})`}
        />

        {/* Discovery Info */}
        <AlertBanner variant="info" className="mb-6">
          <h2 className="text-lg font-semibold">{discovery.title}</h2>
          <p className="mt-2 text-sm">{discovery.seedSummary}</p>
        </AlertBanner>

        {actionData?.error && (
          <AlertBanner variant="destructive" className="mb-6">
            <p>{actionData.error}</p>
          </AlertBanner>
        )}

        <Card>
          <CardContent className="pt-6">
            <Form method="post" className="space-y-6">
              <AlertBanner variant="default">
                <p>
                  <strong>💡 Tip:</strong> 채팅에서 "실험 추천해줘"라고 요청하면 Method Pack 분석 결과 기반 실험 초안을 받을 수 있습니다.
                </p>
              </AlertBanner>

              <AlertBanner variant="warning">
                <p>
                  <strong>주의:</strong> Discovery당 최대 2개의 실험만 가능합니다.
                  3번째 실험은 Reviewer 승인이 필요합니다.
                </p>
              </AlertBanner>

              {/* Hypothesis */}
              <FormField label="가설" htmlFor="hypothesis" required hint="200자 이내">
                <Input
                  type="text"
                  name="hypothesis"
                  id="hypothesis"
                  required
                  maxLength={200}
                  placeholder="예: 대시보드 UI를 개선하면 사용자 만족도가 향상될 것이다"
                />
              </FormField>

              {/* Minimal Action */}
              <FormField label="최소 행동" htmlFor="minimalAction" required hint="200자 이내">
                <Input
                  type="text"
                  name="minimalAction"
                  id="minimalAction"
                  required
                  maxLength={200}
                  placeholder="예: Figma 프로토타입 제작 후 5명 사용자 테스트"
                />
              </FormField>

              {/* Deadline */}
              <FormField
                label="실험 마감일"
                htmlFor="deadline"
                required
                hint={`Discovery 마감일: ${dueDateFormatted}`}
              >
                <Input
                  type="date"
                  name="deadline"
                  id="deadline"
                  required
                  defaultValue={defaultDeadlineStr}
                  max={discovery.dueDate ? String(discovery.dueDate).split("T")[0] : undefined}
                />
              </FormField>

              {/* Expected Evidence */}
              <FormField label="예상 근거" htmlFor="expectedEvidence" required hint="200자 이내">
                <Input
                  type="text"
                  name="expectedEvidence"
                  id="expectedEvidence"
                  required
                  maxLength={200}
                  placeholder="예: 사용자 만족도 점수 3.5 → 4.0 이상 향상"
                />
              </FormField>

              {/* Actions */}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3 border-t border-[var(--axis-border-default)] pt-6">
                <Button variant="outline" asChild>
                  <a href={`/discoveries/${discovery.id}`}>취소</a>
                </Button>
                <Button type="submit">실험 추가</Button>
              </div>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
