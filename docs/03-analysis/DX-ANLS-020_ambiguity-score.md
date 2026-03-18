---
code: DX-ANLS-020
title: "F50 Ambiguity Score — Gap Analysis v1.0"
version: "1.0"
status: Active
category: ANLS
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
---

# F50 Ambiguity Score — Gap Analysis v1.0

> **Design**: [[DX-DSGN-020]] v0.1
> **Plan**: [[DX-PLAN-013]] v0.1
> **Req**: DX-REQ-020 (F50, P3, v0.8.0)
> **분석 대상**: 설계 12개 섹션 ↔ 구현 코드

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Feature** | F50 PRD Studio Ambiguity Score — 인터뷰 품질 게이트 |
| **분석 기준일** | 2026-03-18 |
| **분석 범위** | DX-DSGN-020 12개 섹션 vs 구현 코드 9개 파일 |

| 지표 | 값 |
|------|---|
| **Overall Match Rate** | **88%** |
| **GREEN** | 15 / 20 항목 |
| **YELLOW** | 3 / 20 항목 |
| **RED** | 2 / 20 항목 |
| **구현 파일 수** | 9개 (lib 1 + ui 3 + schema 1 + types 1 + route 2 + migration 1) |
| **테스트** | 15개 (단위: 15, 통합: 0, UI: 0) |

| Perspective | Content |
|-------------|---------|
| **Problem** | 설계 대비 일부 기능 누락 — useAmbiguityScore 훅 미구현, useEventTracking 미확장, Feature Flag 미적용 |
| **Solution** | Phase 1(점수 엔진 + DB + API + 기본 UI) 핵심은 완료. Phase 2~3(훅, 이벤트 추적, Feature Flag, 통합 테스트) 보충 필요 |
| **Function/UX Effect** | 인터뷰 명확성 게이지, 차원별 카드, 게이트 모달 모두 동작. 다만 섹션 변경 시 자동 부분 재평가 트리거 미연결 |
| **Core Value** | 핵심 가치(입력 품질 선행 보증)는 달성. 자동화·추적 보완으로 완성도 향상 가능 |

---

## Gap Items

### 1. AmbiguityScorer 서비스 (설계 §2)

| # | 설계 항목 | 상태 | 근거 |
|---|----------|------|------|
| G01 | `lib/ambiguity-scorer.ts` 모듈 위치 | 🟢 GREEN | `app/features/prd-studio/lib/ambiguity-scorer.ts`에 정확히 구현 |
| G02 | `AmbiguityScorer` 클래스 + `evaluate()` | 🟢 GREEN | 설계와 동일한 시그니처·로직. `callLLM` 경유, 가중 합산, 게이트 판정 |
| G03 | `evaluatePartial()` 부분 재평가 | 🟢 GREEN | 변경 차원만 교체 + 재합산 로직 구현 완료 |
| G04 | `detectProjectType()` Greenfield/Brownfield 판별 | 🟢 GREEN | 키워드 2개 이상 매칭 로직 일치. 한/영 키워드 13개 |

### 2. 차원 매핑 (설계 §2.3~2.5)

| # | 설계 항목 | 상태 | 근거 |
|---|----------|------|------|
| G05 | `DIMENSION_WEIGHTS` 가중치 | 🟢 GREEN | Greenfield(0.4/0.3/0.3/0), Brownfield(0.35/0.25/0.25/0.15) 정확히 일치 |
| G06 | `DIMENSION_TO_SECTIONS` 매핑 | 🟢 GREEN | goal→[summary,objectives], constraint→[risks,requirements], success→[objectives,target_users], context→[background,solution,timeline] |
| G07 | `SECTION_TO_DIMENSION_MAP` 역매핑 | 🟢 GREEN | 8개 섹션 → 차원 역매핑 테이블 구현 |

### 3. LLM 평가 프롬프트 (설계 §4)

