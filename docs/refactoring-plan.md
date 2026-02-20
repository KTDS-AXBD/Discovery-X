# Discovery-X 리팩토링 계획

> 작성일: 2026-02-20 | 분석 기준: v6.18 | 총 코드: 86,699줄 (484 파일)

---

## 0. 현황 요약

### 핵심 문제
프로젝트 방향이 v1→v3→v4→v5→v6까지 반복 수정되면서 **사용하지 않는 기능이 누적**되었다.
- **203개 라우트** 중 GNB에 노출되는 탭은 **5개** (대시보드/아이디어/사업제안/시그널/실험실)
- GNB에 없는 대규모 모듈: Venture(52파일+20라우트), Market(3라우트), Knowledge(5라우트), Agent DO(3라우트), Briefing(3라우트), Discoveries(16라우트)
- Dashboard 서브라우트 12개 중 **10개**가 어디서도 링크되지 않음
- Cron 19개가 파일로 존재하나 **wrangler.toml에 단 하나도 등록되지 않음**
- 서비스 레이어 사용률 **9.4%** — 라우트의 55.7%가 직접 DB 조작

### 현재 GNB 구조 (실제 사용 가능 경로)
```
/ → /dashboard (리다이렉트)
├── 대시보드     /dashboard
├── 아이디어     /ideas, /ideas/:id
├── 사업제안     /proposals, /proposals/:id, /proposals/new
├── 시그널       /signals
└── 실험실       /lab, /lab/analysis, /lab/review, /lab/methods, /lab/matrix
    + 검색       /search
    + 설정       /settings
    + 프로필     /profile
    + 관리자     /admin/*
```

### GNB에 없는 모듈 (접근 경로 없거나 불명확)
```
/discoveries/*     — 16개 라우트 (Discovery 원본 CRUD, GNB 미노출)
/venture/*         — 20개 라우트 + 52개 모듈 파일 (Venture Sprint, GNB 미노출)
/market/*          — 3개 라우트 (참조 0건, 완전 dead)
/knowledge/*       — 5개 라우트 (팀 지식 베이스, GNB 미노출)
/briefing/*        — 3개 라우트 (일간 브리핑, GNB 미노출)
/agent/*           — 3개 라우트 (Agent 대화, GNB 미노출)
/topics/*          — 3개 라우트 + 9개 API (Topic 협업, GNB 미노출)
/valueup/*         — 2개 라우트 (Value-up 시나리오)
/docs              — 도움말
/evidence/*        — 1개 라우트 (근거 중복 관리)
/methods           — 1개 라우트 (방법론 — lab/methods와 중복?)
/metrics           — 1개 라우트 (지표 대시보드)
/radar             — 1개 라우트 (소스 관리 — dashboard에 통합됨)
/recall            — 1개 라우트 (재호출 큐)
/review            — 1개 라우트 (주간 리뷰)
```

---

## 1. 리팩토링 원칙

1. **제거보다 정리 우선** — 코드를 즉시 삭제하지 않고, 먼저 "활성/보류/폐기" 분류
2. **서비스 레이어 일관성** — 새 기능은 반드시 Service 경유, 기존은 점진적 이관
3. **Feature Flag 기반 점진적 정리** — 불필요한 모듈은 FF로 비활성화 후 관찰
4. **확장성 구조** — 도메인별 모듈 경계를 명확히 하여 새 기능 추가 시 영향 범위 최소화

---

## 2. Phase 1: Dead Code 정리 (예상 절감: ~5,000줄)

### 2.1 완전 Dead 라우트 제거

| 라우트 | 파일 수 | 참조 | 판정 |
|--------|---------|------|------|
| `/market/*` | 3 (layout + index + $id) | **0건** | **즉시 제거** |
| `/evidence/duplicates` | 1 | **0건** | **즉시 제거** |
| Dashboard 서브라우트 10개 | 10 | **0건** (alerts, assets, audit-log, exec, failure-replay, health, metrics, ops-metrics, ops, shadow) | **FF 비활성화 후 제거** |

