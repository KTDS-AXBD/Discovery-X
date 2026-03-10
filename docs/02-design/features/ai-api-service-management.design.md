# AI API 서비스 관리 — 설계 문서

> **Summary**: 3-Ledger 비용 관리 + Policy Engine 라우팅 + Capability-aware Fallback
>
> **Project**: Discovery-X
> **Version**: 0.7.0
> **Author**: Sinclair Seo
> **Date**: 2026-03-11
> **Status**: Draft
> **Planning Doc**: [DX-PLAN-008](../../01-plan/DX-PLAN-008_ai-api-service-management.md)

---

## 1. Overview

### 1.1 Design Goals

1. **Ledger-First**: Usage(사실) / Cost(추정) / Billing(실제) 3-Ledger 분리로 비용 데이터 신뢰성 확보
2. **O(1) Budget Evaluation**: budget_usage_cache incremental update로 hot-path SUM 쿼리 제거
3. **Policy Engine**: 코드 배포 없이 DB 테이블 수정만으로 라우팅/예산 정책 변경 가능
4. **Capability Score**: 0~100 수치 기반 모델 분류로 신규 모델 즉시 반영

### 1.2 Design Principles

- **기존 BC 패턴 준수**: `app/features/cost/` BC로 신설, `constructor(private db: DB)` 서비스 패턴
- **`from "~/db"` import 통일**: cost 스키마도 db/index.ts에서 머지
- **Append-only Ledger**: usage_events는 UPDATE/DELETE 금지, 보정은 보상 이벤트(compensation event)로
- **하위 호환**: 기존 token_usage_logs 병행 운영 후 마이그레이션 완료 시 제거

---

## 2. Architecture

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ LLM 호출 경로 (Hot Path)                                            │
│                                                                     │
│  Agent/Chat Route                                                   │
│       │                                                             │
│       ▼                                                             │
│  ┌──────────┐   policy_cache   ┌───────────────┐                   │
│  │ Budget   │◄────────────────▶│ Policy        │                   │
│  │ Evaluator│  budget_usage    │ Router        │                   │
│  │ (O(1))   │  _cache 조회     │ (7단계 평가)  │                   │
│  └────┬─────┘                  └───────┬───────┘                   │
│       │ allow/degrade/block            │ selected provider+model   │
│       ▼                                ▼                            │
│  ┌──────────┐                  ┌───────────────┐                   │
│  │ Provider │◄─────────────────│ Routing       │                   │
│  │ .call()  │                  │ Decision Log  │                   │
│  └────┬─────┘                  └───────────────┘                   │
│       │ response                                                    │
│       ▼                                                             │
│  ┌──────────┐   incremental    ┌───────────────┐                   │
│  │ Usage    │─────────────────▶│ Cost          │                   │
│  │ Recorder │   update         │ Estimator     │                   │
│  └────┬─────┘                  └───────┬───────┘                   │
│       │                                │ budget_usage_cache 갱신   │
│       ▼                                ▼                            │
│  usage_events              cost_estimates + budget_usage_cache      │
│  daily_usage_aggregates                                             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ Cron 경로 (Background)                                              │
│                                                                     │
│  api.cron.cost-maintenance                                          │
│       │                                                             │
│       ├─▶ daily_usage_aggregates 백필 (정합성 보정)                  │
│       ├─▶ budget_usage_cache drift 보정                             │
│       ├─▶ usage_events → usage_events_archive (90일 이상)           │
│       └─▶ BillingSync: Anthropic Admin API → billing_balances       │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
LLM 호출 요청
  → BudgetEvaluator.evaluate(userId, tenantId, purpose)     # O(1) 캐시 조회
  → PolicyRouter.route(purpose, budgetTier, capabilities)    # 7단계 정책 평가
  → Provider.call(apiKey, request)                           # 실제 LLM 호출
  → UsageRecorder.record(event)                              # usage_events INSERT
  → CostEstimator.estimate(usageEventId)                     # cost_estimates INSERT
  → BudgetUsageCache.increment(budgetPolicyId, costUsd)      # 캐시 incremental update
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| PolicyRouter | model_catalog, routing_policies, policy_* 테이블, BudgetEvaluator | 모델/프로바이더 선택 |
| BudgetEvaluator | budget_policies, budget_usage_cache | 예산 상태 판정 (O(1)) |
| CostEstimator | price_catalog, usage_events | USD 비용 환산 |
| UsageRecorder | usage_events, daily_usage_aggregates | 사용량 기록 |
| BillingSync | AnthropicAdminClient, billing_balances | 외부 크레딧 동기화 |

