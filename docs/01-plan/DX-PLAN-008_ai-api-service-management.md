---
code: DX-PLAN-008
title: AI API 서비스 관리 — 재구조화 요구사항
version: "1.2"
status: Draft
category: plan
created: 2026-03-10
updated: 2026-03-11
author: Sinclair Seo
refs:
  - "[[DX-PLAN-007]]"
  - "[[DX-SPEC-002]]"
  - "[[DX-REQ-011]]"
---

# AI API 서비스 관리 — 재구조화 요구사항

> 1차 검토의견([[DX-ANLS-006]]) 반영하여 재구조화.
> 2차 검토의견 반영: Usage Aggregation / Budget Cache / Policy 정규화 / Capability Score.
> 3차 검토의견 반영: Usage Cold Archive / Score 산정 기준 / Policy Versioning.
> 핵심 변경: 3-Ledger 데이터 모델 / 정책 엔진 우선 / capability-aware fallback.

---

## 1. 설계 원칙

### 1.1 Ledger-First

UI/대시보드보다 데이터 모델과 정책 엔진을 먼저 구축한다.
숫자의 신뢰성이 확보된 뒤에 사용자 가시성(UI)을 붙인다.

### 1.2 3-Ledger 분리

동일 대시보드에 정밀도가 다른 숫자를 혼합 표시하지 않는다.
Usage(사실) / Cost Estimation(추정) / Billing(실제)을 명확히 구분한다.

### 1.3 Policy Engine ≫ Hardcoded Rules

예산 임계값, fallback 체인, 모델 허용 목록 등을 코드가 아닌 정책 테이블로 관리한다.
정책 변경 시 배포 없이 DB 업데이트만으로 반영 가능해야 한다.

### 1.4 Decision Explainability

모든 LLM 호출에 routing decision log를 남겨 "왜 이 모델로 갔는지" 설명할 수 있어야 한다.

### 1.5 Hot-Path 성능 보장 (2차 검토 반영)

BudgetEvaluator와 PolicyRouter는 모든 LLM 호출의 전처리 경로(hot path)에 위치한다.
매 호출마다 SUM 집계 쿼리를 실행하면 데이터 증가에 따라 성능이 선형 저하된다.
**집계 캐시(aggregation cache) + incremental update** 방식으로 O(1) 조회를 보장해야 한다.

---

## 2. 3-Ledger 데이터 모델

### 2.1 Ledger 정의

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 1: Usage Ledger (사실 기록)                               │
│  ─ 모든 LLM 호출의 원시 로그. 변경 불가(append-only).             │
│  ─ 토큰, 모델, 프로바이더, 사용자, 용도, latency                  │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: Cost Estimation Ledger (추정 비용)                     │
│  ─ Usage × 단가표(Price Catalog) = 추정 USD 비용.                │
│  ─ 단가 변경 시 재계산 가능. 라벨: "추정 비용".                    │
├─────────────────────────────────────────────────────────────────┤
│  Layer 3: Billing Ledger (실제 크레딧/청구)                      │
│  ─ 벤더 API 조회값 또는 관리자 수동 입력.                         │
│  ─ 출처(source) 라벨 필수: api_auto | manual | estimated.        │
│  ─ 변경 이력(audit trail) 보존.                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 엔터티 설계

#### 2.2.1 Usage Ledger — `usage_events` (기존 `token_usage_logs` 확장)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | text PK | UUID |
| userId | text NOT NULL | **직접 기록** (JOIN 의존 제거) |
| tenantId | text NOT NULL | 조직 귀속 |
| conversationId | text | 대화 연결 (nullable — 배치는 null) |
| provider | text NOT NULL | anthropic / openai / google / workers-ai |
| model | text NOT NULL | 실제 사용된 모델 ID |
| purpose | text NOT NULL | 용도 분류 (§2.3 참조) |
| inputTokens | integer | 입력 토큰 |
| outputTokens | integer | 출력 토큰 |
| cacheReadTokens | integer | 캐시 읽기 토큰 |
| cacheWriteTokens | integer | 캐시 생성 토큰 |
| totalTokens | integer | 합계 |
| latencyMs | integer | 응답 시간 (ms) |
| toolRounds | integer | 도구 호출 횟수 |
| retryOf | text | 재시도인 경우 원래 usage_event ID |
| routingDecisionId | text FK | routing_decisions.id 참조 |
| createdAt | integer timestamp | 호출 시점 |

인덱스: `(tenantId, createdAt)`, `(userId, createdAt)`, `(provider, createdAt)`, `(purpose, createdAt)`

