# AX BD PoC Gap Analysis Report

> **Feature**: ax-bd-poc
> **Analysis Date**: 2026-02-10
> **Design Doc**: `docs/02-design/features/ax-bd-poc.design.md` (v0.2)
> **Plan Doc**: `docs/01-plan/features/ax-bd-poc.plan.md`

---

## 1. Executive Summary

### Architecture Divergence (핵심 발견)

Design 문서(v0.2)와 실제 구현 사이에 **의도적인 아키텍처 차이**가 존재합니다:

| 항목 | Design (v0.2) | Implementation (Plan 기반) |
|------|--------------|---------------------------|
| 아키텍처 | Feature Module (`app/features/workspace/`) | Core table extension (기존 테이블 확장) |
| 데이터 모델 | 7개 `ws_*` 신규 테이블 | 1개 신규 + 6개 컬럼 추가 |
| 라우트 | `/workspace/*`, `/team-ideas/*` | 기존 `_index.tsx` + `/radar` 수정 |
| Vectorize | `VECTORIZE_WORKSPACE` | `VECTORIZE_RADAR` |

**구현은 Plan 문서를 충실히 따랐으며, 모든 기능 요구사항이 충족됨.**

### Match Rate

| 비교 대상 | Match Rate | 판정 |
|-----------|:----------:|------|
| vs Design Document (v0.2) | **35%** | 아키텍처 불일치 |
| vs Plan Document | **92%** | OK |
| Functional Requirements (FR) | **91%** | OK (11/12, FR-12 out of scope) |

---

## 2. Functional Requirements

| FR | 요구사항 | 구현 | 테스트 | 상태 |
|----|---------|------|--------|------|
| FR-01 | 사용자별 소스 수집 | `radarSources.userId` + 필터 | I-12, I-13 | ✅ |
| FR-02 | 소스 열람 상태 관리 | `radar_item_user_status` UPSERT | I-14~I-17 | ✅ |
| FR-03 | 클릭 시 즉시 요약 | `api.radar.summarize.ts` + GPT | I-18~I-21 | ✅ |
| FR-04 | 소스 기반 대화 시작 | `conversations.sourceItemId` | I-25~I-27 | ✅ |
| FR-05 | 연관 소스 추천 | `api.similar-sources.ts` + Vectorize | I-22~I-24 | ✅ |
| FR-06 | 워크스페이스 히스토리 | 기존 conversations 재사용 | (기존 테스트) | ✅ |
| FR-07 | 아이디어 후보 자동 생성 | `generate_idea_candidates` 도구 | I-01~I-04 | ✅ |
| FR-08 | 아이디어 후보 선택 | `select_idea_candidate` 도구 | I-05~I-08 | ✅ |
| FR-09 | 템플릿 자동 채움 | `auto_fill_template` 도구 | I-09~I-11 | ✅ |
| FR-10 | 템플릿 수동 편집 | `discoveries_.$id.edit.tsx` 필드 추가 | (테스트 없음) | ⚠️ |
| FR-11 | 3-Pane 메인 레이아웃 | `_index.tsx` SourcePanel+Chat+Summary | (E2E 없음) | ⚠️ |
| FR-12 | 팀 토론 뷰 | Out of scope (EPIC 5) | - | N/A |

---

## 3. Agent Tools

| 도구 | 스키마 | DB 로직 | 이벤트 로깅 | autonomy | 상태 |
|------|--------|---------|------------|:--------:|------|
| `generate_idea_candidates` | ✅ | ✅ | - | 2 | ✅ |
| `select_idea_candidate` | ✅ | ✅ | ✅ candidate_selected/dropped | 2 | ✅ |
| `auto_fill_template` | ✅ | ✅ | ✅ template_filled | 2 | ✅ |

**sourceContext 경로**: conversation → radarItem → buildSystemPrompt → Agent 응답

| 구간 | 파일 | 상태 |
|------|------|------|
| DB 조회 | `executor.ts:332-354` | ✅ |
| 프롬프트 삽입 | `system-prompt.ts:221-234` | ✅ |
| null 안전성 | try-catch 래핑 | ✅ |

---

## 4. API Endpoints

| 엔드포인트 | 메서드 | 구현 파일 | 상태 |
|-----------|--------|----------|------|
| `/api/radar/sources` (수정) | GET | `api.radar.sources.ts` | ✅ userId 필터 |
| `/api/radar/sources` (수정) | POST | `api.radar.sources.ts` | ✅ keywords, radarTags |
| `/api/radar/items/:id/status` (신규) | PATCH | `api.radar.items.$id.status.ts` | ✅ |
| `/api/radar/summarize` (신규) | POST | `api.radar.summarize.ts` | ✅ |
| `/api/similar-sources` (신규) | GET | `api.similar-sources.ts` | ✅ |
| `/api/conversations` (수정) | POST | `api.conversations.ts` | ✅ sourceItemId |

