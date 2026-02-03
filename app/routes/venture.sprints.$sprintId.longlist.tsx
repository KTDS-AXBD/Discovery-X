/**
 * Venture Sprint Long List 탭
 * /venture/sprints/:sprintId/longlist
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/cloudflare";
import { json, redirect } from "@remix-run/cloudflare";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import { getDb } from "~/db";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";
import { Button } from "~/components/ui/Button";
import { Badge } from "~/components/ui/Badge";
import { getSprintById } from "~/features/venture/repositories/sprint.repository";
import {
  listOpportunitiesBySprint,
  createOpportunity,
  updateOpportunity,
} from "~/features/venture/repositories/opportunity.repository";
import { listThemesBySprint, createTheme } from "~/features/venture/repositories/signal.repository";
import { createWorkEvent } from "~/features/venture/repositories/analytics.repository";
import { createOpportunitySchema } from "~/features/venture/schemas/opportunity.schema";
import type { VdRecommendationType } from "~/features/venture/types";

const RECOMMENDATION_CONFIG: Record<VdRecommendationType, { label: string; variant: "success" | "info" | "warning" | "secondary" }> = {
  INVEST: { label: "투자", variant: "success" },
  EXPLORE: { label: "탐색", variant: "info" },
  HOLD: { label: "보류", variant: "warning" },
  DROP: { label: "중단", variant: "secondary" },
};

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

  const [opportunities, themes] = await Promise.all([
    listOpportunitiesBySprint(db, sprintId),
    listThemesBySprint(db, sprintId),
  ]);

  return json({ sprint, opportunities, themes });
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

  if (intent === "addOpportunity") {
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const themeId = formData.get("themeId") as string;
    const targetSegment = formData.get("targetSegment") as string;

    const parseResult = createOpportunitySchema.safeParse({
      title,
      description: description || undefined,
      themeId: themeId || undefined,
      targetSegment: targetSegment || undefined,
    });

    if (!parseResult.success) {
      return json({ error: parseResult.error.errors[0].message }, { status: 400 });
    }

    await createOpportunity(db, sprintId, parseResult.data);

    await createWorkEvent(db, sprintId, {
      eventType: "opportunity_create",
      actorType: "human",
      actorId: user.id,
      entityType: "opportunity",
    });

    return json({ success: true });
  }

  if (intent === "addTheme") {
    const name = formData.get("name") as string;

    if (!name || name.trim().length === 0) {
      return json({ error: "테마 이름은 필수입니다" }, { status: 400 });
    }

    await createTheme(db, sprintId, { name: name.trim() });

    return json({ success: true });
  }

  if (intent === "toggleShortlist") {
    const opportunityId = formData.get("opportunityId") as string;
    const isShortlisted = formData.get("isShortlisted") === "true";

    await updateOpportunity(db, opportunityId, { isShortlisted });

    await createWorkEvent(db, sprintId, {
      eventType: isShortlisted ? "opportunity_shortlist" : "opportunity_unshortlist",
      actorType: "human",
      actorId: user.id,
      entityType: "opportunity",
      entityId: opportunityId,
    });

    return json({ success: true });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}

export default function VentureSprintLonglist() {
  const { opportunities, themes } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // 테마별 그룹핑
  const opportunitiesByTheme = new Map<string | null, typeof opportunities>();
  for (const opp of opportunities) {
    const key = opp.themeId;
    if (!opportunitiesByTheme.has(key)) {
      opportunitiesByTheme.set(key, []);
    }
    opportunitiesByTheme.get(key)!.push(opp);
  }

  return (
    <div className="space-y-6">
      {/* 기회 추가 */}
      <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-6">
        <h2 className="mb-4 font-semibold text-[var(--axis-text-primary)]">기회 추가</h2>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="addOpportunity" />
          <div className="grid gap-4 sm:grid-cols-2">
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
            <div>
              <label className="block text-sm font-medium text-[var(--axis-text-primary)]">
                테마
              </label>
              <select
                name="themeId"
                className="mt-1 block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm"
              >
                <option value="">미분류</option>
                {themes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--axis-text-primary)]">
              설명
            </label>
            <textarea
              name="description"
              rows={2}
              maxLength={3000}
              className="mt-1 block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[var(--axis-text-primary)]">
              타겟 세그먼트
            </label>
            <input
              type="text"
              name="targetSegment"
              maxLength={200}
              className="mt-1 block w-full rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "추가 중..." : "기회 추가"}
            </Button>
          </div>
        </Form>

        {/* 테마 추가 (인라인) */}
        <div className="mt-4 border-t border-[var(--axis-border-default)] pt-4">
          <Form method="post" className="flex gap-2">
            <input type="hidden" name="intent" value="addTheme" />
            <input
              type="text"
              name="name"
              placeholder="새 테마 이름"
              maxLength={100}
              className="flex-1 rounded-md border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] px-3 py-2 text-sm"
            />
            <Button type="submit" variant="secondary" disabled={isSubmitting}>
              테마 추가
            </Button>
          </Form>
        </div>
      </div>

      {/* 요약 통계 */}
      <div className="flex gap-4 text-sm">
        <div className="rounded-md bg-[var(--axis-surface-tertiary)] px-3 py-2">
          <span className="text-[var(--axis-text-tertiary)]">전체: </span>
          <span className="font-medium text-[var(--axis-text-primary)]">
            {opportunities.length}개
          </span>
        </div>
        <div className="rounded-md bg-[var(--axis-surface-tertiary)] px-3 py-2">
          <span className="text-[var(--axis-text-tertiary)]">Shortlist: </span>
          <span className="font-medium text-[var(--axis-text-primary)]">
            {opportunities.filter((o) => o.isShortlisted).length}개
          </span>
        </div>
        <div className="rounded-md bg-[var(--axis-surface-tertiary)] px-3 py-2">
          <span className="text-[var(--axis-text-tertiary)]">테마: </span>
          <span className="font-medium text-[var(--axis-text-primary)]">{themes.length}개</span>
        </div>
      </div>

      {/* 기회 목록 (테마별 그룹) */}
      {opportunities.length === 0 ? (
        <div className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)] p-12 text-center">
          <p className="text-[var(--axis-text-tertiary)]">아직 생성된 기회가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(opportunitiesByTheme.entries()).map(([themeId, opps]) => {
            const theme = themes.find((t) => t.id === themeId);
            return (
              <div
                key={themeId || "uncategorized"}
                className="rounded-lg border border-[var(--axis-border-default)] bg-[var(--axis-surface-primary)]"
              >
                <div className="border-b border-[var(--axis-border-default)] p-4">
                  <h3 className="font-semibold text-[var(--axis-text-primary)]">
                    {theme?.name || "미분류"}
                  </h3>
                  {theme?.description && (
                    <p className="text-sm text-[var(--axis-text-tertiary)]">
                      {theme.description}
                    </p>
                  )}
                </div>
                <div className="divide-y divide-[var(--axis-border-default)]">
                  {opps.map((opp) => (
                    <div key={opp.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-[var(--axis-text-primary)]">
                              {opp.title}
                            </span>
                            {opp.isShortlisted === 1 && (
                              <Badge variant="success">Shortlist</Badge>
                            )}
                            {opp.isFinal === 1 && <Badge variant="info">Final</Badge>}
                            {opp.recommendation && (
                              <Badge
                                variant={
                                  RECOMMENDATION_CONFIG[opp.recommendation as VdRecommendationType]
                                    ?.variant || "secondary"
                                }
                              >
                                {RECOMMENDATION_CONFIG[opp.recommendation as VdRecommendationType]
                                  ?.label || opp.recommendation}
                              </Badge>
                            )}
                          </div>
                          {opp.description && (
                            <p className="mt-1 text-sm text-[var(--axis-text-tertiary)]">
                              {opp.description.length > 150
                                ? `${opp.description.slice(0, 150)}...`
                                : opp.description}
                            </p>
                          )}
                          <div className="mt-2 flex gap-4 text-xs text-[var(--axis-text-tertiary)]">
                            {opp.potentialScore !== null && (
                              <span>잠재력: {opp.potentialScore}</span>
                            )}
                            {opp.confidenceScore !== null && (
                              <span>신뢰도: {opp.confidenceScore}</span>
                            )}
                            {opp.depthScore !== null && <span>깊이: {opp.depthScore}</span>}
                          </div>
                        </div>

                        {/* Shortlist 토글 */}
                        <Form method="post">
                          <input type="hidden" name="intent" value="toggleShortlist" />
                          <input type="hidden" name="opportunityId" value={opp.id} />
                          <input
                            type="hidden"
                            name="isShortlisted"
                            value={opp.isShortlisted ? "false" : "true"}
                          />
                          <Button
                            type="submit"
                            variant={opp.isShortlisted ? "secondary" : "default"}
                            size="sm"
                            disabled={isSubmitting}
                          >
                            {opp.isShortlisted ? "Shortlist 해제" : "Shortlist 추가"}
                          </Button>
                        </Form>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