| # | 설계 항목 | 상태 | 근거 |
|---|----------|------|------|
| G08 | 시스템 프롬프트 (역할 + 루브릭 + JSON 응답 지시) | 🟢 GREEN | `buildSystemPrompt()` — 5단계 루브릭 테이블 + "JSON만 출력" 지시 포함 |
| G09 | 전체 평가 프롬프트 (차원별 블록 + JSON 스키마) | 🟢 GREEN | `buildPrompt()` — dimensionTypes 기반 동적 생성, 설계와 구조 동일 |
| G10 | 부분 재평가 프롬프트 | 🟢 GREEN | `buildPartialPrompt()` — 영향 차원만 포함 |
| G11 | LLM 파라미터 (model, temperature, max_tokens) | 🟢 GREEN | gpt-4.1, temperature 0.1, maxTokens 600/400 |
| G12 | JSON 응답 파서 (markdown fence 제거) | 🟢 GREEN | `parseJsonFromLLM()` — fence 제거 + fallback 파싱. 실패 시 score 0 |

### 4. UI 컴포넌트 (설계 §5)

| # | 설계 항목 | 상태 | 근거 |
|---|----------|------|------|
| G13 | `AmbiguityGauge.tsx` — 프로그레스 바 + 차원 카드 + 안내 메시지 | 🟢 GREEN | 설계와 동일 구조. 추가로 dark mode 지원. 📊 이모지 미사용(미미한 차이) |
| G14 | `DimensionCard.tsx` — 점수·색상·N/A 표시 | 🟡 YELLOW | 구현됨. 차이: 설계는 `score.toFixed(1) + statusIcon(🟢/🟡/🔴)` 포맷, 구현은 `(score*10).toFixed(1)` 10점 스케일 + 이모지 미사용. 기능적 차이 없음 |
| G15 | `GateBlocker.tsx` — 모달 + SuggestionCard + 보충하기/생성하기 버튼 | 🟢 GREEN | 설계와 동일. block 시 "그래도 생성하기" 숨김, warn 시 표시. "이 질문에 답변하기 →" 동작 |

### 5. PRD 생성 게이트 (설계 §6)

| # | 설계 항목 | 상태 | 근거 |
|---|----------|------|------|
| G16 | 클라이언트 게이트 체크 (block→모달, warn→모달+force, pass→generate) | 🟢 GREEN | `handleGenerateClick()` — 정확히 3분기 처리. `showGateBlocker` state로 모달 제어 |
| G17 | Feature Flag `AMBIGUITY_SCORE_ENABLED` | 🔴 RED | **미구현**. 설계에서는 환경변수 기반 비활성화를 명시했으나, 구현에 해당 플래그 없음. 게이트는 항상 동작 |

### 6. DB 스키마 + 마이그레이션 (설계 §7~8)

| # | 설계 항목 | 상태 | 근거 |
|---|----------|------|------|
| G18 | `prds` 테이블 3컬럼 (ambiguity_score, dimension_scores, project_type) | 🟢 GREEN | Drizzle 스키마 + 마이그레이션 SQL 일치. `tests/helpers/db.ts`에도 `0069_ambiguity_score.sql` 추가됨 |

### 7. API 라우트 (설계 §9)

| # | 설계 항목 | 상태 | 근거 |
|---|----------|------|------|
| G19 | `POST /api/prd-studio/:id/ambiguity` (평가 요청 API) | 🟡 YELLOW | **구현되었으나 경로명과 일부 로직 차이**. 설계: `api.prd-studio.$id.ambiguity.ts` (소유자 검증, DRAFT 상태 검증, 최소 3개 답변, 부분 재평가 지원, FallbackContext). 구현: `api.prd-studio.$id.evaluate-ambiguity.ts` (경로명 다름, 소유자 검증 없음, DRAFT 상태 검증 없음, 최소 1개 답변, 부분 재평가 미지원, FallbackContext 미사용). 핵심 기능(평가+저장+이벤트)은 동작하지만 설계의 접근 제어·부분 재평가가 누락됨 |

### 8. 이벤트 추적 (설계 §10)

| # | 설계 항목 | 상태 | 근거 |
|---|----------|------|------|
| G20 | 이벤트 3종 (ambiguity_evaluated, gate_passed, gate_warned) | 🟡 YELLOW | `PrdEventType`에 3종 추가 완료. API 라우트에서 `ambiguity_evaluated`와 `gate_passed`/`gate_warned` 기록됨. 그러나 설계에서 명시한 `useEventTracking` 훅 확장(클라이언트 측 trackGatePassed/trackGateWarned)은 **미구현**. 현재는 서버 측 API에서만 이벤트 기록 |