---

## 5. Data Model (vs Plan)

| 변경 | 테이블 | 상태 |
|------|--------|------|
| `radarSources` + userId, keywords, radarTags | 기존 확장 | ✅ |
| `radarItems` + keyPoints, embeddingUpdatedAt | 기존 확장 | ✅ |
| `radar_item_user_status` (신규) | 1개 신규 | ✅ |
| `conversations` + sourceItemId | 기존 확장 | ✅ |
| `discoveries` + targetSegment, valueProposition, candidateGroupId | 기존 확장 | ✅ |
| Migration `0020_bd_poc_refactoring.sql` | drizzle/ | ✅ |
| Test helper 동기화 | `tests/helpers/db.ts:45` | ✅ |

---

## 6. Test Coverage

### 6.1 테스트 현황

| 파일 | 건수 | 유형 | 상태 |
|------|:----:|------|------|
| `tool-registry-bd.test.ts` | 3 | Unit | ✅ |
| `system-prompt-bd.test.ts` | 5 | Unit | ✅ |
| `bd-poc-tools.test.ts` | 11 | Integration | ✅ |
| `executor-source-context.test.ts` | 3 | Integration | ✅ |
| `radar-bd.test.ts` | 13 | Integration | ✅ |
| `sync.test.ts` (+I-28) | 1 | Integration | ✅ |
| **BD PoC 합계** | **36** | | ✅ |
| **전체 테스트** | **597** | | ✅ Regression 없음 |

### 6.2 미비 항목

| 항목 | 이유 | 우선순위 |
|------|------|---------|
| FR-10 수동 편집 테스트 | Remix form 통합 테스트 복잡도 | P2 |
| FR-11 3-Pane E2E | Playwright 필요 (배포 후 검증) | P2 |
| FR-06 히스토리 전용 테스트 | 기존 conversation 테스트로 커버 | P3 |

---

## 7. Gap 목록

### 7.1 Design vs Implementation Gap (아키텍처 차이)

이들은 의도적 설계 차이이며, Design 문서 업데이트로 해소 가능:

| # | Gap | Design | Implementation | 영향도 |
|---|-----|--------|----------------|--------|
| G-01 | Feature Module 미존재 | `app/features/workspace/` | 기존 테이블 확장 | HIGH (의도적) |
| G-02 | `ws_*` 7개 테이블 미존재 | 신규 테이블 7개 | 1개 신규 + 확장 | HIGH (의도적) |
| G-03 | `/workspace` 라우트 미존재 | 전용 라우트 | `_index.tsx` 통합 | MEDIUM (의도적) |
| G-04 | Team 기능 미구현 | `/team-ideas/*` | Out of scope | LOW (계획대로) |
| G-05 | 컴포넌트 위치 상이 | `features/workspace/ui/` | `components/chat/` | LOW |
| G-06 | Vectorize 바인딩명 상이 | `VECTORIZE_WORKSPACE` | `VECTORIZE_RADAR` | LOW |

### 7.2 실질적 Gap (코드 보완 필요)

| # | Gap | 설명 | 우선순위 |
|---|-----|------|---------|
| G-07 | E2E 테스트 부재 | 3-Pane 레이아웃 Playwright 테스트 없음 | P2 |
| G-08 | 수동 편집 테스트 부재 | FR-10 targetSegment/valueProposition 편집 검증 없음 | P2 |

---

## 8. 권장 사항

### Option A: Design 문서 현행화 (권장)

구현이 Plan을 충실히 따랐고 모든 FR이 충족되므로, **Design 문서를 실제 구현에 맞게 업데이트**하는 것을 권장합니다.

1. `ax-bd-poc.design.md`를 Core Table Extension 아키텍처로 재작성
2. `ws_*` 테이블/라우트 참조 제거
3. 실제 구현된 스키마/API/컴포넌트로 갱신
4. E2E 테스트 플랜 추가

### 즉시 조치 항목

| 순위 | 항목 | 예상 노력 |
|------|------|----------|
| 1 | Design 문서 현행화 | 1시간 |
| 2 | E2E 테스트 추가 (3-Pane) | 30분 |
| 3 | Plan 문서 FR 상태 갱신 | 15분 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-02-10 | Initial gap analysis | Claude |
