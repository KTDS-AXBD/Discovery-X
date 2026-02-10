# AX BD팀 PoC Design Document — Core Table Extension

> **Summary**: Discovery-X의 기존 core 테이블을 확장하고 기존 라우트를 수정하여 BD팀 워크스페이스 기능을 구현하는 상세 설계. 신규 테이블 1개 + 기존 테이블 6개 컬럼 확장으로 최소 변경.
>
> **Project**: Discovery-X
> **Version**: v4.2
> **Author**: Claude
> **Date**: 2026-02-09 (최초), 2026-02-10 (현행화)
> **Status**: Implemented
> **Planning Doc**: [ax-bd-poc.plan.md](../../01-plan/features/ax-bd-poc.plan.md)
> **Analysis Doc**: [ax-bd-poc.analysis.md](../../03-analysis/ax-bd-poc.analysis.md)

---

## 1. Overview

### 1.1 Design Goals

1. **기존 테이블 확장**: `radarSources`, `radarItems`, `conversations`, `discoveries` 등 core 테이블에 필요한 컬럼만 추가
2. **신규 테이블 최소화**: `radar_item_user_status` 1개만 신규 생성
3. **기존 라우트 통합**: `_index.tsx`(3-Pane), `radar.tsx` 등 기존 라우트에 기능 통합
4. **Agent 도구 3개 추가**: 기존 `discovery-tools.ts`에 BD PoC 전용 도구 함수 추가

### 1.2 Design Principles

- **Core Extension 패턴**: 기존 테이블 구조를 유지하며 ADD COLUMN만 사용 (breaking change 없음)
- **기존 인프라 재사용**: Vectorize `VECTORIZE_RADAR` 인덱스 재사용 (신규 인덱스 불필요)
- **Agent 도구 조합**: 신규 도구가 기존 `create_discovery` 등과 조합하여 동작
- **레이아웃 통합**: 기존 `_index.tsx`를 3-Pane으로 확장 (별도 레이아웃 불필요)

### 1.3 Architecture Decision Record

**결정**: Feature Module(`app/features/workspace/`) 대신 Core Table Extension 선택

| 기준 | Feature Module | Core Extension (선택) |
|------|---------------|---------------------|
| 개발 기간 | 14일 (ws_* 7개 테이블) | 2일 (컬럼 추가) |
| 코드 재사용 | ~30% | ~70% |
| Core 영향 | 없음 | 최소 (ADD COLUMN) |
| 복잡도 | 높음 (새 모듈) | 낮음 (기존 패턴) |
| 향후 분리 | 용이 | 리팩토링 필요 |

**근거**: PoC 단계에서는 빠른 검증이 우선이며, 기존 기능과 70% 이상 중복되므로 Core Extension이 적합.

---

## 2. Architecture

### 2.1 시스템 아키텍처

```
┌─ Discovery-X v4.2 ─────────────────────────────────────────────────────┐
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    _index.tsx (3-Pane Layout)                    │   │
│  │  ┌──────────┐  ┌──────────────────┐  ┌───────────────────────┐  │   │
│  │  │SourcePanel│  │    ChatPanel     │  │    SummaryPanel       │  │   │
│  │  │ (240px)   │  │    (flex-1)      │  │    (320px)            │  │   │
│  │  │           │  │                  │  │                       │  │   │
│  │  │ 소스 탭    │  │  Agent 채팅      │  │  소스 요약            │  │   │
│  │  │ 히스토리 탭│  │  (SSE 스트리밍)  │  │  아이디어 후보 카드    │  │   │
│  │  │ 연관 소스  │  │                  │  │  템플릿 미리보기       │  │   │
│  │  └──────────┘  └──────────────────┘  └───────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                        API Endpoints                             │   │
│  │  api.radar.sources.ts (수정)  │  api.radar.items.$id.status.ts  │   │
│  │  api.radar.summarize.ts       │  api.similar-sources.ts         │   │
│  │  api.conversations.ts (수정)  │  api.chat.ts (기존 유지)        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                    Agent System (executor.ts)                    │   │
│  │  sourceContext 조회 → system-prompt 주입 → Agent 도구 호출       │   │
│  │  도구 48개 (기존 45 + BD PoC 3)                                  │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │                   Core Tables (D1/SQLite)                        │   │
│  │  radarSources (+userId, keywords, radarTags)                    │   │
│  │  radarItems (+keyPoints, embeddingUpdatedAt)                    │   │
│  │  radar_item_user_status (신규)                                   │   │
│  │  conversations (+sourceItemId)                                   │   │
│  │  discoveries (+targetSegment, valueProposition, candidateGroupId)│   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  외부 연동:                                                             │
│  - Vectorize (VECTORIZE_RADAR) — 연관 소스 추천                        │
│  - OpenAI API — 요약/임베딩 (gpt-4o-mini, text-embedding-3-small)     │
│  - Claude API — Agent 채팅 (tool_use, SSE)                             │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
사용자 키워드/태그 등록 → radarSources (userId 필터)
  → Cron/수동 수집 → radarItems (score, summaryKo 포함)
    → 소스 클릭 → api.radar.summarize (keyPoints 생성/캐시)
      → "대화 시작" → conversations.sourceItemId 설정
        → executor.ts: sourceContext 조회 (radarItem)
        → system-prompt.ts: 소스 컨텍스트 주입
        → Agent 채팅 → 연관 소스 추천 (VECTORIZE_RADAR)
        → "아이디어 만들어줘" → generate_idea_candidates (groupId 발행)
          → create_discovery × N (candidateGroupId 지정)
          → select_idea_candidate (1개 → IDEA_CARD, 나머지 → DROP)
            → auto_fill_template (hypothesis, targetSegment, valueProposition)
```

