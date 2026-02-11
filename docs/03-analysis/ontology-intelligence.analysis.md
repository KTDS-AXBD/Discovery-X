# Gap Analysis Report — ontology-intelligence

> Phase 1 (Data Formation Automation) + Phase 2 (Relationship Analysis Engine)

## Analysis Overview

| Item | Detail |
|------|--------|
| Feature | ontology-intelligence |
| Design Document | `docs/02-design/features/ontology-intelligence.design.md` |
| Plan Document | `docs/01-plan/features/ontology-intelligence.plan.md` |
| Analysis Date | 2026-02-11 |
| Analyzer | gap-detector (opus) |

## Overall Scores

| Category | Score | Status |
|----------|:-----:|:------:|
| Design Match (Phase 1) | 92% | PASS |
| Design Match (Phase 2) | 95% | PASS |
| Schema Compliance | 100% | PASS |
| API Compliance | 85% | PARTIAL |
| Agent Tool Integration | 100% | PASS |
| Test Coverage vs Design | 50% | PARTIAL |
| **Overall** | **88%** | PARTIAL |

## Per-FR Match Status

### Phase 1: Data Formation Automation

| FR | Requirement | Status | Notes |
|----|-------------|:------:|-------|
| FR-01 | Evidence LLM 자동 엔티티 추출 (NER + 분류) | PASS | `extractor.ts` — Claude Haiku 기반, JSON 구조화, confidence 필터링, 재시도 |
| FR-02 | 엔티티 간 자동 관계 추론 | PASS | `extractor.ts` — type + strength + confidence로 contextEdges 생성 |
| FR-03 | Cross-Discovery 공유 엔티티 감지 + 연결 | PASS | `matcher.ts` — normalizeLabel() + globalEntityId 매칭 |
| FR-04 | Human-in-the-Loop 검토 큐 | PASS | `api.ontology.review.ts` + `ontology.review.tsx` — approve/reject/edit |
| FR-05 | Embeddings-Ontology 연결 (유사 엔티티 클러스터링) | PARTIAL | MVP 범위(label 매칭)만 구현, embedding 유사도 미구현 |

### Phase 2: Relationship Analysis Engine

| FR | Requirement | Status | Notes |
|----|-------------|:------:|-------|
| FR-06 | 글로벌 온톨로지 그래프 뷰 | PASS | `ontology.graph.tsx` — GraphViewer 재활용 |
| FR-07 | 패턴 탐지 (반복 엣지 패턴) | PASS | `analyzer.ts::detectPatterns` — 2/3-hop 경로, frequency ≥ 2 |
| FR-08 | 모순 감지 (supports vs contradicts) | PASS | `analyzer.ts::detectContradictions` — globalEntityId 기반 그룹핑 |
| FR-09 | 클러스터 분석 (밀집 연결 그룹) | PASS | `analyzer.ts::detectClusters` — Union-Find + globalEntityId 머지 |
| FR-10 | 중심성 분석 | PASS | `analyzer.ts::analyzeCentrality` — degree 중심성만 (betweenness 미구현) |

### Phase 3: 미래 예측 (미착수 — 의도적)

| FR | Requirement | Status |
|----|-------------|:------:|
| FR-11~14 | 시나리오 생성 / 확률 전파 / Gate 추천 / 타임라인 | N/A |

## Gap List

### HIGH (1건)

| # | Gap | 설명 | 파일 |
|---|-----|------|------|
| H-01 | Analysis UI 필드명 불일치 | UI가 `analysisType`을 보내지만 API는 `type`을 읽음 → 분석 페이지 완전 동작 불가 | `ontology.analysis.tsx:41` vs `api.ontology.analyze.ts:22` |

### MEDIUM (3건)

| # | Gap | 설명 |
|---|-----|------|
| M-01 | 테스트 파일 미생성 | Design 명세 3개 테스트 파일 모두 미작성 (extractor/matcher/cron) |
| M-02 | Cron 응답 포맷 | Design: `{ success, results }` envelope vs 실제: raw array |
| M-03 | Betweenness 중심성 미구현 | Plan에 명시, InsightPanel UI에 필드 존재하나 데이터 미제공 |

### LOW (4건)

| # | Gap | 설명 |
|---|-----|------|
| L-01 | 0.5-0.8 confidence 엔티티 무시 | Design: 검토 큐에 등록 vs 실제: 필터링 후 사라짐 |
| L-02 | LLM 재시도 1회 (Design: 2회) | 영향 최소 — 다음 Cron 주기에서 재처리 |
| L-03 | 모델명 불일치 (개선) | Design: "Claude 3.5 Haiku" vs 실제: claude-haiku-4-5 (최신 모델 사용) |
| L-04 | Review UI "편집" 버튼 미노출 | API는 edit 지원하나 UI에 버튼 없음 |

## 추가 구현 (Design에 없으나 구현됨)

| 항목 | 파일 | 설명 |
|------|------|------|
| 요약 대시보드 | `ontology._index.tsx` | 통계 카드 + 최근 추출 엔티티 — Phase 2 레이아웃의 자연스러운 추가 |
| 배치 매칭 최적화 | `matcher.ts::matchGlobalEntitiesBatch` | 1 DB 쿼리로 전체 엔티티 매칭 — 성능 개선 |
| 분석 Cron | `api.cron.ontology-analyze.ts` | Plan에만 명시, Phase 1 Design에는 없음 |

## 권장 조치

### 즉시 수정 (Priority 1)
1. **H-01**: `ontology.analysis.tsx` line 41 — `analysisType` → `type` 변경 (1줄 수정)

### 단기 수정 (Priority 2)
2. **M-02**: Cron 응답 envelope 추가
3. **L-04**: Review UI 편집 버튼 추가
4. **L-01**: 0.5-0.8 confidence 엔티티를 reviewed=0으로 저장

### 문서 업데이트 (Priority 3)
5. **L-03**: Design 문서 모델명 현행화
