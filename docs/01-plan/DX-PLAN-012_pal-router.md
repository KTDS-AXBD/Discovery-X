---
code: DX-PLAN-012
title: "PAL Router — 복잡도 기반 LLM 모델 티어 자동 선택"
version: "0.1"
status: Draft
category: PLAN
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
---

# PAL Router — 복잡도 기반 LLM 모델 티어 자동 선택

> **Req**: DX-REQ-019 (F49, P2, v0.8.0)
> **Pattern**: Ouroboros — Progressive Adaptive LLM (PAL)
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 현재 PolicyRouter+FallbackManager는 모든 요청을 동일한 "최고 품질 우선" 체인으로 처리. 간단한 토큰 추출, 분류, 요약도 Frontier 모델(Opus/GPT-5.4)을 먼저 시도하여 비용 대비 품질 효율이 낮음 |
| **Solution** | PAL Router: 요청 복잡도를 실시간 점수화(0~1)하여 Frugal(≤0.3)/Standard(≤0.7)/Frontier(>0.7) 3티어로 자동 분배. 실패 시 상위 티어 에스컬레이션, 과잉 시 하위 다운그레이드 |
| **Function/UX Effect** | 사용자 경험 변화 없음(투명). 동일 요청에 대해 복잡도에 맞는 모델이 자동 선택되어 응답 속도 향상(Frugal 평균 480ms) + 비용 절감 |
| **Core Value** | 비용 최적화 — Frugal 비율 40~60% 달성 시 월 AI 비용 30~50% 절감. 품질 저하 없는 지능적 자원 배분 |

---

## 1. Overview

### 1.1 Purpose & Positioning

```
요청 입력 → PAL Complexity Scorer → 티어 결정 → PolicyRouter → FallbackManager → 응답
                                        ↑                                    ↓
                                        └── 에스컬레이션/다운그레이드 피드백 ──┘
```

PAL Router는 기존 PolicyRouter와 FallbackManager **사이**에 삽입되는 복잡도 기반 사전 분류 레이어이다. 요청의 특성(토큰 수, 도구 개수, 대화 깊이)을 분석하여 적절한 모델 티어를 결정하고, PolicyRouter에 티어별 모델 풀을 전달한다.

### 1.2 Background

**현재 순차 폴백의 한계**:

| 문제 | 상세 |
|------|------|
| **과잉 품질** | `analysis` 용도의 간단한 키워드 추출도 Anthropic Claude Sonnet(capabilityScore 93) 시도 → 실패 시 DeepSeek(91) → OpenAI(93) 순서. 모두 고품질 모델 |
| **비용 비효율** | Haiku($0.80/M) vs Sonnet($3.00/M) vs Opus($15.00/M) — 단순 작업에 Sonnet 사용 시 3.75배 과잉 비용 |
| **지연 시간** | Frontier 모델 평균 2~5초 vs Frugal 모델 평균 0.5~1초 — 간단한 요청에 불필요한 대기 |
| **일률적 체인** | `DEFAULT_PROVIDER_CHAIN` 5단계가 모든 용도에 동일 적용 — 용도별 최적 모델 미분화 |

**PAL Router 해결 접근**:
1. 요청 메타데이터(토큰 수, 도구 개수, 대화 깊이)로 복잡도 점수 산출
2. 점수 기반 3티어(Frugal/Standard/Frontier) 자동 분배
3. 결과 품질 피드백 루프로 점수 알고리즘 자동 보정

### 1.3 Related Documents

- [[DX-REQ-019]] F49: PAL Router
- [[DX-PLAN-008]] AI API 서비스 관리 (PolicyRouter/FallbackManager 설계)
- `app/lib/ai/policy-router.ts` — 현재 PolicyRouter
- `app/lib/ai/fallback-manager.ts` — 현재 FallbackManager
- `app/lib/ai/model-mapping.ts` — 모델 매핑 테이블
- `app/features/cost/db/schema.ts` — 비용 스키마 (model_catalog, routing_decisions 등)

---

## 2. Scope

### 2.1 In Scope