### 2.3 파일 구조 (변경분)

```
app/
├── routes/
│   ├── _index.tsx              ← 3-Pane 레이아웃 (수정)
│   ├── radar.tsx               ← 키워드/태그/상태 관리 UI (수정)
│   ├── discoveries.$id.tsx     ← 템플릿 뷰 섹션 (수정)
│   ├── discoveries_.$id.edit.tsx ← 신규 필드 폼 (수정)
│   ├── api.radar.sources.ts    ← userId 필터링 (수정)
│   ├── api.radar.items.$id.status.ts ← 사용자 상태 변경 (신규)
│   ├── api.radar.summarize.ts  ← 온디맨드 요약 (신규)
│   ├── api.similar-sources.ts  ← 연관 소스 추천 (신규)
│   └── api.conversations.ts    ← sourceItemId 저장 (수정)
├── components/chat/
│   ├── SourcePanel.tsx         ← 좌측 패널 (신규)
│   ├── SummaryPanel.tsx        ← 우측 패널 (신규)
│   └── IdeaCandidateCards.tsx  ← 후보 카드 UI (신규)
├── lib/agent/
│   ├── tools/discovery-tools.ts ← Agent 도구 3개 추가 (수정)
│   ├── tool-registry.ts        ← 도구 레지스트리 등록 (수정)
│   ├── system-prompt.ts        ← sourceContext 프롬프트 주입 (수정)
│   └── executor.ts             ← sourceContext 조회 로직 (수정)
├── lib/embeddings/
│   └── sync.ts                 ← Radar 아이템 Embedding 동기화 (수정)
└── db/
    └── schema.ts               ← 테이블 확장 + 신규 테이블 (수정)
```

---

## 3. Data Model

### 3.1 설계 원칙

- **ADD COLUMN 전용**: 기존 테이블에는 ADD COLUMN만 사용, 기존 컬럼 변경/삭제 없음
- **D1/SQLite 호환**: `integer("field", { mode: "timestamp" })` + `sql\`(unixepoch())\`` 패턴 준수
- **Drizzle ORM**: `app/db/schema.ts` 단일 파일에서 관리
- **JSON 컬럼**: Drizzle 자동 직렬화 (`JSON.parse()`/`JSON.stringify()` 수동 호출 금지)

### 3.2 기존 테이블 확장 (5개)

#### `radarSources` — 사용자별 소스 수집 (FR-01)

추가 컬럼:
```typescript
// app/db/schema.ts (기존 radarSources에 추가)
userId: text("user_id").references(() => users.id),
keywords: text("keywords", { mode: "json" }).$type<string[]>(),
radarTags: text("radar_tags", { mode: "json" }).$type<string[]>(),
```

인덱스: `idx_radar_sources_user_id ON radar_sources(user_id)`

#### `radarItems` — 핵심 포인트 + Embedding 추적 (FR-03, FR-05)

추가 컬럼:
```typescript
// app/db/schema.ts (기존 radarItems에 추가)
keyPoints: text("key_points", { mode: "json" }).$type<string[]>(),
embeddingUpdatedAt: integer("embedding_updated_at", { mode: "timestamp" }),
```

