---
code: DX-PLAN-005
title: 통합 실행 계획서
version: 2.0
status: Active
category: PLAN
created: 2026-03-07
updated: 2026-03-07
author: Sinclair Seo
---

# Discovery-X 통합 실행 계획서

> 작성일: 2026-03-07 | 상태: **Final** (v2.0 — 3차 리뷰 반영, 실행 승인)
> 원본 문서: DX-DSGN-005 (Ideas v2), DX-DSGN-006 (MSA), DX-DSGN-007 (Ontology)

---

## 0. 비즈니스 목적

### 왜 이 프로젝트를 하는가

Discovery-X는 "관찰 → 행동 → 근거 → 자산 축적" 사이클을 돌리는 실험 시스템이다.
현재 세 가지 구조적 한계가 이 사이클을 막고 있다.

| 한계 | 영향 | 해결 이니셔티브 |
|------|------|---------------|
| AI 분석이 피상적 (소스 3필드, 6/12 카테고리만 실행) | 아이디어 → 사업제안 전환 품질 낮음 | A: Ideas v2 |
| 온톨로지 그래프 데이터 0건 (수동 입력 의존) | 맥락 기반 예측·인사이트 불가능 | B: Ontology 활성화 |
| 모노리스에 Heavy 모듈 밀집 (AI, Graph, Embedding) | 빌드 느림, 성능 격리 불가, 코드 결합도 높음 | C: MSA 리팩토링 |

### 비즈니스 목표

1. **분석 품질 향상** — AI가 실질적으로 의사결정에 도움이 되는 분석을 생성
2. **맥락 자동 축적** — 활동만 하면 지식 그래프가 자연스럽게 성장
3. **구조적 지속 가능성** — 기능 추가·유지보수가 도메인 단위로 독립 가능

---

## 1. 3대 이니셔티브 요약

| # | 이니셔티브 | 목적 | 상태 | 규모 |
|---|-----------|------|------|------|
| A | Ideas 분석 파이프라인 v2 | AI 분석 품질 근본 개선 | **구현 완료** | 10파일, 27테스트 |
| B | Ontology 데이터 활성화 | 맥락 그래프에 자동 데이터 공급 | Draft | **7 세션**, ~8파일 |
| C | MSA 하이브리드 리팩토링 | 코드 결합도 + 성능 분리 | Draft | **17 세션**, 전체 구조 변경 |

### 관계도

```
[A] Ideas v2 (완료)
 │
 ├──▶ [B] Ontology 활성화 (A의 분석 결과를 Evidence로 변환)
 │     │
 │     └──▶ [C] MSA 리팩토링 (B가 안정화된 코드를 BC 단위로 이동)
 │
 └──▶ [C] MSA Phase 0 (A에서 정리 못 한 FF/레거시 제거)
```

---

## 2. To-Be 아키텍처

### 2.1 시스템 아키텍처 다이어그램

```
                          ┌─────────────────────────┐
                          │    Cloudflare Pages      │
                          │    (메인앱 — Slim)        │
                          │                         │
                          │  SSR + UI + Auth         │
                          │  + features/*/service    │
                          │  (CRUD, 읽기 전용 쿼리)   │
                          └────────┬────────────────┘
                                   │ HTTP + HMAC
                    ┌──────────────┼──────────────┐
                    │              │              │
             ┌──────▼──────┐ ┌────▼─────┐ ┌──────▼──────┐
             │ agent-      │ │analytics-│ │ vectorize-  │
             │ worker      │ │ worker   │ │ worker      │
             │             │ │          │ │             │
             │ Orchestration│ │ Graph    │ │ Embeddings  │
             │ Hub (★)     │ │ Ontology │ │ Vectorize   │
             │ AI Pipeline │ │ Scoring  │ │ ×6 indexes  │
             │ LLM Fallback│ │ Cache:KV │ │ Cache:API   │
             └──────┬──────┘ └────┬─────┘ └──────┬──────┘
                    │              │              │
        ┌───────────┼──────────────┼──────────────┘
        │    ┌──────▼──────┐ ┌────▼─────┐
        │    │ radar-      │ │ collab-  │
        │    │ worker      │ │ worker   │
        │    │ (Cron)      │ │ (Cron)   │
        │    └──────┬──────┘ └────┬─────┘
        │           │              │
        │    ┌──────▼──────┐      │
        │    │ venture-    │      │
        │    │ worker      │      │
        │    │ (Cron)      │      │
        │    └──────┬──────┘      │
        │           │              │
        └───────────┼──────────────┘
                    │
          ┌─────────▼─────────┐   ┌──────────────┐
          │   D1 (SQLite)     │   │ Workers KV   │
          │   단일 공유 DB     │   │ 읽기 캐시     │
          │                   │   │              │
          │ packages/database │   │ Vectorize    │
          │ (Single Source    │   │ ×6 indexes   │
          │  of Truth)        │   │              │
          └───────────────────┘   └──────────────┘

    ★ Orchestration Hub 원칙:
      사용자 요청 기반 다중 서비스 조합은
      agent-worker를 단일 orchestration hub로 한다.
      Pages는 BFF(Backend for Frontend)로만 동작하며,
      직접 다수 Worker를 연쇄 호출하지 않는다.
```

### 2.2 Orchestration 호출 패턴

