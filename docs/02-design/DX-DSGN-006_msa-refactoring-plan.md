---
code: DX-DSGN-006
title: MSA 리팩토링 설계
version: 1.0
status: Draft
category: DSGN
created: 2026-03-07
updated: 2026-03-07
author: Sinclair Seo
---

# Discovery-X MSA Refactoring Plan

> 작성일: 2026-03-06 | 세션 298 | 상태: Draft

## 1. Executive Summary

Discovery-X는 현재 **Remix Pages 모노리스 + 4개 독립 Worker**로 운영 중이다.
코드 결합도, 성능 영향, 팀 스케일링 문제를 해결하기 위해 MSA 전환을 검토한다.

### 현재 규모
| 항목 | 수치 |
|------|------|
| 코드 | ~70,700줄 (427파일) |
| 라우트 | 158개 |
| DB 테이블 | 97개 (8개 스키마 머지) |
| 서비스 | 12+ (lib/services) |
| 공유 모듈 | 23개 (lib/) |
| 테스트 | 1,615개 |
| Worker | 4개 (agent, radar, collab, venture) |

### 핵심 제약
- 인프라: **Cloudflare 생태계 내부**
- Pages는 서비스 바인딩 미지원 (Worker 간 HTTP fetch만 가능)
- D1 (SQLite) 단일 DB 공유
- 다운타임 허용 (내부 실험용, 최대 5명)

---

## 2. 현재 아키텍처 분석

### 2.1 이미 분리된 서비스 (As-Is)

```
                    +------------------+
                    |   Cloudflare     |
                    |   Pages (메인앱)  |
                    |   Remix SSR      |
                    +--------+---------+
                             |
              +--------------+--------------+
              |              |              |
     +--------v--+   +------v-----+  +-----v------+
     | agent-    |   | radar-     |  | collab-    |
     | worker    |   | worker     |  | worker     |
     | (DO+SSE)  |   | (Cron)     |  | (Cron)     |
     +-----------+   +------------+  +------------+
              |              |              |
              +--------------+--------------+
                             |
                    +--------v---------+
                    |    D1 (SQLite)   |
                    |  단일 공유 DB     |
                    +------------------+

     + venture-worker (Cron, 5분 폴링)
```

| Worker | 역할 | 통신 방식 |
|--------|------|----------|
| agent-worker | AI 채팅 (DO + SSE) | HTTP fetch + HMAC |
| radar-worker | 소스 수집 (일 1회 Cron) | DB 비동기 공유 |
| collab-worker | 브리핑/메모리 (Cron) | DB 비동기 공유 |
| venture-worker | Task Queue 폴링 (5분) | DB 비동기 공유 |

### 2.2 도메인 결합도 분석 결과

#### 도메인별 독립성 (낮을수록 분리 용이)

| 도메인 | 테이블 수 | 크로스-도메인 FK | 결합도 | 분리 난이도 |
|--------|----------|----------------|--------|------------|
| Archive | 2 | 2 (users, tenants) | 낮음 | 쉬움 |
| Radar | 9 | 3 (users, tenants, discovery) | 낮음 | 쉬움 |
| Proposals | 9 | 2 (users, tenants) | 낮음 | 쉬움~중간 |
| Ideas | 2 | 4 (users, tenants, conversations, radarItems) | 낮음~중간 | 중간 |
| Requests | 5 | 2 + Discovery 직접 쓰기 | 중간~높음 | 어려움 |
| Matrix | 7 | Signal/Topic 양방향 | 중간 | 중간~어려움 |
| Discovery | 31 | 다수 (핵심 도메인) | 높음 | 매우 어려움 |
| Chat/AI | 14 | 4 (users, tenants, radar, discovery) | 높음 | 어려움 |
| Core (users/tenants) | 4 | 모든 도메인에서 참조 | 최상 | 분리 불가 (공유) |

