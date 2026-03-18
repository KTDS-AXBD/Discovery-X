/**
 * PolicyRouter — 7단계 정책 평가 + routing_decisions 기록.
 *
 * 평가 순서 (DX-PLAN-008 §3.1):
 *   1. 보안/규제 제한
 *   2. 비활성 모델 제외
 *   3. 기능 적합성 (도구/스트리밍/JSON/컨텍스트)
 *   4. 예산 상태 (3단계: warn/degrade/block)
 *   5. 공급자 가용성 (API 키/크레딧 소진)
 *   6. 우선순위 체인 (routing_policies.providerChain)
 *   7. 비용 최적화 (동일 capability 내 저비용 선호)
 *
 * Phase 1 어댑터: PolicyRouter가 route()로 provider+model 결정 후,
 * FallbackManager가 실제 API 호출을 수행한다.
 */

import { eq } from "drizzle-orm";
import type { DB } from "~/db";
import { modelCatalog, routingDecisions } from "~/features/cost/db/schema";
import type { ModelCatalogEntry } from "~/features/cost/db/schema";
import type {
  RoutingRequest,
  RoutingResult,
  ReasonCode,
  ProviderId,
  BudgetEvaluation,
} from "~/features/cost/types";
import { PolicyLoader } from "~/features/cost/service/policy-loader";
import type { LoadedPolicy } from "~/features/cost/service/policy-loader";
import { BudgetEvaluator } from "~/features/cost/service/budget-evaluator";
import { TierRouter, type TierRoutingResult } from "./tier-router";
import type { Tier } from "./complexity-scorer";

// ============================================================================
// TYPES
// ============================================================================

/** 7단계 평가 과정에서 각 모델의 후보 정보 */
interface CandidateModel {
  catalogEntry: ModelCatalogEntry;
  provider: ProviderId;
  /** 정책 체인에서의 순서 (1 = 최우선) */
  chainPriority: number;
  /** 탈락 사유 (null = 유효 후보) */
  excludeReason?: string;
}

/** provider 건강 상태 캐시 */
interface ProviderHealthEntry {
  available: boolean;
  updatedAt: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** API 키 환경변수 매핑 */
const API_KEY_MAP: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_AI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  "workers-ai": "", // Workers AI는 바인딩 사용
};

/** provider 건강 상태 캐시 TTL: 30초 */
const HEALTH_CACHE_TTL_MS = 30 * 1000;

/** model_catalog 캐시 TTL: 5분 */
const MODEL_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * PAL Router — 티어별 capabilityScore 상한 (이하만 후보에 포함).
 *
 * 설계는 capabilityScore + price 이중 조건 분류를 사용하나,
 * 정적 상수로는 price 조회 불가. capabilityScore 단일 상한으로 근사:
 *   frugal ≤85: haiku(60), llama(50), flash(80), mini(85) = 4모델
 *   standard ≤93: nano(88), v3.2(91), r1(90), sonnet(93), gpt-5.4(93) 등
 *   frontier: opus(97)
 */
const TIER_CAPABILITY_CEILING: Record<Tier, number> = {
  frugal: 85,
  standard: 93,
  frontier: 100,
};

// ============================================================================
// POLICY ROUTER
// ============================================================================

export class PolicyRouter {
  private policyLoader: PolicyLoader;
  private budgetEvaluator: BudgetEvaluator;
  /** PAL Router — 복잡도 기반 티어 라우팅 (opt-in) */
  private tierRouter = new TierRouter();

  /** provider 건강 상태 캐시 */
  private healthCache = new Map<ProviderId, ProviderHealthEntry>();
  /** model_catalog 캐시 */
  private modelCache: { data: ModelCatalogEntry[]; loadedAt: number } | null =
    null;

  constructor(
    private db: DB,
    private env: Record<string, string | undefined>
  ) {
    this.policyLoader = new PolicyLoader(db);
    this.budgetEvaluator = new BudgetEvaluator(db);
  }

  /** TierRouter 인스턴스 접근 (에스컬레이션/다운그레이드 기록용) */
  getTierRouter(): TierRouter {
    return this.tierRouter;
  }

