---
code: DX-DSGN-019
title: "PAL Router — 복잡도 기반 LLM 모델 티어 자동 선택 설계"
version: "0.1"
status: Draft
category: DSGN
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
---

# PAL Router — 복잡도 기반 LLM 모델 티어 자동 선택 설계

> **Plan**: [[DX-PLAN-012]]
> **Req**: DX-REQ-019 (F49, P2, v0.8.0)
> **Pattern**: Ouroboros — Progressive Adaptive LLM (PAL)
> **Status**: Draft

---

## 1. 모듈 아키텍처

### 1.1 전체 흐름

```
요청 입력 (RoutingRequest + conversationDepth + toolCount)
     │
     ▼
┌─────────────────────────────┐
│   ComplexityScorer          │  순수 함수 — DB 의존 없음
│   (complexity-scorer.ts)    │  입력 메타데이터 → score 0~1
└──────────┬──────────────────┘
           │ ComplexityResult { score, tier, factors }
           ▼
┌─────────────────────────────┐
│   TierRouter                │  model_catalog 기반 티어별 모델 풀 필터
│   (pal-router.ts)           │  score → 티어 → 후보 모델 축소
└──────────┬──────────────────┘
           │ filteredModels + selectedTier
           ▼
┌─────────────────────────────┐
│   PolicyRouter              │  기존 7단계 정책 평가 (변경 최소)
│   (policy-router.ts)        │  buildCandidates()에 tierFilter 옵션 추가
└──────────┬──────────────────┘
           │ RoutingResult { provider, model }
           ▼
┌─────────────────────────────┐
│   FallbackManager           │  기존 체인 순회 (변경 없음)
│   (fallback-manager.ts)     │  실패 시 다음 provider 전환
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│   EscalationManager         │  실패 시 상위 티어 재시도 결정
│   (pal-router.ts 내부)      │  연속 실패 → 에스컬레이션
│                             │  연속 성공 → 다운그레이드 기록
└─────────────────────────────┘
```

### 1.2 모듈 배치

| 파일 | 역할 | 의존성 |
|------|------|--------|
| `app/lib/ai/complexity-scorer.ts` | 복잡도 점수 산출 (순수 함수) | 없음 |
| `app/lib/ai/pal-router.ts` | 티어 결정 + 에스컬레이션 + 로깅 | DB, ComplexityScorer, PolicyRouter |
| `app/lib/ai/policy-router.ts` | 기존 7단계 + `tierFilter` 옵션 추가 | DB, PolicyLoader, BudgetEvaluator |
| `app/lib/ai/fallback-manager.ts` | 변경 없음 | providers |
| `app/lib/ai/types.ts` | PAL 관련 타입 추가 | - |
| `app/features/cost/db/schema.ts` | `taskComplexityLogs` + `complexityOverrides` 테이블 추가 | drizzle-orm |

### 1.3 기존 모듈과의 관계

```
                     ┌─────────────┐
                     │  executor-  │  호출 진입점
                     │  stream.ts  │
                     └──────┬──────┘
                            │
              ┌─────────────▼─────────────┐
              │       PalRouter           │  NEW — 복잡도 판정 + 티어 결정
              │  (PAL_ROUTER_ENABLED 시)  │
              └─────────────┬─────────────┘
                            │ PalRoutingResult
              ┌─────────────▼─────────────┐
              │     PolicyRouter          │  MODIFIED — tierFilter 파라미터 추가
              │     .route(request,       │
              │       { tierFilter })     │
              └─────────────┬─────────────┘
                            │ RoutingResult
              ┌─────────────▼─────────────┐
              │    FallbackManager        │  UNCHANGED
              │    .call() / .callStream()│
              └───────────────────────────┘
```

**비활성 시 (PAL_ROUTER_ENABLED=false)**: executor-stream → PolicyRouter → FallbackManager (현행과 동일).

---

## 2. ComplexityScorer 설계

### 2.1 입력 인터페이스

```typescript
// app/lib/ai/complexity-scorer.ts

interface ComplexityInput {
  /** 예상 입력 토큰 수 */
  estimatedTokens: number;
  /** 요청에 포함된 도구 개수 */
  toolCount: number;
  /** 대화 턴 깊이 (0 = 첫 메시지) */
  conversationDepth: number;
  /** 요청 용도 (purpose별 보정 적용) */
  purpose: Purpose;
  /** JSON 구조화 출력 필요 여부 */
  needsJsonMode: boolean;
}
```

### 2.2 점수 산출 알고리즘

```
rawScore = 0.30 × tokenFactor + 0.30 × toolFactor + 0.40 × depthFactor
```

| Factor | 계산 | 정규화 기준 | 범위 |
|--------|------|------------|------|
| `tokenFactor` | `min(estimatedTokens / 8000, 1.0)` | 8K 토큰 | 0~1 |
| `toolFactor` | `min(toolCount / 10, 1.0)` | 10개 도구 | 0~1 |
| `depthFactor` | `min(conversationDepth / 20, 1.0)` | 20턴 | 0~1 |

**가중치 근거**:

- `depthFactor` 0.40 (최고): 대화가 깊어질수록 긴 컨텍스트 이해력 필요 → Frontier 모델 유리
- `tokenFactor` 0.30: 입력 길이 ↑ → 처리 비용 + 요약/추출 능력 요구
- `toolFactor` 0.30: 도구 체인 ↑ → 계획/실행/판단 능력 요구

### 2.3 purpose별 보정 규칙

