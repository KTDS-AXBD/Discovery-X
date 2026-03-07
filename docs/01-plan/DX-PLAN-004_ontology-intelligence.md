# Plan: ontology-intelligence

> **Feature**: 온톨로지 기반 관계 분석 + 미래 예측 시스템
> **Author**: Claude
> **Created**: 2026-02-11
> **Status**: Draft
> **Priority**: HIGH — 프로젝트 핵심 가치 제안

---

## 1. 배경 및 문제 정의

### 1.1 프로젝트 핵심 가치

Discovery-X의 본질은 **"관찰 → 실험 → 근거 → 결정"** 루프에서 축적되는 지식을 **구조화된 온톨로지**로 연결하고, 그 관계 네트워크에서 **패턴 감지** 및 **미래 시나리오 예측**을 수행하는 것이다.

### 1.2 현재 상태 (As-Is)

| 구성요소 | 상태 | 문제 |
|---------|------|------|
| **스키마** (5테이블) | ✅ 존재 | 데이터가 거의 비어있음 |
| **Agent 도구** (5개) | ✅ 존재 | 수동 호출 전제 — 자동 실행 없음 |
| **GraphViewer** (UI) | ✅ 존재 | 시각화만 가능, 분석/예측 기능 없음 |
| **Embeddings** (Vectorize) | ✅ 운영 중 | 온톨로지와 연결 안 됨 |
| **자동 엔티티 추출** | ❌ 없음 | Evidence 추가 시 아무 일도 안 일어남 |
| **교차 Discovery 그래프** | ❌ 없음 | 각 Discovery별 격리된 서브그래프 |
| **관계 분석 엔진** | ❌ 없음 | 패턴/클러스터/모순 감지 불가 |
| **미래 예측/시뮬레이션** | ❌ 없음 | 시나리오 생성/평가 불가 |

### 1.3 목표 상태 (To-Be)

```
Evidence 추가 → 자동 엔티티 추출 → 글로벌 온톨로지 그래프 형성
                                              ↓
                                    관계 분석 엔진 (패턴/클러스터/모순)
                                              ↓
                                    미래 예측 시뮬레이션 (시나리오/확률)
                                              ↓
                                    의사결정 지원 인사이트 (Dashboard)
```

---

## 2. 요구사항 (Functional Requirements)

### Phase 1: 온톨로지 데이터 형성 자동화

| ID | 요구사항 | 우선순위 |
|----|---------|---------|
| FR-01 | Evidence 생성 시 LLM이 자동으로 엔티티 추출 (NER + 분류) | P0 |
| FR-02 | 추출된 엔티티 간 관계 자동 추론 (관계 타입 + 강도) | P0 |
| FR-03 | Discovery 간 공유 엔티티 자동 감지 및 교차 링크 | P0 |
| FR-04 | 추출 결과 사용자 검토/수정 큐 (Human-in-the-Loop) | P1 |
| FR-05 | Embeddings ↔ 온톨로지 연결 (유사 엔티티 클러스터링) | P1 |

### Phase 2: 관계 분석 엔진

| ID | 요구사항 | 우선순위 |
|----|---------|---------|
| FR-06 | 글로벌 온톨로지 그래프 뷰 (전체 Discovery 통합) | P0 |
| FR-07 | 패턴 감지: 반복되는 관계 패턴 (e.g. "시장 트렌드 → 고객 세그먼트 → 비즈니스 모델") | P0 |
| FR-08 | 모순 감지: "supports" vs "contradicts" 충돌 엔티티 쌍 하이라이트 | P0 |
| FR-09 | 클러스터 분석: 밀접하게 연결된 엔티티 그룹 식별 | P1 |
| FR-10 | 중심성 분석: 가장 영향력 있는 엔티티 (PageRank/Betweenness) | P1 |

### Phase 3: 미래 예측 시뮬레이션

| ID | 요구사항 | 우선순위 |
|----|---------|---------|
| FR-11 | 시나리오 생성: 특정 엔티티/관계 변경 시 영향 시뮬레이션 | P0 |
| FR-12 | 확률 전파: Edge strength 기반 영향도 전파 계산 | P1 |
| FR-13 | 의사결정 추천: Gate 단계에서 온톨로지 기반 Go/No-Go 근거 | P1 |
| FR-14 | 타임라인 시뮬레이션: 스냅샷 기반 그래프 변화 추적/외삽 | P2 |