#### 순환 의존성: 2건 (즉시 위험 없음)
1. **Matrix <-> Signal**: 데이터 레벨 양방향 참조 (읽기만)
2. **Requests -> Discovery**: 단방향 강결합 (DB 직접 insert)

#### 분리 불가 영역 (단일 DB 필수)
- Discovery <-> Evidence <-> Ontology (31개 밀결합)
- Matrix <-> Cell <-> Scores (계산 일관성)
- Users <-> Tenants <-> TenantMembers (인증/인가)

### 2.3 공유 모듈 분류

| 분류 | 모듈 | Import 횟수 | 비고 |
|------|------|------------|------|
| **Core** | auth(143), utils(68), constants(26), types(5), context(5) | 247 | 모든 서비스에서 사용 |
| **Domain** | validation(17), services(111), ideas(6), ontology(6) | 140 | 특정 도메인 전용 |
| **Heavy** | agent(18/50파일), ai(13/8파일), embeddings(5), notifications(16), graph(25/10파일) | 77 | 외부 API, 무거운 처리 |
| **Utility** | acl(1), hooks(2), query(0), rate-limit(0), docs(1) | 4 | 작고 독립적 |

---

## 3. 전환 전략 비교

### Option A: 풀 MSA
각 도메인이 독립 서비스 + 독립 DB.

| 장점 | 단점 |
|------|------|
| 완전한 독립 배포/스케일링 | D1은 DB 분리가 비효율적 (SQLite 한계) |
| 팀별 도메인 소유 가능 | 크로스-도메인 FK 제거에 6개월+ |
| 장애 격리 | 5명 팀에 과도한 운영 복잡도 |
| | Cloudflare Pages 서비스 바인딩 미지원 |

**판정: 부적합** - 팀 규모(5명)와 인프라 제약(CF+D1)에 비해 과도한 복잡도

### Option B: 모듈러 모노리스
코드 경계만 명확히 분리, 배포는 하나.

| 장점 | 단점 |
|------|------|
| 리스크 최소 (배포 변경 없음) | 빌드/배포 속도 개선 없음 |
| DB 분리 불필요 | 성능 격리 불가 |
| 점진적 적용 가능 | AI 무거운 처리가 메인앱에 영향 지속 |

**판정: 부분 적합** - 코드 품질 개선에는 좋지만 성능 문제 미해결

### Option C: 하이브리드 (권장)
코어는 모듈러 모노리스 + 무거운 기능만 Worker로 추가 분리.

| 장점 | 단점 |
|------|------|
| 기존 4 Worker 구조 활용 | 일부 서비스 간 API 통신 필요 |
| 성능 격리 달성 (Heavy 모듈 분리) | 공유 라이브러리 관리 필요 |
| 점진적 적용 가능 | |
| DB 공유 유지 (D1 단일) | |
| CF 생태계 내에서 완결 | |

**판정: 권장** - 현재 인프라와 팀 규모에 최적

---

## 4. 권장안: 하이브리드 아키텍처

### 4.1 To-Be 아키텍처

```
                    +-------------------+
                    |  Cloudflare Pages |
                    |  (메인앱 - Slim)   |
                    |  SSR + UI + Auth  |
                    |  + Core Services  |
                    +--------+----------+
                             |
         +-------------------+-------------------+
         |           |           |               |
+--------v--+ +------v-----+ +--v---------+ +---v--------+
| agent-    | | radar-     | | collab-    | | venture-   |
| worker    | | worker     | | worker     | | worker     |
| (DO+SSE)  | | (Cron)     | | (Cron)     | | (Cron)     |
+-----------+ +------------+ +------------+ +------------+
         |           |           |               |
+--------v--+ +------v-----+    |               |
| analytics-| | vectorize- |    |               |
| worker    | | worker     |    |               |
| (NEW)     | | (NEW)      |    |               |
+-----------+ +------------+    |               |
         |           |          |               |
         +-----------+----------+---------------+
                     |
            +--------v---------+
            |    D1 (SQLite)   |
            |  단일 공유 DB     |
            +------------------+
```

