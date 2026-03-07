---
code: DX-DSGN-007
title: 온톨로지 활성화 설계
version: 1.0
status: Draft
category: DSGN
created: 2026-03-07
updated: 2026-03-07
author: Sinclair Seo
---

# Ontology Activation Plan

> 작성일: 2026-03-07 | 세션 298 | 상태: Draft
> MSA-Refactoring-Plan.md와 별도 문서

## 1. 문제 정의

온톨로지 시스템은 **맥락 구성 + 변화 예측**을 위해 설계되었으나, 현재 형식적으로만 존재한다.

### 원인
```
Evidence 0건 → Extractor 공회전 → Nodes/Edges 0건 → Analyzer/Simulator 무의미
```

데이터 공급 루프가 끊겨 있다. Evidence가 수동 입력에 의존하므로, 5명 팀이 실험하면서 동시에 꼼꼼히 기록하는 건 현실적으로 어렵다.

### 목표
**"활동하면 자동으로 쌓인다"** — 수동 기록 의존을 제거하고, 기존 활동(Radar 수집, 아이디어 분석, Agent 대화)에서 Evidence가 자연스럽게 생성되도록 한다.

---

## 2. 현재 온톨로지 파이프라인

```
[Evidence 입력]
      ↓
  Extractor (LLM) ── contextNodes + contextEdges 생성
      ↓
  Matcher ────────── 글로벌 엔티티 매칭 (교차 Discovery)
      ↓
  Analyzer ────────── 패턴/모순/클러스터/중심성 분석
      ↓
  Simulator ───────── BFS 영향 전파 + LLM 시나리오 생성
      ↓
  [UI: 인사이트 패널 + 시뮬레이션 뷰 + 그래프 뷰어]
```

파이프라인 자체는 완성되어 있다. **입구(Evidence)만 연결하면 된다.**

---

## 3. 데이터 공급 파이프라인 설계

3개 경로에서 Evidence를 자동 생성한다.

### 3.1 경로 A: Radar → Evidence (가장 간단, 가장 큰 효과)

```
radar-worker (Cron 수집)
    ↓
radarItems (summaryKo, relevanceScore, url)
    ↓
AI Pipeline: evaluateForDiscovery()  ← [여기서 Evidence 자동 생성]
    ↓
Discovery 생성 + Evidence 동시 확보
```

**생성 시점**: `AIPipelineService.evaluateForDiscovery()` 직후, Discovery가 생성되는 시점에 클러스터의 모든 radarItems를 Evidence로 변환.

**필드 매핑**:

| Evidence 필드 | 소스 | 값 |
|---------------|------|-----|
| discoveryId | 생성된 Discovery | 자동 |
| type | 고정 | "ARTIFACT" |
| strength | relevanceScore 기반 | 80-100→"A", 60-79→"B", 40-59→"C", <40→"D" |
| content | radarItems.summaryKo | 최대 400자 |
| sourceUrl | radarItems.url | 원본 URL |
| reliabilityLabel | 고정 | "reported" |
| createdById | 고정 | SYSTEM_AGENT_ID |

**위치**: `app/lib/ai-pipeline/service.ts` — evaluateForDiscovery() 직후

**예상 효과**: Discovery 1건당 초기 Evidence 1~3건 자동 확보

---

### 3.2 경로 B: Ideas 분석 → Evidence (가장 정교)

```
Ideas 분석 실행 (12개 카테고리)
    ↓
analysisData: { market: {...}, technology: {...}, ... }
    ↓
각 카테고리 분석 완료 시  ← [여기서 Evidence 자동 생성]
    ↓
Discovery에 카테고리별 Evidence 축적
```

**생성 시점**: `runIdeaAnalysis()` 각 카테고리 분석 완료 시. 단, Idea가 Discovery에 연결된 경우에만.

**카테고리 → Evidence 타입 매핑**:

| 분석 카테고리 | Evidence Type | Strength | 근거 |
|--------------|---------------|----------|------|
| 시장 분석 | DATA | B | 시장 통계/동향 데이터 |
| 기술 평가 | DATA | B | 기술 성숙도 평가 |
| 경쟁 분석 | ARTIFACT | B | 경쟁사 벤치마킹 |
| 고객 인사이트 | USER | C | 간접 추론 기반 |
| 실행 가능성 | ASSUMPTION | C | 기술적 가정 |
| 리스크 분석 | ASSUMPTION | C | 리스크 식별 |
| 재무 분석 | DATA | B | 비용/수익 추정 |
| 그 외 | REF | C | 참조 자료 |

**위치**: `app/lib/ideas/analyzer.ts` — 각 카테고리 SSE 전송 직후

**제약**: Idea → Discovery 연결이 있어야 함. 연결 없으면 Evidence 미생성 (나중에 Discovery 연결 시 일괄 생성 가능).

**예상 효과**: 아이디어 분석 1건당 Evidence 3~8건 생성 (비어있지 않은 카테고리만)

---

### 3.3 경로 C: Agent 대화 → Evidence (자연스러운 축적)

2단계로 나눈다.

