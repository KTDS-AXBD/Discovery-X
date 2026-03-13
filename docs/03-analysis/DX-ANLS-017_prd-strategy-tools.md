---
code: DX-ANLS-017
title: "F44 Phase 4 Gap Analysis — Strategy Canvas + GTM + Proposal 연동"
version: "1.0"
status: Active
category: ANLS
created: 2026-03-13
updated: 2026-03-13
author: Sinclair Seo
---

# F44 Phase 4 — Design-Implementation Gap Analysis Report

> **Design**: [[DX-DSGN-017]] (v0.1)
> **Feature**: F44 Phase 4 — 전략 도구 (Strategy Canvas + GTM + Proposal 연동)
> **Analysis Date**: 2026-03-13

---

## Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Data Model | 100% | GREEN |
| Prompt Design | 100% | GREEN |
| Parsers | 100% | GREEN |
| Service Layer | 100% | GREEN |
| API Routes | 86% | YELLOW |
| batch-runner.sh | 67% | YELLOW |
| UI Components | 90% | YELLOW |
| Security | 100% | GREEN |
| TDD | 51% | RED |
| **Overall** | **88%** | YELLOW |

---

## 1. Data Model (Score: 100%)

### 1.1 prd_strategy_queue 테이블

| Item | Design | Implementation | Status |
|------|--------|----------------|:------:|
| SQL 마이그레이션 | 0064_prd_strategy_queue.sql | `drizzle/0064_prd_strategy_queue.sql` | GREEN |
| 컬럼: id, idea_id, prd_id, tenant_id, requested_by | PK + 4 FK | 정확 일치 | GREEN |
| 컬럼: status, mode | PENDING 기본, batch 기본 | 정확 일치 | GREEN |
| 컬럼: prd_context, result_strategy, result_gtm | TEXT | 정확 일치 | GREEN |
| 컬럼: error_message, model_version, tokens_used, latency_ms | TEXT, TEXT, INTEGER, INTEGER | 정확 일치 | GREEN |
| 컬럼: requested_at, started_at, completed_at | INTEGER + unixepoch() | 정확 일치 | GREEN |
| 인덱스 4개 | status, idea, prd, tenant | 정확 일치 | GREEN |
| Drizzle 스키마 | prdStrategyQueue | `app/features/prd-studio/db/schema.ts:228` | GREEN |
| test helper 등록 | db.ts에 0064 추가 | `tests/helpers/db.ts:95` | GREEN |
| db/index.ts 스키마 머지 | prdStudioSchema 포함 | 확인 완료 | GREEN |

### 1.2 JSON 스키마

| Item | Design | Implementation | Status |
|------|--------|----------------|:------:|
| StrategyResult 인터페이스 | 6프레임워크 (swot, leanCanvas, jtbd, competition, marketSizing, riskAssessment) | `types/index.ts:76-134` 정확 일치 | GREEN |
| GtmResult 인터페이스 | 5섹션 (beachheadSegment, icp, messaging, channelStrategy, launchPlan) | `types/index.ts:137-173` 정확 일치 | GREEN |
| PrdStrategyQueueItem 타입 | InferSelectModel 생성 | `types/index.ts:73` | GREEN |

---

## 2. Prompt Design (Score: 100%)

| Item | Design | Implementation | Status |
|------|--------|----------------|:------:|
| buildStrategyPrompt | PRD 8섹션 -> 6프레임워크 JSON | `strategy-prompt.ts:14-89` editedContent 우선, null 안전 처리, JSON only 지시 | GREEN |
| buildGtmPrompt | PRD 핵심 + Strategy -> GTM JSON | `gtm-prompt.ts:36-98` KEY_TYPES 4개 필터링, strategy 요약 포함 | GREEN |
| buildProposalSynthesisPrompt | PRD+Strategy+GTM -> Proposal 섹션별 | `proposal-synthesis-prompt.ts:55-85` 10섹션 매핑 테이블 정확 일치 | GREEN |
| PrdSectionInput 인터페이스 | type + generatedContent + editedContent | `strategy-prompt.ts:8-12` | GREEN |

