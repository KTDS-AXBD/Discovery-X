---
code: DX-PLAN-013
title: "PRD Studio Ambiguity Score — 인터뷰 품질 게이트"
version: "0.1"
status: Draft
category: PLAN
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
---

# PRD Studio Ambiguity Score — 인터뷰 품질 게이트

> **Req**: DX-REQ-020 (F50, P3, v0.8.0)
> **Origin**: Q00/ouroboros Ambiguity Score 패턴
> **Parent Feature**: F44 PRD Studio ([[DX-PLAN-010]])
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 현재 PRD Studio 인터뷰는 8섹션 답변 개수(interviewProgress 0~8)만 추적하고, 답변 *품질*을 측정하지 않아요. 모호하고 두루뭉술한 답변으로도 PRD가 생성되어 AI 검토에서 NOT_READY 판정이 반복되고, 사용자는 "어디가 부족한지" 모른 채 재시도해요 |
| **Solution** | Q00/ouroboros Ambiguity Score 패턴 적용 — Goal·Constraint·Success(+Context) 차원별 LLM 평가(temperature 0.1)로 가중 명확성 점수 산출. 인터뷰 진행 중 실시간 게이지 표시 + 점수 미달(> 0.2) 시 부족 차원 안내 + 추가 질문 제안으로 PRD 생성 전 품질 게이트 역할 |
| **Function/UX Effect** | 인터뷰 UI 상단에 모호성 게이지(0~100% 명확성)가 실시간 표시돼요. 답변을 작성할수록 게이지가 올라가고, 80% 이상이면 "PRD 생성" 버튼이 활성화돼요. 미달이면 어떤 차원이 부족한지 카드로 안내하고, 추가 질문을 제안해요 |
| **Core Value** | 인터뷰 품질 선행 보증 — "잘 물어야 잘 만든다". PRD 생성 전에 입력 품질을 확보하여 AI 검토 NOT_READY 반복을 줄이고, 비개발자도 체계적으로 모호성을 해소할 수 있게 가이드해요 |

---

## 1. Overview

### 1.1 목적

PRD Studio의 8섹션 인터뷰 과정에 **입력 품질 측정 레이어**를 추가해요. 현재는 "8개 섹션 모두 답변했는가"만 확인하지만, 답변이 한 줄이든 상세한 문단이든 차이가 없어요. Ambiguity Score는 각 답변의 **구체성·완전성·일관성**을 차원별로 평가하여 PRD 생성 전에 품질을 보증하는 게이트예요.

### 1.2 배경

**현재 흐름의 한계**:
```
인터뷰 8섹션 답변 → [품질 검증 없음] → PRD 생성(GPT-4.1) → AI 검토 → NOT_READY 반복
```

Q00/ouroboros 패턴에서 검증된 Ambiguity Score를 적용하면:
```
인터뷰 8섹션 답변 → [Ambiguity Score ≤ 0.2] → PRD 생성 → AI 검토 → READY/CONDITIONAL 확률↑
```

**핵심 인사이트**: PRD 품질은 인터뷰 답변 품질에 비례해요. 출력(PRD) 단계에서 사후 교정하는 것보다, 입력(인터뷰) 단계에서 선행 보증하는 게 비용 효율적이에요.

### 1.3 관련 문서

- [[DX-REQ-020]] F50: PRD Studio Ambiguity Score
- [[DX-PLAN-010]] F44: PRD Studio Plan 문서
- [[DX-DSGN-016]] F44: PRD Studio Phase 3 (분석 대체) Design
- [[DX-DSGN-017]] F44: PRD Studio Phase 4 (전략 도구) Design
- `app/features/prd-studio/` — 현재 구현 코드

---

## 2. Scope

### 2.1 In Scope