| 호출 유형 | 패턴 | 예시 |
|----------|------|------|
| Pages → 단일 Worker | 직접 HTTP | 분석 결과 조회 → analytics-worker |
| Pages → 다중 Worker 조합 | **agent-worker 경유** | AI 분석 + 벡터 검색 + 그래프 → agent-worker가 오케스트레이션 |
| Worker → Worker | DB 비동기 공유 (기본), Service Bindings (필요 시) | radar → venture (DB 공유) |
| Cron → Workers | Cron Worker가 `/health` 순회 (warm-up) | api.cron.lab.ts → 각 Worker health |

> **금지**: Pages가 2개 이상의 Worker를 직접 순차 호출하는 패턴.
> 이렇게 하면 Pages가 orchestration layer가 되어 분리 이점이 사라진다.

---

## 3. 의존성 분석

### 3.1 파일 충돌 지도

세 계획이 동시에 건드리는 파일을 식별한다.

| 파일 | A (Ideas v2) | B (Ontology) | C (MSA) | 충돌 위험 |
|------|:-----------:|:------------:|:-------:|:---------:|
| `app/lib/ideas/analyzer.ts` | 전면 재작성 | Evidence 생성 추가 | `features/ideas/` 이동 | **높음** |
| `app/lib/ideas/section-builder.ts` | 수정 | - | `features/ideas/` 이동 | 낮음 |
| `app/lib/ideas/analysis-prompts.ts` | 전면 재작성 | - | `features/ideas/` 이동 | 낮음 |
| `app/lib/ideas/proposal-mapper.ts` | 수정 | - | `features/ideas/` 이동 | 낮음 |
| `app/lib/services/idea.service.ts` | 수정 | Discovery 연결 시 일괄 생성 | `features/ideas/service/` 이동 | **중간** |
| `app/lib/ai-pipeline/service.ts` | - | Evidence 생성 추가 | `agent-worker` 통합 | **높음** |
| `app/lib/agent/agent-pipeline.ts` | - | Evidence 메타데이터 보강 | `agent-worker` 유지 | 낮음 |
| `app/lib/agent/executor-stream.ts` | - | 인사이트 추출 추가 | `agent-worker` 유지 | 낮음 |
| `app/lib/ontology/extractor.ts` | - | - | `analytics-worker` 이동 | 낮음 |
| `app/routes/api.cron.lab.ts` | - | 임계치 체크 추가 | 유지 | 낮음 |
| `app/routes/ideas.$id.tsx` | 수정 | - | 유지 | 낮음 |
| `app/lib/constants/methodology.ts` | 수정 | - | `shared/constants/` 이동 | 낮음 |

### 3.2 순서 제약

```
A 완료 ─┬─▶ B Phase 1-2 (analyzer.ts에 Evidence 생성 추가)
        │
        └─▶ C Phase 0 (FF 제거, 레거시 정리) ── 독립 실행 가능

B 완료 ──▶ C Phase 1+ (안정화된 코드를 BC 단위로 이동)
```

**핵심 규칙**: Ontology(B)가 `analyzer.ts`와 `ai-pipeline/service.ts`에 코드를 추가한 뒤, MSA(C)에서 해당 파일을 이동해야 한다. 역순이면 이동 후 다시 수정해야 하므로 비효율적.

### 3.3 병렬 가능 구간

| 구간 | 작업 A | 작업 B | 비고 |
|------|--------|--------|------|
| C Phase 0 ↔ B Phase 1-2 | 서로 다른 파일 | FF 제거 vs Evidence 파이프라인 | **병렬 가능** |
| C Phase 0 ↔ B Phase 3 | - | Agent 쪽은 MSA Phase 0과 무관 | **병렬 가능** |
| C Phase 1 ↔ B Phase 4 | - | BC 이동 vs Cron 활성화 | 주의 필요 (cron.lab.ts) |

---

## 4. 일정 산정 기준

### Claude Code 세션 기반 산정

이 프로젝트는 1인 개발 + Claude Code AI 페어 체제로 진행한다.
전통적인 work-day 산정은 적합하지 않으므로 **세션 단위**로 산정한다.

| 개념 | 정의 |
|------|------|
| **세션** | Claude Code 1회 대화 단위. 보통 1~2시간, 하나의 의미 있는 결과물 산출 |
| **검증 게이트** | `typecheck + lint + test` 통과를 확인하는 구간. 세션 사이에 배치 |
| **배포 포인트** | 프로덕션 push + 모니터링. 자연스러운 세션 구분점 |

### 세션 산정 경험치 (기존 299 세션 기반)

| 작업 유형 | 세션당 처리량 | 예시 |
|----------|-------------|------|
| 기능 추가 (단일 파일 수정 + 테스트) | 1 세션 | Evidence 생성 로직 + 테스트 |
| 기능 추가 (다중 파일 연동) | 1~2 세션 | 12개 분석 파이프라인 체인 |
| 파일 이동 + import 수정 (1 도메인) | 1 세션 | ideas/ BC 완성 |
| Worker 프로젝트 생성 + 모듈 이관 | 2~3 세션 | analytics-worker 전체 |
| Agent Teams 병렬 (/team) | 2~3 세션분 동시 처리 | 독립 도메인 BC 이동 병렬 |
| 테스트 집중 작성 | 1 세션 50~80개 | 세션 297 — 88개 테스트 |