> **주의**: Dashboard 서브라우트는 기능 자체가 폐기된 건지, GNB 네비게이션이 누락된 건지 확인 필요.
> → 만약 `dashboard._index`에서 탭 링크가 있다면 "링크 누락"이고, 없다면 "기능 폐기"로 판단.

### 2.2 Components 정리 대상

| 디렉토리 | 파일 수 | 외부 참조 | 판정 |
|----------|---------|----------|------|
| `components/industry/` | 1 | 0 | **즉시 제거** |
| `components/market/` | 2 | market 라우트에서만 사용 | market 라우트와 함께 제거 |
| `components/shadow/` | 2 | dashboard.shadow에서만 사용 | dashboard 정리 시 함께 판단 |
| `components/compliance/` | 2 | discoveries compliance에서만 | 유지 (discoveries 활성 시) |

### 2.3 Feature Flag 게이트 모듈 정리 판단

| Feature Flag | 모듈 | 줄 수 | 활성 상태 | 권장 |
|-------------|-------|-------|----------|------|
| `FF_AGENT_DO` | Agent DO (Durable Object) | ~500 | **확인 필요** | 비활성이면 코드 제거 |
| `FF_COLLAB_WORKER` | collab-worker | ~200 | **확인 필요** | 비활성이면 코드 제거 |
| `FF_ACL_SCOPE` | ACL 시스템 (287줄) | 287 | 1개 라우트에서만 사용 | **제거 후보** |
| `FF_PIPELINE_BRIDGE` | pipeline-bridge (291줄) | 291 | Cron에서만 사용 | 유지 관찰 |
| `FF_PROFILE_LEARNER` | profile-learner | ~100 | Cron에서만 | 유지 관찰 |

---

## 3. Phase 2: Cron 통합 (19개 → 7~8개)

현재 19개 Cron 라우트가 **wrangler.toml에 등록되지 않은 채** 존재. 대부분 HTTP 트리거로 호출.

### 통합 그룹

| 그룹 | 현재 라우트 | 통합 안 |
|------|------------|---------|
| **Vectorize 계열** (3개) | graph-vectorize, memory-vectorize, signal-vectorize | → `api.cron.vectorize.ts` 1개로 통합 (type 파라미터로 분기) |
| **Lab 계열** (2개) | lab-extract, lab-analyze | → `api.cron.lab.ts` 1개로 통합 |
| **Memory 계열** (2개) | memory-compact, memory-vectorize | memory-vectorize는 위 vectorize 통합, compact는 독립 유지 |
| **Daily 통합** | daily (372줄 — 이미 여러 작업 통합) | 유지 (추가 통합 가능: alerts, weekly-summary) |
| **독립 유지** | embeddings, pattern-extract, shadow-analyze, agent-review, log-archive, projection-sync, signal-route, briefing, matrix-scoring | 각각 독립적 역할 |

### 제거 후보
- `api.cron.profile-learn.ts` (45줄) — FF_PROFILE_LEARNER 비활성 시 제거
- `api.cron.signal-route.ts` (45줄) — Integration 모듈 활용도 검증 후 판단

---

## 4. Phase 3: 아키텍처 레이어 정리 (핵심)

### 4.1 서비스 레이어 강화

**현황**: 203개 라우트 중 19개(9.4%)만 서비스 경유. 113개(55.7%)가 drizzle 직접 사용.

**목표**: 핵심 도메인의 쓰기 오퍼레이션을 서비스로 이관 (읽기 전용 조회는 라우트 직접 OK).

| 서비스 | 현재 상태 | 이관 대상 |
|--------|----------|----------|
| `DiscoveryService` | list/detail만 제공 | **상태 전환 9개 라우트의 로직 통합**: promote, decide-next, decide-not-now, decide-dead-end, gate, add-experiment, add-evidence, complete-experiment, approve |
| `ProposalService` | 구현 존재하나 라우트에서 미사용 | proposals API 라우트가 서비스 경유하도록 연결 |
| `RadarService` | agent tool에서만 간접 사용 | dashboard 라우트에서도 서비스 경유 |
| `VentureService` | 89줄, agent tool 전용 | Venture 모듈 활성화 시 확대 |
| `IdeaService` | matrix 관련에서만 사용 | ideas 라우트에서 서비스 경유 |