#### 2.2.2 Cost Estimation — `cost_estimates`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | text PK | UUID |
| usageEventId | text FK UNIQUE | usage_events.id (1:1) |
| priceVersionId | text FK | 적용된 단가 버전 |
| inputCostUsd | real | 입력 토큰 비용 |
| outputCostUsd | real | 출력 토큰 비용 |
| cacheCostUsd | real | 캐시 관련 비용 |
| totalCostUsd | real | 합계 USD |
| createdAt | integer timestamp | 계산 시점 |

인덱스: `(usageEventId)`

> 단가 변경 시 batch로 재계산 가능 (priceVersionId 기준).

#### 2.2.3 Billing Ledger — `billing_balances`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | text PK | UUID |
| tenantId | text NOT NULL | 조직 |
| provider | text NOT NULL | 사업자 |
| totalCreditUsd | real | 총 크레딧 (계약/충전 금액) |
| usedCreditUsd | real | 사용된 크레딧 |
| remainingCreditUsd | real | 잔여 크레딧 (computed or synced) |
| source | text NOT NULL | `api_auto` / `manual` / `estimated` |
| expiresAt | integer timestamp | 크레딧 만료일 (nullable) |
| updatedBy | text | 수동 입력 시 관리자 userId |
| note | text | 변경 사유 |
| updatedAt | integer timestamp | 마지막 갱신 시점 |

인덱스: `(tenantId, provider)`

#### 2.2.4 Billing Audit Trail — `billing_audit_logs`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | text PK | UUID |
| billingBalanceId | text FK | billing_balances.id |
| field | text | 변경된 필드명 |
| oldValue | text | 이전 값 |
| newValue | text | 변경 값 |
| changedBy | text | 변경자 userId |
| reason | text | 변경 사유 |
| createdAt | integer timestamp | 변경 시점 |

### 2.3 집계/캐시 레이어 (2차 검토 §3.1, §3.2 반영)

Usage Ledger가 append-only로 빠르게 증가하므로 (10k req/day ≈ 360만 rows/year),
매 호출마다 SUM 쿼리 대신 **일별 집계 + 예산 사용량 캐시**를 유지한다.

#### 2.3.1 일별 사용량 집계 — `daily_usage_aggregates`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | text PK | UUID |
| tenantId | text NOT NULL | 조직 |
| userId | text | 사용자 (null = 조직 전체) |
| provider | text NOT NULL | 사업자 |
| model | text NOT NULL | 모델 |
| purpose | text NOT NULL | 용도 |
| date | text NOT NULL | 날짜 (`YYYY-MM-DD`) |
| requestCount | integer | 호출 건수 |
| totalInputTokens | integer | 입력 토큰 합계 |
| totalOutputTokens | integer | 출력 토큰 합계 |
| totalTokens | integer | 전체 토큰 합계 |
| totalCostUsd | real | 추정 비용 합계 (USD) |
| avgLatencyMs | integer | 평균 응답 시간 |
| updatedAt | integer timestamp | 최종 갱신 |

인덱스: `(tenantId, date)`, `(userId, date)`, `(tenantId, purpose, date)`

> **갱신 방식**: `UsageRecorder.record()` 시 UPSERT — `requestCount += 1`, `totalTokens += N` 등 incremental update.
> **백필**: 일 1회 Cron으로 usage_events에서 재집계하여 정합성 보정.

#### 2.3.1a Usage Ledger Cold Archive 정책 (3차 검토 §5 반영)

Usage Ledger는 append-only로 무한 증가하므로 cold archive 정책을 적용한다.

| 구간 | 저장소 | 용도 |
|------|--------|------|
| 0~90일 | `usage_events` (hot) | 실시간 조회, 예산 계산, 대시보드 |
| 91~365일 | `usage_events_archive` (cold) | 정산 리포트, 감사, 분쟁 대응 |
| 366일+ | 삭제 또는 외부 백업 | 장기 보관 필요 시 R2/S3 내보내기 |

> **아카이빙 방식**: 일 1회 Cron으로 `createdAt < 90일 전` 데이터를 `usage_events_archive`로 이동 (INSERT + DELETE).
> `daily_usage_aggregates`는 영구 보관 (집계 데이터, 행 수 적음).
> **정산 리포트**: 90일 이내는 usage_events, 이후는 daily_usage_aggregates 또는 archive에서 조회.

#### 2.3.2 예산 사용량 캐시 — `budget_usage_cache`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | text PK | UUID |
| budgetPolicyId | text FK UNIQUE | budget_policies.id |
| currentUsageUsd | real NOT NULL | 현재 누적 사용 금액 |
| usagePct | real NOT NULL | 사용률 (%) |
| budgetTier | text NOT NULL | 현재 단계: `normal` / `warn` / `degrade` / `block` |
| lastEventId | text | 마지막 반영된 usage_events.id |
| updatedAt | integer timestamp | 최종 갱신 |

인덱스: `(budgetPolicyId)`

