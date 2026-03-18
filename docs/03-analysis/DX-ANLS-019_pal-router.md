---
code: DX-ANLS-019
title: "F49 PAL Router — Gap Analysis v1.0"
version: "1.0"
status: Active
category: ANLS
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
---

# F49 PAL Router — Gap Analysis v1.0

> **Design**: [[DX-DSGN-019]] v0.1
> **Plan**: [[DX-PLAN-012]] v0.1
> **Req**: DX-REQ-019 (F49, P2, v0.8.0)

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| **Feature** | F49 PAL Router — 복잡도 기반 LLM 모델 티어 자동 선택 |
| **분석 일자** | 2026-03-18 |
| **분석 대상** | DX-DSGN-019 v0.1 ↔ 구현 코드 |
| **Overall Match Rate** | **78%** |
| **GREEN** | 10 |
| **YELLOW** | 6 |
| **RED** | 4 |

### Value Delivered

| Perspective | Content |
|-------------|---------|
| **Problem** | 모든 요청을 동일한 "최고 품질 우선" 체인으로 처리하여 비용 대비 품질 효율이 낮음 |
| **Solution** | PAL Router: 요청 복잡도를 실시간 점수화(0~1)하여 3티어(Frugal/Standard/Frontier)로 자동 분배 |
| **Function/UX Effect** | ComplexityScorer + TierRouter + PolicyRouter 통합으로 복잡도 기반 티어 라우팅 기반 구조 완성 |
| **Core Value** | Phase 1~2 핵심 모듈(Scorer+Router+PolicyRouter 통합+DB 스키마) GREEN, Phase 3~5(에스컬레이션 실행/다운그레이드 학습/설정 UI)는 미구현 |

---

## Gap Items

### GREEN — 완전 구현 (10건)

#### G1. ComplexityScorer 모듈 (DSGN §2)

| 설계 항목 | 구현 상태 | 비고 |
|----------|----------|------|
| 순수 함수, DB 의존 없음 | GREEN | `complexity-scorer.ts` — import 없이 순수 계산 |
| `ComplexityInput` 인터페이스 5필드 | GREEN | estimatedTokens, toolCount, conversationDepth, purpose, needsJsonMode |
| `ComplexityResult` 인터페이스 | GREEN | rawScore, adjustedScore, tier, factors 모두 포함 |
| 가중치 0.30/0.30/0.40 | GREEN | `WEIGHTS` 상수 |
| 정규화 기준 8000/10/20 | GREEN | `NORMALIZATION` 상수 |

**파일**: `app/lib/ai/complexity-scorer.ts` (130 LOC)

> **설계와의 차이**: 설계는 `scoreComplexity()` 전역 함수, 구현은 `ComplexityScorer` 클래스 메서드 `score()`. 기능 동일, 캡슐화 개선.

#### G2. 점수 산출 알고리즘 (DSGN §2.2)

| 설계 항목 | 구현 상태 | 비고 |
|----------|----------|------|
| `rawScore = 0.30*token + 0.30*tool + 0.40*depth` | GREEN | 수식 동일 |
| 팩터 정규화 (min, clamp 0~1) | GREEN | `clamp01()` 헬퍼 |
| 소수점 3자리 반올림 | GREEN | `round3()` 헬퍼 |

#### G3. purpose별 보정 계수 (DSGN §2.3)

| 설계 항목 | 구현 상태 | 비고 |
|----------|----------|------|
| 6개 purpose 보정 계수 | GREEN | extraction(0.5), eval(0.6), batch(0.7), analysis(1.0), chat(1.0), agent-tool(1.2) — 설계와 동일 |
| needsJsonMode +0.1 보정 | GREEN | 구현 동일 |
| 0~1 클램프 | GREEN | `clamp01()` 적용 |

**차이점**: `needsJsonMode`가 설계에서는 `boolean` 필수, 구현에서는 `boolean?` (optional) — 더 유연한 인터페이스. 미지정 시 false 동작 동일.

#### G4. 티어 경계값 (DSGN §2.5)

| 설계 항목 | 구현 상태 | 비고 |
|----------|----------|------|
| `<=0.3 -> frugal` | GREEN | `TIER_THRESHOLDS.frugalMax = 0.3` |
| `<=0.7 -> standard` | GREEN | `TIER_THRESHOLDS.standardMax = 0.7` |
| `>0.7 -> frontier` | GREEN | `scoreToTier()` |

#### G5. TierRouter 모듈 (DSGN §3)