### 4.2 서비스 분리 계획

#### Tier 1: 메인앱 (Slim Pages)
UI 렌더링 + 인증 + 경량 서비스만 유지.

**포함 모듈:**
- auth, constants, types, utils, context, hooks
- validation (상태 전환 규칙)
- services/discovery (query만 — 읽기 전용)
- services/dashboard, folder, idea, proposal, matrix, topic
- 모든 routes + components

**제외 대상 (Worker로 이관):**
- agent/ (50파일) -> agent-worker (이미 분리)
- ai/ + ai-pipeline/ -> agent-worker에 통합
- graph/ (10파일, 무거운 처리) -> analytics-worker (신규)
- embeddings/ -> vectorize-worker (신규)
- ontology/ (분석 엔진) -> analytics-worker (신규)
- notifications/alert-engine -> collab-worker에 통합

#### Tier 2: 기존 Worker 강화

| Worker | 현재 역할 | 추가 역할 |
|--------|----------|----------|
| agent-worker | AI 채팅 (DO) | + ai/ fallback 통합, + cost/ 토큰 관리 |
| radar-worker | 소스 수집 | 변경 없음 |
| collab-worker | 브리핑/메모리 | + notifications/alert-engine 통합 |
| venture-worker | Task Queue | 변경 없음 |

#### Tier 3: 신규 Worker

| Worker | 역할 | 이관 모듈 | 바인딩 |
|--------|------|----------|--------|
| **analytics-worker** | Graph 프로젝션, 온톨로지 분석, 스코어링 | graph/, ontology/, scoring | DB, Vectorize (graphs) |
| **vectorize-worker** | 임베딩 생성, 시맨틱 검색 | embeddings/ | DB, Vectorize (6개 전체), OpenAI |

### 4.3 서비스 간 통신

```
메인앱 -> agent-worker:     HTTP fetch + HMAC (기존 유지)
메인앱 -> analytics-worker:  HTTP fetch + HMAC (신규)
메인앱 -> vectorize-worker:  HTTP fetch + HMAC (신규)
Worker -> Worker:            DB 비동기 공유 (기존 패턴)
모든 서비스 -> D1:           직접 바인딩 (공유 DB)
```

### 4.4 메인앱 경량화 효과

| 항목 | Before | After (예상) |
|------|--------|-------------|
| lib/ 모듈 | 23개, ~26,200줄 | 15개, ~14,000줄 |
| Heavy 모듈 | 메인앱 내 | Worker로 분리 |
| 빌드 시간 | 전체 번들 | ~40% 감소 예상 |
| SSR 부하 | AI+Graph 포함 | UI+Auth+CRUD만 |

---

## 5. 코드 구조 리팩토링

### 5.1 Phase 0: 모듈러 모노리스 준비 (메인앱 내부)

메인앱의 features/ 패턴을 **Bounded Context**로 통일한다.
현재 requests만 완전한 BC 구조이므로, 나머지 도메인도 동일 패턴 적용.