rawScore 산출 후 purpose와 옵션에 따라 adjustedScore를 계산한다.

```typescript
function applyPurposeModifier(rawScore: number, input: ComplexityInput): number {
  let score = rawScore;

  // purpose별 보정 계수
  const PURPOSE_MODIFIERS: Record<Purpose, number> = {
    "extraction": 0.5,   // 추출 = 본질적으로 단순
    "eval":       0.6,   // 평가 = 구조화된 판단
    "batch":      0.7,   // 배치 = 비용 효율 우선
    "analysis":   1.0,   // 분석 = 기본
    "chat":       1.0,   // 대화 = 기본
    "agent-tool": 1.2,   // 도구 실행 = 정확도 중요
  };

  score *= PURPOSE_MODIFIERS[input.purpose] ?? 1.0;

  // JSON 모드 보정: 구조화 출력은 약간 더 높은 능력 필요
  if (input.needsJsonMode) {
    score += 0.1;
  }

  // 0~1 범위 클램프
  return Math.max(0, Math.min(1, score));
}
```

### 2.4 출력 인터페이스

```typescript
interface ComplexityResult {
  /** 보정 전 가중 합산 점수 (0~1) */
  rawScore: number;
  /** purpose 보정 후 최종 점수 (0~1) */
  adjustedScore: number;
  /** 결정된 티어 */
  tier: Tier;
  /** 개별 팩터 값 (디버깅/로깅용) */
  factors: {
    tokenFactor: number;
    toolFactor: number;
    depthFactor: number;
  };
}
```

### 2.5 순수 함수 구현

```typescript
/** 순수 함수 — DB 의존 없음, 테스트 용이 */
export function scoreComplexity(input: ComplexityInput): ComplexityResult {
  const tokenFactor = Math.min(input.estimatedTokens / 8000, 1.0);
  const toolFactor = Math.min(input.toolCount / 10, 1.0);
  const depthFactor = Math.min(input.conversationDepth / 20, 1.0);

  const rawScore = 0.30 * tokenFactor + 0.30 * toolFactor + 0.40 * depthFactor;
  const adjustedScore = applyPurposeModifier(rawScore, input);

  const tier = scoreToTier(adjustedScore);

  return {
    rawScore: Math.round(rawScore * 1000) / 1000,
    adjustedScore: Math.round(adjustedScore * 1000) / 1000,
    tier,
    factors: {
      tokenFactor: Math.round(tokenFactor * 1000) / 1000,
      toolFactor: Math.round(toolFactor * 1000) / 1000,
      depthFactor: Math.round(depthFactor * 1000) / 1000,
    },
  };
}

function scoreToTier(score: number): Tier {
  if (score <= 0.3) return "frugal";
  if (score <= 0.7) return "standard";
  return "frontier";
}
```

### 2.6 점수 예시 (예상 시나리오)

| 시나리오 | tokens | tools | depth | purpose | rawScore | adjusted | 티어 |
|---------|--------|-------|-------|---------|----------|----------|------|
| 키워드 추출 | 500 | 0 | 0 | extraction | 0.019 | 0.009 | Frugal |
| 간단한 분류 | 1000 | 1 | 2 | analysis | 0.107 | 0.107 | Frugal |
| 일반 대화 | 3000 | 3 | 8 | chat | 0.363 | 0.363 | Standard |
| PRD 생성 | 5000 | 5 | 5 | agent-tool | 0.387 | 0.465 | Standard |
| 복잡 도구 체인 | 6000 | 8 | 15 | agent-tool | 0.665 | 0.798 | Frontier |
| 장기 전략 대화 | 7000 | 6 | 20 | chat | 0.743 | 0.743 | Frontier |

---

## 3. TierRouter 설계

### 3.1 모델 풀 자동 분류

model_catalog의 `capabilityScore`와 `price_catalog`의 가격 정보를 기반으로 3티어를 동적으로 분류한다. 하드코딩 없이 DB 값으로 자동 매핑.

```typescript
// pal-router.ts 내부

interface TierClassification {
  frugal: ModelCatalogEntry[];
  standard: ModelCatalogEntry[];
  frontier: ModelCatalogEntry[];
}

/**
 * model_catalog → 3티어 자동 분류.
 *
 * 분류 기준:
 *   Frugal:   capabilityScore ≤ 70  또는 inputPrice ≤ $0.50/M
 *   Standard: 70 < capabilityScore ≤ 93
 *   Frontier: capabilityScore > 93 또는 명시적 Frontier (Opus 등)
 *
 * capabilityScore ≤ 70 이면서 price > $0.50 인 경우 → capabilityScore 기준 우선
 * capabilityScore > 70 이면서 price ≤ $0.50 인 경우 → Frugal 분류 (비용 효율)
 */
function classifyModels(
  models: ModelCatalogEntry[],
  prices: Map<string, number> // modelCatalogId → inputPricePerMToken
): TierClassification {
  const result: TierClassification = {
    frugal: [], standard: [], frontier: [],
  };

  for (const model of models) {
    const inputPrice = prices.get(model.id) ?? Infinity;
    const score = model.capabilityScore;

    if (score > 93) {
      result.frontier.push(model);
    } else if (score <= 70 || inputPrice <= 0.50) {
      result.frugal.push(model);
    } else {
      result.standard.push(model);
    }
  }

  return result;
}
```

### 3.2 현재 프로덕션 모델 카탈로그 (12개) 분류 결과