---

## 5. 통합 실행 계획 (세션 기반)

### 전체 흐름

```
Phase B: Ontology 활성화          Phase C: MSA 리팩토링
─────────────────────────         ─────────────────────────

[S1] Radar→Evidence ──┐
[S2] Ideas→Evidence   ├─ 병렬 ── [S3] FF 12개 제거
                      │          [S4] 레거시 정리 + callLLM 통일
── 검증 게이트 ────────┘          ── 검증 게이트 ──

[S5] Agent Evidence 메타데이터
[S6] Agent 인사이트 추출
[S7] Cron 임계치 + 대시보드 UI
── 검증 게이트 + 배포 (M3) ──
                                  [S8~S11] BC 통일 (4 세션, /team 병렬)
                                  [S12] Requests→Discovery Event 전환
                                  [S13] shared/ 추출 + 전체 점검
                                  ── 검증 게이트 + 배포 (M4) ──

                                  [S14~S16] analytics-worker 분리
                                  [S17~S18] vectorize-worker 분리
                                  [S19~S20] agent-worker 강화
                                  ── 검증 게이트 + 배포 (M5) ──

                                  [S19a~S21] 안정화 + 통합 테스트 + 문서 (4 세션)
                                  ── 최종 배포 (M6) ──
```

**총 ~24 세션** (B: 7 세션, C: 17 세션, /team 활용 시 ~22 세션)

---

### Phase B: Ontology 데이터 활성화 (7 세션)

#### S1. Radar→Evidence 자동 생성

| 작업 | 파일 |
|------|------|
| `evaluateForDiscovery()` 직후 Evidence 자동 생성 | `ai-pipeline/service.ts` |
| relevanceScore→strength 매핑 (80-100→A, 60-79→B, ...) | 동일 파일 |
| sourceUrl 기반 중복 방지 | 동일 파일 |
| 유닛 테스트 | `tests/` |

**검증**: typecheck + lint + 테스트 통과

#### S2. Ideas→Evidence 자동 생성

| 작업 | 파일 |
|------|------|
| 카테고리 분석 완료 시 Evidence 자동 생성 | `ideas/analyzer.ts` |
| 카테고리→Evidence Type 매핑 (시장→DATA, 고객→USER 등) | 동일 파일 |
| Idea→Discovery 연결 시 기존 분석 → Evidence 일괄 변환 | `idea.service.ts` |
| 유닛 테스트 | `tests/` |

**검증**: typecheck + lint + 테스트 통과. S1과 합산 Evidence 생성 확인

> S1, S2는 C Phase 0(S3, S4)과 **파일 충돌 없으므로 병렬 진행 가능**

#### S3. Feature Flag 12개 제거 (C Phase 0-a)

| 작업 | 파일 |
|------|------|
| FF 5개 제거 (false 분기 없음) — if문 제거, 내부 코드 유지 | `executor-stream.ts`, `root.tsx` 등 |
| FF 7개 제거 (false 분기 있음) — true 경로만 유지 | `acl/middleware.ts`, `ai/index.ts` 등 |
| wrangler.toml FF vars 12줄 제거 | `wrangler.toml` |

**검증**: typecheck + lint + 테스트 통과, FF 조건 분기 완전 소멸

#### S4. 레거시 정리 + LLM 표준화 (C Phase 0-b)

| 작업 | 파일 |
|------|------|
| signalMetadata 테이블 DROP 마이그레이션 | 스키마 + 마이그레이션 |
| agentMemory v1 제거 (v2 데이터 확인 후) | 스키마 + 마이그레이션 |
| callClaude→callLLM 표준화 | `executor-stream.ts`, `agent/tools/` |
| Worker 공통 유틸 추출 (에러 핸들링, 헬스체크) | `packages/worker-utils/` |

**검증**: typecheck + lint + 테스트 전체 통과. **배포 포인트**

---

#### S5. Agent Evidence 메타데이터 보강

| 작업 | 파일 |
|------|------|
| `processToolBlocks()` 후 Evidence에 conversationId 연결 | `agent-pipeline.ts` |
| 유닛 테스트 | `tests/` |

#### S6. Agent 대화→인사이트 추출

| 작업 | 파일 |
|------|------|
| 인사이트 추출 시스템 프롬프트 설계 | 프롬프트 |
| flushSessionMemory 내 LLM 추출 → Evidence 후보 저장 (reviewed=0) | `executor-stream.ts` |
| 유닛 테스트 | `tests/` |

#### S7. Cron 임계치 + 대시보드 UI

| 작업 | 파일 |
|------|------|
| Evidence 30건 미만 시 Cron skip 로직 | `api.cron.lab.ts` |
| 대시보드 인사이트 위젯 (패턴/모순/핵심 엔티티) | `lab.analysis.tsx` |
| 빈 상태 안내 UI ("데이터 축적 중" + 현재 Evidence 수) | 동일 파일 |
| E2E 시나리오 검증: Radar→Evidence→Extractor→그래프 | 수동 검증 |

**검증 + 배포 (M3)**: 3개 경로 모두 Evidence 자동 생성 확인

---

### Phase C: MSA 하이브리드 리팩토링 (17 세션)

#### Phase 1: 모듈러 모노리스 정비 (6 세션)