#### `conversations` — 소스 연결 대화 (FR-04)

추가 컬럼:
```typescript
// app/db/schema.ts (기존 conversations에 추가)
sourceItemId: text("source_item_id").references(() => radarItems.id),
```

#### `discoveries` — 아이디어 템플릿 + 후보 그룹 (FR-07, FR-09)

추가 컬럼:
```typescript
// app/db/schema.ts (기존 discoveries에 추가)
targetSegment: text("target_segment", { length: 200 }),
valueProposition: text("value_proposition", { length: 400 }),
candidateGroupId: text("candidate_group_id"),
```

인덱스: `idx_discoveries_candidate_group ON discoveries(candidate_group_id)`

### 3.3 신규 테이블 (1개)

#### `radar_item_user_status` — 사용자별 소스 열람 상태 (FR-02)

```typescript
export const radarItemUserStatus = sqliteTable(
  "radar_item_user_status",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    itemId: text("item_id").notNull().references(() => radarItems.id),
    status: text("status").notNull().default("new"), // new | viewed | archived
    viewedAt: integer("viewed_at", { mode: "timestamp" }),
    archivedAt: integer("archived_at", { mode: "timestamp" }),
    tenantId: text("tenant_id").references(() => tenants.id),
  },
  (table) => ({
    userItemIdx: index("idx_rius_user_item").on(table.userId, table.itemId),
    statusIdx: index("idx_rius_status").on(table.status),
    tenantIdx: index("idx_rius_tenant").on(table.tenantId),
  })
);
```

### 3.4 마이그레이션

파일: `drizzle/0020_bd_poc_refactoring.sql`

```sql
-- FR-01: radarSources 사용자별 소스
ALTER TABLE radar_sources ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE radar_sources ADD COLUMN keywords TEXT DEFAULT '[]';
ALTER TABLE radar_sources ADD COLUMN radar_tags TEXT DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_radar_sources_user_id ON radar_sources(user_id);

-- FR-03: radarItems 핵심 포인트 + Embedding
ALTER TABLE radar_items ADD COLUMN key_points TEXT DEFAULT '[]';
ALTER TABLE radar_items ADD COLUMN embedding_updated_at INTEGER;

-- FR-02: 사용자별 소스 열람 상태
CREATE TABLE IF NOT EXISTS radar_item_user_status (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  item_id TEXT NOT NULL REFERENCES radar_items(id),
  status TEXT NOT NULL DEFAULT 'new',
  viewed_at INTEGER,
  archived_at INTEGER,
  tenant_id TEXT REFERENCES tenants(id)
);
CREATE INDEX IF NOT EXISTS idx_rius_user_item ON radar_item_user_status(user_id, item_id);
CREATE INDEX IF NOT EXISTS idx_rius_status ON radar_item_user_status(status);
CREATE INDEX IF NOT EXISTS idx_rius_tenant ON radar_item_user_status(tenant_id);

-- FR-04: conversations 소스 연결
ALTER TABLE conversations ADD COLUMN source_item_id TEXT REFERENCES radar_items(id);

-- FR-07, FR-09: discoveries 아이디어 템플릿 + 후보 그룹
ALTER TABLE discoveries ADD COLUMN target_segment TEXT;
ALTER TABLE discoveries ADD COLUMN value_proposition TEXT;
ALTER TABLE discoveries ADD COLUMN candidate_group_id TEXT;
CREATE INDEX IF NOT EXISTS idx_discoveries_candidate_group ON discoveries(candidate_group_id);
```

### 3.5 Entity Relationships (BD PoC 확장분)

```
[users] 1 ──── N [radarSources] (userId FK, nullable)
                        │
                        1
                        │
                        N
                [radarItems] (+keyPoints, +embeddingUpdatedAt)
                        │
                    ┌───┴───┐
                    │       │
                    N       N
[radar_item_user_status]  [conversations] (sourceItemId FK)
 (userId + itemId)                │
                                  1
                                  │
                                  N
                          [messages] (기존)

[discoveries] (+targetSegment, +valueProposition, +candidateGroupId)
  │
  N ←── candidateGroupId로 그룹화 (같은 groupId = 후보 세트)
```

---

## 4. API Specification

### 4.1 Endpoint 변경 목록