| ID | 항목 | 설명 |
|----|------|------|
| **S1** | Ambiguity Score 계산 엔진 | Greenfield/Brownfield 가중 평균 + LLM 차원별 평가 |
| **S2** | 실시간 게이지 UI | 인터뷰 진행 중 명확성 % 프로그레스 바 + 차원별 점수 카드 |
| **S3** | PRD 생성 게이트 | Ambiguity > 0.2 시 생성 버튼 비활성화 + 부족 차원 안내 |
| **S4** | 추가 질문 제안 | 부족 차원에 대한 보충 질문 자동 제안 |
| **S5** | DB 스키마 확장 | `prds` 테이블에 ambiguity_score + dimension_scores 컬럼 추가 |
| **S6** | 이벤트 추적 | ambiguity_evaluated, gate_passed, gate_blocked 이벤트 |

### 2.2 Out of Scope

- F44 PRD Studio 기본 기능 변경 (인터뷰 8섹션 구조, AI 검토 파이프라인 등은 그대로 유지)
- 독립 페이지/라우트 추가 (기존 인터뷰 UI 내 확장)
- 모바일 레이아웃
- 사용자 커스텀 가중치 설정
- 오프라인 평가 (LLM 호출 필수, 로컬 NLP fallback은 범위 외)

---

## 3. Ambiguity Score 알고리즘

### 3.1 차원 정의

인터뷰 8섹션을 3~4개 평가 차원으로 매핑해요:

| 차원 | 매핑 섹션 | 평가 기준 |
|------|----------|----------|
| **Goal** (목표 명확성) | summary + objectives | 핵심 문제/목표가 구체적인가, 측정 가능한 성공 기준이 있는가 |
| **Constraint** (제약 명확성) | risks + requirements | 기술적·자원적·시간적 제약이 명시됐는가, 우선순위가 분류됐는가 |
| **Success** (성공 기준 명확성) | objectives + target_users | 성공 지표가 정량화됐는가, 대상 사용자가 특정됐는가 |
| **Context** (맥락 명확성) | background + solution + timeline | 기존 시스템/상황 설명이 충분한가, 기술 선택 근거가 있는가 |

### 3.2 가중치 (Greenfield vs Brownfield)

| 차원 | Greenfield | Brownfield |
|------|-----------|------------|
| Goal | **40%** | **35%** |
| Constraint | **30%** | **25%** |
| Success | **30%** | **25%** |
| Context | — | **15%** |
| **합계** | 100% | 100% |

**유형 판별**: background 섹션 답변에 "기존", "레거시", "현재 시스템", "마이그레이션", "개선" 등의 키워드가 포함되면 Brownfield로 자동 판별. 기본값은 Greenfield.

### 3.3 차원별 점수 산출

각 차원은 **LLM 호출 1회**로 0.0 ~ 1.0 범위의 명확성 점수를 받아요:

```
LLM 입력:
  - 시스템 프롬프트: "당신은 PRD 인터뷰 답변의 명확성을 평가하는 전문가입니다."
  - 사용자 프롬프트: 차원별 매핑 섹션 답변 + 평가 루브릭
  - temperature: 0.1 (일관성 최대화)
  - max_tokens: 200 (JSON 응답만)

LLM 출력 (JSON):
  {
    "score": 0.85,          // 0.0(매우 모호) ~ 1.0(완전 명확)
    "rationale": "목표가 3개로 명확히 정의되어 있고...",
    "weakPoints": ["성공 지표에 수치가 없음", ...],
    "suggestedQuestions": ["목표 1의 달성 기준을 수치로 표현하면?", ...]
  }
```

**평가 루브릭** (각 차원 공통 기준):

| 점수 범위 | 수준 | 설명 |
|----------|------|------|
| 0.0 ~ 0.2 | 매우 모호 | 한 줄 이하, 추상적 표현만 |
| 0.2 ~ 0.4 | 모호 | 방향성은 있으나 구체성 부족 |
| 0.4 ~ 0.6 | 보통 | 일부 구체적이나 빈 구간 존재 |
| 0.6 ~ 0.8 | 명확 | 대부분 구체적, 일부 보충 필요 |
| 0.8 ~ 1.0 | 매우 명확 | 구체적이고 측정 가능한 기준 포함 |

### 3.4 최종 Ambiguity Score 계산

