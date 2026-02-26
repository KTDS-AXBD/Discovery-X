import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { DiscoveryStatus } from "~/db/schema";
import { DiscoveryService } from "~/lib/services";
import { DiscoveryQueryExtraService } from "~/lib/services/discovery/query-extra2";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { PageHeader } from "~/components/layout/PageHeader";
import { Card, CardContent } from "~/components/ui/Card";
import { Textarea } from "~/components/ui/Textarea";
import { FormField } from "~/components/ui/FormField";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import {
  DiscoveryValidationRules,
  ExtensionRequestedSchema,
} from "~/lib/validation/discovery-rules";
import { getFormErrorMessage } from "~/lib/utils/form-error";
import { createEmailClient } from "~/lib/notifications/email";
import { buildApprovalRequestEmail } from "~/lib/notifications/templates";
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

  const service = new DiscoveryService(db);
  const discovery = await service.getById(id);
  if (!discovery) {
    throw new Response("Not Found", { status: 404 });
  }

  // Can only request extension from OPEN status
  if (discovery.status !== DiscoveryStatus.IDEA_CARD) {
    return redirect(`/discoveries/${id}`);
  }

  // Must have exactly 2 experiments
  const currentCount = await service.getExperimentCount(id);
  if (currentCount < 2) {
    return redirect(`/discoveries/${id}`);
  }

  return json({ user, discovery, experimentCount: currentCount });
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

  if (discovery.status !== DiscoveryStatus.IDEA_CARD) {
    return json(
      { error: "OPEN 상태의 Discovery만 연장 요청할 수 있습니다" },
      { status: 400 }
    );
  }

  // Verify 2 experiments exist
  const currentCount = await service.getExperimentCount(id);
  if (currentCount < 2) {
    return json(
      { error: "실험이 2개 이상이어야 연장 요청할 수 있습니다" },
      { status: 400 }
    );
  }

  const formData = await request.formData();
  const extensionRationale = formData.get("extensionRationale");

  try {
    const validated = ExtensionRequestedSchema.parse({
      extensionRationale,
    });

    // Calculate new due date (+14 days)
    const currentDueDate = discovery.dueDate
      ? new Date(discovery.dueDate)
      : new Date();
    const newDueDate =
      DiscoveryValidationRules.calculateExtensionDueDate(currentDueDate);

    await service.requestExtension(id, {
      extensionRationale: validated.extensionRationale,
      previousDueDate: discovery.dueDate ? new Date(discovery.dueDate) : null,
      newDueDate,
    }, user.id);

    // Send email to reviewer
    try {
      const queryExtra = new DiscoveryQueryExtraService(db);
      const reviewerUser = discovery.reviewerId
        ? await queryExtra.getUserById(discovery.reviewerId)
        : null;
      if (reviewerUser) {
        const env = context.cloudflare.env as unknown as Record<string, string>;
        if (env.RESEND_API_KEY) {
          const emailClient = createEmailClient(env.RESEND_API_KEY);
          const email = buildApprovalRequestEmail({
            discoveryId: id,
            discoveryTitle: discovery.title,
            ownerName: user.name,
            decision: "IDEA_CARD",
          });
          await emailClient.send({ to: reviewerUser.email, ...email });
        }
      }
    } catch {
      // Email failure is non-blocking
    }

    return redirect(`/discoveries/${id}`);
  } catch (error: unknown) {
    return json({ error: getFormErrorMessage(error) }, { status: 400 });
  }
}

export default function RequestExtension() {
  const { user, discovery, experimentCount } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="연장 요청"
          description="3번째 실험을 위해 Discovery 기한을 연장합니다"
        />

        {/* Discovery Info */}
        <div className="mb-6 rounded-lg bg-badge-purple-bg p-4">
          <h2 className="text-lg font-semibold text-fg">
            {discovery.title}
          </h2>
          <p className="mt-2 text-sm text-fg-secondary">
            {discovery.seedSummary}
          </p>
          <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:space-x-4 text-xs text-fg-tertiary">
            <span>실험 수: {experimentCount}/2</span>
            {discovery.dueDate && (
              <span>
                현재 마감일: {formatDate(discovery.dueDate)}
              </span>
            )}
          </div>
        </div>

        {actionData?.error && (
          <AlertBanner variant="destructive" className="mb-6">
            <p>{actionData.error}</p>
          </AlertBanner>
        )}

        <Card>
          <CardContent className="pt-6">
            <Form method="post" className="space-y-6">
              <AlertBanner variant="purple">
                <p>
                  <strong>연장 요청:</strong> 2회 실험을 모두 소진했지만 추가
                  탐색이 필요한 경우, 기한을 14일 연장하고 3번째 실험을 추가할 수
                  있습니다.
                </p>
              </AlertBanner>

              {/* Extension Rationale */}
              <FormField label="연장 사유" htmlFor="extensionRationale" required hint="400자 이내">
                <Textarea
                  name="extensionRationale"
                  id="extensionRationale"
                  required
                  maxLength={400}
                  rows={5}
                  placeholder="왜 추가 실험이 필요한지, 기존 2회 실험에서 무엇을 배웠고 3번째 실험으로 무엇을 확인하려 하는지 기술합니다"
                />
              </FormField>

              {/* Actions */}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3 border-t border-line pt-6">
                <Button variant="outline" asChild>
                  <a href={`/discoveries/${discovery.id}`}>취소</a>
                </Button>
                <Button type="submit" variant="purple">승인 요청 (연장)</Button>
              </div>
            </Form>
          </CardContent>
        </Card>

        {/* Info */}
        <div className="mt-6 rounded-md bg-surface-secondary p-4 text-sm text-fg-tertiary">
          <p className="font-semibold">연장 요청 후:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>상태: OPEN → EXTENSION_REQUESTED</li>
            <li>마감일이 현재 기준 +14일 연장됩니다</li>
            <li>3번째 실험을 추가할 수 있습니다</li>
            <li>
              이후 NEXT / NOT NOW / DEAD END 결정이 가능합니다
            </li>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