> **갱신 방식**: `CostEstimator`가 cost_estimate 생성 시 해당 budget_usage_cache를 즉시 incremental update.
> `currentUsageUsd += newCost`, `usagePct = currentUsageUsd / budgetUsd * 100`, `budgetTier` 재계산.
> **BudgetEvaluator**: `budget_usage_cache`에서 단일 행 조회 → O(1). SUM 쿼리 불필요.
> **보정**: 일 1회 Cron으로 cost_estimates SUM과 캐시 값 비교, drift 발생 시 캐시 리셋.

### 2.4 용도 분류 (Purpose Taxonomy)

검토의견 §B 반영 — 용도를 사전 표준화하여 정산 리포트 유효성 확보.

| purpose | 설명 | 예시 |
|---------|------|------|
| `chat` | 사용자 대화 | 일반 채팅, 아이디어 토론 |
| `analysis` | AI 분석 | Radar 시장조사, Ideas 분석 |
| `extraction` | 데이터 추출 | Ontology 추출, 엔티티 인식 |
| `batch` | 배치 처리 | Cron 파이프라인, 대량 분석 |
| `agent-tool` | Agent 도구 실행 | 도구 호출, 함수 실행 |
| `eval` | 품질 평가 | LLM Judge 샘플링 (Phase 3) |

> 기존 `mode` (default/ideas/direct) → `purpose` 로 마이그레이션.
> 매핑: default → chat, ideas → analysis, direct → extraction.

### 2.4 4-Catalog SSOT

#### 2.4.1 모델 카탈로그 — `model_catalog`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | text PK | `anthropic:claude-sonnet-4-20250514` 형식 |
| provider | text | 사업자 |
| modelId | text | 사업자 내 모델 ID |
| displayName | text | 표시명 |
| capabilityScore | integer | 0~100 점수 기반 (§4.1 참조). 높을수록 고성능 |
| maxContextTokens | integer | 최대 컨텍스트 |
| supportsTools | boolean | 도구 지원 |
| supportsStreaming | boolean | 스트리밍 지원 |
| supportsJsonMode | boolean | JSON strict 출력 |
| isActive | boolean | 사용 가능 여부 |
| updatedAt | integer timestamp | 최종 갱신 |

#### 2.4.2 가격 카탈로그 — `price_catalog`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | text PK | UUID |
| modelCatalogId | text FK | model_catalog.id |
| inputPricePerMToken | real | 입력 토큰 100만당 USD |
| outputPricePerMToken | real | 출력 토큰 100만당 USD |
| cacheReadPricePerMToken | real | 캐시 읽기 (nullable) |
| cacheWritePricePerMToken | real | 캐시 생성 (nullable) |
| effectiveFrom | integer timestamp | 유효 시작일 |
| effectiveTo | integer timestamp | 유효 종료일 (nullable = 현행) |
| createdAt | integer timestamp | 등록일 |

> 가격 변경 시 새 행 추가 (effectiveTo 세팅). 과거 비용 재계산 시 해당 시점 단가 적용.

#### 2.4.3 정책 카탈로그 — `routing_policies` + 정규화 테이블 (2차 검토 §4.1 반영)

기존 JSON 컬럼(providerChain, purposeModelMap, degradePolicy)을 별도 테이블로 정규화.
인덱스, 부분 업데이트, Drizzle 타입 안전성, 행 단위 관리자 CRUD가 모두 가능해진다.

**`routing_policies` 본체** (JSON 컬럼 제거):

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | text PK | UUID |
| tenantId | text | 조직별 정책 (null = 전역) |
| name | text | 정책명 |
| version | integer NOT NULL | 정책 버전 번호 (monotonic increment) |
| isActive | boolean | 활성 여부 |
| priority | integer | 정책 우선순위 (낮을수록 우선) |
| createdAt | integer timestamp | 생성일 |
| updatedAt | integer timestamp | 최종 갱신 |

> **Policy Versioning (3차 검토 §5 반영)**:
> 정책 수정 시 기존 행을 업데이트하지 않고 **새 버전 행을 INSERT** (version += 1, isActive = true, 이전 버전 isActive = false).
> `routing_decisions.policyId`가 호출 시점의 정책 버전을 참조하므로, 과거 라우팅 결정을 정확히 재현할 수 있다.
> **스냅샷 조회**: `WHERE id = ? AND version = N`으로 특정 버전의 정책 + 하위 테이블 조회 가능.
> 하위 테이블(`policy_provider_priorities`, `policy_purpose_rules`, `policy_degrade_rules`)에도 `policyVersion` 컬럼 추가하여 버전별 매핑 유지.

**`policy_provider_priorities`** (providerChain 정규화):

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | text PK | UUID |
| policyId | text FK | routing_policies.id |
| policyVersion | integer NOT NULL | 정책 버전 |
| provider | text NOT NULL | 사업자 ID |
| priority | integer NOT NULL | 순서 (1 = 최우선) |

