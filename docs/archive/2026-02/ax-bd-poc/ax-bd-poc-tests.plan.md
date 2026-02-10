# AX BD팀 PoC 테스트 시나리오 Plan

> **Summary**: ax-bd-poc 기능 구현 전체에 대한 테스트 시나리오 계획
>
> **Project**: Discovery-X
> **Version**: v4.2
> **Author**: Claude
> **Date**: 2026-02-09
> **Status**: Draft
> **Design Doc**: [ax-bd-poc.design.md](../../02-design/features/ax-bd-poc.design.md)

---

## 1. Overview

### 1.1 테스트 대상

ax-bd-poc 리팩토링에서 구현된 모든 코드를 테스트 대상으로 한다.

| 카테고리 | 구현 파일 | 테스트 유형 |
|---------|----------|-----------|
| Agent 도구 3개 | `discovery-tools.ts` | Integration |
| 도구 레지스트리 | `tool-registry.ts` | Unit |
| Radar API 수정 | `api.radar.sources.ts` | Integration |
| 즉시 요약 API | `api.radar.summarize.ts` | Integration |
| 아이템 상태 API | `api.radar.items.$id.status.ts` | Integration |
| 연관 소스 API | `api.similar-sources.ts` | Integration |
| 대화 sourceItemId | `api.conversations.ts` | Integration |
| Executor 소스 컨텍스트 | `executor.ts` | Integration |
| Embeddings Radar 동기화 | `sync.ts` | Integration |
| 시스템 프롬프트 | `system-prompt.ts` | Unit |
| Discovery 편집 필드 | `discoveries_.$id.edit.tsx` | Integration |
| 3-Pane 레이아웃 | `_index.tsx` | E2E |

### 1.2 테스트 스택

- **Unit/Integration**: Vitest + better-sqlite3 in-memory DB
- **E2E**: Playwright
- **패턴**: `createTestDb()` + `asDB()` 캐스팅 + `makeXxx()` 팩토리 함수
- **모킹**: `vi.stubGlobal("fetch")` (OpenAI/GPT), `vi.fn()` (Vectorize)

### 1.3 예상 테스트 수

| Type | 예상 건수 | 파일 |
|------|----------|------|
| Unit | 8건 | 2 파일 |
| Integration | 28건 | 5 파일 |
| E2E | 2건 | 1 파일 |
| **합계** | **38건** | **8 파일** |

---

## 2. Unit 테스트

### 2.1 도구 레지스트리 검증 (`tests/unit/agent/tool-registry-bd.test.ts`)

**목적**: 신규 3개 도구가 tool-registry에 올바르게 등록되어 있는지 검증

| # | 시나리오 | 검증 항목 |
|---|---------|----------|
| U-01 | `generate_idea_candidates` 도구 스키마 존재 | name, required, properties 구조 |
| U-02 | `select_idea_candidate` 도구 스키마 존재 | name, required 필드 (candidateGroupId, selectedDiscoveryId) |
| U-03 | `auto_fill_template` 도구 스키마 존재 | name, required 필드 (discoveryId) |

### 2.2 시스템 프롬프트 소스 컨텍스트 (`tests/unit/agent/system-prompt-bd.test.ts`)

**목적**: sourceContext가 전달될 때 시스템 프롬프트에 올바르게 포함되는지 검증

| # | 시나리오 | 검증 항목 |
|---|---------|----------|
| U-04 | sourceContext 있을 때 프롬프트 포함 | title, summaryKo, keyPoints가 포함됨 |
| U-05 | sourceContext null일 때 기본 프롬프트 | 소스 관련 섹션 없음 |
| U-06 | sourceContext에 keyPoints 없을 때 | keyPoints 섹션 생략 |
| U-07 | sourceContext에 url만 있을 때 | url만 포함, 나머지 생략 |
| U-08 | sourceContext가 빈 객체일 때 | 기본 프롬프트로 폴백 |

---

## 3. Integration 테스트

### 3.1 Agent 도구 — BD PoC 3개 (`tests/integration/agent/bd-poc-tools.test.ts`)

**목적**: 신규 3개 Agent 도구의 DB 상호작용 검증

**셋업**:
```typescript
let db: TestDB;
beforeEach(() => {
  resetFixtureCounter();
  db = createTestDb();
  // 기본 사용자 + Discovery 데이터 생성
});
```