| Method | Path | 변경 | FR | 구현 파일 |
|--------|------|------|-----|----------|
| GET | `/api/radar/sources` | userId 필터 추가 | FR-01 | `api.radar.sources.ts` |
| POST | `/api/radar/sources` | keywords, radarTags 필드 추가 | FR-01 | `api.radar.sources.ts` |
| PATCH | `/api/radar/items/:id/status` | **신규** | FR-02 | `api.radar.items.$id.status.ts` |
| POST | `/api/radar/summarize` | **신규** | FR-03 | `api.radar.summarize.ts` |
| GET | `/api/similar-sources` | **신규** | FR-05 | `api.similar-sources.ts` |
| POST | `/api/conversations` | sourceItemId 필드 추가 | FR-04 | `api.conversations.ts` |

### 4.2 `PATCH /api/radar/items/:id/status`

**Purpose**: 사용자별 Radar 아이템 열람 상태 변경

**Request**:
```json
{ "status": "viewed" }  // "new" | "viewed" | "archived"
```

**Response (200)**:
```json
{
  "success": true,
  "itemId": "ri_abc123",
  "status": "viewed",
  "viewedAt": "2026-02-09T10:00:00Z"
}
```

**로직**:
1. `radar_item_user_status` UPSERT (userId + itemId)
2. status = "viewed" → viewedAt = NOW
3. status = "archived" → archivedAt = NOW

### 4.3 `POST /api/radar/summarize`

**Purpose**: 미생성 소스의 즉시 요약 + 핵심 포인트 생성

**Request**:
```json
{ "itemId": "ri_abc123" }
```

**Response (200)**:
```json
{
  "itemId": "ri_abc123",
  "summaryKo": "AI 기반 제조업 품질 검사 시장이 급성장 중",
  "keyPoints": [
    "비전 AI 기반 불량 검출 정확도 99.5% 달성",
    "중소 제조업체 도입 비용 연 30% 감소 추세"
  ],
  "cached": false
}
```

**로직**:
1. `radarItems`에서 itemId 조회
2. `keyPoints`가 이미 있으면 바로 반환 (cached: true)
3. 없으면 GPT-4o-mini 호출 → keyPoints JSON 배열 생성
4. DB UPDATE (`radarItems.keyPoints` 저장)

### 4.4 `GET /api/similar-sources`

**Purpose**: Vectorize 기반 연관 소스 추천

**Request (Query)**:
```
GET /api/similar-sources?itemId=ri_abc123&limit=3
```

**Response (200)**:
```json
{
  "results": [
    { "id": "ri_def456", "title": "관련 기사", "summaryKo": "...", "score": 0.89 }
  ],
  "source": "vectorize"
}
```

**로직**:
1. 해당 Radar 아이템의 Embedding 벡터 조회
2. `VECTORIZE_RADAR` 인덱스에서 cosine 유사 검색 (top K)
3. score >= 0.7 필터 + 자기 자신 제외
4. `radarItems` JOIN으로 상세 데이터 보강
5. VECTORIZE_RADAR 미설정 시 빈 배열 반환

---

## 5. Agent 도구 설계

### 5.1 신규 도구 3개

모든 도구는 `app/lib/agent/tools/discovery-tools.ts`에 구현되며, autonomy level 2 (Tool-guided).

#### `generate_idea_candidates`

**tool-registry 정의**:
```typescript
{
  name: "generate_idea_candidates",
  description: "현재 대화 맥락(소스, 분석 결과)을 바탕으로 사업 아이디어 후보를 최대 3개 생성합니다. 반환된 candidateGroupId로 create_discovery를 N회 호출하세요.",
  input_schema: {
    type: "object",
    required: ["count"],
    properties: {
      count: { type: "number", description: "생성할 후보 수 (1~3)", minimum: 1, maximum: 3 },
      sourceContext: { type: "string", description: "참고할 소스/대화 요약 (선택)" },
      industryCode: {
        type: "string",
        enum: ["manufacturing", "finance", "healthcare", "public", "energy", "other"],
      },
    },
  },
}
```

**구현** (`discovery-tools.ts:673-687`):
- candidateGroupId (UUID) 발행
- count를 1~3으로 클램핑
- Agent가 반환된 groupId로 `create_discovery`를 N회 호출하여 후보 생성

#### `select_idea_candidate`