  /**
   * 7단계 정책 평가 → provider+model 선택 + routing_decisions 기록.
   * 정책이 없으면 기본 fallback (anthropic 최우선) 사용.
   */
  async route(request: RoutingRequest): Promise<RoutingResult> {
    const loadedPolicy = await this.policyLoader.loadPolicy(request.tenantId);
    const budget = await this.budgetEvaluator.evaluate(
      request.userId,
      request.tenantId,
      request.purpose
    );

    // 예산 block → 즉시 차단
    if (budget.tier === "block") {
      return this.logAndReturn(request, null, budget, loadedPolicy, "budget_block");
    }

    // 모델 카탈로그 로드
    const models = await this.getActiveModels();
    if (models.length === 0) {
      throw new Error("[PolicyRouter] 활성 모델이 없습니다");
    }

    // 용도별 규칙 조회
    const purposeRule = loadedPolicy?.purposeRules.find(
      (r) => r.purpose === request.purpose
    );

    // 후보 모델 목록 구성
    const candidates = this.buildCandidates(models, loadedPolicy);

    // Step 1~3: 기능 적합성 필터링
    const filtered = this.filterByCriteria(
      candidates,
      request,
      purposeRule,
      budget
    );

    // PAL Router 레이어 (opt-in): 복잡도 기반 티어 필터링
    let palResult: TierRoutingResult | undefined;
    let afterTier = filtered;
    if (request.enablePalRouter && request.palInput) {
      palResult = this.tierRouter.route({
        estimatedTokens: request.estimatedTokens ?? 0,
        toolCount: request.palInput.toolCount,
        conversationDepth: request.palInput.conversationDepth,
        purpose: request.purpose,
        needsJsonMode: request.needsJsonMode,
      });
      afterTier = this.filterByTier(filtered, palResult.effectiveTier);
      // 티어 필터링으로 후보가 0이면 상위 티어로 폴백
      if (afterTier.length === 0) {
        afterTier = filtered;
      }
    }

    // Step 4: 예산 degrade 처리
    const afterBudget = this.applyBudgetDegrade(
      afterTier,
      budget,
      purposeRule,
      loadedPolicy
    );

    // Step 5: 공급자 가용성 필터링
    const available = this.filterByAvailability(afterBudget);

    // Step 6+7: 우선순위 + 비용 최적화
    const selected = this.selectBest(available);

    if (!selected) {
      return this.logAndReturn(
        request,
        null,
        budget,
        loadedPolicy,
        "capability_skip",
        palResult?.effectiveTier
      );
    }

    const reasonCode: ReasonCode =
      budget.tier === "degrade" ? "budget_degrade" : "primary";

    return this.logAndReturn(
      request,
      selected,
      budget,
      loadedPolicy,
      reasonCode,
      palResult?.effectiveTier
    );
  }

  /** provider 호출 실패 시 건강 상태 갱신 (FallbackManager에서 호출) */
  markProviderFailed(providerId: ProviderId): void {
    this.healthCache.set(providerId, {
      available: false,
      updatedAt: Date.now(),
    });
  }

  /** provider 호출 성공 시 건강 상태 갱신 */
  markProviderHealthy(providerId: ProviderId): void {
    this.healthCache.set(providerId, {
      available: true,
      updatedAt: Date.now(),
    });
  }

  /** 전체 캐시 무효화 */
  invalidateCache(): void {
    this.policyLoader.invalidateCache();
    this.healthCache.clear();
    this.modelCache = null;
    this.tierRouter.reset();
  }

  // ==========================================================================
  // PAL ROUTER — 에스컬레이션 / 다운그레이드
  // ==========================================================================

  /**
   * PAL 에스컬레이션 — 실패 기록 + 상위 티어로 재라우팅.
   * FallbackManager의 모든 provider 실패 후 호출.
   *
   * @returns 상위 티어 라우팅 결과 (null이면 에스컬레이션 불가)
   */
  async escalatePal(
    request: RoutingRequest,
    reason?: string
  ): Promise<RoutingResult | null> {
    if (!request.enablePalRouter || !request.palInput) return null;

    const { purpose } = request;
    const { toolCount, conversationDepth } = request.palInput;

    // 현재 effective tier 계산
    const palResult = this.tierRouter.route({
      estimatedTokens: request.estimatedTokens ?? 0,
      toolCount,
      conversationDepth,
      purpose,
      needsJsonMode: request.needsJsonMode,
    });
    const currentTier = palResult.effectiveTier;

    // 실패 기록 + 에스컬레이션 판정
    const escalatedTier = this.tierRouter.recordFailure(
      purpose,
      toolCount,
      currentTier,
      reason
    );
    if (!escalatedTier) return null;

    // 상위 티어로 재라우팅
    return this.routeWithForcedTier(request, escalatedTier);
  }