| 설계 항목 | 구현 상태 | 비고 |
|----------|----------|------|
| 복잡도 -> 티어 결정 | GREEN | `TierRouter.route()` |
| ComplexityScorer 내장 | GREEN | `private scorer = new ComplexityScorer()` |
| `TierRoutingResult` 반환 | GREEN | complexity, effectiveTier, escalatedFrom |

**파일명 차이**: 설계는 `pal-router.ts`, 구현은 `tier-router.ts` — TierRouter와 PalRouter 클래스를 분리하여 독립성 강화.

#### G6. 에스컬레이션 맵 (DSGN §4.1)

| 설계 항목 | 구현 상태 | 비고 |
|----------|----------|------|
| `frugal -> standard -> frontier -> null` | GREEN | `TIER_ESCALATION_MAP` 동일 |
| 에스컬레이션 이력 기록 | GREEN | `escalationHistory` + `EscalationEvent` 타입 |
| `escalate()` 함수 | GREEN | `recordFailure()` 내부에서 구현 |

#### G7. 다운그레이드 맵 (DSGN §4.3 — 인메모리 부분)

| 설계 항목 | 구현 상태 | 비고 |
|----------|----------|------|
| 연속 성공 시 하위 티어 전환 | GREEN | `TIER_DOWNGRADE_MAP` + `recordSuccess()` |
| `frontier -> standard -> frugal -> null` | GREEN | 설계 방향과 동일 |

> 설계는 DB 기반 비동기 학습 루프(Phase 4)를 기술했으나, 구현은 인메모리 연속 5성공 기반 즉시 다운그레이드. Phase 1 MVP로서 적합하되 학습 데이터 영속성은 없음.

#### G8. Jaccard 유사도 기반 태스크 유형 상속 (DSGN §4.3)

| 설계 항목 | 구현 상태 | 비고 |
|----------|----------|------|
| toolCount +-2 범위 기반 Jaccard | GREEN | `TOOL_RANGE_HALF = 2`, `jaccardSimilarity()` |
| 유사 태스크에 override 전파 | GREEN | `propagateOverride()` |
| `JACCARD_SIMILARITY_MIN = 0.5` | GREEN | 설계와 동일 |

#### G9. PolicyRouter 통합 (DSGN §3.3 + §9.1)

| 설계 항목 | 구현 상태 | 비고 |
|----------|----------|------|
| TierRouter 인스턴스 내장 | GREEN | `private tierRouter = new TierRouter()` |
| `enablePalRouter` opt-in 플래그 | GREEN | `RoutingRequest.enablePalRouter?: boolean` |
| `palInput` (toolCount, conversationDepth) | GREEN | `RoutingRequest.palInput?` |
| `palTier` 반환 | GREEN | `RoutingResult.palTier?` |
| `getTierRouter()` 접근자 | GREEN | PolicyRouter 외부에서 에스컬레이션/다운그레이드 기록 가능 |
| 빈 후보 시 전체 모델 fallback | GREEN | `if (afterTier.length === 0) afterTier = filtered` |

**통합 방식 차이**: 설계는 `TierFilterOption.allowedModelIds` (모델 ID 리스트 전달), 구현은 `TIER_CAPABILITY_CEILING` (capabilityScore 상한 필터). 구현 방식이 더 단순하고 model_catalog 변경에 자동 대응 — 설계 의도(하드코딩 없음)와 부합.

| 티어 | 설계 분류 기준 | 구현 필터 기준 | 비교 |
|------|--------------|--------------|------|
| Frugal | score<=70 또는 price<=$0.50 | capabilityScore <= 40 | 차이 있음 |
| Standard | 70 < score <= 93 | capabilityScore <= 75 | 차이 있음 |
| Frontier | score > 93 | 전체 (ceiling=100) | 동일 |

> 설계의 분류 기준(score + price 이중 조건)과 구현의 capabilityScore 단일 상한은 다르다. 설계에서 Frugal로 분류되는 GPT-4.1-mini(score=85, price=$0.40)가 구현에서는 capabilityScore > 40이므로 Frugal에 포함 안 됨. 이는 **의도적 간소화**로 보이며, 향후 price 기반 분류 추가 시 조정 필요. 핵심 구조(opt-in + 티어 필터 + fallback)는 완성이므로 GREEN 판정.

#### G10. task_complexity_logs DB 스키마 (DSGN §5.1)

