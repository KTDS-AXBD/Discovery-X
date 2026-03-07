/**
 * /settings — Settings page with role-based sections.
 */

import { useState, useEffect, useCallback } from "react";
import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { Form, useLoaderData, useActionData } from "@remix-run/react";
import { getDb } from "~/db";
import { agentConfig, UserRole } from "~/db";
import { eq } from "drizzle-orm";
import { requireUser, getSessionSecret } from "~/lib/auth/session.server";
import { isFeatureEnabled } from "~/lib/feature-flags";
import type { FallbackState } from "~/lib/ai/types";
import { AppShell } from "~/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/Card";
import { Button } from "~/components/ui/Button";
import { Input } from "~/components/ui/Input";
import { Textarea } from "~/components/ui/Textarea";
import { FormField } from "~/components/ui/FormField";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "~/components/ui/Select";
import { AlertBanner } from "~/components/ui/AlertBanner";
import { Badge } from "~/components/ui/Badge";
import { TokenUsageChart } from "~/components/settings/TokenUsageChart";
import { TokenUsageTable } from "~/components/settings/TokenUsageTable";

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
  if (user.role === UserRole.ADMIN) {
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

  // AI Fallback 상태
  const env = context.cloudflare.env as unknown as Record<string, string | undefined>;
  const aiFallbackEnabled = isFeatureEnabled(env, "aiFallback");
  let aiProviderState: FallbackState | null = null;
  if (user.role === UserRole.ADMIN && aiFallbackEnabled && config) {
    try {
      if (config.aiProviderState) {
        aiProviderState = JSON.parse(config.aiProviderState) as FallbackState;
      }
    } catch { /* ignore */ }
  }

  return json({ user, config, aiFallbackEnabled, aiProviderState });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await requireUser(request, db, secret);

  // Only ADMIN can save agent config
  if (user.role !== UserRole.ADMIN) {
    return json({ error: "권한이 없습니다." }, { status: 403 });
  }

  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  // AI 프로바이더 수동 전환
  if (intent === "switch-provider") {
    const provider = formData.get("provider") as string;
    const validProviders = ["anthropic", "openai", "google", "workers-ai"];
    if (!validProviders.includes(provider)) {
      return json({ error: "잘못된 프로바이더입니다." }, { status: 400 });
    }

    const state: FallbackState = {
      activeProvider: provider as FallbackState["activeProvider"],
      failedProviders: [],
      manualOverride: provider as FallbackState["activeProvider"],
    };

    await db
      .update(agentConfig)
      .set({ aiProviderState: JSON.stringify(state), updatedAt: new Date() })
      .where(eq(agentConfig.id, "default"));

    return json({ success: true });
  }

  // AI 프로바이더 상태 리셋
  if (intent === "reset-provider") {
    await db
      .update(agentConfig)
      .set({ aiProviderState: null, updatedAt: new Date() })
      .where(eq(agentConfig.id, "default"));

    return json({ success: true });
  }

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

interface TokenUsageData {
  dailySummary: Array<{ date: string; mode: string; total_tokens: number; request_count: number }>;
  todayUsage: { tokensUsedToday: number; dailyTokenBudget: number; tokenResetDate: string | null };
  recentLogs: Array<{
    id: string; mode: string; model: string;
    inputTokens: number; outputTokens: number; totalTokens: number;
    toolRounds: number; createdAt: string | number | null;
  }>;
}

function useTokenUsage(isAdmin: boolean) {
  const [data, setData] = useState<TokenUsageData | null>(null);
  const [range, setRange] = useState<"7d" | "30d">("7d");
  const [modeFilter, setModeFilter] = useState("all");

  const fetchData = useCallback(() => {
    if (!isAdmin) return;
    fetch(`/api/admin/token-usage?range=${range}&mode=${modeFilter}`)
      .then((r) => r.json() as Promise<TokenUsageData>)
      .then(setData)
      .catch(() => {});
  }, [isAdmin, range, modeFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, range, setRange, modeFilter, setModeFilter };
}

export default function Settings() {
  const { user, config, aiFallbackEnabled, aiProviderState } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const role = user.role || UserRole.USER;
  const isAdmin = role === UserRole.ADMIN;
  const isGatekeeperOrAbove = role === UserRole.GATEKEEPER || isAdmin;
  const tokenUsage = useTokenUsage(isAdmin);

  return (
    <AppShell user={user}>
      <h1 className="text-2xl font-bold text-fg">설정</h1>
      <p className="mt-1 text-sm text-fg-secondary">
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
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-brand text-lg font-bold text-fg-brand">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium text-fg">{user.name}</p>
                <p className="text-xs text-fg-tertiary">{user.email}</p>
              </div>
              <Badge variant={role === UserRole.ADMIN ? "destructive" : role === UserRole.GATEKEEPER ? "info" : "default"} className="ml-auto">
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
            <p className="text-sm text-fg-tertiary">
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
              <p className="text-sm text-fg-tertiary">
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
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AUTONOMY_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
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
                  <Select name="modelId" defaultValue={config.modelId || undefined}>
                    <SelectTrigger>
                      <SelectValue placeholder="기본 (Claude Sonnet 4)" />
                    </SelectTrigger>
                    <SelectContent>
                      {MODEL_OPTIONS.filter((opt) => opt.value !== "").map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
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
                  <span className="text-xs text-fg-tertiary">
                    오늘 사용: {String(config.tokensUsedToday || 0)}
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

            {/* Token usage monitoring (loaded client-side) */}
            {tokenUsage.data && (
              <>
                <TokenUsageChart
                  dailySummary={tokenUsage.data.dailySummary}
                  todayUsage={tokenUsage.data.todayUsage}
                  range={tokenUsage.range}
                  onRangeChange={tokenUsage.setRange}
                />
                <TokenUsageTable
                  logs={tokenUsage.data.recentLogs}
                  modeFilter={tokenUsage.modeFilter}
                  onModeChange={tokenUsage.setModeFilter}
                />
              </>
            )}

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

        {/* Section: AI Provider Fallback — ADMIN only, FF enabled */}
        {isAdmin && aiFallbackEnabled && (
          <AIProviderSection
            state={aiProviderState}
          />
        )}
      </div>
    </AppShell>
  );
}

// ============================================================================
// AI Provider Section
// ============================================================================

const PROVIDER_CHAIN = [
  { id: "anthropic", label: "Anthropic", description: "Claude Sonnet/Haiku" },
  { id: "openai", label: "OpenAI", description: "GPT-4o/4o-mini" },
  { id: "google", label: "Google", description: "Gemini Flash/Lite" },
  { id: "workers-ai", label: "Workers AI", description: "Llama 3.3 (도구 미지원)" },
] as const;

function AIProviderSection({ state }: { state: FallbackState | null }) {
  const activeProvider = state?.activeProvider ?? "anthropic";
  const failedProviders = state?.failedProviders ?? [];
  const failedIds = new Set(failedProviders.map((f) => f.id));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">AI 프로바이더 Fallback</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Chain visualization */}
        <div className="flex items-center gap-2 flex-wrap">
          {PROVIDER_CHAIN.map((p, i) => {
            const isActive = p.id === activeProvider;
            const isFailed = failedIds.has(p.id);
            const failed = failedProviders.find((f) => f.id === p.id);

            return (
              <div key={p.id} className="flex items-center gap-2">
                <div
                  className={`rounded-lg border px-3 py-2 text-xs ${
                    isActive
                      ? "border-brand bg-surface-brand text-fg-brand font-semibold"
                      : isFailed
                        ? "border-danger bg-surface-danger text-fg-danger line-through"
                        : "border-outline bg-surface text-fg-secondary"
                  }`}
                  title={isFailed && failed ? `소진: ${failed.reason.slice(0, 50)}` : undefined}
                >
                  <div>{p.label}</div>
                  <div className="text-[10px] opacity-70">{p.description}</div>
                  {isActive && (
                    <Badge variant="success" className="mt-1 text-[10px]">활성</Badge>
                  )}
                  {isFailed && (
                    <Badge variant="destructive" className="mt-1 text-[10px]">소진</Badge>
                  )}
                </div>
                {i < PROVIDER_CHAIN.length - 1 && (
                  <span className="text-fg-tertiary text-xs">&rarr;</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Manual switch */}
        <div className="flex items-center gap-3">
          <Form method="post" className="flex items-center gap-2">
            <input type="hidden" name="intent" value="switch-provider" />
            <FormField label="수동 전환">
              <Select name="provider" defaultValue={activeProvider}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_CHAIN.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <Button type="submit" variant="outline" className="mt-5">
              전환
            </Button>
          </Form>

          {/* Reset */}
          <Form method="post">
            <input type="hidden" name="intent" value="reset-provider" />
            <Button type="submit" variant="ghost" className="mt-5 text-xs">
              자동 모드로 리셋
            </Button>
          </Form>
        </div>

        {/* Failed providers detail */}
        {failedProviders.length > 0 && (
          <div className="text-xs text-fg-tertiary space-y-1">
            <p className="font-medium text-fg-secondary">소진된 프로바이더:</p>
            {failedProviders.map((f) => (
              <p key={f.id}>
                {f.id}: {f.reason.slice(0, 80)} ({f.failedAt})
              </p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