| 티어 | 모델 | capabilityScore | 가격 (Input/M) | 분류 근거 |
|------|------|-----------------|---------------|----------|
| **Frugal** | claude-haiku-4.5 | 60 | $0.80 | score ≤ 70 |
| **Frugal** | gpt-4.1-mini | 85 | $0.40 | price ≤ $0.50 |
| **Frugal** | gpt-4.1-nano | 88 | $0.07 | price ≤ $0.50 |
| **Frugal** | gemini-2.5-flash | 80 | $0.15 | price ≤ $0.50 |
| **Frugal** | deepseek-v3.2 | 91 | $0.14 | price ≤ $0.50 |
| **Frugal** | llama-3.3-70b | 50 | $0.00 | score ≤ 70 + price ≤ $0.50 |
| **Standard** | claude-sonnet-4 | 93 | $3.00 | 70 < score ≤ 93 |
| **Standard** | gpt-5.4 | 93 | $2.00 | 70 < score ≤ 93 |
| **Standard** | gpt-4.1 | 93 | $2.00 | 70 < score ≤ 93 |
| **Standard** | gemini-2.5-pro | 93 | $1.25 | 70 < score ≤ 93 |
| **Standard** | deepseek-r1 | 90 | $0.55 | 70 < score ≤ 93 |
| **Frontier** | claude-opus-4 | 97 | $15.00 | score > 93 |

> **Frugal 6개**, **Standard 5개**, **Frontier 1개** — Frugal 풀이 풍부하여 PAL 전략에 유리.

### 3.3 PolicyRouter 통합 — tierFilter 옵션

TierRouter는 PolicyRouter.route()를 직접 호출하되, 티어별 모델 ID 필터를 전달한다.

```typescript
// policy-router.ts에 추가되는 옵션

interface TierFilterOption {
  /** 허용할 model_catalog ID 목록 */
  allowedModelIds: string[];
  /** 이 필터의 출처 (로깅용) */
  source: "pal-router";
}

// route() 메서드 시그니처 변경
async route(
  request: RoutingRequest,
  options?: { tierFilter?: TierFilterOption }
): Promise<RoutingResult>
```

**buildCandidates() 변경**:

```typescript
private buildCandidates(
  models: ModelCatalogEntry[],
  loadedPolicy: LoadedPolicy | null,
  tierFilter?: TierFilterOption
): CandidateModel[] {
  // 기존 로직 그대로...
  let filteredModels = models;

  // PAL 티어 필터 적용 (설정 시)
  if (tierFilter) {
    filteredModels = models.filter(
      m => tierFilter.allowedModelIds.includes(m.id)
    );
    // 필터 후 후보가 없으면 전체 모델 사용 (안전장치)
    if (filteredModels.length === 0) {
      filteredModels = models;
    }
  }

  const providerOrder = loadedPolicy?.providerPriorities.map(
    p => p.provider as ProviderId
  ) ?? ["anthropic", "openai", "google", "workers-ai"];

  return filteredModels.map(m => ({
    catalogEntry: m,
    provider: m.provider as ProviderId,
    chainPriority: (() => {
      const idx = providerOrder.indexOf(m.provider as ProviderId);
      return idx >= 0 ? idx + 1 : 999;
    })(),
  }));
}
```

### 3.4 TierRouter.route() 흐름

```typescript
class PalRouter {
  async route(request: PalRoutingRequest): Promise<PalRoutingResult> {
    // 1. 복잡도 점수 산출
    const complexity = scoreComplexity({
      estimatedTokens: request.estimatedTokens ?? 0,
      toolCount: request.toolCount ?? 0,
      conversationDepth: request.conversationDepth ?? 0,
      purpose: request.purpose,
      needsJsonMode: request.needsJsonMode,
    });

    // 2. complexity_overrides 확인 (학습 기반 강제 지정)
    const override = await this.checkOverride(
      request.tenantId, request.purpose, request.toolCount ?? 0
    );
    const effectiveTier = override?.overrideTier ?? complexity.tier;

    // 3. 티어별 모델 풀 분류
    const classification = await this.getClassifiedModels();
    const tierModels = this.getModelsForTier(classification, effectiveTier);

    // 4. PolicyRouter에 티어 필터 전달
    const routingResult = await this.policyRouter.route(request, {
      tierFilter: {
        allowedModelIds: tierModels.map(m => m.id),
        source: "pal-router",
      },
    });

    // 5. task_complexity_logs 기록 (비동기, 실패 무시)
    this.logComplexity(request, complexity, effectiveTier, routingResult)
      .catch(err => console.warn("[PalRouter] log failed:", err));

    return {
      ...routingResult,
      complexityScore: complexity.adjustedScore,
      selectedTier: effectiveTier,
    };
  }
}
```

### 3.5 티어 캐시

model_catalog → 티어 분류 결과는 `MODEL_CACHE_TTL_MS` (5분)과 동일 주기로 캐시한다. PolicyRouter의 기존 modelCache와 동기화하여 이중 쿼리를 방지.

```typescript
private tierCache: { data: TierClassification; loadedAt: number } | null = null;

private async getClassifiedModels(): Promise<TierClassification> {
  if (this.tierCache && Date.now() - this.tierCache.loadedAt < MODEL_CACHE_TTL_MS) {
    return this.tierCache.data;
  }

  const models = await this.policyRouter.getActiveModels(); // 기존 캐시 활용
  const prices = await this.loadCurrentPrices();
  const classified = classifyModels(models, prices);

  this.tierCache = { data: classified, loadedAt: Date.now() };
  return classified;
}
```