```typescript
// Greenfield
ambiguity = 1 - (goal * 0.4 + constraint * 0.3 + success * 0.3)

// Brownfield
ambiguity = 1 - (goal * 0.35 + constraint * 0.25 + success * 0.25 + context * 0.15)
```

예시 (Greenfield):
- Goal: 0.9, Constraint: 0.7, Success: 0.8
- 가중 합: 0.9×0.4 + 0.7×0.3 + 0.8×0.3 = 0.36 + 0.21 + 0.24 = **0.81**
- Ambiguity = 1 - 0.81 = **0.19** → ≤ 0.2 **통과** ✅

### 3.5 게이트 임계값

| Ambiguity | 명확성 | 게이트 | UI 표시 |
|-----------|--------|--------|---------|
| ≤ 0.2 | ≥ 80% | **통과** — PRD 생성 허용 | 🟢 녹색 게이지 + "PRD 생성 가능" |
| 0.2 ~ 0.4 | 60~80% | **경고** — 생성 가능하나 품질 경고 | 🟡 노란색 게이지 + "보충 권장" |
| > 0.4 | < 60% | **차단** — PRD 생성 비활성화 | 🔴 빨간색 게이지 + "답변 보충 필요" |

> **설계 결정**: 0.2~0.4 구간은 경고만 표시하고 생성은 허용해요. "의도된 인지부하"(PRD §2.2) 철학에 따라 강제 차단보다 안내 중심으로 설계하되, 사용자가 모호한 입력으로도 시도할 자유는 보장해요.

---

## 4. UI 변경

### 4.1 인터뷰 페이지 — 실시간 게이지

기존 인터뷰 UI(`/prd-studio/:id`)의 상단에 Ambiguity 게이지를 추가해요:

```
┌──────────────────────────────────────────────────────┐
│  📊 인터뷰 명확성                                       │
│  ████████████████████░░░░░░  78%                      │
│                                                        │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐     │
│  │ 목표     │ │ 제약     │ │ 성공기준 │ │ 맥락     │     │
│  │ 0.9 🟢  │ │ 0.7 🟡  │ │ 0.6 🟡  │ │  —       │     │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘     │
│                                                        │
│  ⚠️ 제약 차원 보충 권장: 기술적 제약과 우선순위를 구체화하세요  │
└──────────────────────────────────────────────────────┘
```

- **프로그레스 바**: 가중 명확성(%) 표시, 색상은 임계값에 따라 변경
- **차원별 카드**: 각 차원 점수 + 상태 아이콘 (🟢/🟡/🔴)
- **안내 메시지**: 가장 점수가 낮은 차원에 대한 개선 가이드

### 4.2 평가 트리거

| 트리거 | 동작 |
|--------|------|
| 섹션 답변 저장 (debounce 후) | 해당 차원만 재평가 (부분 업데이트) |
| "점수 새로고침" 버튼 클릭 | 전체 차원 재평가 |
| PRD 생성 버튼 클릭 시 | 최종 게이트 체크 (최신 점수 확인) |

**비용 절약**: 섹션 저장마다 전체 LLM 호출 대신, 변경된 섹션이 매핑된 차원만 재평가해요. 전체 4차원 평가도 단일 LLM 호출로 병합 가능 (프롬프트에 4차원 동시 평가 요청).

### 4.3 추가 질문 제안 카드

점수가 낮은 차원(< 0.6)에 대해 보충 질문을 카드 형태로 제안해요:

```
┌──────────────────────────────────────────────────────┐
│  💡 보충 질문 — 제약 차원 (0.55)                        │
│                                                        │
│  Q1: 기술 스택의 제약 사항을 구체적으로 나열해주세요        │
│      (예: D1 트랜잭션 제한, 동시 접속 한계 등)            │
│                                                        │
│  Q2: 예산이나 인력 제약이 있다면 구체적 수치를 알려주세요   │
│      (예: 월 API 비용 $30 이하, 개발자 1명)              │
│                                                        │
│  [이 질문에 답변하기 →] [다음에 보충하기]                  │
└──────────────────────────────────────────────────────┘
```