```
app/features/
├── archive/          # 현재: schema만
│   ├── db/schema.ts
│   ├── service/      # NEW: lib/services/folder.service.ts 이동
│   └── ui/           # NEW: components/archive/ (없으면 생략)
│
├── ideas/            # 현재: schema만
│   ├── db/schema.ts
│   ├── service/      # NEW: lib/services/idea.service.ts 이동
│   └── ui/           # NEW: components/ideas/ 이동
│
├── matrix/           # 현재: schema + types
│   ├── db/schema.ts
│   ├── types.ts
│   ├── service/      # NEW: lib/services/matrix.service.ts + scoring.service.ts 이동
│   └── ui/           # NEW: components/matrix/ 이동
│
├── proposals/        # 현재: schema + constants
│   ├── db/schema.ts
│   ├── constants.ts
│   ├── service/      # NEW: lib/services/proposal/ 이동
│   └── ui/           # NEW: components/proposals/ 이동
│
├── requests/         # 현재: 완전한 BC (모범 사례)
│   ├── db/schema.ts
│   ├── service/      # query, entity, workflow, ai-reviewer
│   ├── events/       # 이벤트 테이블
│   └── ui/           # components
│
├── discovery/        # NEW: 핵심 도메인 통합
│   ├── db/           # schema.ts에서 discovery 관련 추출
│   ├── service/      # lib/services/discovery/ 이동
│   ├── validation/   # lib/validation/ 이동
│   └── ui/           # components/discovery/ 이동
│
├── radar/            # NEW: radar 도메인 통합
│   ├── db/           # schema.ts에서 radar 관련 추출
│   ├── service/      # lib/services/radar.service.ts 이동
│   └── ui/           # components/dashboard/ 일부 이동
│
└── chat/             # NEW: 채팅 도메인 통합
    ├── db/           # schema.ts에서 conversations/messages 추출
    ├── service/      # lib/services/topic.service.ts + signal.service.ts 이동
    └── ui/           # components/chat/ + components/topic/ 이동
```

### 5.2 크로스-도메인 의존성 해결

#### 문제 1: Requests -> Discovery 직접 DB 쓰기

```
현재 (app/features/requests/service/workflow.ts:162):
  db.insert(discoveries).values({...})

변경:
  1. Domain Event 발행 (event_outbox 테이블)
  2. Discovery 서비스가 이벤트를 소비하여 생성
  3. 또는 메인앱 라우트에서 오케스트레이션
```

#### 문제 2: DashboardService 멀티 도메인 쿼리

```
현재 (lib/services/dashboard.service.ts):
  discoveries + proposals + radarItems + experiments 조인

변경:
  1. CQRS 패턴: 각 도메인이 dashboard_summary 테이블에 비정규화 데이터 기록
  2. 또는 유지 (읽기 전용 쿼리는 결합도가 낮으므로)
```

#### 문제 3: Ideas -> Radar 크로스 참조

```
현재 (ideas.conversationId, ideaSources.radarItemId):
  직접 FK 참조

변경:
  ID-only 참조로 유지 (FK 제거, 애플리케이션 레벨 검증)
```

### 5.3 공유 라이브러리 추출

모든 도메인에서 공통으로 사용하는 모듈을 `app/lib/shared/`로 통합:

```
app/lib/shared/           # 모든 서비스에서 import 가능
├── auth/                 # 세션, 인증 가드
├── constants/            # 상태, 메서드, 실패 패턴
├── types/                # 전역 타입
├── utils/                # cn, display-title 등
└── db/                   # getDb, 스키마 머지, 마이그레이션

app/lib/workers/          # Worker에서만 사용하는 모듈
├── ai/                   # LLM fallback (-> agent-worker)
├── agent/                # AI Agent 엔진 (-> agent-worker)
├── graph/                # Graph 프로젝션 (-> analytics-worker)
├── embeddings/           # 벡터 임베딩 (-> vectorize-worker)
└── ontology/             # 온톨로지 분석 (-> analytics-worker)
```

---

## 6. 효율화: MSA 전 정리 대상

MSA 리팩토링 전에 불필요한 코드를 먼저 제거하여 이동 대상을 최소화한다.

### 6.1 코드베이스 상태

**미사용 코드 비율: < 0.6%** — 전반적으로 매우 깨끗한 상태.

### 6.2 즉시 제거 가능

| 대상 | 위치 | 줄 수 | 근거 |
|------|------|------|------|
| signalMetadata 테이블 | db/schema.ts | ~15 | import 0회, 코드에서 참조 없음 |

### 6.3 Feature Flag 정리 (12개 -> 0개 가능)

모든 FF가 true이므로 조건 분기를 제거하고 코드를 단순화할 수 있다.

**false 분기 없음 (조건문 자체 제거):**