인덱스: `(policyId, policyVersion, priority)`

**`policy_purpose_rules`** (purposeModelMap 정규화):

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | text PK | UUID |
| policyId | text FK | routing_policies.id |
| policyVersion | integer NOT NULL | 정책 버전 |
| purpose | text NOT NULL | 용도 |
| minCapabilityScore | integer NOT NULL | 최소 capability 점수 (§4.1 참조) |
| requiresTools | boolean | 도구 필수 여부 |
| requiresJsonMode | boolean | JSON strict 필수 여부 |
| requiresStreaming | boolean | 스트리밍 필수 여부 |
| degradable | boolean NOT NULL | degrade 허용 여부 |
| degradeToScore | integer | degrade 시 최소 점수 (nullable) |

인덱스: `(policyId, purpose)`

**`policy_degrade_rules`** (degradePolicy 정규화):

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | text PK | UUID |
| policyId | text FK | routing_policies.id |
| policyVersion | integer NOT NULL | 정책 버전 |
| fromMinScore | integer NOT NULL | 원래 capability 점수 하한 |
| fromMaxScore | integer NOT NULL | 원래 capability 점수 상한 |
| degradeToModelId | text FK | model_catalog.id (대체 모델) |
| action | text NOT NULL | `degrade` / `block` / `queue` |

인덱스: `(policyId, policyVersion, fromMinScore)`

#### 2.4.4 예산 정책 — `budget_policies`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | text PK | UUID |
| tenantId | text NOT NULL | 조직 |
| userId | text | 사용자 (null = 조직 전체) |
| purpose | text | 용도별 예산 (null = 전체 용도) |
| budgetUsd | real NOT NULL | 예산 금액 (USD) |
| periodStart | integer timestamp | 기간 시작 |
| periodEnd | integer timestamp | 기간 종료 |
| thresholdWarnPct | integer | 경고 임계값 (기본 80) |
| thresholdDegradePct | integer | 저비용 전환 임계값 (기본 100) |
| thresholdBlockPct | integer | 차단 임계값 (기본 120) |
| isActive | boolean | 활성 여부 |
| createdAt | integer timestamp | 등록일 |

인덱스: `(tenantId, userId, isActive)`, `(tenantId, purpose, isActive)`

> 예산 적용 우선순위: 사용자+용도별 > 사용자 전체 > 조직+용도별 > 조직 전체.

#### 2.4.5 Routing Decision Log — `routing_decisions`

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | text PK | UUID |
| userId | text NOT NULL | 요청자 |
| tenantId | text NOT NULL | 조직 |
| purpose | text NOT NULL | 용도 |
| selectedProvider | text | 최종 선택된 프로바이더 |
| selectedModel | text | 최종 선택된 모델 |
| candidateChain | text (JSON) | 평가된 후보 목록 |
| reasonCode | text | 선택 사유 코드 (§3.2 참조) |
| budgetState | text (JSON) | 호출 시점 예산 상태 스냅샷 |
| policyId | text FK | 적용된 routing_policies.id |
| policyVersion | integer | 적용된 정책 버전 (재현 가능) |
| fallbackCount | integer | fallback 발생 횟수 |
| createdAt | integer timestamp | 결정 시점 |

인덱스: `(tenantId, createdAt)`, `(userId, createdAt)`

---

## 3. 정책 엔진

### 3.1 정책 충돌 해소 순서

검토의견 §D/§E 반영 — 정책 간 우선순위를 명시.

```
1. 보안/규제 제한        ─ 특정 벤더 금지, 데이터 경계
2. 강제 금지 모델        ─ 비활성(isActive=false) 모델 제외
3. 기능 적합성           ─ 도구/스트리밍/JSON/컨텍스트 길이 충족 여부
4. 예산 상태             ─ 3단계 정책 (warn/degrade/block)
5. 공급자 가용성         ─ 실패/크레딧 소진 상태 확인
6. 우선순위 체인         ─ routing_policies.providerChain 순서
7. 비용 최적화           ─ 동일 capability class 내 저비용 선호
```

### 3.2 Routing Reason Codes

| 코드 | 설명 |
|------|------|
| `primary` | 1순위 프로바이더 정상 선택 |
| `fallback_error` | 상위 프로바이더 오류로 전환 |
| `fallback_credit` | 상위 프로바이더 크레딧 소진으로 전환 |
| `budget_degrade` | 예산 100% 초과 → 저비용 모델 전환 |
| `budget_block` | 예산 120% 초과 → 차단 |
| `capability_skip` | 기능 미지원으로 건너뜀 |
| `policy_override` | 관리자 수동 오버라이드 |
| `retry` | 이전 호출 실패 후 재시도 |

### 3.3 예산 3단계 제한 로직