##### S8~S9. BC 통일 — /team 병렬 (4 세션 분량, 2 세션으로 압축)

Agent Teams로 독립 도메인을 병렬 이동한다.

| 세션 | 작업 | 비고 |
|------|------|------|
| S8 (Team A) | `features/discovery/` BC — 스키마 추출 + service/ + validation/ 이동 | 핵심 도메인, 가장 복잡 |
| S8 (Team B) | `features/ideas/` BC + `features/radar/` BC 완성 | 독립적, 병렬 가능 |
| S9 (Team A) | `features/chat/` BC — conversations/messages + topic/signal 이동 | |
| S9 (Team B) | `features/proposals/` BC + `features/matrix/` BC 완성 | 독립적, 병렬 가능 |

**순환 참조 대응 (R12)**:
- 이동 중 도메인 간 순환 참조 발견 시 즉시 `lib/shared/`로 해당 모듈 추출
- 1세션 내 해결 불가한 순환 참조가 나오면 해당 도메인 이동을 보류, 다음 세션에서 의존성 분리 후 재시도
- 각 Team에 "import cycle이 발생하면 이동 중단하고 보고" 지시를 명시

##### S10 (= 원래 S12). Requests→Discovery Event 전환

| 작업 | 파일 |
|------|------|
| 직접 DB insert → Event/Orchestration 패턴 | `features/requests/service/workflow.ts` |
| Discovery 서비스에서 이벤트 소비 | `features/discovery/service/` |
| 크리티컬 경로는 동기 유지 (R11 대응) | |

##### S11 (= 원래 S13). shared/ 추출 + 전체 점검

| 작업 | 파일 |
|------|------|
| auth, constants, types, utils → `lib/shared/` 통합 | `lib/shared/` |
| `lib/services/` 디렉토리 비어 있는지 확인 | |
| import 경로 전수 점검 + 회귀 테스트 | |

**검증 + 배포 (M4 Go/No-Go)**:
- 모든 도메인 `features/*/` BC 구조
- 테스트 전체 통과 + typecheck + lint 0 에러
- 프로덕션 배포 후 정상 확인

> **M4 불통과 시**: Worker 분리 보류, 안정화 집중

---

#### Phase 2: analytics-worker 분리 (3 세션)

##### S12. packages/database 추출 + Worker 프로젝트 생성

| 작업 | 파일 |
|------|------|
| Drizzle 스키마를 `packages/database` 워크스페이스로 추출 (R13 대응) | `packages/database/` |
| 메인앱 + 기존 4 Worker에서 `@discovery-x/database` 참조로 전환 | 각 서비스 |
| analytics-worker wrangler.toml + 기본 구조 + 헬스체크 | 신규 프로젝트 |
| graph/ 10파일 Worker로 이동 + store.ts 분해 | `graph/` → Worker |

> **분할 옵션**: S12는 작업량이 많은 "슈퍼 세션"이다. 컨텍스트 한계에 도달하면 즉시 분할:
> - **S12-a**: `packages/database` 구축 + 메인앱 연결 (순수 인프라)
> - **S12-b**: analytics-worker 생성 + graph/ 이관 (기능 이관)

##### S13. ontology/ 이관 + HTTP API

| 작업 | 파일 |
|------|------|
| ontology/ 4모듈 (extractor, matcher, analyzer, simulator) 이관 | `ontology/` → Worker |
| HTTP API 엔드포인트 설계 | Worker |
| HMAC 인증 (agent-worker 패턴 재사용) | Worker |

##### S14. 메인앱 import 교체

| 작업 | 파일 |
|------|------|
| graph/ontology 직접 import → HTTP API 호출로 대체 | 메인앱 라우트 |
| 메인앱에서 graph/ontology import 0건 확인 | |

**검증**: analytics-worker 독립 배포 성공

---

#### Phase 3: vectorize-worker 분리 (2 세션)

##### S15. vectorize-worker 생성 + embeddings/ 이관

| 작업 | 파일 |
|------|------|
| vectorize-worker wrangler.toml + Vectorize 바인딩 6개 | 신규 프로젝트 |
| embeddings/ 모듈 이동 | `embeddings/` → Worker |

##### S16. 메인앱 Vectorize 정리 + scoring 분해

| 작업 | 파일 |
|------|------|
| 메인앱 Vectorize 바인딩 제거, API 호출 대체 | wrangler.toml, 라우트 |
| scoring.service.ts(682줄) Strategy 분리 | 이동 시 동시 수행 |

**검증**: vectorize-worker 독립 배포 성공

---

#### Phase 4: agent-worker 강화 (2 세션)

##### S17. ai/ + ai-pipeline/ 통합

| 작업 | 파일 |
|------|------|
| callLLM/callLLMStream → agent-worker 내장 | agent-worker |
| ai-pipeline/ 평가/분류 로직 이관 (Evidence 생성 로직 포함) | agent-worker |

##### S18. 메인앱 ai/ 제거 + cost/ 통합

| 작업 | 파일 |
|------|------|
| 메인앱 ai/ import 제거, agent-worker API 대체 | 메인앱 라우트 |
| cost/ 토큰 관리 agent-worker 통합 | agent-worker |

**검증 + 배포 (M5)**: 6 Workers + 1 Pages 독립 배포 성공

---

#### Phase 5: 안정화 (4 세션) — R14 반영으로 테스트 세션 분할