---

## 3. Data Model

### 3.1 BC 구조

```
app/features/cost/
├── db/
│   └── schema.ts              # 12 테이블 스키마 정의
├── service/
│   ├── cost-estimator.ts      # CostEstimator
│   ├── budget-evaluator.ts    # BudgetEvaluator
│   ├── usage-recorder.ts      # UsageRecorder
│   └── billing-sync.ts        # BillingSync
├── constants/
│   └── purpose.ts             # Purpose taxonomy enum
└── types/
    └── index.ts               # BudgetTier, RoutingDecision 등 타입
```

기존 `app/lib/cost/` 파일들은 `app/features/cost/service/`로 이동.
기존 `app/lib/ai/` PolicyRouter만 신설, FallbackManager는 점진 교체.

### 3.2 스키마 정의 (Drizzle ORM — D1/SQLite)

#### 3.2.1 usage_events

```typescript
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const usageEvents = sqliteTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    conversationId: text("conversation_id"),
    provider: text("provider").notNull(),       // anthropic | openai | google | workers-ai
    model: text("model").notNull(),
    purpose: text("purpose").notNull(),          // chat | analysis | extraction | batch | agent-tool | eval
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").default(0),
    cacheWriteTokens: integer("cache_write_tokens").default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    latencyMs: integer("latency_ms"),
    toolRounds: integer("tool_rounds").default(0),
    retryOf: text("retry_of"),                   // 재시도 시 원래 usage_event.id
    routingDecisionId: text("routing_decision_id"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    tenantCreatedIdx: index("idx_ue_tenant_created").on(t.tenantId, t.createdAt),
    userCreatedIdx: index("idx_ue_user_created").on(t.userId, t.createdAt),
    providerIdx: index("idx_ue_provider").on(t.provider, t.createdAt),
    purposeIdx: index("idx_ue_purpose").on(t.purpose, t.createdAt),
  })
);
```

#### 3.2.2 cost_estimates

```typescript
export const costEstimates = sqliteTable(
  "cost_estimates",
  {
    id: text("id").primaryKey(),
    usageEventId: text("usage_event_id").notNull().unique(),
    priceVersionId: text("price_version_id").notNull(),
    inputCostUsd: real("input_cost_usd").notNull().default(0),
    outputCostUsd: real("output_cost_usd").notNull().default(0),
    cacheCostUsd: real("cache_cost_usd").default(0),
    totalCostUsd: real("total_cost_usd").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    usageEventIdx: index("idx_ce_usage_event").on(t.usageEventId),
  })
);
```

#### 3.2.3 model_catalog

```typescript
export const modelCatalog = sqliteTable("model_catalog", {
  id: text("id").primaryKey(),                    // "anthropic:claude-sonnet-4-6"
  provider: text("provider").notNull(),
  modelId: text("model_id").notNull(),
  displayName: text("display_name").notNull(),
  capabilityScore: integer("capability_score").notNull(), // 0~100
  maxContextTokens: integer("max_context_tokens"),
  supportsTools: integer("supports_tools", { mode: "boolean" }).default(false),
  supportsStreaming: integer("supports_streaming", { mode: "boolean" }).default(false),
  supportsJsonMode: integer("supports_json_mode", { mode: "boolean" }).default(false),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
```

#### 3.2.4 price_catalog

```typescript
export const priceCatalog = sqliteTable(
  "price_catalog",
  {
    id: text("id").primaryKey(),
    modelCatalogId: text("model_catalog_id").notNull(),
    inputPricePerMToken: real("input_price_per_m_token").notNull(),
    outputPricePerMToken: real("output_price_per_m_token").notNull(),
    cacheReadPricePerMToken: real("cache_read_price_per_m_token"),
    cacheWritePricePerMToken: real("cache_write_price_per_m_token"),
    effectiveFrom: integer("effective_from", { mode: "timestamp" }).notNull(),
    effectiveTo: integer("effective_to", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    modelEffectiveIdx: index("idx_pc_model_effective").on(t.modelCatalogId, t.effectiveFrom),
  })
);
```

#### 3.2.5 budget_policies + budget_usage_cache