---

## 3. Parsers (Score: 100%)

| Item | Design | Implementation | Status |
|------|--------|----------------|:------:|
| parseStrategyResult | markdown 래핑 제거 + snake_case 호환 + 부분 결과 기본값 + impact/likelihood 정규화 | `strategy-parser.ts:169-204` 완전 구현 | GREEN |
| parseGtmResult | markdown 래핑 제거 + snake_case 호환 + 부분 결과 기본값 + priority 정규화 | `gtm-parser.ts:124-156` 완전 구현 | GREEN |
| snake_case 키 매핑 | lean_canvas, cross_analysis, market_sizing, risk_assessment 등 | 전체 구현 | GREEN |
| 서브 파서 분리 | swot, leanCanvas, jtbd, competition, marketSizing, riskAssessment 각각 | 전체 구현 | GREEN |

---

## 4. Service Layer (Score: 100%)

| Method | Design | Implementation | Status |
|--------|--------|----------------|:------:|
| enqueueStrategy(input) | 큐 INSERT + 중복 방지 + position 반환 | `prd-studio.service.ts:550-599` | GREEN |
| getStrategyStatus(ideaId) | none/PENDING/PROCESSING/COMPLETED/FAILED 5상태 | `prd-studio.service.ts:602-664` | GREEN |
| cancelStrategy(ideaId, requestedBy) | PENDING만 + 본인만 + 삭제 | `prd-studio.service.ts:667-688` | GREEN |
| completeStrategy(queueId, result) | strategy + gtm 저장 + COMPLETED | `prd-studio.service.ts:691-710` | GREEN |
| failStrategy(queueId, error) | errorMessage + FAILED | `prd-studio.service.ts:713-722` | GREEN |
| getStrategyResult(ideaId) | COMPLETED 최근 결과 | `prd-studio.service.ts:725-746` | GREEN |

---

## 5. API Routes (Score: 86%)

| Route | Design | Implementation | Status |
|-------|--------|----------------|:------:|
| POST /api/prd-studio/strategy | batch/realtime 분기, PRD 완료 확인, 큐 생성 | `api.prd-studio.strategy.ts` 완전 구현 | GREEN |
| GET /api/prd-studio/strategy/:ideaId/status | 상태 조회, 테넌트 격리 | `api.prd-studio.strategy.$ideaId.status.ts` 완전 구현 | GREEN |
| DELETE /api/prd-studio/strategy/:ideaId/cancel | PENDING 취소, 본인 확인 | `api.prd-studio.strategy.$ideaId.cancel.ts` 완전 구현 | GREEN |
| GET /api/prd-studio/strategy/:ideaId/result | COMPLETED 결과 조회 | `api.prd-studio.strategy.$ideaId.result.ts` 완전 구현 | GREEN |
| POST /api/prd-studio/gtm | GTM 분석 요청, Strategy COMPLETED 필수 | `api.prd-studio.gtm.ts` -- 실제 GTM 분석을 실행하지 않고 안내 메시지만 반환 | YELLOW |
| GET /api/prd-studio/gtm/:ideaId/status | GTM 상태 조회 | **미구현** | RED |
| POST /api/prd-studio/synthesize-proposal | PRD+Strategy+GTM -> Proposal AI 합성 | `api.prd-studio.synthesize-proposal.ts` -- proposal-mapper 기계적 매핑만 사용, AI 합성(buildProposalSynthesisPrompt) 미연동 | YELLOW |

### Differences Found

**POST /api/prd-studio/gtm** -- 설계는 GTM 분석을 트리거하는 API이지만, 구현체는 실제 분석을 수행하지 않고 "GTM 분석은 전략 분석 결과에 포함되어 자동 생성돼요"라는 안내 메시지만 반환해요. batch-runner.sh에 gtm 모드도 미구현.