##### S19a. 유닛 테스트 수정 + Worker mock 교체

| 작업 |
|------|
| Worker 분리에 따른 기존 테스트 mock/stub 교체 |
| 각 Worker의 HTTP API Contract 명세 정의 |
| Worker별 mock 클라이언트 생성 (6개) |

##### S19b. 통합 테스트 + 콜드 스타트 검증

| 작업 |
|------|
| 메인앱↔Worker HTTP 통합 테스트 시나리오 작성 |
| 콜드 스타트 시 응답 시간 측정 + 허용 임계치 설정 |
| Worker 간 연쇄 호출 시나리오 검증 (R9 대응) |

##### S20. 배포 파이프라인 + 환경 정리 + 관측 체계

| 작업 |
|------|
| Atomic Deployment 스크립트 구현 (Section 12 배포 순서 준수) |
| 배포 게이트웨이: Worker /health 확인 + 실패 시 롤백 + 파이프라인 중단 |
| Cron warm-up: api.cron.lab.ts에서 각 Worker /health 순회 코드 추가 (R9 대응) |
| Worker별 환경변수/시크릿 최소 권한 적용 |
| 관측 체계 구축: Worker 에러율/응답시간 로깅 (Section 9.3 참조) |

##### S21. 문서 갱신 + 최종 배포

| 작업 |
|------|
| CLAUDE.md, SPEC.md, CHANGELOG.md, 아키텍처 다이어그램 갱신 |
| 프로덕션 최종 배포 |

**검증 (M6)**: 전체 테스트 통과, 번들 30%+ 감소, 문서 갱신 완료

---

## 6. 마일스톤 & Go/No-Go 게이트

| 마일스톤 | 시점 | Go 기준 | No-Go 시 대응 |
|---------|------|---------|--------------|
| **M1**: Ideas v2 프로덕션 검증 | (이미 완료) | 12개 파이프라인 정상 실행 | 프롬프트 튜닝 후 재검증 |
| **M2**: Ontology 경로 A·B 가동 | S2 완료 후 | Radar+Ideas에서 Evidence 자동 생성 확인 | 매핑 로직 수정 |
| **M3**: Ontology 전체 가동 | S7 완료 후 | 3개 경로 Evidence 생성, Cron 임계치 동작 | Agent 경로 연기, A·B만 운영 |
| **M4**: 모듈러 모노리스 완성 | S11 완료 후 | BC 구조 통일, Event 전환, 테스트 전체 통과, **프로덕션 정상** | Phase 2 보류, 안정화 집중 |
| **M5**: Worker 분리 완료 | S18 완료 후 | 6 Workers + 1 Pages 독립 배포, 기능 정상 | 문제 Worker만 롤백, 메인앱 유지 |
| **M6**: 최종 안정화 | S21 완료 후 | 전체 테스트 통과, 번들 30%+ 감소, 통합 테스트, 문서 갱신 | 추가 세션 투입 |

---

## 7. 리스크 관리

### 7.1 통합 리스크 매트릭스

| # | 리스크 | 확률 | 영향 | 관련 | 완화 전략 |
|---|--------|------|------|------|----------|
| R1 | Anthropic API 크레딧 부족 | 높 | 높 | B, C | AI Fallback 체인 (Google→Workers AI). **충전 즉시 해결** |
| R2 | analyzer.ts 파일 충돌 (B→C 전환 시) | 중 | 중 | B, C | B 완료 후 C 진입. Git diff 확인 후 이동 |
| R3 | ai-pipeline/service.ts 이중 수정 | 중 | 중 | B, C | B에서 Evidence 코드 추가 → C에서 agent-worker로 통째로 이관 |
| R4 | Evidence 품질 낮음 (자동 생성) | 중 | 중 | B | reviewed=0 + Extractor 신뢰도 필터 (0.5 임계치) + confidence scoring + 중복 제거 파이프라인 |
| R5 | BC 이동 시 import 경로 대량 깨짐 | 높 | 중 | C | 경로 별칭(`~/`) 활용, IDE 리팩토링 도구 사용 |
| R6 | Worker 간 HTTP 레이턴시 | 중 | 중 | C | 비동기 Fire-and-forget, 배치 API |
| R7 | D1 단일 DB 병목 (6 Workers 동시 접근) | 중 | 높 | C | Worker KV 읽기 캐싱, 배치 쓰기, read-heavy Worker는 read replica 패턴 검토 |
| R8 | 12개 분석 총 소요시간 (~2분) | 낮 | 낮 | A | SSE 진행률 + 3Phase 그룹핑 UI (이미 구현) |
| **R9** | **Worker 간 연쇄 호출 + 콜드 스타트** | **중** | **높** | **C** | **비동기 큐 패턴 우선, 동기 호출 최소화. 콜드 스타트는 Worker keep-alive (Cron ping) 또는 Durable Objects 활용** |
| **R10** | **분산 환경 테스트 복잡도 급증** | **높** | **중** | **C** | **Sprint 7에 통합 테스트 공수 3일 확보. Worker API는 Contract 수준 명세로 mock 생성** |
| **R11** | **Event/Orchestration 도입 시 UI-데이터 불일치** | **중** | **낮** | **C** | **Eventual consistency를 UI에 반영 (낙관적 업데이트 + 폴링 확인). 크리티컬 경로는 동기 유지** |
| **R12** | **BC 이동 시 도메인 간 순환 참조 발견** | **중** | **중** | **C** | **S8~S9에서 순환 참조 발견 즉시 `lib/shared/`로 추출. 1세션 내 해결 불가 시 해당 도메인 이동 보류하고 다음 세션에서 처리** |
| **R13** | **공유 스키마 관리 부하 (분산 모노리스화)** | **높** | **높** | **C** | **`packages/database`로 스키마 타입 추출 — 메인앱+모든 Worker가 동일 Single Source of Truth 참조. 스키마 변경 시 패키지 버전업 → 각 Worker에서 업데이트** |
| **R14** | **S19 테스트 세션 부족 (6 Worker mocking)** | **중** | **중** | **C** | **S19를 2세션(S19a+S19b)으로 분할. 총 세션 수 23→24로 조정** |