---

## 4. 에스컬레이션 / 다운그레이드

### 4.1 에스컬레이션 (상위 티어 전환)

에스컬레이션은 **티어 내 모든 모델이 실패**한 경우 상위 티어의 모델 풀로 재시도하는 메커니즘이다.

```
Frugal 선택 → Frugal 모델 전체 실패
                    ↓
              Standard 에스컬레이션 → Standard 모델 전체 실패
                                          ↓
                                    Frontier 에스컬레이션
                                    → 기존 FallbackManager 5단계 체인
```

**트리거 조건** (OR):

| # | 조건 | 설명 |
|---|------|------|
| 1 | API 에러 | 선택된 티어의 모든 provider에서 에러 발생 |
| 2 | 품질 미달 | 응답 길이 < 50자 (extraction 제외) 또는 tool_use 파싱 실패 |
| 3 | 연속 실패 2회 | 동일 purpose에서 2회 연속 에스컬레이션 발생 시 해당 purpose를 한 단계 상향 고정 |

**EscalationManager 구현**:

```typescript
// pal-router.ts 내부

interface EscalationState {
  /** 현재 티어 */
  currentTier: Tier;
  /** 현재 티어에서의 연속 실패 횟수 */
  consecutiveFailures: number;
  /** 에스컬레이션 이력 */
  escalationHistory: Array<{
    fromTier: Tier;
    toTier: Tier;
    reason: string;
    timestamp: number;
  }>;
}

const TIER_ESCALATION_MAP: Record<Tier, Tier | null> = {
  frugal: "standard",
  standard: "frontier",
  frontier: null, // 더 이상 에스컬레이션 불가
};

function escalate(state: EscalationState, reason: string): EscalationState {
  const nextTier = TIER_ESCALATION_MAP[state.currentTier];
  if (!nextTier) return state; // frontier에서는 에스컬레이션 불가

  return {
    currentTier: nextTier,
    consecutiveFailures: 0,
    escalationHistory: [
      ...state.escalationHistory,
      {
        fromTier: state.currentTier,
        toTier: nextTier,
        reason,
        timestamp: Date.now(),
      },
    ],
  };
}
```

### 4.2 FallbackManager 연동

에스컬레이션은 FallbackManager의 기존 콜백 메커니즘을 활용한다.

```typescript
// executor-stream.ts (호출 진입점) 에서의 사용 패턴

const palRouter = new PalRouter(db, env, policyRouter);
const palResult = await palRouter.route(request);

const fallbackManager = new FallbackManager(ctx, {
  providerChain: palResult.providerChain,
  nativeModel: palResult.model,
  onProviderFailed: (id) => {
    policyRouter.markProviderFailed(id);
    // 모든 provider 실패 시 에스컬레이션
    palRouter.handleProviderFailure(palResult.selectedTier, id);
  },
  onProviderSuccess: (id) => {
    policyRouter.markProviderHealthy(id);
    palRouter.handleProviderSuccess(palResult.selectedTier, request.purpose);
  },
});

try {
  return await fallbackManager.callStream(apiKey, claudeRequest);
} catch (allFailed) {
  // 모든 provider 실패 → 에스컬레이션 시도
  const escalatedTier = palRouter.escalate(palResult.selectedTier);
  if (escalatedTier) {
    // 상위 티어로 재라우팅
    const retryResult = await palRouter.routeWithTier(request, escalatedTier);
    const retryFallback = new FallbackManager(ctx, {
      providerChain: retryResult.providerChain,
      nativeModel: retryResult.model,
    });
    return await retryFallback.callStream(apiKey, claudeRequest);
  }
  throw allFailed; // 에스컬레이션 불가 → 기존 에러 전파
}
```

### 4.3 다운그레이드 (하위 티어 전환)

다운그레이드는 **과잉 품질 패턴을 학습**하여 유사 요청의 티어를 자동 하향하는 비동기 피드백 루프이다.

**기록 기반 판정**:

```
task_complexity_logs 분석
  → 동일 (purpose, toolCount 범위) 패턴에서
  → selectedTier = "standard" 이고 success = true 인 비율이 90%+ 이며
  → sampleCount ≥ 20
  → 해당 패턴을 complexity_overrides에 "frugal"로 등록
```

**Jaccard 유사도 기반 태스크 유형 상속**:

동일한 purpose + 유사한 toolCount 범위의 요청을 하나의 "태스크 유형"으로 묶어 학습한다. toolCount 범위는 ±2로 설정.

```typescript
interface TaskTypeSignature {
  purpose: Purpose;
  toolCountMin: number; // toolCount - 2 (min 0)
  toolCountMax: number; // toolCount + 2
}

/**
 * 다운그레이드 판정 쿼리 (Cron 또는 비동기).
 *
 * 조건:
 *   1. selectedTier = 'standard' 또는 'frontier'
 *   2. purpose + toolCount 범위 그룹별
 *   3. success 비율 ≥ 90%
 *   4. sampleCount ≥ 20
 *   5. 하위 티어에서 실패한 이력이 최근 7일 내 없음
 */
async function analyzeDowngradeCandidates(
  db: DB,
  tenantId: string
): Promise<DowngradeCandidate[]> {
  // SQL 기반 분석 → complexity_overrides INSERT/UPDATE
}
```

### 4.4 에스컬레이션/다운그레이드 흐름도