---

## 3. 기술 설계 방향

### 3.1 자동 엔티티 추출 파이프라인

```
[Evidence 생성/수정]
    ↓ (Cron 또는 실시간 트리거)
[LLM (Claude/GPT) NER + 분류]
    ↓
[contextNodes 생성 + 관계 추론]
    ↓ (교차 Discovery 검색)
[기존 엔티티 매칭 (Embedding 유사도)]
    ↓
[신규 or 기존 노드에 링크]
    ↓
[사용자 검토 큐 (선택)]
```

**핵심 설계 결정**:
- Cron 기반 배치 처리 (실시간은 비용 과다)
- `api.cron.ontology-extract.ts` 신규 cron 엔드포인트
- 기존 `embeddings` cron 패턴 재사용 (tenant별, 배치 크기 제한)
- LLM 프롬프트: structured output (JSON) → 엔티티 목록 + 관계 목록

### 3.2 글로벌 온톨로지 그래프

**현재**: `contextNodes.discoveryId` 기준 — Discovery별 격리
**변경**: Discovery 간 공유 노드 개념 도입

옵션 A: `globalEntityId` 컬럼 추가 (같은 개념의 노드를 그룹핑)
옵션 B: `entityMerge` 테이블 신규 (M:N 매핑)
→ **옵션 A 권장** (단순, 기존 쿼리 하위 호환)

### 3.3 관계 분석 엔진

**접근**: AI Agent 도구 확장 + 대시보드 UI

| 분석 유형 | 구현 방식 |
|----------|----------|
| 패턴 감지 | LLM + 그래프 쿼리 (빈도 높은 edge 패턴) |
| 모순 감지 | SQL 쿼리 (supports + contradicts 동시 존재) |
| 클러스터 | Union-Find (기존 queryGraph 확장) |
| 중심성 | Degree centrality (SQL) + Betweenness (JS) |

### 3.4 미래 예측 시뮬레이션

**접근**: LLM 기반 시나리오 생성 + 그래프 기반 영향도 전파

```
사용자 입력: "고객 세그먼트 X가 30% 성장하면?"
    ↓
[그래프 탐색: X와 연결된 모든 노드/엣지]
    ↓
[Strength 기반 영향도 전파 계산 (BFS + 감쇠)]
    ↓
[LLM 시나리오 생성: 영향받는 엔티티별 예상 변화]
    ↓
[시각화: 영향도 히트맵 on GraphViewer]
```

---

## 4. 파일 인벤토리

### 4.1 수정 파일

| 파일 | 변경 내용 |
|------|---------|
| `app/db/schema.ts` | contextNodes에 `globalEntityId` 컬럼 추가 |
| `app/lib/agent/tools/ontology-tools.ts` | 분석 도구 5개 추가 (FR-07~10) |
| `app/lib/agent/tool-registry.ts` | 신규 도구 등록 |
| `app/lib/agent/system-prompt.ts` | 온톨로지 활용 가이드 강화 |
| `app/components/graph/GraphViewer.tsx` | 글로벌 뷰 + 히트맵 + 필터 확장 |
| `app/routes/discoveries_.$id.graph.tsx` | 교차 Discovery 그래프 옵션 |

### 4.2 신규 파일

| 파일 | 용도 |
|------|------|
| `app/routes/api.cron.ontology-extract.ts` | 자동 엔티티 추출 cron |
| `app/routes/api.cron.ontology-analyze.ts` | 주기적 관계 분석 cron |
| `app/routes/ontology.tsx` | 글로벌 온톨로지 대시보드 (레이아웃) |
| `app/routes/ontology._index.tsx` | 온톨로지 요약 + 인사이트 |
| `app/routes/ontology.graph.tsx` | 전체 그래프 시각화 |
| `app/routes/ontology.analysis.tsx` | 분석 결과 (패턴/모순/클러스터) |
| `app/routes/ontology.simulation.tsx` | 시뮬레이션 UI |
| `app/routes/api.ontology.analyze.ts` | 분석 API |
| `app/routes/api.ontology.simulate.ts` | 시뮬레이션 API |
| `app/lib/ontology/extractor.ts` | LLM 기반 엔티티 추출 엔진 |
| `app/lib/ontology/analyzer.ts` | 그래프 분석 알고리즘 |
| `app/lib/ontology/simulator.ts` | 영향도 전파 + 시나리오 생성 |
| `app/components/ontology/InsightPanel.tsx` | 분석 인사이트 패널 |
| `app/components/ontology/SimulationView.tsx` | 시뮬레이션 시각화 |
| `drizzle/0025_ontology_global_entity.sql` | 마이그레이션 |