### 9. 타입 정의 (설계 §11)

해당 항목은 GREEN 항목에 포함 (G02의 타입 참조).

- `DimensionType`, `ProjectType`, `GateStatus`, `DimensionScore`, `AmbiguityResult`, `AmbiguityConfig`, `DimensionScoresJson`, `DimensionScoreEntry` — 모두 `types/index.ts`에 설계와 동일하게 구현
- `UpdatePrdInput` 확장 — ambiguityScore, dimensionScores, projectType 필드 추가 완료

### 10. 추가 누락 항목

| # | 설계 항목 | 상태 | 근거 |
|---|----------|------|------|
| — | `useAmbiguityScore` 훅 (설계 §1.2) | 🔴 RED | 설계에서 `hooks/useAmbiguityScore.ts`로 명시(점수 fetch + 캐싱 + 섹션 저장 후 재평가 트리거). **미구현** — 현재는 `prd-studio.$id.tsx`에서 `ambiguityFetcher`로 직접 처리 |
| — | `PrdStudioService.saveAmbiguityScore()` / `getAmbiguityScore()` 전용 메서드 (설계 §9.3) | — | 서비스에 전용 메서드 대신 기존 `update()` 메서드로 저장. 기능적으로 동일하므로 GAP에 포함하지 않음 |

---

## GREEN 항목 (15/20)

| # | 항목 | 구현 파일 |
|---|------|----------|
| G01 | AmbiguityScorer 모듈 위치 | `app/features/prd-studio/lib/ambiguity-scorer.ts` |
| G02 | AmbiguityScorer 클래스 + evaluate() | 위와 동일 |
| G03 | evaluatePartial() 부분 재평가 | 위와 동일 |
| G04 | detectProjectType() 판별 | 위와 동일 |
| G05 | DIMENSION_WEIGHTS 가중치 | 위와 동일 |
| G06 | DIMENSION_TO_SECTIONS 매핑 | 위와 동일 |
| G07 | SECTION_TO_DIMENSION_MAP 역매핑 | 위와 동일 |
| G08 | 시스템 프롬프트 | 위와 동일 |
| G09 | 전체 평가 프롬프트 | 위와 동일 |
| G10 | 부분 재평가 프롬프트 | 위와 동일 |
| G11 | LLM 파라미터 | 위와 동일 |
| G12 | JSON 응답 파서 | 위와 동일 |
| G13 | AmbiguityGauge 컴포넌트 | `app/features/prd-studio/ui/AmbiguityGauge.tsx` |
| G15 | GateBlocker 컴포넌트 | `app/features/prd-studio/ui/GateBlocker.tsx` |
| G16 | 클라이언트 게이트 체크 | `app/routes/prd-studio.$id.tsx` |
| G18 | DB 스키마 + 마이그레이션 | `schema.ts` + `0069_ambiguity_score.sql` + `tests/helpers/db.ts` |

## YELLOW 항목 (3/20)

| # | 항목 | 차이 | 영향 | 우선순위 |
|---|------|------|------|----------|
| G14 | DimensionCard 점수 표시 포맷 | 설계: `0.9 🟢`, 구현: `9.0` (10점 스케일, 이모지 미사용) | Low — UX 차이 미미, 색상으로 상태 전달 | Low |
| G19 | API 라우트 경로명 + 접근 제어 | 경로명 차이(`ambiguity` vs `evaluate-ambiguity`), 소유자 검증·DRAFT 상태 검증·최소 3개 답변·부분 재평가·FallbackContext 누락 | Medium — 보안(소유자 검증) + 기능(부분 재평가) | Medium |
| G20 | 이벤트 추적 확장 | PrdEventType 추가 완료, 서버 측 기록 동작. 클라이언트 측 `useEventTracking` 훅 확장 미구현 | Low — 서버 측에서 이미 기록되므로 기능적 영향 없음 | Low |

## RED 항목 (2/20)

| # | 항목 | 미구현 내용 | 영향 | 우선순위 |
|---|------|-----------|------|----------|
| G17 | Feature Flag | `AMBIGUITY_SCORE_ENABLED` 환경변수 미적용. 게이트 비활성화 불가 | Medium — 운영 중 기능 토글 불가. 현재 F50 자체가 P3이므로 즉시 필요성은 낮음 | Low |
| — | `useAmbiguityScore` 훅 | 설계에서 명시한 전용 훅 미구현 (점수 캐싱, 섹션 저장 후 자동 재평가 트리거) | Medium — 현재는 수동 "새로고침" 버튼만 동작. 자동 재평가가 없으면 UX 편의성 저하 | Medium |