```typescript
export const budgetPolicies = sqliteTable(
  "budget_policies",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    userId: text("user_id"),                      // null = 조직 전체
    purpose: text("purpose"),                     // null = 전체 용도
    budgetUsd: real("budget_usd").notNull(),
    periodStart: integer("period_start", { mode: "timestamp" }).notNull(),
    periodEnd: integer("period_end", { mode: "timestamp" }).notNull(),
    thresholdWarnPct: integer("threshold_warn_pct").default(80),
    thresholdDegradePct: integer("threshold_degrade_pct").default(100),
    thresholdBlockPct: integer("threshold_block_pct").default(120),
    isActive: integer("is_active", { mode: "boolean" }).default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    tenantUserIdx: index("idx_bp_tenant_user").on(t.tenantId, t.userId, t.isActive),
    tenantPurposeIdx: index("idx_bp_tenant_purpose").on(t.tenantId, t.purpose, t.isActive),
  })
);

export const budgetUsageCache = sqliteTable("budget_usage_cache", {
  id: text("id").primaryKey(),
  budgetPolicyId: text("budget_policy_id").notNull().unique(),
  currentUsageUsd: real("current_usage_usd").notNull().default(0),
  usagePct: real("usage_pct").notNull().default(0),
  budgetTier: text("budget_tier").notNull().default("normal"), // normal|warn|degrade|block
  lastEventId: text("last_event_id"),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});
```

#### 3.2.6 routing_policies + 정규화 테이블

```typescript
export const routingPolicies = sqliteTable("routing_policies", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id"),                    // null = 전역
  name: text("name").notNull(),
  version: integer("version").notNull().default(1),
  isActive: integer("is_active", { mode: "boolean" }).default(true),
  priority: integer("priority").notNull().default(100),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const policyProviderPriorities = sqliteTable(
  "policy_provider_priorities",
  {
    id: text("id").primaryKey(),
    policyId: text("policy_id").notNull(),
    policyVersion: integer("policy_version").notNull(),
    provider: text("provider").notNull(),
    priority: integer("priority").notNull(),       // 1 = 최우선
  },
  (t) => ({
    policyPriorityIdx: index("idx_ppp_policy_priority").on(t.policyId, t.policyVersion, t.priority),
  })
);

export const policyPurposeRules = sqliteTable(
  "policy_purpose_rules",
  {
    id: text("id").primaryKey(),
    policyId: text("policy_id").notNull(),
    policyVersion: integer("policy_version").notNull(),
    purpose: text("purpose").notNull(),
    minCapabilityScore: integer("min_capability_score").notNull(),
    requiresTools: integer("requires_tools", { mode: "boolean" }).default(false),
    requiresJsonMode: integer("requires_json_mode", { mode: "boolean" }).default(false),
    requiresStreaming: integer("requires_streaming", { mode: "boolean" }).default(false),
    degradable: integer("degradable", { mode: "boolean" }).notNull(),
    degradeToScore: integer("degrade_to_score"),
  },
  (t) => ({
    policyPurposeIdx: index("idx_ppr_policy_purpose").on(t.policyId, t.policyVersion, t.purpose),
  })
);

export const policyDegradeRules = sqliteTable(
  "policy_degrade_rules",
  {
    id: text("id").primaryKey(),
    policyId: text("policy_id").notNull(),
    policyVersion: integer("policy_version").notNull(),
    fromMinScore: integer("from_min_score").notNull(),
    fromMaxScore: integer("from_max_score").notNull(),
    degradeToModelId: text("degrade_to_model_id"),
    action: text("action").notNull(),              // degrade | block | queue
  },
  (t) => ({
    policyScoreIdx: index("idx_pdr_policy_score").on(t.policyId, t.policyVersion, t.fromMinScore),
  })
);
```

#### 3.2.7 routing_decisions

```typescript
export const routingDecisions = sqliteTable(
  "routing_decisions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    purpose: text("purpose").notNull(),
    selectedProvider: text("selected_provider"),
    selectedModel: text("selected_model"),
    candidateChain: text("candidate_chain"),       // JSON: 평가 후보 목록
    reasonCode: text("reason_code").notNull(),      // primary|fallback_error|budget_degrade|...
    budgetState: text("budget_state"),              // JSON: 시점 스냅샷
    policyId: text("policy_id"),
    policyVersion: integer("policy_version"),
    fallbackCount: integer("fallback_count").default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    tenantCreatedIdx: index("idx_rd_tenant_created").on(t.tenantId, t.createdAt),
    userCreatedIdx: index("idx_rd_user_created").on(t.userId, t.createdAt),
  })
);
```