| 플래그 | 위치 | 조치 |
|--------|------|------|
| FF_GRAPH_LAYER | executor-stream.ts:166 | if문 제거, 내부 코드만 유지 |
| FF_AGENT_DO | agent-do.stub.ts | 미사용, 삭제 |
| FF_TOPIC_COLLAB | wrangler.toml만 | 코드 참조 없음, 삭제 |
| FF_PROFILE_LEARNER | wrangler.toml만 | 코드 참조 없음, 삭제 |
| FF_SIMPLIFIED_NAV | root.tsx:38,118 | if문 제거, 내부 코드만 유지 |

**false 분기 있음 (true 경로만 남기고 제거):**

| 플래그 | 위치 | false 동작 | 조치 |
|--------|------|-----------|------|
| FF_ACL_SCOPE | acl/middleware.ts:26 | skip | true 고정, if문 제거 |
| FF_MEMORY_LIFECYCLE | executor-stream.ts:132 | skip | true 고정, if문 제거 |
| FF_VECTORIZE_SEARCH | api.cron.vectorize.ts:47 | skip | true 고정, if문 제거 |
| FF_PIPELINE_BRIDGE | api.cron.signal-route.ts:26 | skip | true 고정, if문 제거 |
| FF_COLLAB_WORKER | api.collab.worker.ts:19 | 503 응답 | true 고정, if문 제거 |
| FF_AI_FALLBACK | lib/ai/index.ts:24,41 | direct 호출 | true 고정, if문 제거 |
| FF_REQUIREMENTS_AGENT | routes/lab, api.requests | 비활성 | true 고정, if문 제거 |

**효과**: 조건 분기 ~50줄 제거 + wrangler.toml vars 12줄 제거 + 코드 복잡도 감소

### 6.4 LLM 호출 패턴 표준화

현재 두 가지 패턴이 혼용되어 있다:

```
callClaude(apiKey, request)  -- 직통 (Fallback 없음, 장애 시 실패)
callLLM(apiKey, request, ctx) -- Fallback 체인 (Anthropic -> Google -> Workers AI)
```

executor-stream.ts와 agent/tools/ 일부에서 `callClaude` 직접 호출.
**모두 `callLLM`으로 표준화**하면 Fallback 체인이 보장되고, MSA 분리 시 AI Worker 통합이 쉬워진다.

### 6.5 레거시 스키마 정리

| 대상 | 상태 | 조치 |
|------|------|------|
| agentMemory (v1) | agentMemoryV2로 대체됨 | 데이터 마이그레이션 확인 후 삭제 |
| signalMetadata | 참조 0회 | 마이그레이션으로 DROP |

### 6.6 과대 파일 분해 (MSA 이동 전 선행)

| 파일 | 줄 수 | 분해 방안 |
|------|------|----------|
| SourceInputPanel.tsx | 826 | DnD/필터/페이지네이션 -> 커스텀 훅으로 분리 |
| scoring.service.ts | 682 | 개별/합의 스코어링 Strategy 분리 |
| topic.service.ts | 652 | Query/Mutation/Event 분리 |
| graph/store.ts | 612 | loader/merger/validator/cache 분리 |
| MethodologyCards.tsx | 546 | 제목 추천 로직 훅 분리 |

### 6.7 Worker 공통 유틸 추출

4개 Worker에 중복된 코드 (~100줄):
- 에러 핸들링 패턴 (4회 반복)
- 타임스탬프 생성 (12회 반복)
- 헬스체크 응답 (4회 반복)

`packages/worker-utils/` 공유 패키지로 추출하면 Worker 추가 시에도 재사용 가능.

### 6.8 선택적 제거