```
# budget_usage_cache에서 O(1) 조회 (SUM 쿼리 불필요)
budgetTier = budget_usage_cache.budgetTier  -- 'normal' | 'warn' | 'degrade' | 'block'
usagePct   = budget_usage_cache.usagePct

if budgetTier == 'normal':      # usagePct < thresholdWarnPct
    → 정상 동작

elif budgetTier == 'warn':      # usagePct < thresholdDegradePct
    → 경고 알림 발생 (사용자 + 관리자)
    → 정상 모델 유지

elif budgetTier == 'degrade':   # usagePct < thresholdBlockPct
    → 저비용 모델 전환 (capability-aware, §4 참조)
    → 알림: "예산 초과, 경제형 모델로 전환됨"

else:  # budgetTier == 'block'  # usagePct >= thresholdBlockPct
    → LLM 호출 차단
    → 알림: "예산 120% 초과, 관리자 해제 필요"
    → 관리자가 budget_policies 또는 exception으로 해제

# budgetTier 갱신 시점: CostEstimator가 cost_estimate 생성 직후 incremental update
```

---

## 4. Capability-Aware Fallback 정책

### 4.1 Capability Score 기반 모델 분류 (2차 검토 §4.2 반영)

1차 설계의 3-class 분류(high/standard/economy)를 **수치 점수(0~100) 기반**으로 변경.
모델 세대가 빠르게 교체되는 환경에서 class 재분류 없이 점수만 갱신하면 된다.

| 모델 | provider | capabilityScore | 참고 등급 |
|------|----------|-----------------|-----------|
| Claude Opus 4.6 | anthropic | 95 | high |
| GPT-4o | openai | 90 | high |
| Claude Sonnet 4.6 | anthropic | 80 | standard |
| GPT-4o-mini | openai | 70 | standard |
| Gemini 2.5 Flash | google | 65 | standard |
| Claude Haiku 4.5 | anthropic | 50 | economy |
| Workers AI (Llama) | workers-ai | 35 | economy |

> **등급 참고 기준** (score 범위):
> - **high**: 85~100 — 복잡 추론, 긴 컨텍스트, 구조화 추출
> - **standard**: 55~84 — 범용 채팅, 요약, 일반 분석
> - **economy**: 0~54 — 분류, 간단 Q&A, 저비용 배치

점수는 관리자가 `model_catalog.capabilityScore`에서 조정 가능. 새 모델 출시 시 점수만 추가하면 정책 변경 없이 라우팅에 반영된다.

#### 4.1.1 Score 산정 기준 (3차 검토 §5 반영)

점수를 자의적으로 부여하면 신뢰도가 낮아지므로, 다음 3개 축의 가중 합산으로 산정한다.

| 축 | 비중 | 측정 방법 | 예시 |
|---|---|---|---|
| **Benchmark 성능** | 40% | 공개 벤치마크(MMLU, HumanEval, GPQA 등) 상대 점수. 최고 모델=100, 비례 환산 | Opus: 95→38, Haiku: 60→24 |
| **Context 능력** | 30% | maxContextTokens 기반 구간 점수. 200K+=100, 128K=80, 32K=50, 8K=20 | Opus 200K→30, Haiku 200K→30 |
| **Tool/Structured 능력** | 30% | 도구 호출 안정성 + JSON strict 지원 + 스트리밍. 각 항목 boolean → 합산 | Opus 3/3→30, Workers AI 0/3→0 |

> **갱신 주기**: 새 모델 출시 또는 분기 1회. 관리자가 `model_catalog.capabilityScore`를 직접 수정.
> **내부 Judge 보정** (Phase 3): LLM Judge 품질 통계가 축적되면 Benchmark 축을 내부 품질 점수로 보정 가능.

### 4.2 용도별 최소 Capability 요구

`policy_purpose_rules` 테이블 (§2.4.3 정규화 구조) 기준:

| purpose | minCapabilityScore | requiresTools | requiresJsonMode | degradable | degradeToScore |
|---------|-------------------|---------------|------------------|------------|----------------|
| `chat` | 35 | - | - | ✅ | 35 |
| `analysis` | 55 | - | - | ✅ | 35 |
| `extraction` | 55 | - | ✅ | ❌ | - |
| `batch` | 35 | - | - | ✅ | 35 |
| `agent-tool` | 55 | ✅ | - | ❌ | - |
| `eval` | 55 | - | - | ❌ | - |

> **해석**: `extraction`은 JSON strict 필수 + degrade 불가. 예산 초과 시에도 최소 score 55 이상 모델 유지.
> `chat`은 score 35까지 degrade 허용 → Workers AI(Llama)까지 fallback 가능.

### 4.3 Degrade Policy 매핑

`policy_degrade_rules` 테이블 (§2.4.3 정규화 구조) 기준:

