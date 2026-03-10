import { eq, and, lte, gte } from "drizzle-orm";
import type { DB } from "~/db";
import { budgetPolicies, budgetUsageCache } from "../db/schema";
import type { BudgetPolicy } from "../db/schema";
import type { BudgetTier, BudgetEvaluation } from "../types";

const DEFAULT_EVALUATION: BudgetEvaluation = {
  tier: "normal",
  usagePct: 0,
  budgetUsd: 0,
  currentUsageUsd: 0,
  policyId: "",
};

export class BudgetEvaluator {
  constructor(private db: DB) {}

  /**
   * O(1) 예산 상태 조회 — budget_usage_cache에서 단일 행 읽기.
   * 정책이 없으면 기본값(normal tier) 반환.
   */
  async evaluate(
    userId: string,
    tenantId: string,
    purpose?: string
  ): Promise<BudgetEvaluation> {
    const policy = await this.findApplicablePolicy(userId, tenantId, purpose);
    if (!policy) return DEFAULT_EVALUATION;

    const [cache] = await this.db
      .select()
      .from(budgetUsageCache)
      .where(eq(budgetUsageCache.budgetPolicyId, policy.id))
      .limit(1);

    if (!cache) {
      return {
        tier: "normal",
        usagePct: 0,
        budgetUsd: policy.budgetUsd,
        currentUsageUsd: 0,
        policyId: policy.id,
      };
    }

    return {
      tier: cache.budgetTier as BudgetTier,
      usagePct: cache.usagePct,
      budgetUsd: policy.budgetUsd,
      currentUsageUsd: cache.currentUsageUsd,
      policyId: policy.id,
    };
  }

  /**
   * 가장 구체적인 budget_policy를 찾는다.
   * 우선순위: 사용자+용도별 > 사용자 전체 > 조직+용도별 > 조직 전체
   */
  async findApplicablePolicy(
    userId: string,
    tenantId: string,
    purpose?: string
  ): Promise<BudgetPolicy | null> {
    const now = new Date();

    const policies = await this.db
      .select()
      .from(budgetPolicies)
      .where(
        and(
          eq(budgetPolicies.tenantId, tenantId),
          eq(budgetPolicies.isActive, true),
          lte(budgetPolicies.periodStart, now),
          gte(budgetPolicies.periodEnd, now)
        )
      )
;

    // 우선순위 순으로 탐색
    // (a) userId + purpose 일치
    if (purpose) {
      const match = policies.find(
        (p) => p.userId === userId && p.purpose === purpose
      );
      if (match) return match;
    }

    // (b) userId 일치 + purpose IS NULL
    const userWide = policies.find(
      (p) => p.userId === userId && p.purpose === null
    );
    if (userWide) return userWide;

    // (c) userId IS NULL + purpose 일치
    if (purpose) {
      const purposeWide = policies.find(
        (p) => p.userId === null && p.purpose === purpose
      );
      if (purposeWide) return purposeWide;
    }

    // (d) userId IS NULL + purpose IS NULL (조직 전체)
    const orgWide = policies.find(
      (p) => p.userId === null && p.purpose === null
    );
    if (orgWide) return orgWide;

    return null;
  }
}