| 대상 | 줄 수 | 근거 | 판단 |
|------|------|------|------|
| admin.costs.tsx | 122 | UI 미참조 (URL 직접 접근만) | 운영 도구면 유지 |
| admin.monitoring.tsx | 110 | UI 미참조 | 운영 도구면 유지 |
| admin.seed.tsx | 60 | UI 미참조 (개발용) | 프로덕션 불필요 시 삭제 |
| admin.users.tsx | 97 | UI 미참조 | 운영 도구면 유지 |

### 6.9 정리 효과 요약

| 항목 | 예상 줄 수 감소 | 비고 |
|------|---------------|------|
| FF 조건 분기 제거 | ~50줄 | 복잡도 감소 효과가 더 큼 |
| signalMetadata + agentMemory v1 | ~30줄 | DB 정리 |
| callClaude -> callLLM 통일 | ~0줄 (리네임) | 안정성 향상 |
| 과대 파일 분해 | ~0줄 (이동) | 가독성/테스트 용이성 |
| Worker 공통 유틸 | ~100줄 | 중복 제거 |
| admin.seed.tsx | ~60줄 | 선택적 |
| **합계** | **~240줄** | 코드 품질 대폭 향상 |

> 줄 수 감소보다 **복잡도 감소와 구조 개선**이 핵심 효과다.
> FF 12개 제거만으로 코드 경로가 단순해지고, MSA 이동 시 조건 분기를 신경 쓸 필요가 없어진다.

---

## 7. 실행 로드맵

### Phase 0: 효율화 정리 (1주)

**목표**: MSA 리팩토링 전 불필요한 코드 제거 + 과대 파일 분해

| 작업 | 설명 | 영향도 |
|------|------|--------|
| 0-1 | Feature Flag 12개 조건 분기 제거 (true 고정) | 중 |
| 0-2 | signalMetadata 테이블 DROP 마이그레이션 | 낮 |
| 0-3 | agentMemory v1 -> v2 마이그레이션 완료 확인 + v1 제거 | 중 |
| 0-4 | callClaude -> callLLM 표준화 | 중 |
| 0-5 | 과대 파일 분해 (graph/store, scoring, topic) | 낮 |
| 0-6 | Worker 공통 유틸 추출 (worker-utils/) | 낮 |

**검증**: 테스트 전체 통과 + typecheck + lint

### Phase 1: 모듈러 모노리스 정비 (2주)

**목표**: 코드 경계를 명확히 하여 향후 분리 준비