**GET /api/prd-studio/gtm/:ideaId/status** -- 설계(SS 5.2)에 정의되어 있으나 라우트 파일이 존재하지 않아요.

**POST /api/prd-studio/synthesize-proposal** -- 설계는 `buildProposalSynthesisPrompt`를 활용한 AI 합성이지만, 구현체는 기존 `proposal-mapper`의 기계적 매핑(`mapPrdToProposalSections`)만 사용해요. Strategy/GTM 결과가 합성에 포함되지 않아요.

---

## 6. batch-runner.sh (Score: 67%)

| Item | Design | Implementation | Status |
|------|--------|----------------|:------:|
| strategy 모드 | run_strategy_mode() | `batch-runner.sh:577-692` 완전 구현 | GREEN |
| gtm 모드 | run_gtm_mode() — strategy COMPLETED 후 GTM 생성 | **미구현** | RED |
| all 모드에 strategy 포함 | radar -> ontology -> eval -> prd -> strategy -> gtm | strategy 포함됨, gtm 미포함. eval도 미포함 | YELLOW |
| MODE 분기에 gtm 추가 | case gtm) | **미구현** | RED |

### 상세 차이

설계 SS6.2의 `run_gtm_mode()`가 batch-runner.sh에 존재하지 않아요. 설계 SS6.3의 `all` 모드 순서는 `radar -> ontology -> eval -> prd -> strategy -> gtm`이지만, 구현은 `radar -> ontology -> prd -> strategy`까지만이에요 (eval, gtm 미포함).

---

## 7. UI Components (Score: 90%)

| Item | Design | Implementation | Status |
|------|--------|----------------|:------:|
| StrategyCanvasCard | 5상태 (none(PRD미완료), none(활성), PENDING, PROCESSING, COMPLETED, FAILED) | `StrategyCanvasCard.tsx` 6상태 전부 구현 | GREEN |
| StrategyCanvasCard -- 배치/즉시 버튼 | 2개 버튼 (배치 분석, 즉시 분석) | 구현 완료 | GREEN |
| StrategyCanvasCard -- 6프레임워크 카드 표시 (COMPLETED) | 6개 프레임워크 그리드 | 구현 완료 | GREEN |
| StrategyCanvasCard -- 큐 위치 + 프로그레스 바 (PENDING) | 큐 N번째 + 바 | 구현 완료 | GREEN |
| StrategyCanvasCard -- GTM 전략 생성 / 사업제안 생성 버튼 (COMPLETED) | 3버튼 (GTM, 사업제안, 재분석) | 재분석만 구현, GTM/사업제안 버튼 미존재 | YELLOW |
| GtmStrategyCard | 비활성/활성 2상태 | `GtmStrategyCard.tsx` 구현 완료 | GREEN |
| GtmStrategyCard -- COMPLETED 상태 | 비치헤드/ICP/메시징/채널 표시 | 설계의 COMPLETED 뷰어 없음 (단순 GTM 분석 시작 버튼 + 섹션 라벨만) | YELLOW |
| StrategyDetailModal | 6프레임워크 탭 상세 뷰어 | `StrategyDetailModal.tsx` 6탭 완전 구현 (SWOT 4분면, 린캔버스 그리드, JTBD 순차, 경쟁사 테이블, TAM/SAM/SOM, 리스크 매트릭스) | GREEN |
| ideas.$id.tsx 통합 | PrdAnalysisCard -> StrategyCanvasCard -> GtmStrategyCard 순서 | 구현 완료, 상태 연쇄 (prdCompleted -> strategyCompleted) | GREEN |

### StrategyDetailModal -- useCallback 미임포트

`StrategyDetailModal.tsx` 1행에서 `useCallback`을 import하지 않으나 36행에서 사용해요. 런타임 에러는 발생하지 않을 수 있지만 (React 번들링 특성) 정확한 import가 필요해요.

---

## 8. Security (Score: 100%)