- "이 질문에 답변하기" 클릭 → 해당 섹션으로 스크롤 + 질문을 placeholder로 표시
- 답변 후 해당 차원 자동 재평가

---

## 5. PRD 생성 게이트

### 5.1 게이트 체크 흐름

```
사용자: "PRD 생성" 버튼 클릭
  → 최신 Ambiguity Score 확인
  → 점수 미달 (> 0.4)?
    → YES: 모달 표시 "답변을 보충하면 더 좋은 PRD를 만들 수 있어요"
           + 부족 차원 목록 + 보충 질문 제안
           + [보충하기] / [그래도 생성하기] 버튼
    → NO (≤ 0.4): 기존 PRD 생성 API 호출

  → 점수 경고 (0.2 ~ 0.4)?
    → 배너 표시 "일부 차원이 부족해요. 생성은 가능하지만 보충을 권장해요"
    → 사용자 선택: 보충 or 생성 진행
```

### 5.2 기존 흐름과의 호환

- Ambiguity Score는 **DRAFT 상태에서만 계산**해요 (인터뷰 진행 중)
- GENERATED 이후 상태에서는 게이트 체크 없이 기존 흐름 유지
- **배치 분석 경로** (`prd_analysis_queue`)는 게이트 미적용 — 배치는 이미 충분한 컨텍스트를 소스에서 가져오기 때문
- Feature Flag `AMBIGUITY_SCORE_ENABLED` (환경변수)로 비활성화 가능

---

## 6. DB 변경

### 6.1 `prds` 테이블 컬럼 추가

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `ambiguity_score` | `real` (nullable) | 최종 Ambiguity Score (0.0 ~ 1.0). null = 미평가 |
| `dimension_scores` | `text` (JSON, nullable) | 차원별 점수 + 메타데이터 |
| `project_type` | `text` (nullable) | "greenfield" \| "brownfield". null = 미판별 |

**dimension_scores JSON 구조**:
```json
{
  "goal": { "score": 0.9, "rationale": "...", "weakPoints": [], "suggestedQuestions": [] },
  "constraint": { "score": 0.7, "rationale": "...", "weakPoints": [...], "suggestedQuestions": [...] },
  "success": { "score": 0.8, "rationale": "...", "weakPoints": [], "suggestedQuestions": [] },
  "context": null,
  "evaluatedAt": 1742304000,
  "model": "gpt-4.1",
  "projectType": "greenfield"
}
```

### 6.2 마이그레이션

마이그레이션 SQL (예상: `0067_add_ambiguity_score.sql`):

```sql
ALTER TABLE prds ADD COLUMN ambiguity_score REAL;
ALTER TABLE prds ADD COLUMN dimension_scores TEXT;
ALTER TABLE prds ADD COLUMN project_type TEXT;
```

- nullable이므로 기존 레코드 호환
- `tests/helpers/db.ts`에도 동일 SQL 추가 필수

### 6.3 이벤트 타입 추가

`PrdEventType`에 3개 이벤트 추가:

| eventType | 시점 | payload |
|-----------|------|---------|
| `ambiguity_evaluated` | 차원별 평가 완료 | `{ ambiguityScore, dimensions, projectType }` |
| `gate_passed` | 게이트 통과 (생성 진행) | `{ ambiguityScore, gateLevel }` |
| `gate_warned` | 경고 무시 후 생성 진행 | `{ ambiguityScore, skippedDimensions }` |

---

## 7. Implementation Plan

### Phase 1: 점수 계산 엔진 (Week 1)

- [ ] `app/features/prd-studio/lib/ambiguity-scorer.ts` — 핵심 모듈
  - 차원 매핑 로직 (섹션 → 차원)
  - Greenfield/Brownfield 유형 판별
  - LLM 프롬프트 빌더 (4차원 동시 평가)
  - 응답 파서 + 가중 평균 계산