- **S1**: ComplexityScorer 모듈 — 요청 메타데이터 기반 복잡도 점수(0~1) 산출
- **S2**: 3티어 모델 풀 매핑 — model_catalog 기반 Frugal/Standard/Frontier 자동 분류
- **S3**: PAL Router 레이어 — PolicyRouter.route() 호출 전 티어 결정 + 모델 풀 필터링
- **S4**: 에스컬레이션 로직 — Frugal/Standard 실패 시 상위 티어 자동 전환
- **S5**: 다운그레이드 피드백 — 과잉 품질 감지 시 다음 유사 요청의 티어 하향 조정
- **S6**: task_complexity_logs 테이블 — 복잡도 점수 + 티어 선택 + 결과 기록
- **S7**: 비용 절감 대시보드 위젯 — 티어별 분포 + 절감 금액 시각화
- **S8**: 설정 페이지 — 테넌트별 PAL Router 활성화/임계값 조정

### 2.2 Out of Scope

- LLM 자체를 이용한 복잡도 판단 (메타-LLM 호출 비용 발생)
- 사용자별 개인화된 모델 선호 설정
- A/B 테스트 프레임워크 (v0.9.0+)
- 실시간 모델 벤치마크 자동 갱신
- model_catalog 스키마 변경 (기존 capabilityScore 활용)

---

## 3. Architecture

### 3.1 3티어 모델 풀 설계

| 티어 | 복잡도 점수 | 대상 모델 (capabilityScore) | 용도 예시 |
|------|------------|---------------------------|----------|
| **Frugal** | 0.0 ~ 0.3 | Haiku 4.5 (60), DeepSeek V3.2 (91, $0.14/M), GPT-4.1-nano (88, $0.07/M), Llama 3.3 (50), Gemini Flash (80) | 키워드 추출, 분류, 간단한 요약, 포맷 변환 |
| **Standard** | 0.3 ~ 0.7 | Sonnet 4 (93), GPT-4.1 (93), Gemini Pro (93), DeepSeek R1 (90) | 일반 대화, 분석, 도구 사용, PRD 생성 |
| **Frontier** | 0.7 ~ 1.0 | Opus 4 (97), GPT-5.4 (93), GPT-4.1 (93, 복잡 도구) | 다단계 추론, 복잡한 도구 체인, 코드 생성, 전략 수립 |

> **분류 기준**: model_catalog.capabilityScore 기반 자동 매핑
> - Frugal: capabilityScore ≤ 70 또는 price_catalog 기준 $0.50/M 이하
> - Standard: 70 < capabilityScore ≤ 93
> - Frontier: capabilityScore > 93 또는 명시적 Frontier 태그

### 3.2 복잡도 점수 알고리즘

```
complexity = 0.30 × tokenFactor + 0.30 × toolFactor + 0.40 × depthFactor
```

| Factor | 계산 방식 | 범위 |
|--------|----------|------|
| **tokenFactor** | `min(estimatedTokens / 8000, 1.0)` — 8K 토큰 기준 정규화 | 0~1 |
| **toolFactor** | `min(toolCount / 10, 1.0)` — 도구 10개 기준 정규화 | 0~1 |
| **depthFactor** | `min(conversationDepth / 20, 1.0)` — 대화 턴 20회 기준 정규화 | 0~1 |

**가중치 근거**:
- `depthFactor` 0.40 (최고): 대화가 깊어질수록 컨텍스트 이해력이 중요 → Frontier 모델 필요
- `tokenFactor` 0.30: 입력이 길수록 처리 비용 증가 + 요약/추출 능력 요구
- `toolFactor` 0.30: 도구 체인이 길수록 계획/실행 능력 요구

**추가 보정 규칙**:

| 조건 | 보정 | 사유 |
|------|------|------|
| `purpose === "extraction"` | `score × 0.5` | 추출 작업은 본질적으로 단순 |
| `purpose === "eval"` | `score × 0.6` | 평가 작업은 구조화된 출력 |
| `purpose === "batch"` | `score × 0.7` | 배치 작업은 비용 효율 우선 |
| `purpose === "agent-tool"` | `score × 1.2` (cap 1.0) | 도구 실행은 정확도 중요 |
| `needsJsonMode === true` | `score + 0.1` (cap 1.0) | 구조화 출력은 약간 더 높은 능력 필요 |