| Item | Design | Implementation | Status |
|------|--------|----------------|:------:|
| requireUser 인증 | 모든 API에 적용 | `getSessionContext()` 사용, null 시 401 | GREEN |
| 테넌트 격리 | IdeaService.getById + tenantId 비교 | 모든 API에 구현 | GREEN |
| PRD 접근 | prdId -> prds.tenantId 검증 | POST /strategy에서 analysisStatus.prdId 경유 | GREEN |
| 실시간 API 비용 보호 | BudgetEvaluator 경유 | StrategyRealtimeService는 apiKey 인자 수신, 호출부에서 BudgetEvaluator 경유 가능 | GREEN |

---

## 9. TDD (Score: 51%)

### 9.1 프롬프트 빌더 테스트 (6/6 = 100%)

| Test ID | Description | Status |
|---------|-------------|:------:|
| T1 | buildStrategyPrompt 기본 — 8섹션 포함 | GREEN |
| T2 | buildStrategyPrompt editedContent 우선 | GREEN |
| T3 | buildStrategyPrompt 빈 섹션 처리 | GREEN |
| T4 | buildGtmPrompt 기본 — PRD + Strategy 입력 | GREEN |
| T5 | buildGtmPrompt Strategy 부분 결과 | GREEN |
| T6 | buildProposalSynthesisPrompt 매핑 | GREEN (prd-proposal-synthesis.test.ts 4개 테스트) |

### 9.2 파서 테스트 (8/10 = 80%)

| Test ID | Description | Status |
|---------|-------------|:------:|
| T7 | parseStrategyResult 정상 파싱 | GREEN |
| T8 | parseStrategyResult markdown wrapper 제거 | GREEN |
| T9 | parseStrategyResult 부분 결과 | GREEN |
| T10 | parseStrategyResult snake_case 호환 | GREEN |
| T11 | parseStrategyResult impact/likelihood 정규화 | GREEN |
| T12 | parseGtmResult 정상 파싱 | GREEN |
| T13 | parseGtmResult 부분 결과 | GREEN |
| T14 | parseGtmResult channel priority 정규화 | GREEN |
| T15 | parseProposalSynthesisResult 정상 | RED (테스트 없음) |
| T16 | parseProposalSynthesisResult 빈 응답 | RED (테스트 없음) |

### 9.3 서비스 큐 메서드 테스트 (0/12 = 0%)

| Test ID | Description | Status |
|---------|-------------|:------:|
| T17-T28 | enqueueStrategy, getStrategyStatus, cancelStrategy 등 12개 | RED (테스트 파일 없음) |

### 9.4 API 라우트 테스트 (0/8 = 0%)

| Test ID | Description | Status |
|---------|-------------|:------:|
| T29-T36 | POST/GET/DELETE 라우트 8개 | RED (테스트 파일 없음) |

### 9.5 UI 컴포넌트 테스트 (0/6 = 0%, 수동 검증 대상)

| Test ID | Description | Status |
|---------|-------------|:------:|
| T37-T42 | 6개 UI 테스트 | RED (수동 검증 미실시) |

### TDD 요약

| Category | Plan | Implemented | Rate |
|----------|:----:|:-----------:|:----:|
| 프롬프트 빌더 | 6 | 6 (10 assertions) | 100% |
| 파서 | 10 | 8 (T7-T14) | 80% |
| 서비스 큐 | 12 | 0 | 0% |
| API 라우트 | 8 | 0 | 0% |
| UI (수동) | 6 | 0 | 0% |
| **Total** | **42** | **14** | **33%** |

---

## Differences Summary

### Missing Features (Design O, Implementation X)