| 설계 항목 | 구현 상태 | 비고 |
|----------|----------|------|
| 테이블 존재 | GREEN | `cost/db/schema.ts` + `drizzle/0068_task_complexity_logs.sql` |
| PK: id (TEXT) | GREEN | |
| 인덱스: tenant_created, purpose_tier | GREEN | 설계와 동일한 인덱스명 |
| 타입 export | GREEN | `TaskComplexityLog`, `NewTaskComplexityLog` |
| tests/helpers/db.ts 동기화 | GREEN | `0068_task_complexity_logs.sql` 포함 확인 |

---

### YELLOW — 부분 구현 (6건)

#### Y1. task_complexity_logs 컬럼 간소화 (DSGN §5.1)

| 설계 컬럼 | 구현 | 상태 |
|----------|------|------|
| id, tenant_id, purpose, created_at | 구현됨 | 동일 |
| request_id (= routing_decision_id) | 구현됨 | 이름 변경 |
| complexity_score (= adjusted_score) | 구현됨 | 단일 점수로 통합 |
| tier (= selected_tier) | 구현됨 | 이름 변경 |
| selected_model, selected_provider | 구현됨 | 동일 |
| success, latency_ms | 구현됨 | 동일 |
| estimated_cost_usd | 구현됨 (신규) | 설계에 없던 컬럼 추가 |
| escalated_from | 구현됨 (변형) | 설계의 escalated(bool) + escalation_reason -> 단일 text 컬럼 |
| user_id | 미구현 | 사용자별 분석 불가 |
| estimated_tokens, tool_count, conversation_depth | 미구현 | 입력 메트릭 미기록 |
| token_factor, tool_factor, depth_factor | 미구현 | 개별 팩터 미기록 |
| raw_score | 미구현 | 보정 전 점수 미기록 |
| actual_tier | 미구현 | 에스컬레이션 후 실제 티어 미기록 |
| actual_model | 미구현 | fallback 후 실제 모델 미기록 |
| response_tokens | 미구현 | 응답 토큰 미기록 |
| escalated (bool) | 미구현 | boolean 플래그 없음 |
| escalated 부분 인덱스 | 미구현 | `WHERE escalated = 1` 조건부 인덱스 없음 |

**영향**: Phase 4 다운그레이드 학습에 필요한 세부 데이터(입력 메트릭, 개별 팩터, actual_tier)가 부족. 향후 학습 루프 구현 시 스키마 확장 필요.

**심각도**: Low — Phase 1 관찰 로깅에는 현재 스키마로 충분. 다운그레이드 학습은 Phase 4 범위.

#### Y2. 에스컬레이션 실행 연동 미완 (DSGN §4.2)

설계는 executor-stream.ts에서 FallbackManager 실패 시 PalRouter.escalate()를 호출하여 상위 티어로 재라우팅하는 패턴을 기술한다.

| 설계 항목 | 구현 상태 | 비고 |
|----------|----------|------|
| `recordFailure()` / `recordSuccess()` | 구현됨 | TierRouter에 구현 |
| executor-stream 통합 (호출부) | 미구현 | executor-stream.ts에 PAL 관련 코드 없음 |
| FallbackManager.onProviderFailed 콜백 연동 | 미구현 | 콜백에서 TierRouter 기록 미연결 |
| 에스컬레이션 재라우팅 (catch 블록 확장) | 미구현 | 미구현 |

**영향**: TierRouter의 에스컬레이션/다운그레이드 로직은 완성되었으나, 실제 API 호출 흐름에서 트리거되지 않음.

**심각도**: Medium — Phase 3 범위. TierRouter 단독 테스트는 통과하나 E2E에서는 에스컬레이션 동작 안 함.

#### Y3. PAL 핵심 타입 위치 차이 (DSGN §8.1)

| 설계 위치 | 구현 위치 | 비고 |
|----------|----------|------|
| `app/lib/ai/types.ts`에 PAL 타입 추가 | 미구현 | `types.ts`에 PAL 타입 없음 |
| — | `complexity-scorer.ts` | Tier, ComplexityInput, ComplexityResult 직접 정의 |
| — | `tier-router.ts` | TierRoutingResult, EscalationEvent 직접 정의 |
| — | `cost/types/index.ts` | RoutingRequest.enablePalRouter, palInput, RoutingResult.palTier |

**영향**: 타입이 분산되어 있으나 기능적으로 동일. 설계의 `PalRoutingRequest`, `PalRoutingResult`, `EscalationState`, `TierClassification`, `PalConfig`, `TierFilterOption` 인터페이스는 미구현.

**심각도**: Low — 타입 위치는 리팩토링 수준. 기능 동작에 영향 없음.