  /**
   * PAL 성공 기록 — 다운그레이드 학습.
   * 연속 5성공 감지 시 자동으로 하위 티어 override 설정.
   */
  recordPalSuccess(request: RoutingRequest): void {
    if (!request.enablePalRouter || !request.palInput) return;

    const palResult = this.tierRouter.route({
      estimatedTokens: request.estimatedTokens ?? 0,
      toolCount: request.palInput.toolCount,
      conversationDepth: request.palInput.conversationDepth,
      purpose: request.purpose,
      needsJsonMode: request.needsJsonMode,
    });

    this.tierRouter.recordSuccess(
      request.purpose,
      request.palInput.toolCount,
      palResult.effectiveTier
    );
  }

  /**
   * 강제 티어로 라우팅 (에스컬레이션 재시도용).
   * route()와 동일한 7단계 평가를 수행하되, PAL 티어를 직접 지정.
   */
  async routeWithForcedTier(
    request: RoutingRequest,
    forcedTier: Tier
  ): Promise<RoutingResult> {
    const loadedPolicy = await this.policyLoader.loadPolicy(request.tenantId);
    const budget = await this.budgetEvaluator.evaluate(
      request.userId,
      request.tenantId,
      request.purpose
    );

    if (budget.tier === "block") {
      return this.logAndReturn(
        request,
        null,
        budget,
        loadedPolicy,
        "budget_block",
        forcedTier
      );
    }

    const models = await this.getActiveModels();
    if (models.length === 0) {
      throw new Error("[PolicyRouter] 활성 모델이 없습니다");
    }

    const purposeRule = loadedPolicy?.purposeRules.find(
      (r) => r.purpose === request.purpose
    );

    const candidates = this.buildCandidates(models, loadedPolicy);
    const filtered = this.filterByCriteria(
      candidates,
      request,
      purposeRule,
      budget
    );

    // 강제 티어 필터링 (빈 결과 시 전체 폴백)
    let afterTier = this.filterByTier(filtered, forcedTier);
    if (afterTier.length === 0) afterTier = filtered;

    const afterBudget = this.applyBudgetDegrade(
      afterTier,
      budget,
      purposeRule,
      loadedPolicy
    );
    const available = this.filterByAvailability(afterBudget);
    const selected = this.selectBest(available);

    if (!selected) {
      return this.logAndReturn(
        request,
        null,
        budget,
        loadedPolicy,
        "capability_skip",
        forcedTier
      );
    }

    const reasonCode: ReasonCode = "retry";
    return this.logAndReturn(
      request,
      selected,
      budget,
      loadedPolicy,
      reasonCode,
      forcedTier
    );
  }

  // ==========================================================================
  // PRIVATE — 7단계 평가
  // ==========================================================================

  /** 활성 모델 카탈로그 로드 (캐시) */
  private async getActiveModels(): Promise<ModelCatalogEntry[]> {
    if (
      this.modelCache &&
      Date.now() - this.modelCache.loadedAt < MODEL_CACHE_TTL_MS
    ) {
      return this.modelCache.data;
    }

    const models = await this.db
      .select()
      .from(modelCatalog)
      .where(eq(modelCatalog.isActive, true));

    this.modelCache = { data: models, loadedAt: Date.now() };
    return models;
  }

  /** 후보 모델 목록 구성 — 정책의 provider 체인 순서 반영 */
  private buildCandidates(
    models: ModelCatalogEntry[],
    loadedPolicy: LoadedPolicy | null
  ): CandidateModel[] {
    const providerOrder =
      loadedPolicy?.providerPriorities.map((p) => p.provider as ProviderId) ??
      ["anthropic", "openai", "google", "workers-ai"];

    return models.map((m) => {
      const provider = m.provider as ProviderId;
      const idx = providerOrder.indexOf(provider);
      return {
        catalogEntry: m,
        provider,
        chainPriority: idx >= 0 ? idx + 1 : 999, // 체인에 없으면 최하위
      };
    });
  }

