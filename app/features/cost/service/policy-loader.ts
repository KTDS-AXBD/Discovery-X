import { eq, and } from "drizzle-orm";
import type { DB } from "~/db";
import {
  routingPolicies,
  policyProviderPriorities,
  policyPurposeRules,
  policyDegradeRules,
} from "../db/schema";
import type {
  RoutingPolicy,
  PolicyProviderPriority,
  PolicyPurposeRule,
  PolicyDegradeRule,
} from "../db/schema";

// ============================================================================
// TYPES
// ============================================================================

export interface LoadedPolicy {
  policy: RoutingPolicy;
  providerPriorities: PolicyProviderPriority[];
  purposeRules: PolicyPurposeRule[];
  degradeRules: PolicyDegradeRule[];
}

interface CacheEntry {
  data: LoadedPolicy;
  loadedAt: number;
}

// ============================================================================
// POLICY LOADER
// ============================================================================

/** 정책 캐시 TTL: 5분 */
const CACHE_TTL_MS = 5 * 60 * 1000;

export class PolicyLoader {
  private cache = new Map<string, CacheEntry>();

  constructor(private db: DB) {}

  /**
   * 적용 가능한 정책을 로드한다.
   * 우선순위: tenant-specific(낮은 priority 값) > global(tenantId IS NULL).
   * isActive = true인 정책만 대상.
   * 결과는 in-memory 캐시에 5분간 보관.
   */
  async loadPolicy(tenantId: string): Promise<LoadedPolicy | null> {
    const cacheKey = `tenant:${tenantId}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
      return cached.data;
    }

    // tenant-specific 정책 조회 (isActive, 가장 낮은 priority)
    const [tenantPolicy] = await this.db
      .select()
      .from(routingPolicies)
      .where(
        and(
          eq(routingPolicies.tenantId, tenantId),
          eq(routingPolicies.isActive, true)
        )
      )
      .orderBy(routingPolicies.priority)
      .limit(1);

    if (tenantPolicy) {
      const loaded = await this.loadPolicyDetails(tenantPolicy);
      this.cache.set(cacheKey, { data: loaded, loadedAt: Date.now() });
      return loaded;
    }

    // global 정책 fallback (tenantId IS NULL)
    const globalKey = "tenant:__global__";
    const globalCached = this.cache.get(globalKey);

    if (globalCached && Date.now() - globalCached.loadedAt < CACHE_TTL_MS) {
      // tenant 캐시에도 global 결과를 저장 (중복 DB 조회 방지)
      this.cache.set(cacheKey, globalCached);
      return globalCached.data;
    }

    const [globalPolicy] = await this.db
      .select()
      .from(routingPolicies)
      .where(
        and(
          eq(routingPolicies.isActive, true)
        )
      )
      .orderBy(routingPolicies.priority)
      .limit(1);

    // tenantId가 null인 정책만 global로 간주
    const matched = globalPolicy?.tenantId === null ? globalPolicy : null;

    if (!matched) {
      return null;
    }

    const loaded = await this.loadPolicyDetails(matched);
    this.cache.set(globalKey, { data: loaded, loadedAt: Date.now() });
    this.cache.set(cacheKey, { data: loaded, loadedAt: Date.now() });
    return loaded;
  }

  /**
   * 특정 정책 ID + 버전의 전체 구성을 로드한다 (routing_decisions 감사 추적용).
   */
  async loadPolicyById(
    policyId: string,
    version: number
  ): Promise<LoadedPolicy | null> {
    const [policy] = await this.db
      .select()
      .from(routingPolicies)
      .where(eq(routingPolicies.id, policyId))
      .limit(1);

    if (!policy) return null;

    return this.loadPolicyDetails(policy, version);
  }

  /** 캐시 전체 또는 특정 tenant 무효화 */
  invalidateCache(tenantId?: string): void {
    if (tenantId) {
      this.cache.delete(`tenant:${tenantId}`);
    } else {
      this.cache.clear();
    }
  }

  // --- Private ---

  private async loadPolicyDetails(
    policy: RoutingPolicy,
    versionOverride?: number
  ): Promise<LoadedPolicy> {
    const version = versionOverride ?? policy.version;

    const [providers, purposes, degrades] = await Promise.all([
      this.db
        .select()
        .from(policyProviderPriorities)
        .where(
          and(
            eq(policyProviderPriorities.policyId, policy.id),
            eq(policyProviderPriorities.policyVersion, version)
          )
        )
        .orderBy(policyProviderPriorities.priority),

      this.db
        .select()
        .from(policyPurposeRules)
        .where(
          and(
            eq(policyPurposeRules.policyId, policy.id),
            eq(policyPurposeRules.policyVersion, version)
          )
        ),

      this.db
        .select()
        .from(policyDegradeRules)
        .where(
          and(
            eq(policyDegradeRules.policyId, policy.id),
            eq(policyDegradeRules.policyVersion, version)
          )
        )
        .orderBy(policyDegradeRules.fromMinScore),
    ]);

    return {
      policy,
      providerPriorities: providers,
      purposeRules: purposes,
      degradeRules: degrades,
    };
  }
}
