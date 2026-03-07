---
code: DX-DSGN-005
title: 아이디어 분석 파이프라인 v2 설계
version: 1.0
status: Active
category: DSGN
created: 2026-03-07
updated: 2026-03-07
author: Sinclair Seo
---

# 아이디어 분석 파이프라인 v2 — 설계 및 구현 문서

> 세션 299 | 2026-03-07

---

## 0. 배경 — 이해관계자 인터뷰

### 인터뷰 결과 요약

| 항목 | 답변 |
|------|------|
| **불편 영역** | Radar->Ideas, Ideas 분석/구체화, Ideas->Proposals (3개 영역 모두) |
| **개선 유형** | UX/UI + 자동화 + 프로세스 변경 |
| **핵심 Pain** | AI 분석이 부족 -- 피상적 결과, 형식적 방법론, 소스 분석 품질 |
| **기대 모습** | 실행 가능한 제안 + 방법론 실작동 + 끝까지 자동화 + 품질/신뢰도 |
| **우선순위** | 구조적 변화 (근본적 프로세스 개선) |
| **UI 구조** | 현재 3패널 (소스 / 방법론카드 / 채팅) 유지 |

### 핵심 해석

소스 수집부터 사업제안 초안까지 AI가 실질적으로 작동하는 파이프라인으로 바꾸고 싶다.
- 소스 분석 품질 향상
- 방법론의 실질적 적용 (12종 카드가 분석 프로세스에 진짜 녹아들기)
- 분석->제안 자동 연결
- 근거 기반 신뢰도

---

## 1. 현황 진단 — 코드 기반

### 문제점 5가지

| # | 문제 | 위치 | 영향 |
|---|------|------|------|
| P1 | 소스 컨텍스트가 얕음 (제목+요약만 전달, keyPoints/memo 미포함) | `section-builder.ts:buildSourceContext()` | AI가 피상적 분석밖에 못 함 |
| P2 | 전체 분석이 6/12개만 실행 | `ideas.$id.tsx:284` 하드코딩 | 나머지 6개는 채팅 에이전트 경로만 가능 |
| P3 | 카테고리별 완전 독립 실행 | `analyzer.ts:76-166` | 시장조사 결과를 사업성 검증에서 참조 불가 |
| P4 | 분석->제안 매핑이 기계적 복붙 | `proposal-mapper.ts:49-74` | AI 합성 없이 텍스트 이어붙이기 |
| P5 | 일부 프롬프트 한 줄짜리 | `methodology.ts:29-46` (6개) | SWOT, 린캔버스 등 깊이 없는 분석 |

### 데이터 제약

- `radarItems`에 원문 본문(full text) 미저장
- 사용 가능: `title`, `titleKo`, `summary`, `summaryKo`, `keyPoints[]`, `url`, `memo`
- 기존 `buildSourceContext()`가 사용하던 것: `titleKo/title` + `summaryKo` + `url` (3개)
- 미활용 데이터: `keyPoints[]` + `memo` + `summary(영문)` (3개)

---

## 2. 온톨로지 활용 검토

### 현재 상태: Ideas <-> Ontology = 완전 단절

```
[Ideas 워크스페이스]                    [Ontology 시스템]
  소스 -> AI 분석 -> 제안서              Evidence -> 엔티티 추출 -> 그래프
  (app/lib/ideas/)                      (app/lib/ontology/)
  ideaId 기반                            discoveryId 기반

       ---- 연결 없음 ----
```

| 구분 | Ideas 분석 | Ontology |
|------|-----------|----------|
| 데이터 소스 | Radar 소스 제목+요약 | Discovery의 Evidence 본문 |
| AI 역할 | 12개 방법론별 텍스트 생성 | 엔티티/관계 추출 (구조화) |
| 출력 | 마크다운 텍스트 | 노드+엣지 그래프 |
| 사용 위치 | `/ideas/:id` | `/lab/analysis` |
| 교차 참조 | 없음 | 글로벌 엔티티 매칭 (Discovery 간) |

### 평가: "지금은 아니다"

| 관점 | 평가 | 이유 |
|------|------|------|
| 분석 품질 향상에 도움? | 제한적 | 핵심 문제는 소스 컨텍스트 부족과 프롬프트 빈약. 온톨로지 없이 해결 가능 |
| 유의미한 활용 시점? | 있지만 나중 | Ideas->Discovery 전환 시 엔티티를 시드로 활용하는 게 가장 자연스러움 |
| 지금 투자할 가치? | 아니오 | Discovery 데이터 자체가 적어 그래프가 빈약. 분석 파이프라인 안정화 후 연결 |

### 우선순위 결론

```
1순위: 아이디어 분석 파이프라인 재설계 (5가지 문제 해결)
2순위: 실사용 데이터 축적 (Discovery 파이프라인 실운영)
3순위: Ideas <-> Ontology 연결 (데이터가 쌓인 후)
```

---

## 3. 설계 목표