#### 3.2.8 daily_usage_aggregates

```typescript
export const dailyUsageAggregates = sqliteTable(
  "daily_usage_aggregates",
  {
    id: text("id").primaryKey(),
    tenantId: text("tenant_id").notNull(),
    userId: text("user_id"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    purpose: text("purpose").notNull(),
    date: text("date").notNull(),                  // YYYY-MM-DD
    requestCount: integer("request_count").notNull().default(0),
    totalInputTokens: integer("total_input_tokens").default(0),
    totalOutputTokens: integer("total_output_tokens").default(0),
    totalTokens: integer("total_tokens").default(0),
    totalCostUsd: real("total_cost_usd").default(0),
    avgLatencyMs: integer("avg_latency_ms"),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    tenantDateIdx: index("idx_dua_tenant_date").on(t.tenantId, t.date),
    userDateIdx: index("idx_dua_user_date").on(t.userId, t.date),
  })
);
```

### 3.3 Entity Relationships

```
[model_catalog] 1 ──── N [price_catalog]
       │
       └─── referenced by ──── [policy_degrade_rules.degradeToModelId]

[routing_policies] 1 ──── N [policy_provider_priorities]
       │               ──── N [policy_purpose_rules]
       │               ──── N [policy_degrade_rules]
       │
       └─── referenced by ──── [routing_decisions.policyId]

[budget_policies] 1 ──── 1 [budget_usage_cache]

[usage_events] 1 ──── 1 [cost_estimates]
       │       1 ──── 1 [routing_decisions] (via routingDecisionId)
       │
       └─── aggregated into ── [daily_usage_aggregates]
```

### 3.4 db/index.ts 머지

```typescript
// 기존 13개 + 신규 1개
import * as costSchema from "~/features/cost/db/schema";

const allSchema = {
  ...schema, ...discoverySchema, ...radarSchema, ...chatSchema,
  ...labSchema, ...proposalSchema, ...archiveSchema, ...ideasSchema,
  ...tokenUsageSchema, ...v2Schema, ...matrixSchema, ...requestsSchema,
  ...topicSchema, ...costSchema,
};
```

---

## 4. 서비스 인터페이스

### 4.1 BudgetEvaluator

```typescript
// app/features/cost/service/budget-evaluator.ts

export type BudgetTier = "normal" | "warn" | "degrade" | "block";

export interface BudgetEvaluation {
  tier: BudgetTier;
  usagePct: number;
  budgetUsd: number;
  currentUsageUsd: number;
  policyId: string;
}

export class BudgetEvaluator {
  constructor(private db: DB) {}

  /** O(1) 예산 상태 조회 — budget_usage_cache에서 단일 행 읽기 */
  async evaluate(userId: string, tenantId: string, purpose?: string): Promise<BudgetEvaluation>

  /** 가장 구체적인 budget_policy를 찾는다 (사용자+용도 > 사용자 > 조직+용도 > 조직) */
  async findApplicablePolicy(userId: string, tenantId: string, purpose?: string): Promise<BudgetPolicy | null>
}
```

### 4.2 PolicyRouter

```typescript
// app/lib/ai/policy-router.ts

export interface RoutingRequest {
  userId: string;
  tenantId: string;
  purpose: Purpose;
  needsTools: boolean;
  needsStreaming: boolean;
  needsJsonMode: boolean;
  estimatedTokens?: number;
}

export interface RoutingResult {
  provider: ProviderId;
  model: string;
  decisionId: string;         // routing_decisions.id
  reasonCode: ReasonCode;
  budgetTier: BudgetTier;
}

export class PolicyRouter {
  constructor(private db: DB, private env: Record<string, string | undefined>) {}

  /** 7단계 정책 평가 → provider+model 선택 + decision log 기록 */
  async route(request: RoutingRequest): Promise<RoutingResult>

  /** 캐시 무효화 (정책 CRUD 시 호출) */
  invalidateCache(): void
}
```

### 4.3 UsageRecorder