#### Y4. 마이그레이션 번호 차이 (DSGN §6)

| 설계 | 구현 | 비고 |
|------|------|------|
| `0067_add_task_complexity_logs.sql` | `0068_task_complexity_logs.sql` | 번호 +1 (0067은 chat_widgets가 선점) |
| `0068_add_complexity_overrides.sql` (Phase 4) | 미구현 | Phase 4 범위 |

**영향**: 번호 차이는 기술적 문제 없음. complexity_overrides 테이블은 Phase 4 다운그레이드 학습 시 필요.

**심각도**: Low

#### Y5. model_catalog 기반 동적 분류 미구현 (DSGN §3.1)

설계는 `classifyModels()` 함수로 model_catalog + price_catalog를 조회하여 3티어 동적 분류(`TierClassification`)를 수행한다.

| 설계 항목 | 구현 상태 | 비고 |
|----------|----------|------|
| `classifyModels()` 함수 | 미구현 | |
| `TierClassification` 타입 | 미구현 | |
| price_catalog 조회 기반 분류 | 미구현 | |
| 티어 캐시 (5분 TTL) | 미구현 | |
| — | `TIER_CAPABILITY_CEILING` | 정적 capabilityScore 상한으로 대체 |

**영향**: 구현은 `TIER_CAPABILITY_CEILING`(frugal<=40, standard<=75, frontier<=100)으로 간소화. 설계의 capabilityScore+price 이중 조건 분류에 비해 Frugal 풀이 축소됨 (설계: 6모델, 구현: score<=40인 haiku+llama 2모델만).

**심각도**: Medium — Frugal 모델 풀이 설계 대비 크게 축소되어 PAL의 비용 절감 효과 감소. 향후 ceiling 값 조정 또는 동적 분류 도입 권장.

#### Y6. Feature Flag 차이 (DSGN §7.1)

| 설계 | 구현 | 비고 |
|------|------|------|
| `PAL_ROUTER_ENABLED` 환경변수 | 미사용 | 환경변수 미사용 |
| — | `request.enablePalRouter` | 요청 단위 opt-in 플래그 |
| Shadow mode (기록만, 라우팅 미변경) | 미구현 | |

**영향**: 설계의 글로벌 Feature Flag + shadow mode(2주 관찰) 대신, 요청 단위 opt-in으로 구현. 더 세밀한 제어가 가능하나, shadow mode 관찰 기능은 없음.

**심각도**: Low — 요청 단위 제어가 더 유연. shadow mode는 Phase 2 범위.

---

### RED — 미구현 (4건)

#### R1. complexity_overrides 테이블 (DSGN §5.2)

설계 Phase 4에서 패턴별 학습 결과를 저장하는 `complexity_overrides` 테이블.

| 설계 항목 | 구현 상태 |
|----------|----------|
| `complexity_overrides` 테이블 | 미구현 |
| Drizzle 스키마 정의 | 미구현 |
| 마이그레이션 SQL | 미구현 |
| `ComplexityOverride` 타입 | 미구현 |

**영향**: DB 기반 다운그레이드 학습 불가. 현재 인메모리 `tierOverrides`는 세션 간 영속되지 않음.

**계획**: Phase 4 범위. Plan §5.2에서 Phase 4로 명시.

#### R2. PalRouter 클래스 (DSGN §3.4)

설계의 `PalRouter` 클래스는 DB 조회(complexity_overrides), 티어 캐시, 비동기 로깅을 포함하는 통합 진입점이다.

| 설계 항목 | 구현 상태 |
|----------|----------|
| `PalRouter` 클래스 | 미구현 (TierRouter로 대체) |
| DB 기반 override 조회 (`checkOverride()`) | 미구현 |
| 비동기 로깅 (`logComplexity()`) | 미구현 |
| 티어 캐시 (`getClassifiedModels()`) | 미구현 |
| `PalRoutingResult` 반환 (complexityScore + selectedTier) | 미구현 |

**영향**: TierRouter가 인메모리 순수 로직을 담당하고, PolicyRouter가 통합 호출 역할을 대행. PalRouter 클래스가 없어도 Phase 1~2 기능은 PolicyRouter 통합으로 커버됨.

**계획**: Phase 2~3 범위. PalRouter 클래스 신설 또는 PolicyRouter 내부 강화로 해소 가능.

#### R3. 다운그레이드 학습 루프 (DSGN §4.3 — DB 부분)

