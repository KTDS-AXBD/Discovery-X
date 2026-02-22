import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, users } from "~/db/schema";
import { DiscoveryService } from "~/lib/services/discovery.service";
import { getSessionContext, getSessionSecret } from "~/lib/auth/session.server";
import { AppShell } from "~/components/layout/AppShell";
import { PageHeader } from "~/components/layout/PageHeader";
import { Card, CardContent } from "~/components/ui/Card";
import { Input } from "~/components/ui/Input";
import { Select } from "~/components/ui/Select";
import { FormField } from "~/components/ui/FormField";
import { Button } from "~/components/ui/Button";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { eq } from "drizzle-orm";
import { DiscoveryStatus } from "~/db/schema";
import { DiscoveryValidationRules, PromoteToOpenSchema } from "~/lib/validation/discovery-rules";
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

  // Can only promote INBOX discoveries
  if (discovery.status !== DiscoveryStatus.DISCOVERY) {
    return redirect(`/discoveries/${id}`);
  }

  // Get all users for Owner selection
  const allUsers = await db.select().from(users);

  // 서버에서 계산하여 hydration 불일치 방지
  const expectedDueDateStr = formatDate(DiscoveryValidationRules.calculateDueDate(discovery.createdAt));
  const defaultDeadlineStr = getDefaultDeadline();

  return json({ user, discovery, allUsers, expectedDueDateStr, defaultDeadlineStr });
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
  const ownerId = formData.get("ownerId");
  const reviewerId = formData.get("reviewerId") || null;
  const hypothesis = formData.get("hypothesis");
  const minimalAction = formData.get("minimalAction");
  const deadlineStr = formData.get("deadline");
  const expectedEvidence = formData.get("expectedEvidence");

  try {
    const deadline = deadlineStr ? new Date(String(deadlineStr)) : null;
    if (!deadline) {
      throw new Error("실험 마감일을 입력해주세요");
    }

    const validated = PromoteToOpenSchema.parse({
      ownerId,
      firstExperiment: {
        hypothesis,
        minimalAction,
        deadline,
        expectedEvidence,
      },
    });

    const service = new DiscoveryService(db);
    await service.promote(
      id,
      {
        ownerId: validated.ownerId,
        reviewerId: reviewerId ? String(reviewerId) : null,
        firstExperiment: validated.firstExperiment,
      },
      user.id,
    );

    return redirect(`/discoveries/${id}`);
  } catch (error: unknown) {
    return json(
      { error: getFormErrorMessage(error) },
      { status: 400 }
    );
  }
}

export default function PromoteToOpen() {
  const { user, discovery, allUsers, expectedDueDateStr, defaultDeadlineStr } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="OPEN으로 승격"
          description="Owner를 지정하고 첫 번째 실험을 등록하여 Discovery를 시작합니다"
        />

        {/* Discovery Info */}
        <AlertBanner variant="info" className="mb-6">
          <h2 className="text-lg font-semibold">{discovery.title}</h2>
          <p className="mt-2 text-sm">{discovery.seedSummary}</p>
          <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:space-x-4 text-xs opacity-80">
            <span>
              생성: {formatDate(discovery.createdAt)}
            </span>
            <span>
              → 예상 마감: {expectedDueDateStr} (28일)
            </span>
          </div>
        </AlertBanner>

        {actionData?.error && (
          <AlertBanner variant="destructive" className="mb-6">
            <p>{actionData.error}</p>
          </AlertBanner>
        )}

        <Card>
          <CardContent className="pt-6">
            <Form method="post" className="space-y-6">
              <AlertBanner variant="warning">
                <p>
                  <strong>필수 조건:</strong> Owner 지정 + 첫 번째 Experiment 등록
                </p>
              </AlertBanner>

              {/* Owner Selection */}
              <FormField label="Owner 지정" htmlFor="ownerId" required hint="Discovery의 책임자 (실험, 문서, 결정 담당)">
                <Select
                  name="ownerId"
                  id="ownerId"
                  required
                  defaultValue={user.id}
                >
                  <option value="">선택하세요</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </Select>
              </FormField>

              {/* Reviewer Selection */}
              <FormField label="Reviewer 지정 (선택)" htmlFor="reviewerId" hint="Decision Review 시 검토를 담당할 사람 (권장)">
                <Select
                  name="reviewerId"
                  id="reviewerId"
                  defaultValue=""
                >
                  <option value="">없음</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.email})
                    </option>
                  ))}
                </Select>
              </FormField>

              <hr className="border-line" />

              <div>
                <h3 className="text-lg font-medium text-fg">첫 번째 Experiment</h3>
                <p className="mt-1 text-sm text-fg-tertiary">
                  가설을 검증하기 위한 최소 행동을 정의합니다
                </p>
              </div>

              {/* Hypothesis */}
              <FormField label="가설" htmlFor="hypothesis" required hint="200자 이내">
                <Input
                  type="text"
                  name="hypothesis"
                  id="hypothesis"
                  required
                  maxLength={200}
                  placeholder="예: 사용자들은 검색 시간을 15분 → 3분으로 단축하고 싶어할 것이다"
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
                  placeholder="예: 5명에게 프로토타입 보여주고 사용 시간 측정"
                />
              </FormField>

              {/* Deadline */}
              <FormField label="실험 마감일" htmlFor="deadline" required hint="기본 D+7일 (최대 Discovery 마감일까지)">
                <Input
                  type="date"
                  name="deadline"
                  id="deadline"
                  required
                  defaultValue={defaultDeadlineStr}
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
                  placeholder="예: 5명 중 3명 이상이 시간 단축 체감, 정량 데이터 로그"
                />
              </FormField>

              {/* Actions */}
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3 border-t border-line pt-6">
                <Button variant="outline" asChild>
                  <a href={`/discoveries/${discovery.id}`}>취소</a>
                </Button>
                <Button type="submit">OPEN으로 승격</Button>
              </div>
            </Form>
          </CardContent>
        </Card>

        {/* Info Box */}
        <div className="mt-6 rounded-md bg-surface-secondary p-4 text-sm text-fg-tertiary">
          <p className="font-semibold">승격 시 자동 설정:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>상태: INBOX → OPEN</li>
            <li>Discovery 마감일: {expectedDueDateStr} (생성일 + 28일)</li>
            <li>첫 번째 Experiment 등록 (최대 2개까지 추가 가능)</li>
            <li>EventLog 기록 (PROMOTE_OPEN)</li>
          </ul>
        </div>
      </div>
    </AppShell>
  );
}