### 7.2 아키텍처 검토 메모: Service Bindings

> 리뷰에서 "Worker 간 HTTP 대신 Cloudflare Service Bindings 사용"이 권고되었다.

**현재 제약**: Cloudflare **Pages**는 Service Bindings를 지원하지 않는다 (Workers만 지원).
메인앱이 Pages이므로 메인앱→Worker 통신은 HTTP fetch가 유일한 옵션이다.

**대안 검토**:
1. **Pages → Workers 마이그레이션**: 메인앱을 Workers로 전환하면 Service Bindings 사용 가능.
   단, Remix SSR + Pages 배포 파이프라인을 전면 변경해야 하므로 MSA 완료 후 별도 검토.
2. **Worker ↔ Worker 간**: Worker끼리는 Service Bindings 사용 가능.
   analytics-worker ↔ vectorize-worker 간 통신이 필요해지면 Service Bindings 적용.
3. **현재 전략 유지**: 메인앱→Worker는 HTTP + HMAC, Worker→Worker는 DB 비동기 공유.

**결론**: Phase 5 안정화 단계에서 Pages→Workers 마이그레이션 ROI를 평가한다.

### 7.3 공유 스키마 전략: packages/database (R13 대응)

6개 Worker가 D1 단일 DB를 공유하므로, 스키마 변경이 "분산 모노리스" 관리 부하로 이어질 위험이 있다.

**해결**: Drizzle 스키마 타입을 `packages/database` npm 워크스페이스로 추출한다.

```
packages/database/           # Single Source of Truth
├── schema/                  # Drizzle 스키마 정의 (현재 app/db/ 에서 이동)
├── types/                   # 스키마에서 파생된 TS 타입
├── migrations/              # 마이그레이션 파일
└── package.json             # workspace 패키지
```

- 메인앱과 모든 Worker가 `@discovery-x/database`를 의존성으로 참조
- 스키마 변경 시 패키지 버전업 → 각 서비스에서 `pnpm update`로 동기화
- **구현 시점**: Phase 2 진입 시 (S12) — Worker가 DB에 직접 접근하기 시작하는 시점

### 7.4 Read-through Cache 전략 (R7, R9 대응)

read-heavy Worker(analytics, vectorize)의 DB 부하를 줄이기 위해 캐싱을 도입한다.

| 대상 | 캐시 계층 | TTL | 근거 |
|------|----------|-----|------|
| 온톨로지 엔티티 (contextNodes) | Workers KV | 1시간 | Cron 추출 주기가 일 1회이므로 변경 빈도 낮음 |
| 벡터 검색 결과 | Cache API | 5분 | 동일 쿼리 반복 시 Vectorize 호출 절감 |
| graph 프로젝션 데이터 | Workers KV | 30분 | 스코어 변경 빈도가 낮음 |

- **구현 시점**: Phase 2~3 (S12~S16) — 각 Worker 이관 시 함께 적용
- Cron이 데이터를 갱신하면 캐시 무효화 (KV delete)

### 7.5 롤백 전략

| 단계 | 롤백 방법 | 소요 시간 |
|------|----------|----------|
| Ontology (B) | Evidence 생성 코드 revert (3개 파일) | 30분 |
| MSA Phase 0 (C0) | git revert (코드 삭제만이므로 복원 간단) | 1시간 |
| MSA Phase 1 (C1) | git revert (파일 이동 역방향) | 2-3시간 |
| MSA Phase 2-4 (C2-4) | Worker 삭제, 메인앱 코드 복원 | 반나절 |

---

## 8. 비용 영향

| 항목 | 현재 | 변경 후 | 차이 |
|------|------|--------|------|
| Ideas 분석 API 호출 | 6회/건 | 12회/건 + 제안서 10회 | +16회/건 (이미 반영) |
| Ontology Extractor (Cron) | 0회 (미가동) | 일 ~5회 (Haiku) | +$0.30/월 |
| Agent 인사이트 추출 | 0회 | 일 5-10회 (Haiku) | +$0.05/월 |
| Worker 추가 (analytics, vectorize) | 0 | 2개 Worker | CF Free tier 내 |
| **합계 추가 비용** | | | **~$0.45/월** |

---

## 9. 성공 지표

### 9.1 기술 지표

#### 단기 (Ontology 완료 — S7 이후)