```typescript
// app/features/cost/service/usage-recorder.ts

export interface UsageEvent {
  userId: string;
  tenantId: string;
  conversationId?: string;
  provider: ProviderId;
  model: string;
  purpose: Purpose;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  latencyMs?: number;
  toolRounds?: number;
  retryOf?: string;
  routingDecisionId?: string;
}

export class UsageRecorder {
  constructor(private db: DB) {}

  /** usage_events INSERT + daily_usage_aggregates UPSERT + CostEstimator 호출 */
  async record(event: UsageEvent): Promise<{ usageEventId: string; costUsd: number }>
}
```

### 4.4 CostEstimator

```typescript
// app/features/cost/service/cost-estimator.ts

export class CostEstimator {
  constructor(private db: DB) {}

  /** usage_event의 토큰 × 해당 시점 단가 → cost_estimates INSERT + budget_usage_cache 갱신 */
  async estimate(usageEventId: string): Promise<{ totalCostUsd: number }>

  /** 단가 변경 시 특정 기간 cost_estimates 재계산 (Cron 배치) */
  async recalculate(modelCatalogId: string, from: Date, to: Date): Promise<number>
}
```

---

## 5. 기존 코드 통합 (마이그레이션 전략)

### 5.1 FallbackManager → PolicyRouter 점진 교체

```
Phase 1 (초기):
  FallbackManager 내부에 PolicyRouter를 호출하는 어댑터 패턴.
  PolicyRouter가 route()를 실행하고, 실제 API 호출은 FallbackManager.call()이 수행.

Phase 2 (안정화 후):
  PolicyRouter가 직접 Provider.call()을 수행.
  FallbackManager 제거.
```

### 5.2 updateTokenUsage() → UsageRecorder 교체

```typescript
// 기존: agent-utils.ts
updateTokenUsage(db, tokensUsed, meta)

// 신규: UsageRecorder.record() 호출로 교체
// 호출 지점: executor-stream.ts, executor.ts, analyzer.ts
// 기존 token_usage_logs INSERT는 유지 (병행 운영)
// 안정화 후 token_usage_logs 코드 제거
```

### 5.3 TokenBudgetManager → BudgetEvaluator 교체

```
기존: 토큰 기반, SUM 쿼리, 월간 고정
신규: USD 기반, 캐시 O(1), 커스텀 기간

교체 전략:
  1. BudgetEvaluator 구현 + budget_usage_cache 구축
  2. BudgetEvaluator.evaluate()를 기존 isLLMCallAllowed() 대신 사용
  3. 안정화 후 TokenBudgetManager 제거
```

---

## 6. API Specification

### 6.1 관리자 API

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/admin/budget-policies | 예산 정책 목록 | Admin |
| POST | /api/admin/budget-policies | 예산 정책 생성 | Admin |
| PUT | /api/admin/budget-policies/:id | 예산 정책 수정 | Admin |
| DELETE | /api/admin/budget-policies/:id | 예산 정책 삭제 | Admin |
| GET | /api/admin/routing-policies | 라우팅 정책 목록 | Admin |
| POST | /api/admin/routing-policies | 라우팅 정책 생성 (버전 신규) | Admin |
| GET | /api/admin/model-catalog | 모델 카탈로그 | Admin |
| PUT | /api/admin/model-catalog/:id | 모델 정보 수정 (capabilityScore 등) | Admin |
| GET | /api/admin/cost-report-v2 | 3-Ledger 분리 비용 리포트 | Admin |
| GET | /api/admin/routing-decisions | 라우팅 결정 로그 조회 | Admin |
| GET | /api/admin/usage-aggregates | 일별 사용량 집계 | Admin |

### 6.2 사용자 API (Phase 2)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | /api/me/budget-status | 내 예산 상태 (tier, usagePct) | User |
| GET | /api/me/usage-summary | 내 기간별 사용량 요약 | User |

---

## 7. 초기 시딩 데이터

### 7.1 model_catalog 초기 데이터

| id | provider | modelId | displayName | capabilityScore | tools | stream | json |
|----|----------|---------|-------------|-----------------|-------|--------|------|
| anthropic:claude-opus-4-6 | anthropic | claude-opus-4-6 | Claude Opus 4.6 | 95 | ✅ | ✅ | ✅ |
| anthropic:claude-sonnet-4-6 | anthropic | claude-sonnet-4-6 | Claude Sonnet 4.6 | 80 | ✅ | ✅ | ✅ |
| anthropic:claude-haiku-4-5 | anthropic | claude-haiku-4-5-20251001 | Claude Haiku 4.5 | 50 | ✅ | ✅ | ✅ |
| openai:gpt-4o | openai | gpt-4o | GPT-4o | 90 | ✅ | ✅ | ✅ |
| openai:gpt-4o-mini | openai | gpt-4o-mini | GPT-4o Mini | 70 | ✅ | ✅ | ✅ |
| google:gemini-2.5-flash | google | gemini-2.5-flash | Gemini 2.5 Flash | 65 | ✅ | ✅ | ❌ |
| workers-ai:llama | workers-ai | @cf/meta/llama-3.3-70b-instruct-fp8-fast | Workers AI Llama | 35 | ❌ | ✅ | ❌ |