#### `generate_idea_candidates`

| # | 시나리오 | 입력 | 검증 항목 |
|---|---------|------|----------|
| I-01 | 후보 3개 생성 | `{ count: 3 }` | candidateGroupId 반환, success: true |
| I-02 | 후보 1개 생성 | `{ count: 1 }` | candidateGroupId 반환 |
| I-03 | sourceContext 전달 | `{ count: 2, sourceContext: "AI 시장" }` | 정상 생성 |
| I-04 | industryCode 전달 | `{ count: 1, industryCode: "manufacturing" }` | 정상 생성 |

#### `select_idea_candidate`

| # | 시나리오 | 전제 조건 | 검증 항목 |
|---|---------|----------|----------|
| I-05 | 3개 중 1개 선택 | 후보 3개 (같은 groupId) | 선택 → IDEA_CARD, 나머지 2개 → DROP |
| I-06 | 선택 사유 포함 | reason 전달 | eventLogs에 사유 기록 |
| I-07 | 존재하지 않는 groupId | 잘못된 groupId | 에러 반환 (빈 후보 목록) |
| I-08 | 후보가 1개뿐일 때 선택 | 후보 1개 | IDEA_CARD 승격, DROP 없음 |

#### `auto_fill_template`

| # | 시나리오 | 전제 조건 | 검증 항목 |
|---|---------|----------|----------|
| I-09 | 전체 필드 채움 | IDEA_CARD Discovery | seedSummary, targetSegment, valueProposition 업데이트 |
| I-10 | 부분 필드 채움 | targetSegment만 | targetSegment만 업데이트, 나머지 미변경 |
| I-11 | 존재하지 않는 discoveryId | 잘못된 ID | 에러 반환 |

### 3.2 Radar API — 수정/신규 (`tests/integration/api/radar-bd.test.ts`)

**목적**: Radar 관련 API 변경사항 검증

**셋업**:
```typescript
// radarSources, radarItems 픽스처 + 사용자 세션 모킹
```

#### `GET /api/radar/sources` (수정)

| # | 시나리오 | 검증 항목 |
|---|---------|----------|
| I-12 | userId 필터 적용 | 해당 사용자의 소스만 반환 |
| I-13 | userId 없을 때 전체 반환 | 하위 호환 (기존 동작 유지) |

#### `PATCH /api/radar/items/:id/status` (신규)

| # | 시나리오 | 검증 항목 |
|---|---------|----------|
| I-14 | new → viewed 전환 | radarItemUserStatus UPSERT, viewedAt 설정 |
| I-15 | viewed → archived 전환 | archivedAt 설정 |
| I-16 | 잘못된 status 값 | 400 에러 (Zod 검증) |
| I-17 | 존재하지 않는 itemId | 404 에러 |

#### `POST /api/radar/summarize` (신규)

| # | 시나리오 | 검증 항목 |
|---|---------|----------|
| I-18 | keyPoints 미존재 → GPT 호출 | fetch 호출 확인, DB 저장, 응답에 keyPoints 포함 |
| I-19 | keyPoints 이미 존재 → 캐시 | fetch 미호출, DB 기존값 반환 |
| I-20 | 존재하지 않는 itemId | 404 에러 |
| I-21 | GPT API 에러 | 500 에러 + 적절한 메시지 |

#### `GET /api/similar-sources` (신규)

| # | 시나리오 | 검증 항목 |
|---|---------|----------|
| I-22 | Vectorize 정상 응답 | score >= 0.7 필터, radarItems 상세 정보 JOIN |
| I-23 | Vectorize 바인딩 없음 | 빈 배열 반환 (폴백) |
| I-24 | 존재하지 않는 itemId | 빈 배열 반환 |

### 3.3 Executor 소스 컨텍스트 (`tests/integration/agent/executor-source-context.test.ts`)

**목적**: executor.ts의 sourceContext 조회 로직 검증

| # | 시나리오 | 전제 조건 | 검증 항목 |
|---|---------|----------|----------|
| I-25 | 소스 연결된 대화 | conversation.sourceItemId → radarItem | buildSystemPrompt에 sourceContext 전달 |
| I-26 | 소스 없는 대화 | sourceItemId = null | sourceContext = null, 기본 프롬프트 |
| I-27 | radarItem 삭제된 경우 | sourceItemId 있으나 아이템 없음 | sourceContext = null (에러 없이 진행) |