| fromMinScore | fromMaxScore | degradeToModelId | action |
|-------------|-------------|------------------|--------|
| 85 | 100 | `anthropic:claude-sonnet-4-6` (score 80) | `degrade` |
| 55 | 84 | `anthropic:claude-haiku-4-5` (score 50) | `degrade` |
| 0 | 54 | - | `block` |

> **Score 기반 선택 로직**:
> 1. 현재 모델의 capabilityScore 확인
> 2. degrade_rules에서 해당 score 범위의 대체 모델 조회
> 3. 대체 모델이 purpose의 minCapabilityScore와 기능 요구를 충족하는지 검증
> 4. 충족하면 degrade, 불충족하면 block 또는 queue

### 4.4 Degrade 불가 용도 처리

`degradable: false`인 용도(extraction, agent-tool, eval)는 예산 100% 초과 시에도 모델을 유지한다.
대신 호출 빈도를 제한하거나 큐잉하여 120% 차단까지의 여유분 내에서 동작한다.

### 4.5 PolicyRouter 캐시 전략 (2차 검토 §3.3 반영)

PolicyRouter의 7단계 평가 과정에서 외부 의존성(provider 상태, 크레딧)이 포함되므로
다음 캐시를 유지하여 latency를 최소화한다.

| 캐시 | TTL | 갱신 방식 |
|------|-----|-----------|
| `provider_health_cache` | 30초 | FallbackManager의 실패 기록에서 갱신. 실패 시 즉시 무효화 |
| `provider_credit_cache` | 60초 | billing_balances의 remainingCreditUsd 스냅샷. Cron 동기화 시 갱신 |
| `policy_cache` | 5분 | routing_policies + 하위 테이블 로딩. 정책 CRUD 시 즉시 무효화 |
| `budget_tier_cache` | 0 (즉시) | budget_usage_cache에서 직접 조회 (이미 O(1)) |

> D1 SQLite + Cloudflare Edge 환경이므로 in-memory Map으로 구현.
> Worker 인스턴스 간 캐시 불일치는 TTL 내 허용 (최종 일관성).

---

## 5. Phase 분리

### Phase 1: 정산 기반 + 정책 엔진 (MVP)

> 목표: 신뢰할 수 있는 비용 데이터 + 정책 기반 제어 구축

| # | 작업 | 신규/수정 | 우선순위 |
|---|------|-----------|----------|
| P1-01 | `usage_events` 테이블 신규 + 기존 `token_usage_logs` 마이그레이션 | 신규+마이그레이션 | 필수 |
| P1-02 | `model_catalog` (capabilityScore 포함) + `price_catalog` 테이블 + 초기 데이터 시딩 | 신규 | 필수 |
| P1-03 | `cost_estimates` 테이블 + USD 환산 서비스 (`CostEstimator`) | 신규 | 필수 |
| P1-04 | `budget_policies` + `budget_usage_cache` 테이블 + 예산 평가 서비스 (`BudgetEvaluator`) | 신규 | 필수 |
| P1-05 | `routing_policies` + 정규화 3테이블 (`policy_provider_priorities`, `policy_purpose_rules`, `policy_degrade_rules`) + 정책 로더 | 신규 | 필수 |
| P1-06 | `routing_decisions` 테이블 + FallbackManager 리팩토링 → `PolicyRouter` (캐시 전략 포함) | 수정 | 필수 |
| P1-07 | `updateTokenUsage()` → `UsageRecorder` 리팩토링 (userId/provider/purpose 직접 기록 + `daily_usage_aggregates` incremental update) | 수정 | 필수 |
| P1-08 | 3단계 예산 제한 적용 (warn/degrade/block) + 알림 연동 | 신규 | 필수 |
| P1-09 | 관리자 대시보드 — 예산 정책 CRUD + 비용 리포트 (추정/실제 분리 표시) | 수정 | 필수 |
| P1-10 | `purpose` 마이그레이션: mode(default/ideas/direct) → purpose(chat/analysis/extraction) | 마이그레이션 | 필수 |
| P1-11 | `daily_usage_aggregates` 테이블 + 일별 집계 Cron (정합성 보정) | 신규 | 필수 |

### Phase 2: 가시성 + 운영 도구

> 목표: 사용자/관리자에게 신뢰 라벨 기반 비용 정보 제공