### 7.2 기본 routing_policy

```
name: "default-global"
version: 1
priority: 100
isActive: true

provider_priorities: anthropic(1) → openai(2) → google(3) → workers-ai(4)

purpose_rules:
  chat:       minScore=35, degradable=true,  degradeToScore=35
  analysis:   minScore=55, degradable=true,  degradeToScore=35
  extraction: minScore=55, degradable=false, requiresJsonMode=true
  batch:      minScore=35, degradable=true,  degradeToScore=35
  agent-tool: minScore=55, degradable=false, requiresTools=true
  eval:       minScore=55, degradable=false

degrade_rules:
  85~100 → anthropic:claude-sonnet-4-6 (degrade)
  55~84  → anthropic:claude-haiku-4-5  (degrade)
  0~54   → (block)
```

---

## 8. 테스트 계획

### 8.1 테스트 범위

| Type | Target | Tool | Priority |
|------|--------|------|----------|
| Unit | BudgetEvaluator — O(1) 조회, tier 판정, 정책 우선순위 | Vitest | P0 |
| Unit | CostEstimator — 단가 환산, cache incremental, 재계산 | Vitest | P0 |
| Unit | PolicyRouter — 7단계 평가, capability 필터, degrade 로직 | Vitest | P0 |
| Unit | UsageRecorder — usage_events INSERT, aggregates UPSERT | Vitest | P1 |
| Integration | LLM 호출 → record → estimate → cache 갱신 전체 흐름 | Vitest | P1 |
| Integration | 예산 3단계 제한 (warn → degrade → block) | Vitest | P1 |
| Integration | 관리자 API CRUD + 정책 버전 관리 | Vitest | P2 |

### 8.2 핵심 테스트 케이스

- [ ] BudgetEvaluator: 사용자+용도 > 사용자 > 조직 정책 우선순위 정확성
- [ ] BudgetEvaluator: budget_usage_cache에서 O(1) 조회 (SUM 쿼리 없음 확인)
- [ ] CostEstimator: 가격 유효기간(effectiveFrom/To) 교차 시 올바른 단가 적용
- [ ] PolicyRouter: extraction 용도 + degrade 불가 + 예산 초과 → 차단이 아닌 모델 유지
- [ ] PolicyRouter: tools 필요한데 Workers AI 선택 안 됨 확인
- [ ] PolicyRouter: routing_decisions 로그가 모든 호출에 기록됨
- [ ] UsageRecorder: 기존 token_usage_logs와 usage_events 병행 기록 확인

---

## 9. 구현 순서

### Phase 1 (11개 작업)

```
Week 1: 데이터 기반
  P1-01: cost BC 생성 + 스키마 정의 (12테이블)
  P1-02: 마이그레이션 SQL 생성 + 로컬 적용 + tests/helpers/db.ts 동기화
  P1-10: purpose 마이그레이션 (mode → purpose)
  P1-02b: model_catalog + price_catalog 초기 시딩

Week 2: 서비스 레이어
  P1-07: UsageRecorder (기존 updateTokenUsage 교체)
  P1-03: CostEstimator (USD 환산 + budget_usage_cache 갱신)
  P1-04: BudgetEvaluator (O(1) 캐시 조회 + tier 판정)
  P1-11: daily_usage_aggregates Cron 집계

Week 3: 정책 엔진 + 통합
  P1-05: routing_policies + 정규화 테이블 + 정책 로더
  P1-06: PolicyRouter (FallbackManager 어댑터) + routing_decisions 기록
  P1-08: 3단계 예산 제한 적용 (알림 연동)
  P1-09: 관리자 대시보드 (예산 CRUD + 비용 리포트 v2)
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-11 | Initial design based on DX-PLAN-008 v1.2 | Sinclair Seo |