### 3.4 Embeddings Radar 동기화 (`tests/integration/embeddings/radar-sync.test.ts`)

**목적**: sync.ts의 Radar 아이템 임베딩 동기화 검증

| # | 시나리오 | 검증 항목 |
|---|---------|----------|
| I-28 | embeddingUpdatedAt NULL인 아이템 동기화 | OpenAI API 호출, Vectorize upsert, embeddingUpdatedAt 갱신 |

---

## 4. E2E 테스트

### 4.1 3-Pane 레이아웃 (`tests/e2e/bd-poc-layout.spec.ts`)

**목적**: 메인 화면 3-Pane 레이아웃 상호작용 검증

| # | 시나리오 | 검증 항목 |
|---|---------|----------|
| E-01 | lg 화면에서 3-Pane 렌더링 | SourcePanel(좌), ChatPanel(중), SummaryPanel(우) 모두 표시 |
| E-02 | 소스 패널 토글 | 토글 버튼 클릭 → 패널 열림/닫힘 |

---

## 5. 테스트 파일 구조

```
tests/
├── unit/
│   └── agent/
│       ├── tool-registry-bd.test.ts      # U-01~U-03 (3건)
│       └── system-prompt-bd.test.ts      # U-04~U-08 (5건)
├── integration/
│   ├── agent/
│   │   ├── bd-poc-tools.test.ts          # I-01~I-11 (11건)
│   │   └── executor-source-context.test.ts # I-25~I-27 (3건)
│   ├── api/
│   │   └── radar-bd.test.ts              # I-12~I-24 (13건)
│   └── embeddings/
│       └── radar-sync.test.ts            # I-28 (1건)
└── e2e/
    └── bd-poc-layout.spec.ts             # E-01~E-02 (2건)
```

---

## 6. 구현 우선순위

| 순서 | 파일 | 테스트 수 | 이유 |
|------|------|----------|------|
| 1 | `bd-poc-tools.test.ts` | 11 | 핵심 Agent 도구 — 가장 높은 비즈니스 영향도 |
| 2 | `radar-bd.test.ts` | 13 | 4개 API 엔드포인트 — 데이터 무결성 핵심 |
| 3 | `executor-source-context.test.ts` | 3 | 소스 컨텍스트 end-to-end 흐름 |
| 4 | `tool-registry-bd.test.ts` | 3 | 도구 등록 스키마 검증 |
| 5 | `system-prompt-bd.test.ts` | 5 | 프롬프트 생성 로직 |
| 6 | `radar-sync.test.ts` | 1 | Embeddings 동기화 확장 |
| 7 | `bd-poc-layout.spec.ts` | 2 | E2E — 배포 후 검증 |

---

## 7. 테스트 헬퍼 확장

### 7.1 fixtures.ts 추가 필요

```typescript
// 기존 makeUser, makeDiscovery 외 추가
export function makeRadarItem(overrides?: Partial<NewRadarItem>): NewRadarItem;
export function makeRadarSource(overrides?: Partial<NewRadarSource>): NewRadarSource;
export function makeConversation(overrides?: Partial<NewConversation>): NewConversation;
export function makeRadarItemUserStatus(overrides?: Partial<NewRadarItemUserStatus>): NewRadarItemUserStatus;
```

### 7.2 Vectorize Mock 패턴

```typescript
function makeMockVectorizeIndex() {
  const store = new Map<string, { values: number[]; metadata?: Record<string, string> }>();
  return {
    upsert: vi.fn(async (vectors) => { /* ... */ }),
    query: vi.fn(async (vector, options) => { /* ... */ }),
    _store: store,
  };
}
```

기존 `tests/unit/embeddings/embedding-service.test.ts`의 패턴을 재사용한다.

---

## 8. 성공 기준

- [ ] 38개 테스트 전체 PASS
- [ ] 기존 561개 테스트 regression 없음 (총 599개)
- [ ] 신규 Agent 도구 3개 100% 커버
- [ ] 신규 API 3개 정상/에러 케이스 모두 커버
- [ ] sourceContext 경로 (conversation → radarItem → prompt) end-to-end 검증

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-02-09 | Initial draft | Claude |