| 설계 항목 | 구현 상태 |
|----------|----------|
| `analyzeDowngradeCandidates()` 함수 | 미구현 |
| 성공률 90%+ / 샘플 20+ 조건 판정 | 미구현 |
| 최근 7일 하위 티어 실패 이력 확인 | 미구현 |
| Cron job 일일 패턴 분석 | 미구현 |
| `complexity_overrides` INSERT/UPDATE | 미구현 |

**영향**: 자동 비용 최적화의 핵심 피드백 루프 미구현. 인메모리 다운그레이드(연속 5성공)만 동작하며 세션 간 학습 불가.

**계획**: Phase 4 범위 (Plan §5.2).

#### R4. 설정 인터페이스 + 대시보드 (DSGN §7)

| 설계 항목 | 구현 상태 |
|----------|----------|
| `PalConfig` 인터페이스 | 미구현 |
| `DEFAULT_PAL_CONFIG` 상수 | 미구현 |
| `routing_policies.pal_config` JSON 컬럼 추가 | 미구현 |
| 테넌트별 임계값/가중치 커스터마이즈 | 미구현 |
| 관리자 설정 페이지 (토글 + 슬라이더) | 미구현 |
| 비용 절감 대시보드 위젯 | 미구현 |

**영향**: 테넌트별 PAL 설정 불가. 모든 값이 하드코딩 상수.

**계획**: Phase 5 범위 (Plan §5.2).

---

## 테스트 분석

### ComplexityScorer 테스트 (DSGN §10.1)

| # | 설계 테스트 케이스 | 구현 | 상태 |
|---|-----------------|------|------|
| 1 | 최소 입력 -> Frugal | `모든 입력이 0이면 rawScore=0, tier=frugal` | GREEN |
| 2 | 최대 입력 -> Frontier | `최대 입력이면 rawScore=1` + 별도 frontier 테스트 | GREEN |
| 3 | extraction 보정 | `extraction purpose는 0.5 보정` | GREEN |
| 4 | agent-tool 보정 | `agent-tool purpose는 1.2 보정` | GREEN |
| 5 | needsJsonMode +0.1 | `needsJsonMode=true이면 +0.1 보정` | GREEN |
| 6 | 클램프 1.0 초과 방지 | `JSON 보정 후 1.0 초과 시 클램프` | GREEN |
| 7 | 경계값 0.3 -> Frugal | `adjustedScore=0.3이면 frugal` | GREEN |
| 8 | 경계값 0.301 -> Standard | `adjustedScore>0.3이면 standard` (0.4로 검증) | GREEN (간접) |
| 9 | 경계값 0.7 -> Standard | 미구현 | RED |
| 10 | 경계값 0.701 -> Frontier | `adjustedScore>0.7이면 frontier` (1.0으로 검증) | GREEN (간접) |
| 11 | 모든 purpose 보정 계수 | `PURPOSE_MODIFIERS에 6개 purpose가 모두 정의됨` | GREEN |
| 12 | 팩터 반올림 정밀도 | `결과값은 소수점 3자리로 반올림` | GREEN |

**추가 테스트** (설계에 없지만 구현에 있음):
- 정규화 상한 초과 입력 클램프
- 개별 가중치 검증 (토큰만/도구만/깊이만)

**구현 테스트 수**: 16개 (설계 12개 대비 +4개, 경계값 0.7 정확히 1개 누락)

### TierRouter 테스트 (DSGN §10.2 + §10.3)

| # | 설계 테스트 케이스 | 구현 | 상태 |
|---|-----------------|------|------|
| 1 | Frugal 모델만 필터 | 간접 — route()에서 frugal 반환 확인 | GREEN (간접) |
| 2 | Standard 모델만 필터 | 간접 — route()에서 standard 반환 확인 | GREEN (간접) |
| 3 | Frontier 모델만 필터 | 간접 — route()에서 frontier 반환 확인 | GREEN (간접) |
| 4 | model_catalog 동적 분류 | 미구현 | RED (classifyModels 미구현) |
| 5 | complexity_overrides 적용 | 미구현 | RED (DB 기반 override 미구현) |
| 6 | Feature Flag false | 미구현 | RED (Feature Flag 미구현) |
| 7 | 티어 캐시 동작 | 미구현 | RED (캐시 미구현) |
| 8 | 빈 티어 fallback | 미구현 | RED (PolicyRouter 측에서 처리) |

**에스컬레이션 테스트**:

