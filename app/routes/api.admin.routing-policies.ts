/**
 * GET  /api/admin/routing-policies — 라우팅 정책 목록 + 하위 테이블
 * POST /api/admin/routing-policies — 라우팅 정책 생성/버전 업
 */

import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
} from "@remix-run/cloudflare";
import { eq, and } from "drizzle-orm";
import { getDb } from "~/db";
import { requireAdmin, getSessionSecret } from "~/lib/auth/session.server";
import {
  routingPolicies,
  policyProviderPriorities,
  policyPurposeRules,
  policyDegradeRules,
} from "~/features/cost/db/schema";
import type { LoadedPolicy } from "~/features/cost/service/policy-loader";

// GET: 전체 라우팅 정책 목록 (하위 테이블 포함)
export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    await requireAdmin(request, db, secret);

    const policies = await db.select().from(routingPolicies);

    const result: LoadedPolicy[] = await Promise.all(
      policies.map(async (policy) => {
        const [providers, purposes, degrades] = await Promise.all([
          db
            .select()
            .from(policyProviderPriorities)
            .where(
              and(
                eq(policyProviderPriorities.policyId, policy.id),
                eq(policyProviderPriorities.policyVersion, policy.version),
              ),
            )
            .orderBy(policyProviderPriorities.priority),
          db
            .select()
            .from(policyPurposeRules)
            .where(
              and(
                eq(policyPurposeRules.policyId, policy.id),
                eq(policyPurposeRules.policyVersion, policy.version),
              ),
            ),
          db
            .select()
            .from(policyDegradeRules)
            .where(
              and(
                eq(policyDegradeRules.policyId, policy.id),
                eq(policyDegradeRules.policyVersion, policy.version),
              ),
            )
            .orderBy(policyDegradeRules.fromMinScore),
        ]);

        return {
          policy,
          providerPriorities: providers,
          purposeRules: purposes,
          degradeRules: degrades,
        };
      }),
    );

    return Response.json({ policies: result });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.admin.routing-policies] loader error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: 라우팅 정책 생성 또는 버전 업
export async function action({ request, context }: ActionFunctionArgs) {
  try {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const db = getDb(context.cloudflare.env.DB);
    const secret = getSessionSecret(context.cloudflare.env);
    await requireAdmin(request, db, secret);

    const body = (await request.json()) as {
      policyId?: string;
      name: string;
      tenantId?: string;
      priority?: number;
      providerPriorities?: { provider: string; priority: number }[];
      purposeRules?: {
        purpose: string;
        minCapabilityScore: number;
        requiresTools?: boolean;
        requiresJsonMode?: boolean;
        requiresStreaming?: boolean;
        degradable: boolean;
        degradeToScore?: number;
      }[];
      degradeRules?: {
        fromMinScore: number;
        fromMaxScore: number;
        degradeToModelId?: string;
        action: string;
      }[];
    };

    if (!body.name) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }

    let policyId: string;
    let newVersion: number;

    // 기존 정책의 버전 업
    if (body.policyId) {
      const [existing] = await db
        .select()
        .from(routingPolicies)
        .where(eq(routingPolicies.id, body.policyId))
        .limit(1);

      if (!existing) {
        return Response.json({ error: "Policy not found" }, { status: 404 });
      }

      policyId = existing.id;
      newVersion = existing.version + 1;

      // 이전 버전 비활성화
      await db
        .update(routingPolicies)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(routingPolicies.id, policyId));

      // 새 버전으로 업데이트
      await db
        .update(routingPolicies)
        .set({
          name: body.name,
          version: newVersion,
          isActive: true,
          priority: body.priority ?? existing.priority,
          updatedAt: new Date(),
        })
        .where(eq(routingPolicies.id, policyId));
    } else {
      // 완전 새 정책 생성
      policyId = crypto.randomUUID();
      newVersion = 1;

      await db.insert(routingPolicies).values({
        id: policyId,
        tenantId: body.tenantId ?? null,
        name: body.name,
        version: newVersion,
        isActive: true,
        priority: body.priority ?? 100,
      });
    }

    // 하위 테이블 삽입
    if (body.providerPriorities?.length) {
      await db.insert(policyProviderPriorities).values(
        body.providerPriorities.map((pp) => ({
          id: crypto.randomUUID(),
          policyId,
          policyVersion: newVersion,
          provider: pp.provider,
          priority: pp.priority,
        })),
      );
    }

    if (body.purposeRules?.length) {
      await db.insert(policyPurposeRules).values(
        body.purposeRules.map((pr) => ({
          id: crypto.randomUUID(),
          policyId,
          policyVersion: newVersion,
          purpose: pr.purpose,
          minCapabilityScore: pr.minCapabilityScore,
          requiresTools: pr.requiresTools ?? false,
          requiresJsonMode: pr.requiresJsonMode ?? false,
          requiresStreaming: pr.requiresStreaming ?? false,
          degradable: pr.degradable,
          degradeToScore: pr.degradeToScore ?? null,
        })),
      );
    }

    if (body.degradeRules?.length) {
      await db.insert(policyDegradeRules).values(
        body.degradeRules.map((dr) => ({
          id: crypto.randomUUID(),
          policyId,
          policyVersion: newVersion,
          fromMinScore: dr.fromMinScore,
          fromMaxScore: dr.fromMaxScore,
          degradeToModelId: dr.degradeToModelId ?? null,
          action: dr.action,
        })),
      );
    }

    // 생성된 결과 조회
    const [policy] = await db
      .select()
      .from(routingPolicies)
      .where(eq(routingPolicies.id, policyId));

    return Response.json({ policy, version: newVersion }, { status: 201 });
  } catch (error) {
    if (error instanceof Response) throw error;
    console.error("[api.admin.routing-policies] action error:", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
