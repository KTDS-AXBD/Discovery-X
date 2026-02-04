/**
 * Venture Sprint 생성 페이지
 * /venture/sprints/new
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { MainNav } from "~/components/layout/MainNav";
import { Button } from "~/components/ui/Button";
import { createSprint, createSprintScope } from "~/features/venture/repositories/sprint.repository";
import { createSprintSchema } from "~/features/venture/schemas/sprint.schema";
import {
  VD_EVALUATION_PRESETS,
  VD_DEFAULT_EVALUATION_PRESET_ID,
} from "~/features/venture/constants/evaluation-criteria";
import { NextStepGuide } from "~/components/venture/NextStepGuide";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  return json({
    user,
    presets: VD_EVALUATION_PRESETS,
    defaultPresetId: VD_DEFAULT_EVALUATION_PRESET_ID,
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return redirect("/login");
  }

  const formData = await request.formData();

  const name = formData.get("name") as string;
  const description = formData.get("description") as string;
  const targetEndDateStr = formData.get("targetEndDate") as string;
  const industries = formData.getAll("industry") as string[];
  // const presetId = formData.get("presetId") as string; // TODO: 프리셋 기능 구현

  // 입력 검증
  const parseResult = createSprintSchema.safeParse({
    name,
    description: description || undefined,
    targetEndDate: targetEndDateStr ? new Date(targetEndDateStr) : undefined,
    config: {
      maxOpportunities: 50,
      shortlistSize: 8,
      finalSize: 3,
      autoCollectSignals: true,
    },
  });

  if (!parseResult.success) {
    return json(
      { error: parseResult.error.errors[0].message, success: false },
      { status: 400 }
    );
  }

  if (industries.length === 0) {
    return json(
      { error: "최소 1개 산업을 입력해야 합니다.", success: false },
      { status: 400 }
    );
  }

  try {
    // 스프린트 생성
    const sprint = await createSprint(db, {
      ...parseResult.data,
      ownerId: user.id,
    });

    // 산업 범위 생성
    for (const industry of industries) {
      if (industry.trim()) {
        await createSprintScope(db, sprint.id, {
          industry: industry.trim(),
          selected: false,
        });
      }
    }

    return redirect(`/venture/sprints/${sprint.id}`);
  } catch (error) {
    console.error("Failed to create sprint:", error);
    return json(
      { error: "스프린트 생성에 실패했습니다.", success: false },
      { status: 500 }
    );
  }
}

export default function VentureSprintsNew() {
  const { user, presets, defaultPresetId } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();

  const isSubmitting = navigation.state === "submitting";

  // 5일 후 기본값
  const defaultEndDate = new Date();
  defaultEndDate.setDate(defaultEndDate.getDate() + 5);
  const defaultEndDateStr = defaultEndDate.toISOString().split("T")[0];

  return (
    <div className="min-h-screen bg-[var(--axis-surface-secondary)]">
      <MainNav user={user} />
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 lg:px-8">
        {/* 헤더 */}
        <div className="mb-6">
          <nav className="mb-2 text-sm text-[var(--axis-text-tertiary)]">
            <Link to="/venture" className="hover:underline">
              Venture
            </Link>
            {" / "}
            <Link to="/venture/sprints" className="hover:underline">
              스프린트
            </Link>
            {" / "}
            <span className="text-[var(--axis-text-primary)]">새 스프린트</span>
          </nav>
          <h1 className="text-2xl font-bold text-[var(--axis-text-primary)]">
            새 스프린트 생성
          </h1>
          <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
            5일 부트캠프 템플릿 기반 신사업 발굴 스프린트를 시작합니다.
          </p>
        </div>

        {/* 다음 단계 가이드 */}
        <NextStepGuide context="new-sprint" />

        {/* 에러 메시지 */}
        {actionData?.error && (
          <div className="mb-6 rounded-md border border-[var(--axis-badge-destructive-border)] bg-[var(--axis-badge-destructive-bg)] p-4 text-sm text-[var(--axis-badge-destructive-text)]">
            {actionData.error}
          </div>
        )}

        {/* 폼 */}
        <Form method="post">
          <div className="space-y-6 rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
            {/* 스프린트 이름 */}
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-[var(--axis-text-primary)]"
              >
                스프린트 이름 *
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                maxLength={100}
                placeholder="예: 2026 Q1 헬스케어 신사업 발굴"
                className="mt-1 block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm text-[var(--axis-text-primary)] placeholder:text-[var(--axis-text-tertiary)] focus:border-[var(--axis-button-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--axis-button-border-focus)]"
              />
            </div>

            {/* 설명 */}
            <div>
              <label
                htmlFor="description"
                className="block text-sm font-medium text-[var(--axis-text-primary)]"
              >
                설명
              </label>
              <textarea
                id="description"
                name="description"
                rows={3}
                maxLength={1000}
                placeholder="스프린트 목표와 범위를 간략히 설명해주세요."
                className="mt-1 block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm text-[var(--axis-text-primary)] placeholder:text-[var(--axis-text-tertiary)] focus:border-[var(--axis-button-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--axis-button-border-focus)]"
              />
            </div>

            {/* 목표 종료일 */}
            <div>
              <label
                htmlFor="targetEndDate"
                className="block text-sm font-medium text-[var(--axis-text-primary)]"
              >
                목표 종료일
              </label>
              <input
                type="date"
                id="targetEndDate"
                name="targetEndDate"
                defaultValue={defaultEndDateStr}
                className="mt-1 block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm text-[var(--axis-text-primary)] focus:border-[var(--axis-button-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--axis-button-border-focus)]"
              />
              <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                기본: 5일 부트캠프 (Day 1~5)
              </p>
            </div>

            {/* 산업 범위 */}
            <div>
              <label className="block text-sm font-medium text-[var(--axis-text-primary)]">
                탐색 산업 *
              </label>
              <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                1~2개 산업을 입력하세요. 스프린트 시작 시 선택합니다.
              </p>
              <div className="mt-2 space-y-2">
                <input
                  type="text"
                  name="industry"
                  required
                  placeholder="예: 헬스케어"
                  className="block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm text-[var(--axis-text-primary)] placeholder:text-[var(--axis-text-tertiary)] focus:border-[var(--axis-button-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--axis-button-border-focus)]"
                />
                <input
                  type="text"
                  name="industry"
                  placeholder="예: 금융 (선택)"
                  className="block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm text-[var(--axis-text-primary)] placeholder:text-[var(--axis-text-tertiary)] focus:border-[var(--axis-button-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--axis-button-border-focus)]"
                />
              </div>
            </div>

            {/* 평가 기준 프리셋 */}
            <div>
              <label
                htmlFor="presetId"
                className="block text-sm font-medium text-[var(--axis-text-primary)]"
              >
                평가 기준 프리셋
              </label>
              <select
                id="presetId"
                name="presetId"
                defaultValue={defaultPresetId}
                className="mt-1 block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm text-[var(--axis-text-primary)] focus:border-[var(--axis-button-border-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--axis-button-border-focus)]"
              >
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-[var(--axis-text-tertiary)]">
                기회 평가에 사용할 기준을 선택합니다.
              </p>
            </div>
          </div>

          {/* 버튼 */}
          <div className="mt-6 flex justify-end gap-3">
            <Link to="/venture/sprints">
              <Button type="button" variant="secondary" disabled={isSubmitting}>
                취소
              </Button>
            </Link>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "생성 중..." : "스프린트 생성"}
            </Button>
          </div>
        </Form>
      </div>
    </div>
  );
}
