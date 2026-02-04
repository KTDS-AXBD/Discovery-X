/**
 * /settings — Settings page with role-based sections.
 */

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Form, useLoaderData, useActionData } from "@remix-run/react";
import { getDb } from "~/db";
import { agentConfig } from "~/db/schema";
import { eq } from "drizzle-orm";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { PageLayout } from "~/components/layout/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
import { Textarea } from "~/components/ui/Textarea";
import { FormField } from "~/components/ui/FormField";
import { Select } from "~/components/ui/Select";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { Badge } from "~/components/ui/Badge";

const AUTONOMY_OPTIONS = [
  { value: "0", label: "Passive — 응답만" },
  { value: "1", label: "Advisory — 분석+제안만" },
  { value: "2", label: "Semi-auto — INBOX→OPEN 자동" },
  { value: "3", label: "Autonomous — 전체 자율" },
];

const MODEL_OPTIONS = [
  { value: "", label: "기본 (Claude Sonnet 4)" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-haiku-3-5-20241022", label: "Claude Haiku 3.5" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
];

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await requireUser(request, db, secret);

  // Only load agent config for ADMIN
  let config = null;
  if (user.role === "ADMIN") {
    const rows = await db
      .select()
      .from(agentConfig)
      .where(eq(agentConfig.id, "default"))
      .limit(1);
    config = rows[0] || {
      id: "default",
      autonomyLevel: 3,
      dailyTokenBudget: 100000,
      tokensUsedToday: 0,
      systemPrompt: null,
    };
  }

  return json({ user, config });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await requireUser(request, db, secret);

  // Only ADMIN can save agent config
  if (user.role !== "ADMIN") {
    return json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const formData = await request.formData();
  const autonomyLevel = parseInt(formData.get("autonomyLevel") as string, 10);
  const dailyTokenBudget = parseInt(formData.get("dailyTokenBudget") as string, 10);
  const systemPrompt = (formData.get("systemPrompt") as string) || null;
  const modelId = (formData.get("modelId") as string) || null;

  await db
    .update(agentConfig)
    .set({
      autonomyLevel: isNaN(autonomyLevel) ? 3 : autonomyLevel,
      dailyTokenBudget: isNaN(dailyTokenBudget) ? 100000 : dailyTokenBudget,
      systemPrompt,
      modelId,
      updatedAt: new Date(),
    })
    .where(eq(agentConfig.id, "default"));

  return json({ success: true });
}

export default function Settings() {
  const { user, config } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const role = user.role || "USER";
  const isAdmin = role === "ADMIN";
  const isGatekeeperOrAbove = role === "GATEKEEPER" || isAdmin;

  return (
    <PageLayout user={user}>
      <h1 className="text-2xl font-bold text-[var(--axis-text-primary)]">설정</h1>
      <p className="mt-1 text-sm text-[var(--axis-text-secondary)]">
        프로필 및 알림 설정을 관리합니다.
      </p>

      {actionData && "success" in actionData && (
        <AlertBanner variant="success" className="mt-4">
          설정이 저장되었습니다.
        </AlertBanner>
      )}

      <div className="mt-6 space-y-6">
        {/* Section: Profile — all roles */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">프로필</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--axis-surface-brand)] text-lg font-bold text-[var(--axis-text-brand)]">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--axis-text-primary)]">{user.name}</p>
                <p className="text-xs text-[var(--axis-text-tertiary)]">{user.email}</p>
              </div>
              <Badge variant={role === "ADMIN" ? "destructive" : role === "GATEKEEPER" ? "info" : "default"} className="ml-auto">
                {role}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Section: Notification — all roles */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">알림 설정</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--axis-text-tertiary)]">
              알림 설정은 현재 시스템 기본값을 사용합니다.
            </p>
          </CardContent>
        </Card>

        {/* Section: Gate notifications — GATEKEEPER/ADMIN */}
        {isGatekeeperOrAbove && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Gate 알림</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-[var(--axis-text-tertiary)]">
                Gate 승인 요청 시 이메일 알림을 받습니다. (Gatekeeper/Admin 전용)
              </p>
            </CardContent>
          </Card>
        )}

        {/* Section: Agent config — ADMIN only */}
        {isAdmin && config && (
          <Form method="post" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">자율도 레벨</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField label="자율도">
                  <Select name="autonomyLevel" defaultValue={String(config.autonomyLevel)}>
                    {AUTONOMY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">모델 선택</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField label="Claude 모델" hint="Agent가 사용할 Claude 모델을 선택합니다">
                  <Select name="modelId" defaultValue={config.modelId || ""}>
                    {MODEL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">토큰 예산</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField label="일일 토큰 예산" hint="하루에 사용할 수 있는 최대 토큰 수">
                  <Input
                    name="dailyTokenBudget"
                    type="number"
                    defaultValue={config.dailyTokenBudget}
                    min={1000}
                    max={1000000}
                  />
                </FormField>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xs text-[var(--axis-text-tertiary)]">
                    오늘 사용: {(config.tokensUsedToday || 0).toLocaleString()}
                  </span>
                  <Badge
                    variant={
                      config.tokensUsedToday > config.dailyTokenBudget * 0.8
                        ? "destructive"
                        : "success"
                    }
                  >
                    {config.dailyTokenBudget > 0
                      ? Math.round(((config.tokensUsedToday || 0) / config.dailyTokenBudget) * 100)
                      : 0}
                    %
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">커스텀 시스템 프롬프트</CardTitle>
              </CardHeader>
              <CardContent>
                <FormField label="추가 지침" hint="Agent의 기본 시스템 프롬프트에 추가될 커스텀 지침">
                  <Textarea
                    name="systemPrompt"
                    defaultValue={config.systemPrompt || ""}
                    rows={5}
                    placeholder="예: 모든 Discovery에 대해 한국어로만 소통하세요..."
                  />
                </FormField>
              </CardContent>
            </Card>

            <div className="flex justify-end">
              <Button type="submit">설정 저장</Button>
            </div>
          </Form>
        )}
      </div>
    </PageLayout>
  );
}
