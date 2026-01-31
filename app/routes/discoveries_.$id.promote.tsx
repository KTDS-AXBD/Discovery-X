import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useActionData, useLoaderData } from "@remix-run/react";
import { getDb } from "~/db";
import { discoveries, experiments, users, eventLogs } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { PageLayout } from "~/components/layout/PageLayout";
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

  // Can only promote INBOX discoveries
  if (discovery.status !== DiscoveryStatus.INBOX) {
    return redirect(`/discoveries/${id}`);
  }

  // Get all users for Owner selection
  const allUsers = await db.select().from(users);

  return json({ user, discovery, allUsers });
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

  if (discovery.status !== DiscoveryStatus.INBOX) {
    return json({ error: "INBOX 상태의 Discovery만 승격할 수 있습니다" }, { status: 400 });
  }

  const formData = await request.formData();
  const ownerId = formData.get("ownerId");
  const reviewerId = formData.get("reviewerId") || null;
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
    const validated = PromoteToOpenSchema.parse({
      ownerId,
      firstExperiment: {
        hypothesis,
        minimalAction,
        deadline,
        expectedEvidence,
      },
    });

    // Additional validation: Owner required
    DiscoveryValidationRules.validateOwnerRequired(validated.ownerId);

    // Calculate due date (createdAt + 28 days)
    const dueDate = DiscoveryValidationRules.calculateDueDate(discovery.createdAt);

    // Create experiment
    const experimentId = crypto.randomUUID();
    await db.insert(experiments).values({
      id: experimentId,
      discoveryId: id,
      hypothesis: validated.firstExperiment.hypothesis,
      minimalAction: validated.firstExperiment.minimalAction,
      deadline: validated.firstExperiment.deadline,
      expectedEvidence: validated.firstExperiment.expectedEvidence,
    });

    // Update discovery status
    await db
      .update(discoveries)
      .set({
        status: DiscoveryStatus.OPEN,
        ownerId: validated.ownerId,
        reviewerId: reviewerId ? String(reviewerId) : null,
        dueDate,
        updatedAt: new Date(),
      })
      .where(eq(discoveries.id, id));

    // Create event log
    await db.insert(eventLogs).values({
      id: crypto.randomUUID(),
      actorId: user.id,
      discoveryId: id,
      eventType: "PROMOTE_OPEN",
      metadata: {
        ownerId: validated.ownerId,
        experimentId,
        dueDate: dueDate.toISOString(),
      },
    });

    return redirect(`/discoveries/${id}`);
  } catch (error: unknown) {
    return json(
      { error: getFormErrorMessage(error) },
      { status: 400 }
    );
  }
}

export default function PromoteToOpen() {
  const { user, discovery, allUsers } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  // Calculate default deadline (today + 7 days)
  const defaultDeadline = new Date();
  defaultDeadline.setDate(defaultDeadline.getDate() + 7);
  const defaultDeadlineStr = defaultDeadline.toISOString().split("T")[0];

  // Calculate expected due date (createdAt + 28 days)
  const expectedDueDate = new Date(discovery.createdAt);
  expectedDueDate.setDate(expectedDueDate.getDate() + 28);

  return (
    <PageLayout user={user}>
      <div className="mx-auto max-w-2xl">
        <PageHeader
          title="OPEN으로 승격"
          description="Owner를 지정하고 첫 번째 실험을 등록하여 Discovery를 시작합니다"
        />

        {/* Discovery Info */}
        <div className="mb-6 rounded-lg bg-[var(--axis-surface-brand)] p-4">
          <h2 className="text-lg font-semibold text-[var(--axis-text-primary)]">{discovery.title}</h2>
          <p className="mt-2 text-sm text-[var(--axis-text-secondary)]">{discovery.seedSummary}</p>
          <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:space-x-4 text-xs text-[var(--axis-text-tertiary)]">
            <span>
              생성: {new Date(discovery.createdAt).toLocaleDateString("ko-KR")}
            </span>
            <span>
              → 예상 마감: {expectedDueDate.toLocaleDateString("ko-KR")} (28일)
            </span>
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

              <hr className="border-[var(--axis-border-default)]" />

              <div>
                <h3 className="text-lg font-medium text-[var(--axis-text-primary)]">첫 번째 Experiment</h3>
                <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
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
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end sm:gap-3 border-t border-[var(--axis-border-default)] pt-6">
                <Button variant="outline" asChild>
                  <a href={`/discoveries/${discovery.id}`}>취소</a>
                </Button>
                <Button type="submit">OPEN으로 승격</Button>
              </div>
            </Form>
          </CardContent>
        </Card>

        {/* Info Box */}
        <div className="mt-6 rounded-md bg-[var(--axis-surface-secondary)] p-4 text-sm text-[var(--axis-text-tertiary)]">
          <p className="font-semibold">승격 시 자동 설정:</p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>상태: INBOX → OPEN</li>
            <li>Discovery 마감일: {expectedDueDate.toLocaleDateString("ko-KR")} (생성일 + 28일)</li>
            <li>첫 번째 Experiment 등록 (최대 2개까지 추가 가능)</li>
            <li>EventLog 기록 (PROMOTE_OPEN)</li>
          </ul>
        </div>
      </div>
    </PageLayout>
  );
}