### 3.3 에스컬레이션 & 다운그레이드

```
요청 → ComplexityScorer → Frugal 선택
                              ↓
                         Frugal 호출 시도
                         ├─ 성공 → 완료 (task_complexity_logs 기록)
                         └─ 실패/품질 미달 → Standard 에스컬레이션
                                              ├─ 성공 → 완료
                                              └─ 실패 → Frontier 에스컬레이션
                                                          └─ 기존 FallbackManager 5단계 체인
```

**에스컬레이션 트리거**:
1. **API 에러**: 모든 Frugal 모델 실패 → Standard로 에스컬레이션
2. **품질 미달**: 응답 길이 < 50자 (단순 응답 제외) 또는 tool_use 파싱 실패
3. **타임아웃**: 30초 초과 (이미 FallbackManager에서 처리)

**다운그레이드 로직** (비동기 피드백):
- `task_complexity_logs`에 `actualTier`와 `selectedTier` 기록
- 동일 `purpose + toolCount` 조합에서 Frontier → Standard 성공 비율이 90%+ → 해당 패턴 자동 다운그레이드
- 다운그레이드는 `complexity_overrides` 테이블에 저장 (학습 기반)

---

## 4. 현재 시스템 분석

### 4.1 PolicyRouter (app/lib/ai/policy-router.ts)

| 항목 | 현재 구현 |
|------|----------|
| **역할** | 7단계 정책 평가: 보안→비활성→기능→예산→가용성→우선순위→비용 |
| **입력** | `RoutingRequest`: userId, tenantId, purpose, needsTools, needsStreaming, needsJsonMode, estimatedTokens |
| **출력** | `RoutingResult`: provider, model, decisionId, reasonCode, budgetTier |
| **모델 선택** | chainPriority(정책 체인 순서) → capabilityScore 내림차순 — **항상 최고 성능 모델 우선** |
| **예산 degrade** | `budget.tier === "degrade"` 시 `degradeToScore` 이하 모델로 전환 |
| **캐시** | model_catalog 5분, health 30초 |

**PAL 통합 포인트**: `route()` 메서드 진입 시 ComplexityScorer로 티어를 먼저 결정하고, `buildCandidates()`에 티어별 필터를 추가한다.

### 4.2 FallbackManager (app/lib/ai/fallback-manager.ts)

| 항목 | 현재 구현 |
|------|----------|
| **역할** | provider 체인 순회 + 실패 시 다음 provider 전환 |
| **체인** | `DEFAULT_PROVIDER_CHAIN`: anthropic → deepseek → openai → google → workers-ai |
| **옵션** | `FallbackManagerOptions`: providerChain, nativeModel, onProviderFailed/Success |
| **nativeModel** | PolicyRouter가 선택한 모델을 체인 첫 번째 provider에서 직접 사용 |

**PAL 통합 포인트**: FallbackManager는 변경 없음. PAL Router가 PolicyRouter를 통해 간접적으로 provider + model을 결정하면, FallbackManager는 그대로 실행만 담당한다.

### 4.3 Model Mapping (app/lib/ai/model-mapping.ts)

| 항목 | 현재 구현 |
|------|----------|
| **역할** | Anthropic 모델 ID → 타 provider 대응 모델 변환 |
| **매핑** | Sonnet→GPT-4.1/Gemini Pro, Haiku→GPT-4.1-nano/Flash, Opus→GPT-5.4/Pro |
| **Pass-through** | `claude-` prefix 아닌 모델은 매핑 없이 그대로 반환 |

**PAL 통합 포인트**: 티어별 모델 선택 시 매핑 테이블 확장 필요. Frugal 티어 전용 매핑 추가 (예: DeepSeek V3.2 → GPT-4.1-nano fallback).

### 4.4 프로덕션 모델 카탈로그 (12개, S368b 기준)