| 지표 | 목표 |
|------|------|
| Evidence 자동 생성 건수 | 첫 주 10건+ |
| Evidence 생성 경로 활성화 | 3/3 (Radar, Ideas, Agent) |
| Extractor Cron 가동 | Evidence 30건 도달 시 자동 시작 |
| contextNodes 생성 | Evidence 기반 엔티티 추출 확인 |

#### 중기 (MSA 완료 — S21 이후)

| 지표 | 목표 |
|------|------|
| 메인앱 lib/ 모듈 수 | 23개 → 15개 이하 |
| 메인앱 번들 크기 | 30%+ 감소 |
| features/ BC 커버리지 | 8/8 도메인 BC 구조 |
| Worker 수 | 4개 → 6개 |
| 테스트 통과율 | 100% (전체) |
| typecheck + lint | 0 에러 |

#### 장기 (운영 3개월)

| 지표 | 목표 |
|------|------|
| 누적 Evidence | 100건+ |
| 온톨로지 패턴/모순 감지 | 실질적 인사이트 생성 |
| 시뮬레이션 활용 | 월 2회+ 의미 있는 시나리오 분석 |
| Worker 독립 배포 | 메인앱 무관하게 Worker 단독 배포 성공 |

### 9.2 비즈니스 지표

| 구분 | 지표 | 측정 방법 | 목표 |
|------|------|----------|------|
| 분석 품질 | Idea 분석 결과의 실행 가능성 | 분석→제안 전환율 (사용자가 제안서 생성까지 진행한 비율) | 50%+ |
| 인사이트 유용성 | 온톨로지 인사이트 활용 | Lab 분석 페이지 방문 + 시뮬레이션 실행 횟수 | 월 5회+ |
| 의사결정 속도 | Idea→Proposal 소요 시간 | 아이디어 생성~제안서 초안 완성 기간 | 현재 대비 30% 단축 |
| 맥락 축적 | Discovery당 Evidence 밀도 | Evidence 수 / Discovery 수 | 평균 10건+/Discovery |
| 구조 독립성 | 도메인별 독립 배포 가능 여부 | Worker 단독 배포 시 타 서비스 영향 없음 | 6/6 Worker 독립 |

### 9.3 관측 체계 (Telemetry Plan)

성공 지표를 실제로 측정하기 위한 이벤트 소스, 집계 방법, 오너를 정의한다.

| 지표 | 소스 이벤트 | 집계 위치 | 주기 | 오너 |
|------|-----------|----------|------|------|
| 분석→제안 전환율 | `idea_analysis_completed` + `proposal_created` | D1 쿼리 (ideas × proposals JOIN) | 주 1회 | Owner |
| Idea→Proposal 소요시간 | `ideas.createdAt` ~ `proposals.createdAt` 차이 | D1 쿼리 | 주 1회 | Owner |
| Evidence 자동 생성 건수 | `evidence.createdById = SYSTEM_AGENT_ID` | D1 COUNT + reliabilityLabel 별 분류 | 일 1회 (Cron) | 자동 |
| Evidence 밀도 | `evidence COUNT / discovery COUNT` | D1 쿼리 | 주 1회 | Owner |
| 온톨로지 인사이트 활용 | `lab.analysis` 페이지 loader 호출 + `api.lab.simulate` action 호출 | D1 로그 또는 `tokenUsage` 테이블 | 주 1회 | Owner |
| Worker 에러율 | 각 Worker의 `console.error` + HTTP 5xx 응답 | Cloudflare Analytics (대시보드 내장) | 실시간 | 자동 |
| Worker 응답시간 | HTTP 호출 duration (메인앱 측 측정) | 커스텀 로깅 → D1 | 일 1회 | Owner |
| 번들 크기 | `build/client/assets/` 총 용량 | 빌드 스크립트 출력 | 배포 시 | 자동 |

**구현 시점**: S7(Ontology 완료) 시점에 Evidence 관련 관측부터 시작. Worker 관측은 S20(배포 파이프라인)에서 구축.

---

## 10. 팀 역할 및 책임

> 현재 운영 인원: 5명 (내부 실험 팀). 1인 개발 + AI 페어 프로그래밍 체제.

| 역할 | 담당 | 책임 |
|------|------|------|
| **Owner / Lead Dev** | Sinclair | 전체 설계·구현·배포. 모든 Sprint의 실행 주체 |
| **AI Pair** | Claude (Agent) | 코드 구현 보조, 테스트 작성, 리뷰, 문서 갱신 |
| **QA / 검증** | Owner + 팀원 | 마일스톤별 기능 검증, 프로덕션 모니터링 |
| **Stakeholder** | AX BD팀 (5명) | 분석 품질 피드백, 비즈니스 지표 검증, Go/No-Go 판단 참여 |

### 의사결정 기준

| 결정 사항 | 결정권자 | 기준 |
|----------|---------|------|
| Sprint 진입/보류 | Owner | M1~M6 Go/No-Go 기준 충족 여부 |
| Worker 분리 범위 변경 | Owner | 성능 측정 결과 기반 |
| 온톨로지 경로 축소/확장 | Owner + 팀 | Evidence 품질 평가 |
| 전체 프로젝트 중단 | 팀 합의 | Prototype Gate 판단 (30~60일) |

---

## 11. Evidence Ingestion 정책

자동 생성 Evidence의 품질을 장기적으로 유지하기 위한 운영 정책.