**tool-registry 정의**:
```typescript
{
  name: "select_idea_candidate",
  description: "아이디어 후보 그룹에서 1개를 선택합니다. 선택된 후보는 IDEA_CARD로 승격되고, 나머지는 DROP됩니다.",
  input_schema: {
    type: "object",
    required: ["candidateGroupId", "selectedDiscoveryId"],
    properties: {
      candidateGroupId: { type: "string", description: "후보 그룹 ID" },
      selectedDiscoveryId: { type: "string", description: "선택할 Discovery ID" },
      reason: { type: "string", description: "선택 이유 (200자 이내)" },
    },
  },
}
```

**구현** (`discovery-tools.ts:693-762`):
1. `discoveries` 테이블에서 candidateGroupId로 후보 조회
2. 선택된 후보 → `IDEA_CARD` 상태 승격 + `candidate_selected` 이벤트 로깅
3. 나머지 후보 → `DROP` 상태 + `decisionState: "DROP"` + `candidate_dropped` 이벤트 로깅

#### `auto_fill_template`

**tool-registry 정의**:
```typescript
{
  name: "auto_fill_template",
  description: "IDEA_CARD 상태의 Discovery에 BD 아이디어 템플릿 4개 필드(가설, 근거, 타겟, 가치 제안)를 자동 채웁니다.",
  input_schema: {
    type: "object",
    required: ["discoveryId"],
    properties: {
      discoveryId: { type: "string", description: "대상 Discovery ID" },
      hypothesis: { type: "string", description: "가설 (직접 지정 시)" },
      targetSegment: { type: "string", description: "타겟 고객/시장 (직접 지정 시)" },
      valueProposition: { type: "string", description: "가치 제안 (직접 지정 시)" },
    },
  },
}
```

**구현** (`discovery-tools.ts:767-811`):
1. Discovery 존재 확인
2. hypothesis → `seedSummary` 컬럼에 저장 (가설 역할)
3. targetSegment, valueProposition → 해당 컬럼에 저장
4. `template_filled` 이벤트 로깅 (채워진 필드 목록 포함)

### 5.2 기존 도구 수정

#### `create_discovery` — candidateGroupId 파라미터 추가

```typescript
// tool-registry.ts input_schema에 추가
candidateGroupId: {
  type: "string",
  description: "아이디어 후보 그룹 ID (generate_idea_candidates 결과, 선택)",
},
```

### 5.3 sourceContext 경로

대화가 소스에 연결되어 있을 때, Agent에 소스 컨텍스트를 자동 주입합니다.

```
conversation.sourceItemId → radarItems 조회 → sourceContext 객체
  → buildSystemPrompt(agentCfg, sourceContext) → 프롬프트 주입
```

**executor.ts** (`executor.ts:332-354`):
```typescript
let sourceContext = null;
try {
  const conv = await db.select({ sourceItemId: conversations.sourceItemId })
    .from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  if (conv[0]?.sourceItemId) {
    const item = await db.select({
      title: radarItems.title, titleKo: radarItems.titleKo,
      summaryKo: radarItems.summaryKo, url: radarItems.url,
      keyPoints: radarItems.keyPoints,
    }).from(radarItems).where(eq(radarItems.id, conv[0].sourceItemId)).limit(1);
    if (item[0]) {
      sourceContext = {
        title: item[0].titleKo || item[0].title || undefined,
        summaryKo: item[0].summaryKo || undefined,
        url: item[0].url || undefined,
        keyPoints: (item[0].keyPoints as string[]) || undefined,
      };
    }
  }
} catch { /* sourceContext is optional */ }
```

**system-prompt.ts** (`system-prompt.ts:221-234`):
- sourceContext가 존재하면 "현재 소스 컨텍스트" 섹션 추가
- 제목, 요약, URL, 핵심 포인트를 프롬프트에 삽입
- Agent에게 소스 분석/아이디어 생성 가이드 제공

---

## 6. UI/UX Design

### 6.1 3-Pane Layout (`_index.tsx`)

기존 `_index.tsx`의 2-Pane 레이아웃을 3-Pane으로 확장합니다.