| # | Provider | Model | capabilityScore | 가격 (Input/M) | 티어 분류 |
|---|----------|-------|-----------------|---------------|----------|
| 1 | anthropic | claude-opus-4 | 97 | $15.00 | **Frontier** |
| 2 | anthropic | claude-sonnet-4 | 93 | $3.00 | Standard |
| 3 | anthropic | claude-haiku-4.5 | 60 | $0.80 | **Frugal** |
| 4 | openai | gpt-5.4 | 93 | $2.00 | Standard |
| 5 | openai | gpt-4.1 | 93 | $2.00 | Standard |
| 6 | openai | gpt-4.1-mini | 85 | $0.40 | **Frugal** |
| 7 | openai | gpt-4.1-nano | 88 | $0.07 | **Frugal** |
| 8 | google | gemini-2.5-pro | 93 | $1.25 | Standard |
| 9 | google | gemini-2.5-flash | 80 | $0.15 | **Frugal** |
| 10 | deepseek | deepseek-v3.2 | 91 | $0.14 | **Frugal** |
| 11 | deepseek | deepseek-r1 | 90 | $0.55 | Standard |
| 12 | workers-ai | llama-3.3-70b | 50 | $0.00 | **Frugal** |

> **Frugal 6개**, **Standard 5개**, **Frontier 1개** — Frugal 풀이 풍부하여 PAL 전략에 유리

---

## 5. Migration Plan — 비파괴적 전환

### 5.1 원칙

1. **기존 코드 무수정**: PolicyRouter/FallbackManager 인터페이스 변경 없음
2. **점진적 활성화**: Feature Flag `PAL_ROUTER_ENABLED` (기본 false)
3. **Bypass 경로**: PAL 비활성 시 기존 flow 100% 동일
4. **모니터링 기간**: 2주간 shadow mode (PAL 판정 기록만, 실제 라우팅 미적용)

### 5.2 구현 단계

```
Phase 1: ComplexityScorer + task_complexity_logs (관찰 전용)
  ↓
Phase 2: PAL Router 레이어 + PolicyRouter 통합 (shadow mode)
  ↓
Phase 3: Feature Flag 활성화 + 에스컬레이션 로직
  ↓
Phase 4: 다운그레이드 피드백 루프 + 자동 보정
  ↓
Phase 5: 대시보드 위젯 + 설정 페이지
```

### Phase 1: ComplexityScorer + 관찰 (1~2일)

- [ ] `app/lib/ai/complexity-scorer.ts` 신규 — 복잡도 점수 산출 순수 함수
- [ ] `task_complexity_logs` 테이블 마이그레이션
- [ ] PolicyRouter.route() 진입부에서 점수 계산 + 로그 기록 (라우팅 미변경)
- [ ] 단위 테스트: ComplexityScorer 점수 산출 검증

### Phase 2: PAL Router 레이어 (2~3일)

- [ ] `app/lib/ai/pal-router.ts` 신규 — 티어 결정 + model_catalog 필터링
- [ ] PolicyRouter.buildCandidates()에 티어 필터 옵션 추가
- [ ] Shadow mode: PAL 판정과 기존 판정 모두 기록, 비교 분석
- [ ] 통합 테스트: 티어별 모델 선택 검증

### Phase 3: 에스컬레이션 + Feature Flag (1~2일)

- [ ] PAL_ROUTER_ENABLED Feature Flag 구현
- [ ] 에스컬레이션: Frugal 실패 → Standard → Frontier 자동 전환
- [ ] FallbackManager.onProviderFailed 콜백에서 에스컬레이션 트리거
- [ ] E2E 테스트: 에스컬레이션 시나리오

### Phase 4: 다운그레이드 피드백 (2~3일)

- [ ] `complexity_overrides` 테이블 — 패턴별 학습 데이터
- [ ] 비동기 분석: 성공률 90%+ 패턴 자동 다운그레이드 등록
- [ ] Cron job: 일일 패턴 분석 + 오버라이드 갱신
- [ ] 단위 테스트: 다운그레이드 판정 로직

### Phase 5: 대시보드 + 설정 (1~2일)

- [ ] 비용 절감 위젯: 티어별 분포 차트 + 예상 절감 금액
- [ ] 테넌트 설정: PAL 활성화 토글 + 임계값 슬라이더
- [ ] admin 전용 PAL 분석 페이지