### 4.2 Agent Executor 분리 (9,757줄 → 모듈화)

현재 Agent 모듈이 프로젝트에서 **가장 비대** (9,757줄).

```
현재 구조:
agent/
├── tool-registry.ts  (1,323줄 — 65개 tool JSON schema)
├── executor.ts       (912줄 — 거대한 switch)
├── tools/            (14개 파일, ~5,000줄)
└── ...기타 (claude-client, context-builder, etc.)

제안 구조:
agent/
├── executor.ts       (200줄 — dispatch만)
├── tool-map.ts       (자동 등록 맵)
├── tools/
│   ├── discovery/
│   │   ├── handlers.ts   (tool 구현)
│   │   └── schema.ts     (JSON schema — registry에서 분리)
│   ├── query/
│   ├── valueup/
│   └── ...
└── ...기타
```

- `switch` 문 → `Map<string, ToolHandler>` 패턴
- tool-registry.ts 분해 → 각 도메인별 schema 파일로 colocate
- 각 tool이 `{ name, schema, handler }` 형태로 자기 등록

### 4.3 도메인 모듈 경계 명확화

현재 코드가 흩어진 패턴:
```
Discovery 관련:
  app/routes/discoveries*.tsx          (16개 라우트)
  app/components/discovery/            (1개 컴포넌트)
  app/lib/services/discovery.service   (서비스)
  app/lib/validation/discovery-rules   (검증)
  app/lib/agent/tools/discovery-tools  (Agent tool)
  app/db/schema.ts                     (스키마 — 머지됨)
```

**제안**: 도메인별 모듈 경계를 `app/features/` 패턴으로 통일
```
app/features/discovery/
├── db/schema.ts        (현재 app/db/schema.ts에서 분리)
├── services/           (discovery.service + recall-tracking.service)
├── validation/         (discovery-rules)
├── ui/                 (컴포넌트)
└── constants/          (status, transitions)
```

> 단, 이 리팩토링은 영향 범위가 크므로 **Phase 3 후반**에 점진적 수행.

---

## 5. Phase 4: Venture 모듈 결정

Venture는 가장 큰 모듈 (52파일, 20라우트, 7 API)이나 **GNB에서 접근 불가**.

### 옵션

| 옵션 | 설명 | 권장 |
|------|------|------|
| A. 활성화 | GNB에 Venture 탭 추가, 적극 사용 | Venture Sprint 기능이 필요하다면 |
| B. 보류 | 코드 유지하되 FF_VENTURE로 게이트 | 향후 활성화 가능성 있으면 |
| C. 아카이브 | `app/_archived/venture/`로 이동 | 당분간 사용 계획 없으면 |
| **D. 제거** | 완전 삭제 (52파일, ~4,000줄) | 방향이 완전히 변경되었다면 |

> **사용자 결정 필요**: Venture Discovery Sprint 기능의 향후 방향

### 유사하게 결정 필요한 모듈

| 모듈 | 파일/라우트 | GNB 접근 | 결정 필요 |
|------|------------|----------|----------|
| Discoveries CRUD | 16 라우트 | 없음 | 아이디어/Lab에 통합? 독립 유지? |
| Knowledge | 5 라우트 | 없음 | 활성화? 제거? |
| Agent 대화 | 3 라우트 | 없음 | 활성화? 제거? |
| Topics | 3 라우트 + 9 API | 없음 | 활성화? 제거? |
| Briefing | 3 라우트 | 없음 | 활성화? 제거? |
| ValueUp | 2 라우트 | 없음 | 활성화? 제거? |

---

## 6. Phase 5: 구조적 개선 (확장성)