### 11.1 소스별 신뢰도 가중치

| 소스 | 기본 weight | reliabilityLabel | reviewed 초기값 | 근거 |
|------|-----------|------------------|----------------|------|
| Radar (경로 A) | 0.7 | `reported` | 0 | 외부 소스 기반, 비교적 신뢰 |
| Ideas 분석 (경로 B) | 0.5 | `hypothesis` | 0 | LLM 분석 결과, 추론 기반 |
| Agent 도구 (경로 C-1) | 0.8 | 사용자 지정 | 1 | 사용자가 명시적으로 도구 호출 |
| Agent 인사이트 (경로 C-2) | 0.3 | `hypothesis` | 0 | LLM 자동 추출, 잡음 가능성 높음 |

weight는 Extractor가 confidence 계산 시 소스 가중치로 반영한다.
`confidence = extractedConfidence × sourceWeight`

### 11.2 자동 승격 금지 규칙

- `reviewed=0`인 Evidence는 **자동으로 `reviewed=1`로 승격하지 않는다**
- Extractor는 `reviewed=0` Evidence도 처리하지만, 추출된 엔티티는 `confidence < 0.8` 검토 큐에만 등록
- `reviewed=1`로의 승격은 다음 경로만 허용:
  1. 사용자가 Lab UI에서 수동 확인
  2. Agent 도구(`add_evidence`)로 명시적 생성된 건 (C-1 경로)
  3. 동일 내용이 2개 이상 소스에서 독립적으로 생성된 경우 (교차 검증)

### 11.3 중복 병합 규칙

| 조건 | 동작 |
|------|------|
| 동일 discoveryId + 동일 sourceUrl | 생성 차단 (중복) |
| 동일 discoveryId + 동일 카테고리 + ideaId | 기존 Evidence 업데이트 (재분석 시) |
| 동일 entity가 다른 소스에서 추출 | 별도 Evidence 유지, Matcher가 globalEntityId로 연결 |

### 11.4 정리 정책 (TTL)

| 대상 | 조건 | 동작 |
|------|------|------|
| `reviewed=0` + 90일 경과 | 자동 | `archived=1`로 마킹 (삭제하지 않음) |
| `reviewed=0` + confidence < 0.3 | 30일 후 | 자동 삭제 |
| `reviewed=1` | - | 영구 보존 |

**구현 시점**: S7(Ontology 완료)에서 기본 정책 적용. 운영 1개월 후 가중치·TTL 튜닝.

---

## 12. 배포 전략 (Atomic Deployment)

6개 Worker + 1 Pages가 단일 DB 스키마를 공유하므로, 스키마 변경 포함 배포 시 순서가 중요하다.

### 12.1 배포 순서

```
1. DB 마이그레이션 실행 (하위 호환성 유지하는 마이그레이션만 허용)
2. Worker 배포 (의존성 역순: vectorize → analytics → agent → radar → collab → venture)
3. Pages 배포 (메인앱)
4. 각 Worker /health 확인
5. 이상 시 해당 Worker 롤백 + 마이그레이션 역방향 (가능한 경우)
```

### 12.2 하위 호환 마이그레이션 규칙

- 컬럼 추가: OK (기존 Worker가 무시)
- 컬럼 삭제: 2단계 — 먼저 코드에서 참조 제거 배포 → 다음 배포에서 컬럼 DROP
- 테이블 추가: OK
- 테이블 삭제: 2단계 (컬럼 삭제와 동일)

### 12.3 배포 게이트웨이

S20에서 배포 스크립트 작성 시 포함할 로직:
- 각 Worker 배포 후 `/health` 200 응답 확인
- 실패 시 해당 Worker 이전 버전으로 롤백 + 전체 파이프라인 중단
- 성공 시 다음 Worker로 진행

### 12.4 Worker Warm-up (R9 콜드 스타트 대응)

Cron 작업(`api.cron.lab.ts`)이 온톨로지 처리 전에 각 Worker의 `/health`를 순회하여 warm-up한다.

```
Cron 실행 순서:
1. analytics-worker/health → warm-up
2. vectorize-worker/health → warm-up
3. agent-worker/health → warm-up
4. 온톨로지 추출/분석 실행
```

이를 통해 실제 처리 시점에 콜드 스타트가 발생하지 않도록 한다.

---

## 13. 원본 문서 참조

| 문서 | 경로 | 상세 내용 |
|------|------|----------|
| Ideas 분석 파이프라인 v2 | `docs/02-design/DX-DSGN-005_idea-analysis-pipeline-v2.md` | P1-P5 문제 정의, 12개 프롬프트, 체인 메커니즘, 구현 결과 |
| Ontology 활성화 계획 | `docs/02-design/DX-DSGN-007_ontology-activation-plan.md` | 3개 데이터 경로, Evidence 필드 매핑, Cron 임계치, 품질 관리 |
| MSA 리팩토링 계획 | `docs/02-design/DX-DSGN-006_msa-refactoring-plan.md` | 결합도 분석, 3가지 전략 비교, BC 구조, Worker 분리 상세 |

각 원본 문서는 해당 이니셔티브의 상세 설계·근거·코드 레벨 변경 사항을 포함한다.
본 통합 계획서는 실행 순서·의존성·일정만 다루며, 구현 상세는 원본을 참조한다.