| # | 작업 | 신규/수정 | 우선순위 |
|---|------|-----------|----------|
| P2-01 | `billing_balances` + `billing_audit_logs` 테이블 | 신규 | 필수 |
| P2-02 | Anthropic Admin API → `billing_balances` 자동 동기화 | 수정 | 필수 |
| P2-03 | OpenAI/Google Billing API 연동 조사 + 가능한 범위 구현 | 신규 | 조사 후 결정 |
| P2-04 | 관리자 수동 크레딧 입력 UI (감사 추적 포함) | 신규 | 필수 |
| P2-05 | 사용자 프로필 — "내 사용량" 카드 (기간 사용률 + 정책 상태 + 예상 동작) | 신규 | 필수 |
| P2-06 | 채팅 상단 배너 — 잔여 예산 프로그레스 바 + 정책 상태 표시 | 신규 | 필수 |
| P2-07 | 관리자 대시보드 — 사업자별 크레딧 현황 (출처 라벨 구분 표시) | 수정 | 필수 |
| P2-08 | 기간별 정산 리포트 (사업자/사용자/용도별 비용 집계, CSV 내보내기) | 신규 | 중요 |

### Phase 3: 고급 기능

> 목표: 품질 평가, 지능형 재시도, 남용 감지

| # | 작업 | 신규/수정 | 우선순위 |
|---|------|-----------|----------|
| P3-01 | LLM Judge 모듈 — 샘플링 기준 정의 (랜덤 + 위험 기반 혼합) | 신규 | 중요 |
| P3-02 | `quality_samples` 테이블 + judge versioning | 신규 | 중요 |
| P3-03 | 모델별 품질 통계 대시보드 (faithfulness, format compliance, task success) | 신규 | 중요 |
| P3-04 | Retry taxonomy 분리 (transport/quota/structured/empty/semantic) | 수정 | 중요 |
| P3-05 | 남용 감지 — 탐지 룰 정의 (rate/burst/repetition per user/tenant/session) | 신규 | 보통 |
| P3-06 | 남용 대응 — alert/throttle/block 단계 + 관리자 알림 + 화이트리스트 | 신규 | 보통 |

---

## 6. 기존 코드 영향 분석

### 6.1 변경 대상 파일

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `app/db/token-usage-schema.ts` | **대체** | `usage_events` + `cost_estimates`로 분리 |
| `app/lib/cost/token-budget.ts` | **대체** | `BudgetEvaluator` (USD 기반, 정책 테이블 참조) |
| `app/lib/ai/fallback-manager.ts` | **대체** | `PolicyRouter` (정책 엔진 + capability-aware) |
| `app/lib/ai/types.ts` | **확장** | `LLMProvider.capabilities`에 jsonMode, capabilityClass 추가 |
| `app/features/chat/agent/agent-utils.ts` | **수정** | `updateTokenUsage()` → `UsageRecorder.record()` |
| `app/lib/cost/anthropic-admin-client.ts` | **유지** | billing_balances 동기화 서비스에서 활용 |
| `app/routes/api.admin.cost-report.ts` | **수정** | 3-Ledger 분리 데이터 반환 |
| `app/features/settings/ui/CostMonitorWidget.tsx` | **수정** | 추정/실제 라벨 구분 표시 |

### 6.2 신규 서비스

| 서비스 | 위치 (예정) | 역할 |
|--------|------------|------|
| `CostEstimator` | `app/lib/cost/cost-estimator.ts` | usage_events → cost_estimates 변환 |
| `BudgetEvaluator` | `app/lib/cost/budget-evaluator.ts` | 예산 평가 + 3단계 판정 |
| `PolicyRouter` | `app/lib/ai/policy-router.ts` | 정책 기반 모델/프로바이더 선택 |
| `UsageRecorder` | `app/lib/cost/usage-recorder.ts` | 통합 사용량 기록 (userId/provider/purpose 필수) |
| `BillingSync` | `app/lib/cost/billing-sync.ts` | 벤더 API → billing_balances 동기화 |

### 6.3 신규 테이블 수 (마이그레이션)

- Phase 1: 12개 테이블 + 기존 1개 마이그레이션
  - Core Ledger: `usage_events`, `cost_estimates`
  - Catalog: `model_catalog`, `price_catalog`
  - Policy: `routing_policies`, `policy_provider_priorities`, `policy_purpose_rules`, `policy_degrade_rules`
  - Budget: `budget_policies`, `budget_usage_cache`
  - Cache: `daily_usage_aggregates`
  - Log: `routing_decisions`
  - 마이그레이션: `token_usage_logs` → `usage_events`
- Phase 2: 2개 (`billing_balances`, `billing_audit_logs`)
- Phase 3: 1개 (`quality_samples`)

---

## 7. UI 표시 원칙 (검토의견 §A 반영)

대시보드에서 숫자를 표시할 때 **출처 라벨을 반드시 구분**한다.

| 라벨 | 표시 형태 | 데이터 출처 |
|------|-----------|------------|
| "추정 비용" | 일반 텍스트 | cost_estimates (내부 단가 × 사용량) |
| "실제 잔여" | 🟢 뱃지 | billing_balances (source=api_auto) |
| "관리자 입력" | 🔵 뱃지 | billing_balances (source=manual) |
| "역산 추정" | ⚪ 뱃지 | billing_balances (source=estimated) |