```
                    ┌────────────────────┐
                    │  요청 도착         │
                    └──────┬─────────────┘
                           ▼
                    ┌────────────────────┐
                    │ ComplexityScorer   │
                    │ → tier 결정       │
                    └──────┬─────────────┘
                           ▼
               ┌───────────────────────────┐
               │ complexity_overrides 확인 │
               │ (학습 기반 강제 지정?)    │
               └──────┬────────────────────┘
                      ▼
               ┌─────────────┐
               │ 티어 모델   │
               │ 호출 시도   │
               └──┬──────┬───┘
                  │      │
            성공 ▼      ▼ 실패
         ┌────────┐  ┌──────────────────┐
         │ 기록   │  │ consecutiveFailures++ │
         │ + 완료 │  └──────┬───────────┘
         └────────┘         ▼
                     ┌──────────────┐
                     │ failures ≥ 2?│
                     └──┬───────┬───┘
                   No   ▼       ▼ Yes
              ┌────────┐  ┌───────────────┐
              │ 재시도  │  │ 상위 티어     │
              │ (동일)  │  │ 에스컬레이션  │
              └────────┘  └───────────────┘
```

---

## 5. DB 스키마

### 5.1 task_complexity_logs 테이블

복잡도 점수 + 티어 선택 + 실행 결과를 기록. 다운그레이드 학습과 비용 분석의 데이터 소스.

```typescript
// app/features/cost/db/schema.ts에 추가

export const taskComplexityLogs = sqliteTable(
  "task_complexity_logs",
  {
    id: text("id").primaryKey(),
    routingDecisionId: text("routing_decision_id"),
    userId: text("user_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    purpose: text("purpose").notNull(),

    // 입력 메트릭
    estimatedTokens: integer("estimated_tokens").notNull().default(0),
    toolCount: integer("tool_count").notNull().default(0),
    conversationDepth: integer("conversation_depth").notNull().default(0),

    // 복잡도 점수
    tokenFactor: real("token_factor").notNull(),
    toolFactor: real("tool_factor").notNull(),
    depthFactor: real("depth_factor").notNull(),
    rawScore: real("raw_score").notNull(),
    adjustedScore: real("adjusted_score").notNull(),

    // 티어 결정
    selectedTier: text("selected_tier").notNull(), // "frugal" | "standard" | "frontier"
    actualTier: text("actual_tier"),                // 에스컬레이션 후 실제 사용 티어
    escalated: integer("escalated", { mode: "boolean" }).notNull().default(false),
    escalationReason: text("escalation_reason"),

    // 결과
    selectedModel: text("selected_model"),
    actualModel: text("actual_model"),
    success: integer("success", { mode: "boolean" }),
    responseTokens: integer("response_tokens"),
    latencyMs: integer("latency_ms"),

    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    tenantCreatedIdx: index("idx_tcl_tenant_created").on(
      table.tenantId, table.createdAt
    ),
    purposeTierIdx: index("idx_tcl_purpose_tier").on(
      table.purpose, table.selectedTier
    ),
    escalatedIdx: index("idx_tcl_escalated").on(table.escalated),
  })
);
```

### 5.2 complexity_overrides 테이블 (Phase 4)

패턴별 학습 결과를 저장하여 ComplexityScorer 판정을 자동 보정한다.

```typescript
export const complexityOverrides = sqliteTable(
  "complexity_overrides",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    purpose: text("purpose").notNull(),
    toolCountMin: integer("tool_count_min").notNull().default(0),
    toolCountMax: integer("tool_count_max").notNull().default(100),
    overrideTier: text("override_tier").notNull(), // 강제 지정 티어
    confidence: real("confidence").notNull(),       // 학습 신뢰도 (0~1)
    sampleCount: integer("sample_count").notNull().default(0),
    successRate: real("success_rate").notNull().default(0),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (table) => ({
    tenantPurposeIdx: index("idx_co_tenant_purpose").on(
      table.tenantId, table.purpose
    ),
  })
);
```

### 5.3 타입 export

```typescript
export type TaskComplexityLog = typeof taskComplexityLogs.$inferSelect;
export type NewTaskComplexityLog = typeof taskComplexityLogs.$inferInsert;

export type ComplexityOverride = typeof complexityOverrides.$inferSelect;
export type NewComplexityOverride = typeof complexityOverrides.$inferInsert;
```

---

## 6. 마이그레이션 SQL

### 6.1 Phase 1: task_complexity_logs

```sql
-- 0067_add_task_complexity_logs.sql

CREATE TABLE task_complexity_logs (
  id TEXT PRIMARY KEY,
  routing_decision_id TEXT,
  user_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  purpose TEXT NOT NULL,

  -- 입력 메트릭
  estimated_tokens INTEGER NOT NULL DEFAULT 0,
  tool_count INTEGER NOT NULL DEFAULT 0,
  conversation_depth INTEGER NOT NULL DEFAULT 0,

  -- 복잡도 점수
  token_factor REAL NOT NULL,
  tool_factor REAL NOT NULL,
  depth_factor REAL NOT NULL,
  raw_score REAL NOT NULL,
  adjusted_score REAL NOT NULL,

  -- 티어 결정
  selected_tier TEXT NOT NULL,
  actual_tier TEXT,
  escalated INTEGER NOT NULL DEFAULT 0,
  escalation_reason TEXT,

  -- 결과
  selected_model TEXT,
  actual_model TEXT,
  success INTEGER,
  response_tokens INTEGER,
  latency_ms INTEGER,

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_tcl_tenant_created ON task_complexity_logs(tenant_id, created_at);
CREATE INDEX idx_tcl_purpose_tier ON task_complexity_logs(purpose, selected_tier);
CREATE INDEX idx_tcl_escalated ON task_complexity_logs(escalated) WHERE escalated = 1;
```