- [ ] `app/features/prd-studio/types/index.ts` — 타입 추가
  - `AmbiguityDimension`, `DimensionScore`, `AmbiguityResult` 인터페이스
- [ ] DB 마이그레이션 — `prds` 테이블 3컬럼 추가
- [ ] 서비스 레이어 확장 — `evaluateAmbiguity()`, `getAmbiguityScore()` 메서드
- [ ] API 라우트 — `POST /api/prd-studio/:id/ambiguity` (평가 요청)
- [ ] 유닛 테스트 — scorer, parser, 가중 계산

### Phase 2: UI 게이지 + 게이트 (Week 2)

- [ ] `AmbiguityGauge` 컴포넌트 — 프로그레스 바 + 차원 카드
- [ ] `AmbiguityGate` 컴포넌트 — 게이트 모달 (차단/경고)
- [ ] `SuggestionCard` 컴포넌트 — 보충 질문 카드
- [ ] `useAmbiguityScore` 훅 — 점수 fetch + 캐싱 + 섹션 저장 후 재평가
- [ ] 인터뷰 UI 통합 — 기존 인터뷰 페이지에 게이지/게이트 삽입
- [ ] 이벤트 추적 — `useEventTracking` 훅에 3개 이벤트 추가
- [ ] 통합 테스트 — API + 게이트 흐름

### Phase 3: 자동 추가 질문 (Week 3)

- [ ] 차원별 추가 질문 자동 생성 로직 (LLM suggestedQuestions 활용)
- [ ] "이 질문에 답변하기" 인터랙션 — 섹션 스크롤 + placeholder
- [ ] 재평가 자동 트리거 — 보충 답변 저장 시 해당 차원 재계산
- [ ] Feature Flag `AMBIGUITY_SCORE_ENABLED` 적용
- [ ] E2E 시나리오 — 인터뷰 → 게이트 차단 → 보충 → 통과 → PRD 생성

---

## 8. 비용 영향

### 8.1 LLM 호출 비용

| 시나리오 | 모델 | 토큰 (예상) | 비용 (예상) |
|----------|------|------------|------------|
| 전체 4차원 1회 평가 | GPT-4.1 | ~1,500 input + ~400 output | ~$0.003 |
| 섹션별 부분 재평가 | GPT-4.1 | ~500 input + ~200 output | ~$0.001 |
| PRD 1건 평균 (3~5회 평가) | GPT-4.1 | ~5,000 total | ~$0.01 |

**월간 예상**: PRD 20건 × $0.01 = **$0.20** (기존 PRD 생성·검토 비용 대비 미미)

### 8.2 응답 시간

- 전체 평가: 2~4초 (단일 LLM 호출)
- 부분 재평가: 1~2초
- 사용자 체감: debounce 1.5초 후 백그라운드 실행이므로 인터뷰 흐름에 영향 없음

---

## 9. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| LLM 평가 일관성 부족 — 같은 답변에 점수 편차 | Medium | Medium | temperature 0.1 고정 + 루브릭 상세화 + 평가 캐싱 (동일 답변 재평가 방지) |
| 비개발자가 게이지를 이해하지 못함 | Medium | Low | 퍼센트(%)로 표시 + 직관적 색상 코드 + 안내 툴팁 |
| LLM API 장애 시 게이트 차단 | High | Low | 게이트 bypass — API 실패 시 경고만 표시하고 생성 허용 (graceful degradation) |
| 과도한 LLM 호출로 인터뷰 UX 저해 | Medium | Low | debounce + 부분 재평가 + 수동 새로고침 버튼 옵션 |
| Brownfield 자동 판별 오류 | Low | Medium | 사용자 수동 토글 UI 제공 (Greenfield/Brownfield 선택) |
| "PRD 생성 차단"에 대한 사용자 불만 | Medium | Medium | 0.2~0.4 구간은 경고만 (강제 차단 없음). > 0.4도 "그래도 생성하기" 옵션 제공 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-18 | Initial — F50 Ambiguity Score Plan 작성. 알고리즘, UI, DB, 3 Phase 실행 계획 | Sinclair Seo |