### 4.3 의존성

| 외부 서비스 | 용도 | 비용 영향 |
|-----------|------|---------|
| Claude API | 엔티티 추출 + 시나리오 생성 | Cron 당 ~$0.02-0.05 |
| OpenAI Embeddings | 엔티티 유사도 매칭 | 기존 비용 내 |
| Cloudflare Vectorize | 엔티티 벡터 저장 (선택) | 기존 인덱스 활용 |

---

## 5. 구현 순서 (3 Phase)

### Phase 1: 데이터 형성 (세션 2~3개)
1. `globalEntityId` 스키마 + 마이그레이션
2. `app/lib/ontology/extractor.ts` — LLM 추출 엔진
3. `api.cron.ontology-extract.ts` — 자동 cron
4. 기존 `extractEntities` 도구와 통합
5. 교차 Discovery 엔티티 매칭

### Phase 2: 관계 분석 (세션 2~3개)
1. `app/lib/ontology/analyzer.ts` — 그래프 분석
2. Agent 도구 확장 (패턴/모순/클러스터/중심성)
3. `ontology.*` 라우트 + UI
4. `api.cron.ontology-analyze.ts` — 주기적 분석

### Phase 3: 미래 예측 (세션 2~3개)
1. `app/lib/ontology/simulator.ts` — 영향도 전파
2. 시뮬레이션 UI + API
3. Gate 단계 의사결정 연동
4. 타임라인 시뮬레이션 (스냅샷 기반)

---

## 6. 리스크 및 제약사항

| 리스크 | 영향 | 완화 방안 |
|--------|------|---------|
| LLM 추출 품질 | 잘못된 엔티티/관계 → 오염된 그래프 | HITL 검토 큐 + confidence threshold |
| API 비용 | 대량 Evidence → 높은 LLM 비용 | 배치 처리 + 중요도 필터링 |
| 그래프 복잡도 | 노드/엣지 급증 → 시각화 성능 | 필터링 + 페이지네이션 + 클러스터 접기 |
| 예측 신뢰도 | LLM 환각 → 잘못된 예측 | 근거 명시 + 신뢰도 표시 + "가설" 라벨링 |
| Prototype 기간 | 30-60일 제약 | Phase 1 필수, Phase 2~3 선택적 |

---

## 7. 성공 기준

| 기준 | 목표 |
|------|------|
| 자동 추출률 | Evidence의 80%에서 1개 이상 엔티티 추출 |
| 교차 링크 | Discovery 3개 이상 연결된 글로벌 엔티티 존재 |
| 패턴 감지 | 최소 1개 반복 패턴 자동 식별 |
| 모순 감지 | Contradicts 관계 자동 발견 시 알림 |
| 시뮬레이션 | 사용자가 "what-if" 질문 → 시나리오 응답 |

---

## 8. Known Issues / 기술 부채

| # | 이슈 | 심각도 | 비고 |
|---|------|--------|------|
| 1 | contextNodes.discoveryId 필수 → 글로벌 엔티티 표현 불가 | HIGH | globalEntityId 추가로 해결 |
| 2 | 온톨로지 타입 10개 고정 → 동적 타입 필요할 수 있음 | MEDIUM | 우선 기존 10개 활용 |
| 3 | GraphViewer SVG 기반 → 대규모 그래프 성능 | MEDIUM | WebGL/Canvas 전환 검토 |
| 4 | 단일 테넌트 기준 설계 → 멀티 테넌트 고려 필요 | LOW | contextNodes에 tenantId 없음 (discoveryId로 간접 참조) |
| 5 | Edge strength 0-100 정수 → 확률 계산 시 정밀도 | LOW | 0-1 float 변환으로 대응 |

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-11 | Initial plan — 3 Phase 구조 |