### 6.2 Phase 4: complexity_overrides

```sql
-- 0068_add_complexity_overrides.sql

CREATE TABLE complexity_overrides (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  tool_count_min INTEGER NOT NULL DEFAULT 0,
  tool_count_max INTEGER NOT NULL DEFAULT 100,
  override_tier TEXT NOT NULL,
  confidence REAL NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_co_tenant_purpose ON complexity_overrides(tenant_id, purpose);
```

> **주의**: 마이그레이션 추가 시 `tests/helpers/db.ts`에도 SQL 파일 추가 필수.

---

## 7. 설정 인터페이스

### 7.1 Feature Flag

```typescript
// PAL Router 활성화 제어
// .dev.vars 또는 Cloudflare 환경변수
PAL_ROUTER_ENABLED=false  // Phase 1~2: 관찰 전용 (기록만, 라우팅 미변경)
PAL_ROUTER_ENABLED=true   // Phase 3+: 실제 라우팅 적용
```

### 7.2 테넌트별 설정 구조

PAL Router 설정은 기존 `routing_policies` 테이블 체계에 추가 설정 테이블 없이 JSON 컬럼으로 저장한다. 별도 테이블 추가 시 스키마 복잡도가 과도해지므로, `routing_policies`에 `palConfig` JSON 컬럼을 추가하는 방식을 택한다.

```typescript
interface PalConfig {
  /** PAL Router 활성화 여부 (테넌트별 오버라이드) */
  enabled: boolean;
  /** 티어 경계 임계값 커스터마이즈 */
  thresholds: {
    frugalMax: number;   // 기본 0.3
    standardMax: number; // 기본 0.7
  };
  /** 가중치 커스터마이즈 */
  weights: {
    tokenWeight: number; // 기본 0.30
    toolWeight: number;  // 기본 0.30
    depthWeight: number; // 기본 0.40
  };
  /** 에스컬레이션 설정 */
  escalation: {
    maxRetries: number;          // 기본 2
    consecutiveFailureThreshold: number; // 기본 2
  };
  /** 다운그레이드 설정 */
  downgrade: {
    minSampleCount: number;      // 기본 20
    minSuccessRate: number;      // 기본 0.90
    lookbackDays: number;        // 기본 7
  };
}

/** 기본값 */
const DEFAULT_PAL_CONFIG: PalConfig = {
  enabled: true,
  thresholds: { frugalMax: 0.3, standardMax: 0.7 },
  weights: { tokenWeight: 0.30, toolWeight: 0.30, depthWeight: 0.40 },
  escalation: { maxRetries: 2, consecutiveFailureThreshold: 2 },
  downgrade: { minSampleCount: 20, minSuccessRate: 0.90, lookbackDays: 7 },
};
```

### 7.3 routing_policies 확장

```sql
-- routing_policies 테이블에 pal_config JSON 컬럼 추가 (마이그레이션 0067에 포함)
ALTER TABLE routing_policies ADD COLUMN pal_config TEXT; -- JSON
```

```typescript
// routing_policies 스키마 변경
export const routingPolicies = sqliteTable("routing_policies", {
  // ... 기존 컬럼
  palConfig: text("pal_config", { mode: "json" }).$type<PalConfig | null>(),
});
```

### 7.4 설정 페이지 (Phase 5)

관리자 설정 페이지에서 PAL Router 토글 + 임계값 슬라이더를 제공한다.

| 설정 항목 | UI 컴포넌트 | 범위 | 기본값 |
|----------|------------|------|--------|
| PAL 활성화 | Toggle | on/off | on |
| Frugal 임계값 | Slider | 0.1~0.5 | 0.3 |
| Standard 임계값 | Slider | 0.4~0.9 | 0.7 |
| Token 가중치 | NumberInput | 0~1 (합계 1.0) | 0.30 |
| Tool 가중치 | NumberInput | 0~1 (합계 1.0) | 0.30 |
| Depth 가중치 | NumberInput | 0~1 (합계 1.0) | 0.40 |

---

## 8. 타입 정의

### 8.1 PAL 핵심 타입 (app/lib/ai/types.ts에 추가)