---

## 6. 비용 절감 시뮬레이션

### 6.1 현재 비용 구조 (추정)

현재 모든 요청이 Sonnet/GPT-4.1급(Standard) 모델을 먼저 시도한다고 가정:

| 용도 | 월 요청 수 (추정) | 평균 토큰 | 현재 모델 | 월 비용 (추정) |
|------|------------------|----------|----------|---------------|
| chat | 500 | 4,000 | Sonnet ($3.00/M) | $6.00 |
| analysis | 300 | 2,000 | Sonnet ($3.00/M) | $1.80 |
| extraction | 200 | 1,000 | Sonnet ($3.00/M) | $0.60 |
| agent-tool | 400 | 3,000 | Sonnet ($3.00/M) | $3.60 |
| batch | 100 | 5,000 | Sonnet ($3.00/M) | $1.50 |
| eval | 50 | 2,000 | Sonnet ($3.00/M) | $0.30 |
| **합계** | **1,550** | | | **$13.80/월** |

### 6.2 PAL Router 적용 후 (추정)

| 용도 | Frugal % | Standard % | Frontier % | 절감 비용 |
|------|----------|-----------|------------|----------|
| chat | 20% | 60% | 20% | -15% |
| analysis | 40% | 50% | 10% | -35% |
| extraction | 80% | 20% | 0% | -70% |
| agent-tool | 10% | 60% | 30% | -5% |
| batch | 70% | 30% | 0% | -60% |
| eval | 60% | 40% | 0% | -50% |

| 시나리오 | Frugal 비율 | 월 절감 | 절감률 |
|---------|------------|--------|--------|
| 보수적 | 30% | $2.07 | ~15% |
| 목표 | 45% | $4.14 | ~30% |
| 적극적 | 60% | $6.21 | ~45% |

> **핵심**: extraction(80% Frugal)과 batch(70% Frugal)가 절감 주도. chat과 agent-tool은 품질 유지를 위해 보수적으로 적용.

### 6.3 Frugal 모델별 비용 효율

| 모델 | 가격 (Input/M) | Sonnet 대비 절감 | 응답 속도 |
|------|---------------|-----------------|----------|
| Workers AI Llama | $0.00 | 100% | ~1.5s |
| GPT-4.1-nano | $0.07 | 97.7% | ~0.3s |
| DeepSeek V3.2 | $0.14 | 95.3% | ~0.5s |
| Gemini Flash | $0.15 | 95.0% | ~0.4s |
| GPT-4.1-mini | $0.40 | 86.7% | ~0.5s |
| Haiku 4.5 | $0.80 | 73.3% | ~0.8s |

---

## 7. DB 변경

### 7.1 task_complexity_logs

복잡도 점수 산출 + 티어 선택 + 실행 결과를 기록하여 다운그레이드 학습과 비용 분석의 데이터 소스로 사용한다.

```sql
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
  raw_score REAL NOT NULL,           -- 보정 전
  adjusted_score REAL NOT NULL,      -- 보정 후 (purpose 가중치 적용)

  -- 티어 결정
  selected_tier TEXT NOT NULL,       -- "frugal" | "standard" | "frontier"
  actual_tier TEXT,                  -- 에스컬레이션 후 실제 사용 티어
  escalated INTEGER DEFAULT 0,      -- 에스컬레이션 발생 여부 (boolean)
  escalation_reason TEXT,            -- 에스컬레이션 사유

  -- 결과
  selected_model TEXT,
  actual_model TEXT,
  success INTEGER,                   -- boolean
  response_tokens INTEGER,
  latency_ms INTEGER,

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_tcl_tenant_created ON task_complexity_logs(tenant_id, created_at);
CREATE INDEX idx_tcl_purpose_tier ON task_complexity_logs(purpose, selected_tier);
CREATE INDEX idx_tcl_escalated ON task_complexity_logs(escalated) WHERE escalated = 1;
```

### 7.2 complexity_overrides (Phase 4)

패턴별 학습 결과를 저장하여 복잡도 판정을 자동 보정한다.