#### C-1: 도구 실행 결과 자동 링크 (난이도: 낮음)

```
Agent 대화 중 도구 호출
    ↓
processToolBlocks()
    ↓
add_evidence / complete_experiment 실행 시  ← [자동 메타데이터 보강]
    ↓
Evidence에 대화 컨텍스트(conversationId) 자동 연결
```

현재 `add_evidence` 도구는 이미 Evidence를 DB에 저장하지만, 대화 컨텍스트(어떤 대화에서 왔는지)가 기록되지 않는다.
processToolBlocks() 후처리에서 Evidence 메타데이터를 보강한다.

**위치**: `app/lib/agent/agent-pipeline.ts:115-169`

#### C-2: 대화 종료 시 인사이트 추출 (난이도: 중간)

```
Agent 대화 종료
    ↓
flushSessionMemory()  ← [여기서 인사이트 추출]
    ↓
LLM 호출: "이 대화에서 검증 가능한 근거를 추출하세요"
    ↓
추출된 인사이트 → Evidence 후보로 저장 (reviewed=0)
```

대화 내용에서 Discovery와 관련된 인사이트를 LLM이 추출하여 Evidence 후보로 저장한다.
후보는 `reviewed=0` 상태로, 사용자가 확인하거나 Cron이 자동 승인할 수 있다.

**위치**: `app/lib/agent/executor-stream.ts:119-138`

**조건**:
- 대화에 discoveryId가 연결된 경우에만 실행
- 추가 LLM 호출 비용: ~100 토큰/대화 (Haiku)
- 추출된 인사이트가 0건이면 Evidence 미생성

**예상 효과**: 대화 10건당 Evidence 2~5건 자동 생성

---

## 4. 온톨로지 Cron 활성화 조건

Evidence가 충분히 쌓이면 온톨로지 Cron을 활성화한다.

### 임계치

| 조건 | 값 | 근거 |
|------|-----|------|
| 최소 Evidence | 30건 | 엔티티 추출에 의미 있는 양 |
| 최소 Discovery | 3건 | 교차 Discovery 분석 가능 |
| contextNodes 최소 | 15건 | 패턴 감지 최소 단위 |

### 활성화 흐름

```
Evidence 30건 도달
    ↓
api.cron.lab.ts?mode=extract 활성화 (일 1회)
    ↓
contextNodes 15건 도달
    ↓
api.cron.lab.ts?mode=analyze 활성화 (주 1회)
    ↓
대시보드에 온톨로지 인사이트 노출
```

### 자동 활성화 구현

```typescript
// api.cron.lab.ts에 임계치 체크 추가
const evidenceCount = await db.select({ count: sql`count(*)` }).from(evidence);
if (evidenceCount < 30) {
  return Response.json({ skipped: true, reason: "evidence below threshold", count: evidenceCount });
}
// 기존 추출 로직 실행...
```

---

## 5. 품질 관리

자동 생성 Evidence의 품질을 보장하기 위한 장치.

### 5.1 신뢰도 계층

| 소스 | reliabilityLabel | 자동 reviewed | 근거 |
|------|------------------|-------------|------|
| Radar (경로 A) | "reported" | 0 (미검토) | 외부 소스 기반 |
| Ideas 분석 (경로 B) | "hypothesis" | 0 (미검토) | LLM 분석 결과 |
| Agent 도구 (경로 C-1) | 사용자 지정 | 1 (사용자 승인) | 명시적 도구 호출 |
| Agent 인사이트 (경로 C-2) | "hypothesis" | 0 (미검토) | LLM 추출 |

### 5.2 Extractor 신뢰도 필터

현재 Extractor에 이미 구현된 필터:
- confidence < 0.5: 무시
- confidence 0.5~0.8: 검토 큐에만 등록 (엣지 미생성)
- confidence >= 0.8: 그래프 참여 (엣지 생성)

자동 Evidence는 대부분 "hypothesis" + reviewed=0이므로, Extractor가 낮은 신뢰도로 처리하여 **검토 큐에 먼저 쌓이고, 확인 후 그래프에 반영**되는 구조.

### 5.3 중복 방지

```
Radar Evidence: radarItems.id를 sourceUrl에 포함 → 동일 아이템 중복 생성 방지
Ideas Evidence: analysisData.category + ideaId 조합으로 중복 체크
Agent Evidence: conversationId + 메시지 범위로 중복 체크
```

---

## 6. 대시보드 인사이트 노출

온톨로지 데이터가 쌓이면 대시보드에 인사이트를 노출한다.

### 6.1 위치: 대시보드 홈 또는 Lab 분석 탭

| 인사이트 유형 | 표시 조건 | UI |
|-------------|----------|-----|
| 반복 패턴 | 동일 경로 2회+ | "A→B→C 패턴이 3건에서 발견됨" |
| 모순 감지 | supports + contradicts 동시 | "X와 Y: 지지 2건 vs 반박 1건" |
| 핵심 엔티티 | totalDegree 상위 5개 | "ESG 시장 — 4개 Discovery에 걸쳐 영향" |
| 클러스터 | 노드 3개+ 연결 | "관련 개념 묶음: [A, B, C, D]" |