사용자 프로필 카드에는 잔여 예산이 아니라 아래를 표시한다 (검토의견 §A 추가 권고):

```
이번 기간 사용률: 87%  ⚠️ 경고
초과 시 동작: 경제형 모델로 자동 전환
```

---

## 8. 리스크 및 제약

| 리스크 | 영향 | 대응 |
|--------|------|------|
| OpenAI/Google Billing API 미제공 또는 제한적 | P2-03 범위 축소 | 내부 역산 + 수동 입력 병행 |
| 단가 변경 시 과거 비용 재계산 부하 | D1 SQLite 성능 | 배치 재계산 + daily_usage_aggregates 스냅샷 |
| 정책 테이블 복잡도 증가 (12 테이블) | 관리자 UX 하락 | Phase 1은 최소 정책만, UI는 Phase 2에서 |
| 기존 token_usage_logs → usage_events 마이그레이션 | 데이터 유실 가능 | 기존 테이블 보존 + 신규 테이블 병행 운영 후 전환 |
| Usage Ledger 데이터 증가 (2차 검토 §3.1) | 360만 rows/year, 쿼리 성능 저하 | daily_usage_aggregates + 90일 cold archive (3차 검토) |
| budget_usage_cache drift (2차 검토 §3.2) | 캐시와 실제 SUM 불일치 | 일 1회 Cron 보정 + lastEventId로 누락 감지 |
| Worker 인스턴스 간 캐시 불일치 (2차 검토 §3.3) | TTL 내 stale data | TTL 30~60초 허용 (최종 일관성). 차단 판정은 budget_usage_cache(DB) 기준 |
| Capability Score 자의적 산정 (3차 검토 §5) | 모델 분류 신뢰도 저하 | 3축 가중 합산 기준 정의 (§4.1.1) + 분기 1회 갱신 |
| Policy Explosion — 정책 버전 증가 (3차 검토 §5) | 테이블 행 수 증가, 조회 복잡도 | version 기반 INSERT (isActive 플래그), 비활성 버전 주기적 정리 |

---

## 9. 검토의견 반영 대조표

### 1차 검토 반영

| 검토의견 항목 | 반영 여부 | 반영 위치 |
|-------------|----------|-----------|
| A. 3-Ledger 분리 | ✅ 전면 반영 | §2.1, §2.2 |
| B. 4-Catalog SSOT | ✅ 반영 | §2.4 (model/price/routing/budget) |
| C. 예산 다차원 (용도 추가) | ✅ 반영 | §2.4.4 budget_policies.purpose |
| D. capability-aware 전환 | ✅ 전면 반영 | §4 전체 |
| E. routing decision log | ✅ 반영 | §2.4.5, §3.2 |
| F. Judge 운영설계 보강 | ⬜ Phase 3 후순위 | §5 Phase 3 |
| G. 남용 감지 구체화 | ⬜ Phase 3 후순위 | §5 Phase 3 |
| MVP 범위 축소 | ✅ 반영 | §5 Phase 분리 |
| 정책 우선순위 명시 | ✅ 반영 | §3.1 |
| 용도 taxonomy 표준화 | ✅ 반영 | §2.3 |

### 2차 검토 반영

| 검토의견 항목 | 반영 여부 | 반영 위치 |
|-------------|----------|-----------|
| §3.1 Usage Ledger 데이터 증가 대응 | ✅ 반영 | §2.3.1 `daily_usage_aggregates`, §5 P1-11 |
| §3.2 Budget Evaluator 성능 (incremental update) | ✅ 반영 | §2.3.2 `budget_usage_cache`, §5 P1-04 |
| §3.3 Policy Evaluation latency (캐시) | ✅ 반영 | §4.5 PolicyRouter 캐시 전략 |
| §4.1 Policy JSON 정규화 | ✅ 반영 | §2.4.3 정규화 3테이블 분리 |
| §4.2 Capability Score 기반 분류 | ✅ 반영 | §4.1 점수 기반 (0~100), model_catalog.capabilityScore |
| 종합 평가 8.7/10 | ✅ 확인 | 3가지 추가 설계 모두 반영 완료 |

### 3차 검토 반영

| 검토의견 항목 | 반영 여부 | 반영 위치 |
|-------------|----------|-----------|
| §5 Usage Ledger cold archive (90일) | ✅ 반영 | §2.3.1a `usage_events_archive`, 90/365일 구간 정의 |
| §5 Capability Score 산정 기준 정의 | ✅ 반영 | §4.1.1 3축 가중 합산 (Benchmark 40% + Context 30% + Tool 30%) |
| §5 Policy versioning / snapshot | ✅ 반영 | §2.4.3 routing_policies.version + 하위 테이블 policyVersion 컬럼 |
| 종합 평가 9/10 | ✅ 확인 | 3가지 추가 설계 모두 반영 완료 |