```
┌─────────────────────────────────────────────────────────────────┐
│  TopNav: [현황판] [시장 탐색] [아이디어]  [수집 관리]   사용자    │
├────────────┬──────────────────────────┬─────────────────────────┤
│            │                          │                         │
│ SourcePanel│     ChatPanel            │    SummaryPanel          │
│ (240px)    │     (flex-1)             │    (320px)              │
│            │                          │                         │
│ [소스] [히]│  ┌──────────────────┐   │  소스 요약               │
│            │  │  채팅 메시지      │   │  ─────────────────      │
│ New (3)    │  │  ...             │   │  한 줄 요약              │
│ Viewed     │  │                  │   │  * 포인트 1              │
│ Archived   │  │                  │   │  * 포인트 2              │
│            │  │                  │   │  원문 링크               │
│ ┌────────┐ │  │                  │   │                         │
│ │제조AI.. │ │  │                  │   │  아이디어 후보            │
│ │물류자동 │ │  │                  │   │  ─────────────────      │
│ │ESG규제 │ │  │                  │   │  [후보1] [후보2] [후보3] │
│ └────────┘ │  │                  │   │                         │
│            │  ├──────────────────┤   │  템플릿 미리보기          │
│ 연관 소스   │  │ 메시지 입력      │   │  가설: ...              │
│ * 소스A 89%│  └──────────────────┘   │  타겟: ...              │
│ * 소스B 85%│                          │  가치: ...              │
├────────────┴──────────────────────────┴─────────────────────────┤
```

### 6.2 컴포넌트 구성

| Component | Location | Responsibility | 상태 |
|-----------|----------|----------------|------|
| `SourcePanel` | `app/components/chat/SourcePanel.tsx` | 좌측: 소스 탭 + 히스토리 탭 + 연관 소스 | 신규 |
| `SummaryPanel` | `app/components/chat/SummaryPanel.tsx` | 우측: 요약 + 후보 카드 + 템플릿 미리보기 | 신규 |
| `IdeaCandidateCards` | `app/components/chat/IdeaCandidateCards.tsx` | 후보 카드 (최대 3개, 선택 버튼) | 신규 |
| `ChatPanel` | `app/components/chat/ChatPanel.tsx` | 중앙 채팅 (변경 없음) | 기존 |

### 6.3 Responsive 대응

| Breakpoint | 레이아웃 |
|------------|---------|
| `lg` (1024px+) | 3-Pane (Source 240px + Chat flex + Summary 320px) |
| `md` (768-1023px) | 2-Pane (Chat + Summary), Source는 오버레이 |
| `sm` (~767px) | 1-Pane (탭 전환: Source / Chat / Summary) |

### 6.4 User Flow

```
[메인 화면] / (3-Pane) 에서 시작
  → 좌: 소스 패널 (Radar 아이템 목록, New/Viewed/Archived 필터)
  → 소스 클릭 → 우: 요약 + 핵심 포인트 표시
  → "대화 시작" 클릭
     ↓
  → 중: Agent 채팅 (소스 컨텍스트 자동 주입)
  → Agent에게 "아이디어 만들어줘"
     ↓
  → 우: 아이디어 후보 카드 표시 (최대 3개)
  → 1개 선택 → IDEA_CARD로 승격 → 나머지 DROP
  → 우: 템플릿 미리보기 (4개 필드 자동 채움)
     ↓
[아이디어] /discoveries 페이지
  → 아이디어 목록에서 확인
  → /discoveries/:id/edit 에서 수동 편집 (targetSegment, valueProposition)
```

---

## 7. Embeddings 확장 설계

### 7.1 Vectorize 인덱스

기존 `VECTORIZE_RADAR` 인덱스를 재사용합니다. 신규 인덱스 생성 불필요.

```toml
# wrangler.toml (기존)
[[vectorize]]
binding = "VECTORIZE_RADAR"
index_name = "dx-radar-embeddings"
```

### 7.2 Embedding 동기화 확장

`app/lib/embeddings/sync.ts`의 기존 `syncEmbeddings` 함수에 Radar 아이템 동기화를 추가합니다.

**동기화 로직**:
1. `radarItems`에서 `embeddingUpdatedAt IS NULL` 조회 (배치 크기 제한)
2. `titleKo + summaryKo` 텍스트 결합
3. OpenAI `text-embedding-3-small`으로 벡터 생성
4. `VECTORIZE_RADAR`에 upsert (metadata: sourceId)
5. `radarItems.embeddingUpdatedAt` 업데이트

**환경 변수 체크**: `env.VECTORIZE_RADAR`가 설정된 경우에만 동기화 실행.

---

## 8. Error Handling

### 8.1 API 에러 코드