1. **소스 컨텍스트 최대화** -- DB에 있는 모든 정보를 AI에 전달
2. **12개 카테고리 통합 파이프라인** -- 단일 실행 경로, 채팅 경로 제거
3. **카테고리 간 체인** -- 이전 분석 결과를 다음 카테고리 컨텍스트에 누적
4. **AI 제안서 합성** -- 분석->제안 전환 시 AI가 재구성
5. **12개 프롬프트 균일 상세화** -- 모든 카테고리 전문가 수준 프롬프트

---

## 4. 상세 설계

### 4.1 소스 컨텍스트 강화 (P1 해결)

**Before**:
```
- **AI 시장 전망**: AI 시장이 빠르게 성장 중 (https://example.com)
```

**After**:
```
### 소스 1: AI 시장 전망 (https://example.com)
요약: AI 시장이 빠르게 성장 중
핵심 포인트:
  1. 글로벌 AI 시장 2025년 1,900억 달러 규모
  2. 연평균 성장률 37.3%
  3. 생성형 AI가 성장 주도
메모: B2B SaaS 영역에서 기회 탐색
```

변경 사항:
- `buildSourceContext()` 입력 타입에 `keyPoints`, `memo`, `summary` 추가
- 소스별 구조화된 블록 생성 (번호 헤더 포함)
- 전체 데이터 경로: `IdeaService.getLinkedSources()` -> API -> Client -> `buildSourceContext()`

### 4.2 분석 파이프라인 통합 + 체인 (P2 + P3 해결)

**Pipeline 순서** (Phase가 순서의 핵심):

```
Phase 1: 기초 조사 (외부 환경 - 사실 기반)
  market_research    -> 시장 규모, 경쟁, 트렌드
  customer_research  -> 고객, 니즈, 페인포인트
  industry_example   -> 유사 사례, 성공/실패 패턴
  regulation         -> 규제, 인허가

Phase 2: 전략 분석 (Phase 1 기반 추론)
  swot               -> Phase 1 결과 기반 SWOT
  pestel             -> Phase 1 결과 기반 외부 환경
  value_chain        -> 가치 사슬 분석
  differentiation    -> 경쟁 우위, 해자

Phase 3: 비즈니스 모델 (Phase 1+2 종합)
  bmc                -> Phase 1+2 기반 BMC
  lean_canvas        -> Problem-Solution Fit
  feasibility        -> 수익 모델, BEP
  critical_thinking  -> 최종 검증: 가정, 반론, 리스크
```

**체인 메커니즘**:
- 각 카테고리 프롬프트에 "핵심 인사이트 (3줄 요약)" 출력 요구
- `extractInsightSummary()` 함수가 마크다운에서 해당 섹션 파싱
- 파싱된 요약을 다음 카테고리의 "이전 분석 요약"으로 누적 전달
- 토큰 오버헤드: 카테고리당 ~200토큰, 최대 ~2,400토큰

### 4.3 프롬프트 통합 상세화 (P5 해결)

**Before**: 2곳 분산 (analysis-prompts.ts 6개 상세 + methodology.ts 12개 중 6개 한 줄)

**After**: `analysis-prompts.ts` 1곳 통합 (12개 모두 동일 깊이)

공통 프롬프트 구조:
```
[전문가 역할 선언]

## 이전 분석 참조
(체인 컨텍스트 지시)

## 출력 형식 (마크다운)
### 섹션 1 - 상세 지시
### 섹션 2 - 상세 지시
...

## 공통 규칙
1. 소스 기반 vs 추정 구분
2. 불확실한 내용 "확인 필요" 표기
3. 구체적 수치/기업명/사례 포함
4. 한국어 작성

### 핵심 인사이트 (3줄 요약)  <-- 체인에 사용
```

### 4.4 AI 제안서 합성 (P4 해결)

**Before**: `mapAnalysisToSections()` -- 카테고리별 텍스트를 제안서 섹션에 기계적 매핑

**After**: `synthesizeProposalSections()` -- 10개 섹션별 AI 호출로 제안서 형식 재합성

```
분석 데이터 수집 (카테고리 -> 섹션 매핑 유지)
     |
     v
섹션별 AI 호출 (10회)
  - 입력: 관련 카테고리 분석 결과 + 섹션 타입 + 아이디어 제목
  - 프롬프트: "사업 제안서 작성 전문가" 역할
  - 출력: 제안서에 맞는 구조화된 텍스트
     |
     v
SSE 스트림으로 진행률 전달
```

- API 키 없으면 기존 기계적 매핑으로 fallback
- `useLegacy: true` 옵션으로 명시적 레거시 모드 지원

### 4.5 프론트엔드 연동

- `handleStartAnalysis`: 하드코딩 6개 -> 12개 전체 실행
- `handleRunMethodology`: 채팅 에이전트 경로 -> 직접 API 호출로 교체
- `AnalysisProgress`: 3 Phase 그룹핑 UI (기초 조사 / 전략 분석 / 비즈니스 모델)
- `autoMessage`/`onToolResult` 제거 (채팅 경로 불필요)

