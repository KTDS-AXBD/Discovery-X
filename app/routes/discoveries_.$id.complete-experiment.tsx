import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, experiments, eventLogs } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { PageLayout } from "~/components/layout/PageLayout";
import { PageHeader } from "~/components/layout/PageHeader";
import { Card, CardContent } from "~/components/ui/Card";
import { Textarea } from "~/components/ui/Textarea";
import { FormField } from "~/components/ui/FormField";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { eq, and } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import { CompleteExperimentSchema } from "~/lib/validation/discovery-rules";
import { getFormErrorMessage } from "~/lib/utils/form-error";

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

  const url = new URL(request.url);
  const experimentId = url.searchParams.get("experimentId");
  if (!experimentId) {
    return redirect(`/discoveries/${id}`);
  }

  const discovery = await db.query.discoveries.findFirst({
    where: eq(discoveries.id, id),
  });

  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  if (
    discovery.status !== DiscoveryStatus.OPEN &&
    discovery.status !== DiscoveryStatus.EXTENSION_REQUESTED
  ) {
    return redirect(`/discoveries/${id}`);
  }

  const experiment = await db.query.experiments.findFirst({
    where: and(
      eq(experiments.id, experimentId),
      eq(experiments.discoveryId, id)
    ),
  });

  if (!experiment || experiment.completedAt) {
    return redirect(`/discoveries/${id}`);
  }

  return json({ user, discovery, experiment });
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

  const formData = await request.formData();
  const experimentId = formData.get("experimentId");
  const resultSummary = formData.get("resultSummary");

  if (!experimentId) {
    return json({ error: "실험 ID가 필요합니다" }, { status: 400 });
  }

  const experiment = await db.query.experiments.findFirst({
    where: and(
      eq(experiments.id, String(experimentId)),
      eq(experiments.discoveryId, id)
    ),
  });

  if (!experiment) {
    return json({ error: "실험을 찾을 수 없습니다" }, { status: 400 });
  }

  if (experiment.completedAt) {
    return json({ error: "이미 완료된 실험입니다" }, { status: 400 });
  }

  try {
    const validated = CompleteExperimentSchema.parse({ resultSummary });

    await db
      .update(experiments)
      .set({
        resultSummary: validated.resultSummary,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(experiments.id, String(experimentId)));

    await db
      .update(discoveries)
      .set({ updatedAt: new Date() })
      .where(eq(discoveries.id, id));

    await db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId: user.id,
      discoveryId: id,
      eventType: "COMPLETE_EXPERIMENT",
      metadata: {
        experimentId: String(experimentId),
        resultSummary: validated.resultSummary,
      },
    });

    return redirect(`/discoveries/${id}`);
  } catch (error: unknown) {
    return json({ error: getFormErrorMessage(error) }, { status: 400 });
  }
}

export default function CompleteExperiment() {
  const { user, discovery, experiment } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <PageLayout user={user}>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="실험 결과 기록"
          description="실험의 결과를 기록하고 완료 처리합니다"
        />

        {/* Discovery Info */}
        <AlertBanner variant="info" className="mb-6">
          <h2 className="text-lg font-semibold">{discovery.title}</h2>
        </AlertBanner>

        {/* Experiment Info */}
        <div className="mb-6 rounded-lg bg-[var(--axis-surface-secondary)] p-4">
          <h3 className="text-sm font-medium text-[var(--axis-text-primary)]">실험 정보</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="font-medium text-[var(--axis-text-tertiary)]">가설</dt>
              <dd className="mt-1 text-[var(--axis-text-primary)]">{experiment.hypothesis}</dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--axis-text-tertiary)]">최소 행동</dt>
              <dd className="mt-1 text-[var(--axis-text-primary)]">{experiment.minimalAction}</dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--axis-text-tertiary)]">예상 근거</dt>
              <dd className="mt-1 text-[var(--axis-text-primary)]">{experiment.expectedEvidence}</dd>
            </div>
            <div>
              <dt className="font-medium text-[var(--axis-text-tertiary)]">마감일</dt>
              <dd className="mt-1 text-[var(--axis-text-primary)]">
                {new Date(experiment.deadline).toLocaleDateString("ko-KR")}
              </dd>
            </div>
          </dl>
        </div>

        {actionData?.error && (
          <AlertBanner variant="destructive" className="mb-6">
            <p>{actionData.error}</p>
          </AlertBanner>
        )}

        <Card>
          <CardContent className="pt-6">
            <Form method="post" className="space-y-6">
              <input type="hidden" name="experimentId" value={experiment.id} />

              <FormField label="결과 요약" htmlFor="resultSummary" required hint="400자 이내">
                <Textarea
                  name="resultSummary"
                  id="resultSummary"
                  required
                  maxLength={400}
                  rows={5}
                  placeholder="실험 결과를 요약합니다. 가설이 검증되었는지, 어떤 데이터/피드백을 얻었는지 기술합니다."
                />
              </FormField>

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3 border-t border-[var(--axis-border-default)] pt-6">
                <Button variant="outline" asChild>
                  <a href={`/discoveries/${discovery.id}`}>취소</a>
                </Button>
                <Button type="submit" variant="success">결과 기록 완료</Button>
              </div>
            </Form>
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}