| 작업 | 설명 | 영향도 |
|------|------|--------|
| 1-1 | features/ Bounded Context 통일 (5.1 구조 적용) | 중 |
| 1-2 | lib/services/ -> features/*/service/ 이동 | 중 |
| 1-3 | 거대 파일 분해 (graph/store 612줄, scoring 682줄) | 낮 |
| 1-4 | Requests->Discovery 직접 쓰기 -> Event/Orchestration 전환 | 높 |
| 1-5 | shared/ 모듈 추출 (auth, constants, types, utils) | 낮 |

**검증**: 테스트 1,615개 전체 통과 + typecheck + lint

### Phase 2: analytics-worker 분리 (2주)

**목표**: 무거운 Graph/Ontology/Scoring 처리를 Worker로 이관

| 작업 | 설명 |
|------|------|
| 2-1 | analytics-worker 프로젝트 생성 (wrangler.toml) |
| 2-2 | graph/, ontology/, scoring 모듈 Worker로 이동 |
| 2-3 | 메인앱 -> analytics-worker HTTP API 설계 |
| 2-4 | HMAC 인증 적용 (기존 agent-worker 패턴 재사용) |
| 2-5 | 메인앱에서 graph/ontology import 제거, API 호출로 대체 |

**바인딩**: DB (D1), VECTORIZE_GRAPHS, ANTHROPIC_API_KEY

### Phase 3: vectorize-worker 분리 (1주)

**목표**: 임베딩 생성/검색을 전담 Worker로 이관

| 작업 | 설명 |
|------|------|
| 3-1 | vectorize-worker 프로젝트 생성 |
| 3-2 | embeddings/ 모듈 이동 |
| 3-3 | 6개 Vectorize 인덱스 바인딩 이관 |
| 3-4 | 메인앱 Vectorize 바인딩 제거, API 호출로 대체 |

**바인딩**: DB (D1), VECTORIZE_* (6개 전체), OPENAI_API_KEY

### Phase 4: agent-worker 강화 (1주)

**목표**: AI 관련 모듈을 agent-worker에 통합

| 작업 | 설명 |
|------|------|
| 4-1 | ai/ (LLM fallback) 모듈을 agent-worker에 통합 |
| 4-2 | ai-pipeline/ 모듈을 agent-worker에 통합 |
| 4-3 | cost/ (토큰 관리) 통합 |
| 4-4 | 메인앱에서 ai/ import 제거, agent-worker API로 대체 |

### Phase 5: 안정화 + 최적화 (2주)

| 작업 | 설명 |
|------|------|
| 5-1 | 전체 테스트 수정 및 통과 확인 |
| 5-2 | 배포 파이프라인 정비 (6개 Worker + 1 Pages) |
| 5-3 | 환경변수/시크릿 정리 (Worker별 최소 권한) |
| 5-4 | 모니터링: Worker별 에러율, 응답시간 확인 |
| 5-5 | 문서 업데이트 (CLAUDE.md, SPEC.md) |

### 타임라인 요약

```
Week 1:    Phase 0 — 효율화 정리 (FF 제거, 레거시 삭제, 파일 분해)
Week 2~3:  Phase 1 — 모듈러 모노리스 정비
Week 4~5:  Phase 2 — analytics-worker 분리
Week 6:    Phase 3 — vectorize-worker 분리
Week 7:    Phase 4 — agent-worker 강화
Week 8~9:  Phase 5 — 안정화 + 최적화
```

---

## 8. 리스크 및 완화 전략

| 리스크 | 확률 | 영향 | 완화 전략 |
|--------|------|------|----------|
| D1 단일 DB 병목 | 중 | 높 | DB 읽기 캐싱 (Worker KV), 쿼리 최적화 |
| Worker 간 HTTP 레이턴시 | 중 | 중 | 비동기 처리 (Fire-and-forget), 배치 API |
| 환경변수 관리 복잡도 | 높 | 낮 | wrangler.toml 통합 스크립트 작성 |
| 테스트 깨짐 | 높 | 중 | Phase별 테스트 수정, CI 게이트 유지 |
| Anthropic API 크레딧 부족 | 높 | 높 | AI Fallback 체인 강화 (이미 구현됨) |

---

## 9. 판단 기준 (Go/No-Go)

### Phase 1 이후 Go 기준
- [ ] 테스트 1,615개 전체 통과
- [ ] features/ BC 구조 통일 완료
- [ ] Requests->Discovery Event 전환 완료
- [ ] typecheck + lint 0 에러

### 최종 완료 기준
- [ ] 메인앱 번들 크기 30%+ 감소
- [ ] Heavy 모듈(agent, graph, embeddings) 메인앱에서 완전 제거
- [ ] 6개 Worker + 1 Pages 독립 배포 성공
- [ ] 전체 기능 정상 동작 확인

---

## 10. 결론

**풀 MSA는 부적합하다.** 5명 팀 + D1 단일 DB + CF Pages 제약 하에서 9개 독립 서비스로 분리하는 것은 운영 복잡도 대비 이득이 적다.

**하이브리드 접근이 최적이다.**
1. 메인앱 내부를 모듈러 모노리스로 정비 (코드 결합도 해결)
2. Heavy 모듈만 Worker로 추가 분리 (성능 영향 해결)
3. 기존 4 Worker 구조를 활용 (인프라 변경 최소화)

이 접근으로 **코드 결합도 + 성능 영향 + 팀 스케일링** 3가지 문제를 모두 해결하면서, 운영 복잡도를 관리 가능한 수준으로 유지할 수 있다.