  /**
   * Step 1~3: 보안 + 비활성 + 기능 적합성 필터링.
   * Step 1 (보안/규제)은 현재 no-op — 규제 데이터가 없음.
   * Step 2 (비활성)는 getActiveModels()에서 이미 처리.
   */
  private filterByCriteria(
    candidates: CandidateModel[],
    request: RoutingRequest,
    purposeRule: { minCapabilityScore: number; requiresTools: boolean; requiresJsonMode: boolean; requiresStreaming: boolean } | undefined,
    _budget: BudgetEvaluation
  ): CandidateModel[] {
    const minScore = purposeRule?.minCapabilityScore ?? 0;

    return candidates.filter((c) => {
      const m = c.catalogEntry;

      // Step 3a: capability score 최소 요구
      if (m.capabilityScore < minScore) {
        c.excludeReason = `capabilityScore ${m.capabilityScore} < min ${minScore}`;
        return false;
      }

      // Step 3b: 도구 필요 시 미지원 제외
      if (
        (request.needsTools || purposeRule?.requiresTools) &&
        !m.supportsTools
      ) {
        c.excludeReason = "tools not supported";
        return false;
      }

      // Step 3c: JSON 모드 필요 시 미지원 제외
      if (
        (request.needsJsonMode || purposeRule?.requiresJsonMode) &&
        !m.supportsJsonMode
      ) {
        c.excludeReason = "jsonMode not supported";
        return false;
      }

      // Step 3d: 스트리밍 필요 시 미지원 제외
      if (
        (request.needsStreaming || purposeRule?.requiresStreaming) &&
        !m.supportsStreaming
      ) {
        c.excludeReason = "streaming not supported";
        return false;
      }

      // Step 3e: 컨텍스트 길이 확인
      if (
        request.estimatedTokens &&
        m.maxContextTokens &&
        request.estimatedTokens > m.maxContextTokens
      ) {
        c.excludeReason = `context ${request.estimatedTokens} > max ${m.maxContextTokens}`;
        return false;
      }

      return true;
    });
  }

  /**
   * Step 4: 예산 degrade 처리.
   * budget.tier === "degrade"이고 purpose가 degradable이면 저비용 모델로 전환.
   */
  private applyBudgetDegrade(
    candidates: CandidateModel[],
    budget: BudgetEvaluation,
    purposeRule: { degradable: boolean; degradeToScore?: number | null } | undefined,
    loadedPolicy: LoadedPolicy | null
  ): CandidateModel[] {
    if (budget.tier !== "degrade") return candidates;

    // degrade 불가 용도 → 현재 모델 유지 (빈도 제한은 별도 처리)
    if (purposeRule && !purposeRule.degradable) return candidates;

    const degradeToScore = purposeRule?.degradeToScore ?? 35;

    // degrade_rules에서 대체 모델 조회
    if (loadedPolicy?.degradeRules && loadedPolicy.degradeRules.length > 0) {
      // 후보 중 가장 높은 capabilityScore 모델의 score 범위에 맞는 rule 찾기
      const bestCandidate = candidates.sort(
        (a, b) => a.chainPriority - b.chainPriority
      )[0];

      if (bestCandidate) {
        const score = bestCandidate.catalogEntry.capabilityScore;
        const rule = loadedPolicy.degradeRules.find(
          (r) =>
            score >= r.fromMinScore &&
            score <= r.fromMaxScore &&
            r.action === "degrade"
        );

        if (rule?.degradeToModelId) {
          // 대체 모델이 후보에 있으면 그것만 남기고, 아니면 score 기반 필터링
          const degradeModel = candidates.find(
            (c) => c.catalogEntry.id === rule.degradeToModelId
          );
          if (degradeModel) {
            return [degradeModel];
          }
        }
      }
    }

    // degrade_rules 미매칭 시 degradeToScore 이하 모델만 남기기
    const degraded = candidates.filter(
      (c) => c.catalogEntry.capabilityScore <= degradeToScore
    );

    // degradeToScore 이하 모델이 없으면 전체 후보 유지 (block보다는 비싼 모델 쓰는 게 낫다)
    return degraded.length > 0 ? degraded : candidates;
  }