### 6.1 라우트 파일 정리

현재 203개 라우트가 **flat-file** 구조로 나열. Remix v2의 folder convention 활용:

```
현재: app/routes/api.matrix.$cellId.scores.ts
제안: app/routes/api.matrix+/$cellId.scores.ts (또는 __matrix/ 폴더)
```

> Remix v2에서는 `routes/` 디렉토리의 flat convention이 기본이므로,
> 폴더 구조로 전환하려면 `v2_routeConvention`을 사용.
> 현 시점에서는 **네이밍 일관성 정리**만 수행하고, 폴더화는 Remix v3 마이그레이션 시 검토.

### 6.2 DB Schema 분리 안정화

현재 `app/db/index.ts`에서 7개 스키마를 머지:
```typescript
schema, ventureSchema, proposalSchema, archiveSchema,
ideasSchema, tokenUsageSchema, v2Schema, matrixSchema
```

**문제**: `schema.ts`가 모놀리식 (기본 테이블 전부 포함)

**제안**: Phase 4에서 결정된 "활성 모듈"의 스키마만 남기고,
비활성 모듈의 스키마는 `_archived/` 또는 별도 파일로 분리.
단, **마이그레이션 호환성** 유의 (테이블 drop 없이 코드에서만 분리).

### 6.3 테스트 구조

현재 테스트 959개. 리팩토링 후 broken test 방지를 위해:
- 각 Phase 완료 시 `pnpm test` 전체 통과 확인
- 제거 대상 모듈의 테스트도 함께 제거 (orphan test 방지)

---

## 7. 실행 우선순위

| 순서 | Phase | 예상 영향 | 난이도 | 비고 |
|------|-------|----------|--------|------|
| 1 | **Dead Code 정리** (§2) | ~5,000줄 감소 | 낮음 | market/industry 즉시 제거, dashboard 서브라우트 확인 후 |
| 2 | **Cron 통합** (§3) | 19→8개 (가독성↑) | 낮음 | vectorize/lab 통합 |
| 3 | **Venture 등 모듈 결정** (§4) | 최대 ~4,000줄 감소 | **사용자 결정** | 방향 결정 필수 |
| 4 | **서비스 레이어 강화** (§4.1) | 아키텍처 개선 | 중간 | Discovery 상태 전환 서비스화 우선 |
| 5 | **Agent Executor 분리** (§4.2) | 유지보수성↑ | 중간 | switch→Map, schema colocate |
| 6 | **도메인 모듈 경계** (§4.3) | 확장성↑ | 높음 | 점진적, feature/ 패턴 확산 |

---

## 8. 예상 결과

| 지표 | Before | After (Phase 1-3 완료) | After (전체 완료) |
|------|--------|----------------------|------------------|
| 총 줄 수 | 86,699 | ~75,000 | ~70,000 |
| 라우트 수 | 203 | ~170 | ~150 |
| Cron 수 | 19 | 8 | 8 |
| 서비스 경유율 | 9.4% | 20%+ | 40%+ |
| Agent executor 줄 수 | 912 | 912 | ~200 |
| Dead 컴포넌트 디렉토리 | 2+ | 0 | 0 |

---

## 9. 다음 단계 (사용자 결정 필요)

1. **Dashboard 서브라우트 10개**: 기능 폐기인지, 네비게이션 누락인지? → 현재 접근 불가하므로 확인 필요
2. **Venture 모듈**: 활성화(A) / 보류(B) / 아카이브(C) / 제거(D)?
3. **Discoveries 원본 CRUD**: 아이디어/Lab 워크플로우에 통합? 독립 유지?
4. **Knowledge/Agent/Topics/Briefing/ValueUp**: 각각 활성화 vs 제거?
5. **Feature Flag 현재 프로덕션 설정 값**: `.dev.vars`에서 각 FF의 실제 true/false 확인

> 이 결정들이 내려지면 Phase 1~3의 구체적 실행 계획을 세울 수 있습니다.