```typescript
// ============================================================================
// PAL ROUTER TYPES
// ============================================================================

/** 3티어 모델 분류 */
export type Tier = "frugal" | "standard" | "frontier";

/** 티어 경계 임계값 */
export interface TierThresholds {
  frugalMax: number;   // 이하 → Frugal
  standardMax: number; // 이하 → Standard, 초과 → Frontier
}

/** 복잡도 점수 산출 입력 */
export interface ComplexityInput {
  estimatedTokens: number;
  toolCount: number;
  conversationDepth: number;
  purpose: Purpose;
  needsJsonMode: boolean;
}

/** 복잡도 점수 산출 결과 */
export interface ComplexityResult {
  rawScore: number;
  adjustedScore: number;
  tier: Tier;
  factors: {
    tokenFactor: number;
    toolFactor: number;
    depthFactor: number;
  };
}

/** PAL Router 확장 요청 (기존 RoutingRequest 확장) */
export interface PalRoutingRequest extends RoutingRequest {
  conversationDepth?: number;
  toolCount?: number;
}

/** PAL Router 확장 응답 (기존 RoutingResult 확장) */
export interface PalRoutingResult extends RoutingResult {
  complexityScore: number;
  selectedTier: Tier;
  actualTier?: Tier; // 에스컬레이션 후 실제 사용 티어
}

/** 에스컬레이션 상태 */
export interface EscalationState {
  currentTier: Tier;
  consecutiveFailures: number;
  escalationHistory: Array<{
    fromTier: Tier;
    toTier: Tier;
    reason: string;
    timestamp: number;
  }>;
}

/** 티어별 모델 분류 결과 */
export interface TierClassification {
  frugal: ModelCatalogEntry[];
  standard: ModelCatalogEntry[];
  frontier: ModelCatalogEntry[];
}

/** PAL 설정 (테넌트별) */
export interface PalConfig {
  enabled: boolean;
  thresholds: TierThresholds;
  weights: {
    tokenWeight: number;
    toolWeight: number;
    depthWeight: number;
  };
  escalation: {
    maxRetries: number;
    consecutiveFailureThreshold: number;
  };
  downgrade: {
    minSampleCount: number;
    minSuccessRate: number;
    lookbackDays: number;
  };
}

/** PolicyRouter.buildCandidates()에 전달하는 티어 필터 */
export interface TierFilterOption {
  allowedModelIds: string[];
  source: "pal-router";
}
```

### 8.2 Purpose 보정 계수 상수

```typescript
// app/lib/ai/complexity-scorer.ts

/** purpose별 복잡도 보정 계수 */
export const PURPOSE_MODIFIERS: Record<Purpose, number> = {
  extraction:  0.5,
  eval:        0.6,
  batch:       0.7,
  analysis:    1.0,
  chat:        1.0,
  "agent-tool": 1.2,
} as const;
```

---

## 9. 기존 코드 변경 범위

### 9.1 policy-router.ts — 변경 필요

| 변경 | 상세 | 영향 |
|------|------|------|
| `route()` 시그니처 확장 | 두 번째 인자 `options?: { tierFilter?: TierFilterOption }` 추가 | 기존 호출 코드 무영향 (optional) |
| `buildCandidates()` 확장 | `tierFilter` 인자 추가, 모델 필터링 로직 삽입 | 내부 메서드, 외부 영향 없음 |
| `getActiveModels()` public 노출 | PalRouter에서 캐시된 모델 목록 재사용 | `private` → `public` 접근자 변경 |
| `route()` 내부 `buildCandidates()` 호출 | `options?.tierFilter` 전달 추가 | 1줄 변경 |

**변경 줄 수**: ~15줄 (시그니처 2줄, buildCandidates 10줄, 접근자 1줄, 호출부 2줄)

### 9.2 fallback-manager.ts — 변경 없음

FallbackManager는 인터페이스 변경 없이 기존 동작 유지. PalRouter는 FallbackManager의 콜백(`onProviderFailed`, `onProviderSuccess`)을 통해 간접적으로 에스컬레이션 정보를 수집한다.

### 9.3 model-mapping.ts — 변경 없음

PAL Router는 model_catalog 기반으로 티어를 분류하므로 매핑 테이블 변경 불필요. PolicyRouter가 선택한 모델이 FallbackManager를 통해 매핑되는 기존 흐름 유지.

### 9.4 types.ts — 추가만

기존 타입 변경 없이 PAL 관련 타입만 추가 (§8.1 참조). 기존 `RoutingRequest`, `RoutingResult` 인터페이스는 변경하지 않고 `extends`로 확장.

### 9.5 cost/db/schema.ts — 추가만

기존 테이블 변경 없이 `taskComplexityLogs`, `complexityOverrides` 2개 테이블만 추가.

### 9.6 db/index.ts — 스키마 머지 추가

`costSchema`에서 이미 export하므로 추가 변경 불필요. `taskComplexityLogs`와 `complexityOverrides`가 `costSchema`에 포함되어 자동 머지.

### 9.7 executor-stream.ts — 호출 진입점 변경

| 변경 | 상세 |
|------|------|
| PalRouter 인스턴스 생성 | Feature Flag 확인 후 조건부 생성 |
| route() 호출 분기 | PAL 활성 시 PalRouter.route(), 비활성 시 PolicyRouter.route() |
| FallbackManager 콜백 확장 | 에스컬레이션 훅 추가 |
| 에스컬레이션 재시도 로직 | try-catch 블록 확장 |

**변경 줄 수**: ~30줄

### 9.8 신규 파일

| 파일 | 내용 | 예상 LOC |
|------|------|---------|
| `app/lib/ai/complexity-scorer.ts` | ComplexityScorer 순수 함수 | ~80 |
| `app/lib/ai/pal-router.ts` | PalRouter 클래스 + EscalationManager | ~250 |
| `tests/unit/complexity-scorer.test.ts` | ComplexityScorer 단위 테스트 | ~150 |
| `tests/unit/pal-router.test.ts` | PalRouter 단위 테스트 | ~200 |
| `tests/integration/api-pal-router.test.ts` | 에스컬레이션 통합 테스트 | ~150 |

### 9.9 영향도 요약