---

## 테스트 현황

| 카테고리 | 설계 예상 | 구현 실제 | 상태 |
|---------|----------|----------|------|
| 단위 (scorer + parser + detector) | 25개 | 15개 | 🟡 YELLOW |
| 통합 (API 라우트) | 8개 | 0개 | 🔴 RED |
| 게이트 로직 | 6개 | 0개 | 🔴 RED |
| UI 컴포넌트 | 10개 | 0개 | 🔴 RED |
| **합계** | **49개** | **15개** | — |

### 구현된 테스트 15개 상세

| describe | 테스트 | 파일 |
|----------|--------|------|
| detectProjectType | background 없으면 greenfield, 키워드 2개+ brownfield, 키워드 1개 greenfield, 빈 answer greenfield | `ambiguity-scorer.test.ts` |
| evaluate | greenfield 3차원 + context N/A, brownfield 4차원 | 위와 동일 |
| weighted score | 모든 1.0 → clarity 100%, 낮은 점수 → block | 위와 동일 |
| gate status | ≤0.2 pass, 0.2~0.4 warn | 위와 동일 |
| response parsing | markdown fence JSON 파싱, 잘못된 JSON fallback | 위와 동일 |
| evaluatePartial | 변경 차원만 업데이트 + 나머지 유지 | 위와 동일 |
| custom config | gateThreshold/warnThreshold 커스텀 | 위와 동일 |

### 테스트 갭

- **단위 테스트**: 핵심 로직(가중 계산, 게이트 판정, 프로젝트 판별, 파싱, 부분 재평가) 커버. `collectSectionTexts`, `getAffectedDimensions` 개별 테스트 미작성 (간접 테스트됨)
- **통합 테스트**: API 라우트 테스트 0개. 인증·소유자 검증·에러 핸들링 미커버
- **UI 테스트**: 3개 컴포넌트(AmbiguityGauge, DimensionCard, GateBlocker) 렌더링 테스트 없음
- **게이트 로직 테스트**: prd-studio.$id.tsx의 `handleGenerateClick` 게이트 분기 테스트 없음

---

## Recommendations

### P1 (Medium — 보안·기능)

1. **API 접근 제어 보강 (G19)**
   - `evaluate-ambiguity.ts`에 소유자 검증 (`prd.createdBy !== ctx.user.id`) 추가
   - DRAFT 상태 검증 추가 (GENERATED 이후 평가 불필요)
   - 최소 답변 수 3개로 상향 (현재 1개)
   - FallbackContext 전달로 AI 비용 추적 연동

2. **부분 재평가 API 지원 (G19)**
   - request body에서 `{ partial: true, changedSection: "objectives" }` 수신
   - 기존 dimension_scores가 있으면 `evaluatePartial()` 호출

3. **`useAmbiguityScore` 훅 구현 또는 인라인 자동화**
   - 섹션 저장 debounce 후 변경 차원 자동 부분 재평가
   - 현재 수동 "새로고침"만 동작하므로 UX 개선 효과

### P2 (Low — 운영·추적)

4. **Feature Flag (G17)**: 환경변수 `AMBIGUITY_SCORE_ENABLED` 추가. false면 게이지·게이트 미표시
5. **이벤트 추적 훅 확장 (G20)**: `useEventTracking`에 trackGatePassed/trackGateWarned 추가 (현재 서버에서만 기록)
6. **통합 테스트**: API 라우트 인증·에러 케이스 8개
7. **UI 테스트**: AmbiguityGauge, GateBlocker 렌더링 5+5개

### P3 (Low — 미미한 차이)

8. **DimensionCard 포맷 (G14)**: 10점 스케일 vs 1.0 스케일 — 현재 구현도 충분히 직관적이므로 선택 사항

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-18 | Initial — F50 Ambiguity Score Gap Analysis. 20항목 분석: GREEN 15, YELLOW 3, RED 2. Overall 88% | Sinclair Seo |