| Code | Endpoint | Cause | Handling |
|------|----------|-------|----------|
| 400 | `PATCH /api/radar/items/:id/status` | 잘못된 status 값 | 상수 배열 검증 |
| 404 | `POST /api/radar/summarize` | itemId 미존재 | JSON 에러 |
| 429 | `POST /api/radar/summarize` | GPT-4o-mini rate limit | 에러 텍스트 반환 |
| 404 | `GET /api/similar-sources` | itemId 미존재 | 빈 배열 반환 |
| N/A | `GET /api/similar-sources` | VECTORIZE_RADAR 미설정 | 빈 배열 반환 (graceful) |

### 8.2 sourceContext 에러 처리

- executor.ts에서 sourceContext 조회는 `try-catch`로 래핑
- 실패해도 Agent 채팅은 정상 동작 (sourceContext = null)
- conversation에 연결된 radarItem이 삭제된 경우 → null 반환 (에러 없이)

---

## 9. Test Plan

### 9.1 테스트 현황 (구현 완료)

| 파일 | 건수 | 유형 | ID |
|------|:----:|------|-----|
| `tests/unit/agent/tool-registry-bd.test.ts` | 3 | Unit | U-01~U-03 |
| `tests/unit/agent/system-prompt-bd.test.ts` | 5 | Unit | U-04~U-08 |
| `tests/integration/agent/bd-poc-tools.test.ts` | 11 | Integration | I-01~I-11 |
| `tests/integration/agent/executor-source-context.test.ts` | 3 | Integration | I-25~I-27 |
| `tests/integration/api/radar-bd.test.ts` | 13 | Integration | I-12~I-24 |
| `tests/integration/embeddings/sync.test.ts` (+1) | 1 | Integration | I-28 |
| **BD PoC 합계** | **36** | | |
| **전체 테스트** | **597** | | Regression 없음 |

### 9.2 테스트 범위

- Agent 도구 3개: 스키마 검증 + DB 로직 + 이벤트 로깅 (14건)
- Radar API: userId 필터 + UPSERT 상태 + 요약 캐시/GPT + 유사 검색 (13건)
- sourceContext 경로: 소스 연결 대화 + 소스 없는 대화 + 고아 참조 (3건)
- Embeddings: Radar 아이템 동기화 (1건)
- 시스템 프롬프트: sourceContext 주입 + 도구 가이드 (5건)

### 9.3 미구현 테스트 (P2)

| 항목 | 이유 | 우선순위 |
|------|------|---------|
| FR-10 수동 편집 E2E | Remix form 통합 테스트 복잡도 | P2 |
| FR-11 3-Pane Playwright | 배포 후 브라우저 검증 | P2 |

---

## 10. Implementation Summary

### 10.1 구현 통계

| 항목 | 수량 |
|------|:---:|
| 신규 파일 | 10 |
| 수정 파일 | 14 |
| 마이그레이션 | 1 (`0020_bd_poc_refactoring.sql`) |
| Agent 도구 추가 | 3 (45 → 48) |
| API 엔드포인트 | 3 신규 + 3 수정 |
| 테스트 | 36 신규 (전체 597) |

### 10.2 FR 구현 상태

| FR | 요구사항 | 상태 |
|----|---------|------|
| FR-01 | 사용자별 소스 수집 | ✅ |
| FR-02 | 소스 열람 상태 관리 | ✅ |
| FR-03 | 클릭 시 즉시 요약 | ✅ |
| FR-04 | 소스 기반 대화 시작 | ✅ |
| FR-05 | 연관 소스 추천 | ✅ |
| FR-06 | 워크스페이스 히스토리 | ✅ (기존 재사용) |
| FR-07 | 아이디어 후보 자동 생성 | ✅ |
| FR-08 | 아이디어 후보 선택 | ✅ |
| FR-09 | 템플릿 자동 채움 | ✅ |
| FR-10 | 템플릿 수동 편집 | ✅ (E2E 테스트 P2) |
| FR-11 | 3-Pane 메인 레이아웃 | ✅ (E2E 테스트 P2) |
| FR-12 | 팀 토론 뷰 | ⏸️ Out of scope (EPIC 5) |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-02-09 | Initial draft | Claude |
| 0.2 | 2026-02-10 | ws_* Feature 모듈 분리 아키텍처 설계 | Claude |
| 1.0 | 2026-02-10 | 실제 구현(Core Table Extension)에 맞게 전면 재작성 | Claude |