```
변경 파일 (기존):
  app/lib/ai/policy-router.ts    — ~15줄 (시그니처 + buildCandidates)
  app/lib/ai/types.ts            — ~60줄 (타입 추가만)
  app/features/cost/db/schema.ts — ~70줄 (테이블 추가만)
  app/routes/executor-stream 류  — ~30줄 (호출 분기)

신규 파일:
  app/lib/ai/complexity-scorer.ts — ~80줄
  app/lib/ai/pal-router.ts       — ~250줄

변경 없음:
  app/lib/ai/fallback-manager.ts
  app/lib/ai/model-mapping.ts
  app/lib/ai/providers/*
```

---

## 10. 테스트 계획

### 10.1 ComplexityScorer 단위 테스트

순수 함수이므로 DB 없이 테스트 가능. 입력 조합별 점수 + 티어 검증.

| # | 테스트 케이스 | 입력 | 기대 |
|---|-------------|------|------|
| 1 | 최소 입력 → Frugal | tokens=0, tools=0, depth=0, purpose=chat | score=0, tier=frugal |
| 2 | 최대 입력 → Frontier | tokens=10000, tools=15, depth=25, purpose=agent-tool | score=1.0, tier=frontier |
| 3 | extraction 보정 | tokens=3000, tools=3, depth=5, purpose=extraction | adjustedScore = rawScore × 0.5 |
| 4 | agent-tool 보정 (1.2배) | tokens=2000, tools=5, depth=3, purpose=agent-tool | adjustedScore = rawScore × 1.2 |
| 5 | needsJsonMode 보정 (+0.1) | 보정 전 0.25, needsJsonMode=true | adjustedScore = 0.35 |
| 6 | 클램프 1.0 초과 방지 | rawScore=0.9, purpose=agent-tool, needsJsonMode=true | adjustedScore = 1.0 (cap) |
| 7 | 경계값: 0.3 정확히 → Frugal | adjustedScore = 0.3 | tier = frugal |
| 8 | 경계값: 0.301 → Standard | adjustedScore = 0.301 | tier = standard |
| 9 | 경계값: 0.7 정확히 → Standard | adjustedScore = 0.7 | tier = standard |
| 10 | 경계값: 0.701 → Frontier | adjustedScore = 0.701 | tier = frontier |
| 11 | 모든 purpose 보정 계수 검증 | 6개 purpose 각각 | 올바른 modifier 적용 |
| 12 | 팩터 반올림 정밀도 | 임의 값 | 소수점 3자리 |

### 10.2 TierRouter 단위 테스트 (DB mock)

| # | 테스트 케이스 | 기대 |
|---|-------------|------|
| 1 | Frugal 티어 → Frugal 모델만 필터 | allowedModelIds에 Frugal 모델만 포함 |
| 2 | Standard 티어 → Standard 모델만 필터 | allowedModelIds에 Standard 모델만 포함 |
| 3 | Frontier 티어 → Frontier 모델만 필터 | allowedModelIds에 Frontier 모델만 포함 |
| 4 | model_catalog 동적 분류 | capabilityScore/price 기반 올바른 분류 |
| 5 | complexity_overrides 적용 | override 존재 시 scorer 결과 무시 |
| 6 | Feature Flag false → 기존 라우팅 | PolicyRouter.route() 직접 호출 |
| 7 | 티어 캐시 동작 | 5분 이내 재호출 시 DB 미조회 |
| 8 | 빈 티어 fallback | Frugal 모델 0개 → 전체 모델 사용 |

### 10.3 에스컬레이션 통합 테스트

| # | 테스트 케이스 | 기대 |
|---|-------------|------|
| 1 | Frugal 성공 → 에스컬레이션 없음 | actualTier = frugal, escalated = false |
| 2 | Frugal 실패 → Standard 에스컬레이션 | actualTier = standard, escalated = true |
| 3 | Frugal + Standard 실패 → Frontier | actualTier = frontier, 2회 에스컬레이션 |
| 4 | Frontier 실패 → 기존 에러 전파 | Error throw (에스컬레이션 불가) |
| 5 | 연속 실패 2회 → purpose 상향 고정 | complexity_overrides에 상향 기록 |
| 6 | task_complexity_logs 기록 검증 | 모든 필드 올바르게 INSERT |
| 7 | 에스컬레이션 reason 기록 | escalation_reason에 실패 사유 포함 |

### 10.4 다운그레이드 테스트 (Phase 4)

| # | 테스트 케이스 | 기대 |
|---|-------------|------|
| 1 | 성공률 90%+ / 샘플 20+ → 다운그레이드 | complexity_overrides INSERT |
| 2 | 성공률 89% → 다운그레이드 안 함 | complexity_overrides 미생성 |
| 3 | 샘플 19개 → 다운그레이드 안 함 | 최소 샘플 미충족 |
| 4 | 최근 7일 하위 티어 실패 이력 → 보류 | 다운그레이드 스킵 |
| 5 | 기존 override 갱신 | sampleCount, successRate UPDATE |

### 10.5 테스트 파일 구성

```
tests/
├── unit/
│   ├── complexity-scorer.test.ts     — 12 cases
│   └── pal-router.test.ts            — 8 cases
└── integration/
    └── api-pal-router.test.ts        — 7 cases (에스컬레이션)
```

**예상 테스트 수**: 27개 (Phase 1~3) + 5개 (Phase 4 다운그레이드) = **32개**

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-18 | Initial — 10섹션 설계: 모듈 아키텍처, ComplexityScorer, TierRouter, 에스컬레이션/다운그레이드, DB 스키마, 마이그레이션, 설정, 타입, 변경 범위, 테스트 계획 | Sinclair Seo |
