import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, experiments } from "~/db/schema";
import { DiscoveryService } from "~/lib/services/discovery.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
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
import { formatDate } from "~/lib/format-date";

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
    discovery.status !== DiscoveryStatus.IDEA_CARD &&
    discovery.status !== DiscoveryStatus.IDEA_CARD
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
  const ctx = await getSessionContext(request, db, secret);

  if (!ctx) {
    return redirect("/login");
  }
  const user = ctx.user;

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

  try {
    const validated = CompleteExperimentSchema.parse({ resultSummary });

    const service = new DiscoveryService(db);
    await service.completeExperiment(
      id,
      {
        experimentId: String(experimentId),
        resultSummary: validated.resultSummary,
      },
      user.id,
    );

    return redirect(`/discoveries/${id}`);
  } catch (error: unknown) {
    return json({ error: getFormErrorMessage(error) }, { status: 400 });
  }
}

export default function CompleteExperiment() {
  const { user, discovery, experiment } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <AppShell user={user}>
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
        <div className="mb-6 rounded-lg bg-surface-secondary p-4">
          <h3 className="text-sm font-medium text-fg">실험 정보</h3>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="font-medium text-fg-tertiary">가설</dt>
              <dd className="mt-1 text-fg">{experiment.hypothesis}</dd>
            </div>
            <div>
              <dt className="font-medium text-fg-tertiary">최소 행동</dt>
              <dd className="mt-1 text-fg">{experiment.minimalAction}</dd>
            </div>
            <div>
              <dt className="font-medium text-fg-tertiary">예상 근거</dt>
              <dd className="mt-1 text-fg">{experiment.expectedEvidence}</dd>
            </div>
            <div>
              <dt className="font-medium text-fg-tertiary">마감일</dt>
              <dd className="mt-1 text-fg">
                {formatDate(experiment.deadline)}
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

              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3 border-t border-line pt-6">
                <Button variant="outline" asChild>
                  <a href={`/discoveries/${discovery.id}`}>취소</a>
                </Button>
                <Button type="submit" variant="success">결과 기록 완료</Button>
              </div>
            </Form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