---

## 5. 구현 결과

### 변경 파일 (10개)

| 파일 | 변경 유형 | 내용 |
|------|-----------|------|
| `app/lib/ideas/section-builder.ts` | 수정 | `buildSourceContext()` -- keyPoints/memo/summary 포함, 구조화된 블록 |
| `app/lib/ideas/analysis-prompts.ts` | 전면 재작성 | 12개 상세 프롬프트 + 3 Phase + 체인 참조 + 핵심 인사이트 섹션 |
| `app/lib/ideas/analyzer.ts` | 전면 재작성 | `PIPELINE_ORDER` 12개 순차 + `extractInsightSummary()` 체인 누적 |
| `app/lib/ideas/proposal-mapper.ts` | 수정 | `synthesizeProposalSections()` AI 합성 추가 (기존 유지) |
| `app/lib/constants/methodology.ts` | 수정 | `METHODOLOGY_PROMPTS` 제거 (중복) |
| `app/lib/services/idea.service.ts` | 수정 | `getLinkedSources()`에 `summary`, `keyPoints` 추가 |
| `app/routes/ideas.tsx` | 수정 | parent loader에 `summary`, `keyPoints` 추가 |
| `app/routes/ideas.$id.tsx` | 수정 | 12개 카테고리 통합 + 개별 직접 API + autoMessage 제거 |
| `app/routes/api.ideas.$id.create-proposal.ts` | 전면 재작성 | AI 합성 + SSE + legacy fallback |
| `app/components/ideas/AnalysisProgress.tsx` | 수정 | 3 Phase 그룹핑 UI |

### 새 테스트 파일 (2개, 27 테스트)

| 파일 | 테스트 수 | 내용 |
|------|----------|------|
| `tests/unit/ideas/section-builder.test.ts` | 14 | buildSourceContext, buildMethodologySections, detectStaleSections |
| `tests/unit/ideas/analysis-pipeline.test.ts` | 13 | 12개 카테고리 구조, 파이프라인 순서, 체인 추출 로직 |

### 검증 결과

| 항목 | 결과 |
|------|------|
| typecheck | 0 에러 |
| lint | 0 에러, 0 경고 |
| build | 성공 |
| 테스트 | 236/236 통과 (기존 209 + 신규 27) |

---

## 6. Before / After 비교

| 항목 | Before (v1) | After (v2) |
|------|-------------|------------|
| 소스 컨텍스트 | 제목 + 요약 + URL (3필드) | 제목 + 요약 + 핵심포인트 + 메모 + URL (6필드) |
| 실행 카테고리 | 6개 (나머지는 채팅 경로) | 12개 통합 파이프라인 |
| 카테고리 간 관계 | 완전 독립 | 체인 구조 (이전 인사이트 누적) |
| 프롬프트 품질 | 6개 상세 + 6개 한줄 | 12개 모두 전문가 수준 |
| 분석->제안 | 텍스트 복붙 | AI 합성 (SSE) + legacy fallback |
| 진행률 UI | 6개 flat | 12개 3-Phase 그룹핑 |
| 개별 분석 경로 | 채팅 에이전트 경유 | 직접 API 호출 |

---

## 7. 리스크 및 대응

| 리스크 | 대응 |
|--------|------|
| 12개 순차 실행 시 총 소요 시간 (~2분) | SSE 진행률로 UX 보완. 3 Phase 그룹핑으로 진행 상황 가시화 |
| 체인 누적 시 토큰 한도 | 카테고리별 핵심 3줄만 누적 (~200 토큰/카테고리, 최대 ~2,400 토큰) |
| API 비용 증가 (12회 + 제안서 10회) | 기존 6회 -> 12회 (2배). 제안서 합성은 선택적. 토큰 모니터링으로 관리 |
| 원문 본문 없이 분석 품질 한계 | keyPoints/memo 추가로 상당 부분 보완. 향후 URL 크롤링 검토 |
| AI 합성 실패 시 제안서 생성 불가 | 기계적 매핑 fallback 유지. API 키 없어도 동작 |

---

## 8. 향후 과제

| 우선순위 | 과제 | 비고 |
|----------|------|------|
| 단기 | 프로덕션 배포 후 분석 품질 실사용 검증 | 실제 소스로 12개 파이프라인 테스트 |
| 단기 | ProposalCreationModal에서 SSE 합성 연동 | 현재 프론트엔드 모달이 SSE 미지원 |
| 중기 | URL 크롤링으로 원문 본문 확보 | 분석 시 실시간 fetch 또는 수집 시 저장 |
| 중기 | 분석 결과 캐싱/재사용 (소스 변경 시만 재분석) | stale 감지는 이미 구현됨 |
| 장기 | Ideas <-> Ontology 연결 | Discovery 데이터 축적 후 |
