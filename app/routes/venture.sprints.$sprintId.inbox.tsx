/**
 * Venture Sprint Inbox 탭
 * /venture/sprints/:sprintId/inbox
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { Button } from "~/components/ui/Button";
import { Badge } from "~/components/ui/Badge";
import { EmptyState } from "~/components/venture/EmptyState";
import { getSprintById } from "~/features/venture/repositories/sprint.repository";
import {
  listSignalsBySprint,
  createSignal,
  getSignalCount,
} from "~/features/venture/repositories/signal.repository";
import { listEvidencesBySprint, createEvidence } from "~/features/venture/repositories/opportunity.repository";
import { createWorkEvent } from "~/features/venture/repositories/analytics.repository";
import { createSignalSchema, createEvidenceSchema } from "~/features/venture/schemas/opportunity.schema";
import type { VdSignalTypeValue, VdEvidenceStrengthValue } from "~/features/venture/types";

const SIGNAL_TYPES: { value: VdSignalTypeValue; label: string }[] = [
  { value: "TREND", label: "트렌드" },
  { value: "NEWS", label: "뉴스" },
  { value: "RESEARCH", label: "리서치" },
  { value: "COMPETITOR", label: "경쟁사" },
  { value: "INTERNAL", label: "내부" },
  { value: "USER_FEEDBACK", label: "사용자 피드백" },
];

const EVIDENCE_STRENGTHS: { value: VdEvidenceStrengthValue; label: string; description: string }[] = [
  { value: "A", label: "A", description: "하드 데이터" },
  { value: "B", label: "B", description: "직접 관찰" },
  { value: "C", label: "C", description: "간접" },
  { value: "D", label: "D", description: "가설" },
];

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const { sprintId } = params;
  if (!sprintId) {
    return redirect("/venture/sprints");
  }

  const sprint = await getSprintById(db, sprintId);
  if (!sprint) {
    throw new Response("Sprint not found", { status: 404 });
  }

  const [signals, evidences, signalCount] = await Promise.all([
    listSignalsBySprint(db, sprintId),
    listEvidencesBySprint(db, sprintId),
    getSignalCount(db, sprintId),
  ]);

  return json({ sprint, signals, evidences, signalCount });
}

export async function action({ request, context, params }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const { sprintId } = params;
  if (!sprintId) {
    return json({ error: "Sprint ID required" }, { status: 400 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "addSignal") {
    const signalType = formData.get("signalType") as VdSignalTypeValue;
    const title = formData.get("title") as string;
    const summary = formData.get("summary") as string;
    const sourceUrl = formData.get("sourceUrl") as string;

    const parseResult = createSignalSchema.safeParse({
      signalType,
      title,
      summary: summary || undefined,
      sourceUrl: sourceUrl || undefined,
    });

    if (!parseResult.success) {
      return json({ error: parseResult.error.errors[0].message }, { status: 400 });
    }

    await createSignal(db, sprintId, parseResult.data);

    // 이벤트 기록
    await createWorkEvent(db, sprintId, {
      eventType: "signal_create",
      actorType: "human",
      actorId: user.id,
      entityType: "signal",
    });

    return json({ success: true });
  }

  if (intent === "addEvidence") {
    const type = formData.get("type") as string;
    const strength = formData.get("strength") as VdEvidenceStrengthValue;
    const content = formData.get("content") as string;
    const sourceUrl = formData.get("sourceUrl") as string;

    const parseResult = createEvidenceSchema.safeParse({
      type,
      strength,
      content,
      sourceUrl: sourceUrl || undefined,
    });

    if (!parseResult.success) {
      return json({ error: parseResult.error.errors[0].message }, { status: 400 });
    }

    await createEvidence(db, sprintId, parseResult.data);

    // 이벤트 기록
    await createWorkEvent(db, sprintId, {
      eventType: "evidence_add",
      actorType: "human",
      actorId: user.id,
      entityType: "evidence",
    });

    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}

export default function VentureSprintInbox() {
  const { signals, evidences, signalCount } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="space-y-6">
      {/* Signal 입력 */}
      <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
        <h2 className="mb-4 font-semibold text-[var(--axis-text-primary)]">
          신호 추가
          <span className="ml-2 text-sm font-normal text-[var(--axis-text-tertiary)]">
            ({signalCount}개)
          </span>
        </h2>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="addSignal" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[var(--axis-text-primary)]">
                유형 *
              </label>
              <select
                name="signalType"
                required
                className="mt-1 block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm"
              >
                {SIGNAL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--axis-text-primary)]">
                제목 *
              </label>
              <input
                type="text"
                name="title"
                required
                maxLength={200}
                className="mt-1 block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--axis-text-primary)]">
              요약
            </label>
            <textarea
              name="summary"
              rows={2}
              maxLength={2000}
              className="mt-1 block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--axis-text-primary)]">
              출처 URL
            </label>
            <input
              type="url"
              name="sourceUrl"
              className="mt-1 block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "추가 중..." : "신호 추가"}
          </Button>
        </Form>
      </div>

      {/* Signal 목록 */}
      <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
        <h2 className="mb-4 font-semibold text-[var(--axis-text-primary)]">수집된 신호</h2>
        {signals.length === 0 ? (
          <EmptyState
            title="아직 수집된 신호가 없습니다"
            description="위 양식으로 직접 추가하거나 AI가 자동 수집합니다"
            features={[]}
          />
        ) : (
          <div className="space-y-3">
            {signals.map((signal) => (
              <div
                key={signal.id}
                className="rounded-md border border-[var(--axis-border-default)] p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">
                        {SIGNAL_TYPES.find((t) => t.value === signal.signalType)?.label ||
                          signal.signalType}
                      </Badge>
                      <span className="font-medium text-[var(--axis-text-primary)]">
                        {signal.title}
                      </span>
                    </div>
                    {signal.summary && (
                      <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
                        {signal.summary}
                      </p>
                    )}
                    {signal.sourceUrl && (
                      <a
                        href={signal.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 block text-xs text-[var(--axis-text-brand)] hover:underline"
                      >
                        {signal.sourceUrl}
                      </a>
                    )}
                  </div>
                  {signal.relevanceScore !== null && (
                    <Badge
                      variant={
                        signal.relevanceScore >= 70
                          ? "success"
                          : signal.relevanceScore >= 40
                            ? "warning"
                            : "secondary"
                      }
                    >
                      {signal.relevanceScore}점
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Evidence 입력 */}
      <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
        <h2 className="mb-4 font-semibold text-[var(--axis-text-primary)]">
          근거 추가
          <span className="ml-2 text-sm font-normal text-[var(--axis-text-tertiary)]">
            ({evidences.length}개)
          </span>
        </h2>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="addEvidence" />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-[var(--axis-text-primary)]">
                유형 *
              </label>
              <select
                name="type"
                required
                className="mt-1 block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm"
              >
                <option value="DATA">데이터</option>
                <option value="USER_QUOTE">사용자 인용</option>
                <option value="ARTIFACT">아티팩트</option>
                <option value="RESEARCH">리서치</option>
                <option value="ASSUMPTION">가정</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-[var(--axis-text-primary)]">
                강도 *
              </label>
              <div className="mt-1 flex gap-2">
                {EVIDENCE_STRENGTHS.map((s) => (
                  <label key={s.value} className="flex items-center">
                    <input
                      type="radio"
                      name="strength"
                      value={s.value}
                      required
                      className="mr-1"
                    />
                    <span className="text-sm" title={s.description}>
                      {s.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--axis-text-primary)]">
              내용 *
            </label>
            <textarea
              name="content"
              required
              rows={3}
              maxLength={3000}
              className="mt-1 block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--axis-text-primary)]">
              출처 URL
            </label>
            <input
              type="url"
              name="sourceUrl"
              className="mt-1 block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm"
            />
          </div>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "추가 중..." : "근거 추가"}
          </Button>
        </Form>
      </div>
    </div>
  );
}