```sql
CREATE TABLE complexity_overrides (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  tool_count_min INTEGER NOT NULL DEFAULT 0,
  tool_count_max INTEGER NOT NULL DEFAULT 100,
  override_tier TEXT NOT NULL,       -- 강제 지정 티어
  confidence REAL NOT NULL,          -- 학습 신뢰도 (0~1)
  sample_count INTEGER NOT NULL DEFAULT 0,
  success_rate REAL NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_co_tenant_purpose ON complexity_overrides(tenant_id, purpose);
```

---

## 8. 핵심 인터페이스 설계

### 8.1 ComplexityScorer

```typescript
interface ComplexityInput {
  estimatedTokens: number;
  toolCount: number;
  conversationDepth: number;
  purpose: Purpose;
  needsJsonMode: boolean;
}

interface ComplexityResult {
  rawScore: number;        // 0~1 (가중 합산)
  adjustedScore: number;   // 0~1 (purpose 보정 후)
  tier: "frugal" | "standard" | "frontier";
  factors: {
    tokenFactor: number;
    toolFactor: number;
    depthFactor: number;
  };
}

/** 순수 함수 — DB 의존 없음 */
function scoreComplexity(input: ComplexityInput): ComplexityResult;
```

### 8.2 PalRouter

```typescript
interface PalRoutingRequest extends RoutingRequest {
  conversationDepth?: number;
  toolCount?: number;
}

interface PalRoutingResult extends RoutingResult {
  complexityScore: number;
  selectedTier: "frugal" | "standard" | "frontier";
  actualTier?: "frugal" | "standard" | "frontier";
}

class PalRouter {
  constructor(
    private db: DB,
    private env: Record<string, string | undefined>,
    private policyRouter: PolicyRouter
  );

  /** PAL 복잡도 판정 + PolicyRouter 위임 */
  async route(request: PalRoutingRequest): Promise<PalRoutingResult>;

  /** 에스컬레이션 처리 — FallbackManager 실패 콜백에서 호출 */
  escalate(currentTier: string): "standard" | "frontier" | null;
}
```

---

## 9. Risk & Mitigation

| # | Risk | Impact | Likelihood | Mitigation |
|---|------|--------|------------|------------|
| R1 | Frugal 모델 품질 부족으로 사용자 경험 저하 | High | Medium | 에스컬레이션 자동 트리거 + shadow mode 2주 검증 |
| R2 | 복잡도 점수 오판 (과소/과대 평가) | Medium | Medium | purpose별 보정 계수 + complexity_overrides 학습 |
| R3 | 에스컬레이션 지연으로 응답 시간 증가 | Medium | Low | Frugal 타임아웃 5초로 단축 + 동시 에스컬레이션 |
| R4 | model_catalog 변경 시 티어 분류 깨짐 | Low | Low | capabilityScore 기반 자동 분류 (하드코딩 없음) |
| R5 | 다운그레이드 학습 데이터 부족 | Low | High | 초기 2주 shadow mode로 데이터 축적 후 활성화 |
| R6 | 테넌트별 요청 패턴 차이 | Low | Medium | 테넌트별 complexity_overrides 독립 관리 |
| R7 | PAL + PolicyRouter 이중 라우팅 복잡도 | Medium | Low | PAL은 "티어 필터"만 담당, PolicyRouter 7단계 로직 유지 |

---

## 10. 성공 지표

| 지표 | 목표 | 측정 방식 |
|------|------|----------|
| Frugal 비율 | ≥ 40% | `task_complexity_logs WHERE selected_tier = 'frugal'` |
| 에스컬레이션 비율 | ≤ 15% | `task_complexity_logs WHERE escalated = 1` |
| 월 비용 절감 | ≥ 30% | `daily_usage_aggregates` 비교 (PAL 전/후) |
| 응답 품질 유지 | 사용자 불만 0건 | 피드백 + 에러 로그 모니터링 |
| 평균 응답 시간 | ≤ 현재 대비 +500ms | `task_complexity_logs.latency_ms` 평균 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-18 | Initial — 3티어 설계 + 복잡도 알고리즘 + 현행 분석 + 비용 시뮬레이션 + DB 설계 | Sinclair Seo |