### 6.2 시뮬레이션 활용

노드가 충분히 쌓이면 시뮬레이션이 실질적 가치를 제공한다:
- "ESG 규제 강화 시 영향 범위는?" → BFS 전파로 관련 엔티티 영향도 계산
- "탄소중립 정책이 우리 사업에 미치는 영향?" → LLM 시나리오 분석

---

## 7. 실행 로드맵

### Phase 1: Radar → Evidence 자동 생성 (3일)

| 작업 | 파일 | 설명 |
|------|------|------|
| 1-1 | ai-pipeline/service.ts | evaluateForDiscovery() 직후 Evidence 생성 로직 추가 |
| 1-2 | ai-pipeline/service.ts | relevanceScore → strength 매핑 함수 |
| 1-3 | ai-pipeline/service.ts | 중복 방지 (sourceUrl 기반) |
| 1-4 | tests/ | AI Pipeline Evidence 생성 테스트 |

### Phase 2: Ideas 분석 → Evidence 연결 (3일)

| 작업 | 파일 | 설명 |
|------|------|------|
| 2-1 | ideas/analyzer.ts | 카테고리별 Evidence 생성 로직 |
| 2-2 | ideas/analyzer.ts | 카테고리 → Evidence Type 매핑 |
| 2-3 | idea.service.ts | Idea→Discovery 연결 시 기존 분석 → Evidence 일괄 생성 |
| 2-4 | tests/ | Ideas Evidence 생성 테스트 |

### Phase 3: Agent 대화 → Evidence 추출 (5일)

| 작업 | 파일 | 설명 |
|------|------|------|
| 3-1 | agent-pipeline.ts | processToolBlocks 후 Evidence 메타데이터 보강 |
| 3-2 | executor-stream.ts | flushSessionMemory 내 인사이트 추출 LLM 호출 |
| 3-3 | executor-stream.ts | 추출 결과 → Evidence 후보 저장 (reviewed=0) |
| 3-4 | 프롬프트 설계 | 인사이트 추출 시스템 프롬프트 작성 |
| 3-5 | tests/ | Agent Evidence 생성 테스트 |

### Phase 4: Cron 활성화 + 대시보드 연동 (3일)

| 작업 | 파일 | 설명 |
|------|------|------|
| 4-1 | api.cron.lab.ts | 임계치 체크 로직 추가 |
| 4-2 | dashboard 또는 lab | 온톨로지 인사이트 요약 위젯 추가 |
| 4-3 | lab.analysis.tsx | 빈 상태 → 데이터 축적 중 안내 UI |

### 타임라인

```
Week 1:  Phase 1 (Radar) + Phase 2 (Ideas)
Week 2:  Phase 3 (Agent)
Week 3:  Phase 4 (Cron + Dashboard) + 통합 테스트
```

---

## 8. 예상 데이터 축적 시뮬레이션

### 가정
- Radar: 일 5개 아이템 수집, 월 1~2건 Discovery 자동 생성
- Ideas: 주 2~3건 분석 실행
- Agent: 일 5~10건 대화

### 월별 Evidence 축적 예상

| 월 | Radar Evidence | Ideas Evidence | Agent Evidence | 누적 | 온톨로지 상태 |
|----|---------------|----------------|----------------|------|-------------|
| 1개월 | 3~6건 | 15~24건 | 10~25건 | 28~55건 | 임계치 도달 (30건) |
| 2개월 | 6~12건 | 30~48건 | 20~50건 | 56~110건 | 패턴 감지 시작 |
| 3개월 | 9~18건 | 45~72건 | 30~75건 | 84~165건 | 클러스터/모순 분석 가능 |

**1개월이면 임계치 도달**, 2개월이면 의미 있는 인사이트 생성 가능.

---

## 9. API 비용 추정

| 항목 | 호출 빈도 | 모델 | 토큰/건 | 월 비용 (추정) |
|------|----------|------|---------|--------------|
| Extractor (Cron) | 일 5건 | Haiku | ~1,500 | ~$0.30 |
| Agent 인사이트 추출 | 일 5~10건 | Haiku | ~100 | ~$0.05 |
| Simulator (사용자 요청) | 주 1~2건 | Haiku | ~1,500 | ~$0.10 |
| **합계** | | | | **~$0.45/월** |

비용은 무시할 수준이다. Haiku 기반이므로 Anthropic 크레딧 부족 시에도 Google Gemini fallback으로 동작 가능.

---

## 10. 결론

온톨로지 시스템의 문제는 코드가 아니라 **데이터 공급 루프의 단절**이다.

3개 자동 공급 경로(Radar, Ideas, Agent)를 연결하면:
- 1개월 내 임계치 도달 (Evidence 30건+)
- 2개월 내 의미 있는 패턴/모순 감지
- 3개월 내 시뮬레이션 활용 가능

기존 코드(extractor, analyzer, matcher, simulator) 변경 없이, **파이프라인 입구만 연결**하면 원래 비전(맥락 구성 + 변화 예측)을 실현할 수 있다.