  /** Step 5: 공급자 가용성 필터링 — API 키 존재 + 건강 상태 확인 */
  private filterByAvailability(candidates: CandidateModel[]): CandidateModel[] {
    return candidates.filter((c) => {
      const provider = c.provider;

      // 건강 상태 캐시 확인 (TTL 내 실패 기록 → 건너뛰기)
      const health = this.healthCache.get(provider);
      if (
        health &&
        !health.available &&
        Date.now() - health.updatedAt < HEALTH_CACHE_TTL_MS
      ) {
        c.excludeReason = "provider unhealthy";
        return false;
      }

      // API 키 확인 (Workers AI는 바인딩이므로 키 불필요)
      if (provider !== "workers-ai") {
        const keyName = API_KEY_MAP[provider];
        if (!keyName || !this.env[keyName]) {
          c.excludeReason = "API key missing";
          return false;
        }
      }

      return true;
    });
  }

  /**
   * PAL Router Step: 티어에 맞는 capabilityScore 상한으로 후보 필터링.
   * frugal(≤40), standard(≤75), frontier(전체)
   */
  private filterByTier(
    candidates: CandidateModel[],
    tier: Tier
  ): CandidateModel[] {
    const ceiling = TIER_CAPABILITY_CEILING[tier];
    return candidates.filter((c) => c.catalogEntry.capabilityScore <= ceiling);
  }

  /**
   * Step 6+7: 우선순위 체인 순서 → 동일 provider 내 최저 비용 모델 선택.
   * chainPriority 오름차순 → capabilityScore 내림차순 (성능 우선).
   */
  private selectBest(candidates: CandidateModel[]): CandidateModel | null {
    if (candidates.length === 0) return null;

    // 체인 우선순위 정렬 → 동일 provider 내 capabilityScore 내림차순
    candidates.sort((a, b) => {
      if (a.chainPriority !== b.chainPriority)
        return a.chainPriority - b.chainPriority;
      // 동일 체인 우선순위면 높은 capability 선호
      return b.catalogEntry.capabilityScore - a.catalogEntry.capabilityScore;
    });

    return candidates[0];
  }

  // ==========================================================================
  // ROUTING DECISION LOG
  // ==========================================================================

  /** 라우팅 결정 로그 기록 + RoutingResult 반환 */
  private async logAndReturn(
    request: RoutingRequest,
    selected: CandidateModel | null,
    budget: BudgetEvaluation,
    loadedPolicy: LoadedPolicy | null,
    reasonCode: ReasonCode,
    palTier?: Tier
  ): Promise<RoutingResult> {
    const decisionId = crypto.randomUUID();

    // routing_decisions INSERT (비핵심 — 실패해도 라우팅은 계속)
    try {
      await this.db.insert(routingDecisions).values({
        id: decisionId,
        userId: request.userId,
        tenantId: request.tenantId,
        purpose: request.purpose,
        selectedProvider: selected?.provider ?? null,
        selectedModel: selected?.catalogEntry.modelId ?? null,
        candidateChain: selected
          ? [
              {
                provider: selected.provider,
                model: selected.catalogEntry.modelId,
                score: selected.catalogEntry.capabilityScore,
              },
            ]
          : [],
        reasonCode,
        budgetState: {
          tier: budget.tier,
          usagePct: budget.usagePct,
          budgetUsd: budget.budgetUsd,
          currentUsageUsd: budget.currentUsageUsd,
        },
        policyId: loadedPolicy?.policy.id ?? null,
        policyVersion: loadedPolicy?.policy.version ?? null,
        fallbackCount: 0,
      });
    } catch (err) {
      console.warn("[PolicyRouter] routing_decisions INSERT failed:", err);
    }

    if (!selected) {
      // block 또는 적합 모델 없음 — provider/model 빈 값으로 반환
      return {
        provider: "anthropic", // fallback default
        model: "",
        decisionId,
        reasonCode,
        budgetTier: budget.tier,
        ...(palTier && { palTier }),
      };
    }

    return {
      provider: selected.provider,
      model: selected.catalogEntry.modelId,
      decisionId,
      reasonCode,
      budgetTier: budget.tier,
      ...(palTier && { palTier }),
    };
  }
}