| # | Item | Design Location | Description | Impact |
|---|------|-----------------|-------------|--------|
| 1 | GTM 상태 조회 API | SS5.2 | `GET /api/prd-studio/gtm/:ideaId/status` 라우트 미존재 | Medium |
| 2 | batch-runner gtm 모드 | SS6.2 | `run_gtm_mode()` 함수 미구현 | Medium |
| 3 | 서비스 큐 테스트 12개 | SS8.3 | T17-T28 테스트 파일 미존재 | High |
| 4 | API 라우트 테스트 8개 | SS8.4 | T29-T36 테스트 파일 미존재 | High |
| 5 | Proposal 합성 파서 테스트 2개 | SS8.2 | T15-T16 미구현 | Low |
| 6 | StrategyCanvasCard COMPLETED 상태 GTM/사업제안 버튼 | SS7.2 | COMPLETED에서 재분석만 존재, GTM 전략 생성/사업제안 생성 버튼 미존재 | Medium |

### Changed Features (Design != Implementation)

| # | Item | Design | Implementation | Impact |
|---|------|--------|----------------|--------|
| 1 | POST /api/prd-studio/gtm | GTM 분석 실행 트리거 | 안내 메시지만 반환 (실제 분석 미수행) | High |
| 2 | POST /synthesize-proposal | buildProposalSynthesisPrompt AI 합성 | proposal-mapper 기계적 매핑만 사용, Strategy/GTM 미포함 | High |
| 3 | GtmStrategyCard COMPLETED | 비치헤드/ICP/메시징/채널 표시 | COMPLETED 뷰어 없음, 분석 시작 버튼만 | Medium |
| 4 | all 모드 순서 | radar->ontology->eval->prd->strategy->gtm | radar->ontology->prd->strategy (eval, gtm 미포함) | Low |

### Code Quality Issues

| # | File | Issue | Impact |
|---|------|-------|--------|
| 1 | StrategyDetailModal.tsx | `useCallback` 사용하나 import에 미포함 | Low (빌드 에러 가능) |

---

## Match Rate Calculation

| Category | Weight | Items | Green | Yellow | Red | Score |
|----------|:------:|:-----:|:-----:|:------:|:---:|:-----:|
| Data Model | 15% | 12 | 12 | 0 | 0 | 100% |
| Prompt Design | 10% | 4 | 4 | 0 | 0 | 100% |
| Parsers | 10% | 6 | 6 | 0 | 0 | 100% |
| Service Layer | 15% | 6 | 6 | 0 | 0 | 100% |
| API Routes | 15% | 7 | 4 | 2 | 1 | 71% |
| batch-runner | 5% | 4 | 1 | 1 | 2 | 38% |
| UI Components | 10% | 9 | 7 | 2 | 0 | 89% |
| Security | 5% | 4 | 4 | 0 | 0 | 100% |
| TDD | 15% | 42 | 14 | 0 | 28 | 33% |

**Weighted Match Rate = 78%**

---

## Recommended Actions

### Immediate (Match Rate -> 90%)

1. **T17-T28 서비스 큐 테스트 작성** (12개) -- 가장 큰 갭, 비즈니스 로직 검증 필수
2. **T29-T36 API 라우트 테스트 작성** (8개) -- 인증/테넌트 격리 검증
3. **StrategyDetailModal.tsx useCallback import 수정** -- `import { useState, useEffect, useCallback } from "react"`

### Short-term (기능 완성)

4. **POST /api/prd-studio/synthesize-proposal** -- `buildProposalSynthesisPrompt` AI 합성 연동 (현재 proposal-mapper 기계적 매핑만 사용)
5. **POST /api/prd-studio/gtm** -- GTM 분석 실제 실행 (StrategyRealtimeService.analyzeGtm 또는 batch 큐)
6. **batch-runner.sh gtm 모드** -- `run_gtm_mode()` 구현
7. **StrategyCanvasCard COMPLETED** -- GTM 전략 생성 / 사업제안 생성 버튼 추가

### Documentation Update

8. **설계 반영**: GTM API가 안내 메시지만 반환하는 것이 의도적 결정이라면 DX-DSGN-017 SS5.2를 갱신해요
9. **설계 반영**: synthesize-proposal이 proposal-mapper 활용으로 변경된 것이 의도적이라면 설계 문서 갱신해요

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-13 | Initial gap analysis — 78% match rate | Sinclair Seo |