| # | 설계 테스트 케이스 | 구현 | 상태 |
|---|-----------------|------|------|
| 1 | 성공 -> 에스컬레이션 없음 | 간접 확인 | GREEN (간접) |
| 2 | Frugal 실패 -> Standard | `연속 2실패 -> 상위 티어로 에스컬레이션` | GREEN |
| 3 | Frugal+Standard -> Frontier | 미테스트 | RED (2단계 연속 에스컬레이션) |
| 4 | Frontier 실패 -> 에러 | `frontier에서 연속 2실패 -> null` | GREEN |
| 5 | 연속 실패 2회 -> purpose 상향 | override + route() 반영 확인 | GREEN |
| 6 | task_complexity_logs 기록 | 미구현 | RED (로깅 미구현) |
| 7 | escalation_reason 기록 | 에스컬레이션 이력 확인 | GREEN |

**추가 테스트** (설계에 없지만 구현에 있음):
- 다운그레이드 (연속 5성공 -> 하위 티어): 4건
- 성공/실패 카운터 리셋: 2건
- Jaccard 유사도 전파/미전파: 3건
- reset(): 1건

**구현 테스트 수**: 20개 (설계 15개 대비 일부 미커버 + 추가 독자 테스트)

### 테스트 요약

| 카테고리 | 설계 예상 | 구현 실제 | 비율 |
|---------|----------|----------|------|
| ComplexityScorer | 12 | 16 | 133% |
| TierRouter (점수->티어) | 8 | 4 | 50% |
| 에스컬레이션 통합 | 7 | 7 | 100% |
| 다운그레이드 DB | 5 | 0 | 0% |
| 추가 (Jaccard, reset 등) | 0 | 9 | - |
| **합계** | **32** | **36** | **113%** |

> 전체 테스트 수는 설계 대비 초과(36 vs 32). 다만 DB 기반 테스트(TierRouter DB mock, 다운그레이드 DB)가 미구현이고, 인메모리 로직 테스트가 풍부.

---

## Phase별 진행 상태

| Phase | 설계 범위 | 상태 | 비고 |
|-------|----------|------|------|
| **Phase 1** | ComplexityScorer + task_complexity_logs (관찰 전용) | GREEN **완료** | Scorer 완성, 스키마 완성 (컬럼 간소화) |
| **Phase 2** | PalRouter 레이어 + PolicyRouter 통합 (shadow mode) | YELLOW **부분** | PolicyRouter 통합 완료, PalRouter 클래스 미생성, shadow mode 미구현 |
| **Phase 3** | Feature Flag + 에스컬레이션 로직 | YELLOW **부분** | 인메모리 에스컬레이션 완성, executor-stream 연동 미구현 |
| **Phase 4** | 다운그레이드 피드백 루프 | RED **미구현** | complexity_overrides 테이블 + 학습 로직 미구현 |
| **Phase 5** | 대시보드 + 설정 페이지 | RED **미구현** | PalConfig, 설정 UI, 절감 대시보드 모두 미구현 |

---

## Recommendations

### 즉시 해소 권장 (Low Effort, High Impact)

1. **Y5: TIER_CAPABILITY_CEILING 조정** — 현재 frugal=40은 너무 제한적. 설계 기준에 맞추어 frugal=70 또는 price 기반 로직 추가. Frugal 풀 확대가 PAL 비용 절감의 핵심.
2. **테스트: 경계값 0.7 정확히** — ComplexityScorer 테스트에서 `adjustedScore=0.7 -> standard` 케이스 추가.

### Phase 3 해소 권장 (executor-stream 통합)

3. **Y2: executor-stream 연동** — PolicyRouter.route() 반환의 `palTier`를 기반으로 FallbackManager 콜백에서 `tierRouter.recordSuccess/recordFailure` 호출. 에스컬레이션 재시도 로직 추가.

### Phase 4 해소 권장 (학습 루프)

4. **R1+R3: complexity_overrides + 학습 루프** — DB 영속 다운그레이드가 PAL의 장기 비용 최적화 핵심. Cron 기반 일일 분석 + override 갱신.
5. **Y1: task_complexity_logs 스키마 확장** — 학습에 필요한 입력 메트릭(estimatedTokens, toolCount, conversationDepth), 개별 팩터, actual_tier 컬럼 추가.

### Phase 5 (후순위)

6. **R4: 설정 UI + 대시보드** — 운영 데이터 축적 후 구현 권장.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-18 | Initial — GREEN 10, YELLOW 6, RED 4. Overall 78%. Phase 1~2 핵심 완성, Phase 3~5 미구현 | Sinclair Seo |
