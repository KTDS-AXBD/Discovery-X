# F20: 아이디어 페이지 고도화 Design Document

> **Summary**: 아이디어 페이지의 메모 영속 저장, 스코어 필터링, 상태 그룹핑, 텍스트 검색, 유사 소스 추천 기능에 대한 상세 설계
>
> **Project**: Discovery-X
> **Version**: v5.1
> **Author**: Claude
> **Date**: 2026-02-10
> **Status**: Draft
> **Planning Doc**: [f20-ideas-enhancement.plan.md](../../01-plan/features/f20-ideas-enhancement.plan.md)

---

## 1. Overview

### 1.1 Design Goals

1. **메모 영속 저장**: `radarItems`에 `memo` 컬럼 1개 추가로 최소 스키마 변경, MemoPanel이 DB와 직접 연동
2. **필터/검색 통합 UI**: ideas.tsx의 loader에 URL 파라미터 기반 동적 쿼리를 추가하여 서버 사이드 필터링 구현
3. **유사 소스 추천**: 기존 `api.similar-sources.ts` 패턴을 재사용하여 ideas.$id.tsx loader에서 inline 호출
4. **기존 아키텍처 존중**: 새 테이블 없이 기존 `radarItems` 확장, 기존 API 패턴(UPSERT, Vectorize graceful fallback) 준수

### 1.2 Design Principles

- **ADD COLUMN 전용**: 기존 `radarItems` 테이블에 `memo` 컬럼만 추가 (breaking change 없음)
- **Single Owner 원칙**: 메모는 radarItem당 1개 — 다중 사용자 분리 불필요 (Plan §4.3 Option A 결정 준수)
- **서버 사이드 필터링**: Remix loader에서 URL searchParams 기반으로 WHERE 조건 동적 구성
- **Vectorize Graceful Fallback**: `VECTORIZE_RADAR` 미설정 시 스코어 유사도 기반 대체 로직
- **Axis 디자인 토큰**: 모든 UI는 `var(--axis-*)` / `var(--dx-*)` CSS 변수 사용

### 1.3 Architecture Decision Record

**결정 1**: `radarItems`에 `memo` 컬럼 추가 (별도 `ideaMemos` 테이블 불사용)

| 기준 | Option A: 컬럼 추가 (선택) | Option B: 별도 테이블 |
|------|---------------------------|---------------------|
| 구현 복잡도 | 낮음 (ADD COLUMN 1개) | 중간 (테이블+FK+인덱스) |
| 다중 사용자 메모 | 불가 | 가능 |
| 쿼리 비용 | 없음 (기존 SELECT에 포함) | JOIN 필요 |
| 히스토리 추적 | 불가 | updatedAt로 가능 |
| 현재 요구사항 부합 | 충분 (Single Owner) | 오버엔지니어링 |

**근거**: Plan §4.3과 동일. ideas.tsx가 이미 radarItems를 직접 조회하므로 JOIN 없이 기존 쿼리에 memo 필드만 추가. 추후 다중 사용자 필요 시 별도 테이블로 마이그레이션 가능.

**결정 2**: 메모 API는 전용 엔드포인트 (`api.ideas.memo.ts`)로 분리

| 기준 | 기존 라우트에 action 추가 | 전용 API 엔드포인트 (선택) |
|------|------------------------|-------------------------|
| 관심사 분리 | ideas.tsx에 loader+action 혼재 | API 전용 파일로 명확한 분리 |
| 재사용성 | ideas.tsx에서만 사용 가능 | 다른 페이지에서도 호출 가능 |
| 기존 패턴 | 없음 | `api.radar.items.$id.status.ts` 패턴과 일관 |

**근거**: BD PoC의 `api.radar.items.$id.status.ts`가 PATCH 전용 API로 분리된 패턴을 따름.

**결정 3**: 유사 소스 추천은 ideas.$id.tsx loader에서 inline 호출 (별도 API 불필요)

| 기준 | 별도 API 호출 | loader inline (선택) |
|------|-------------|---------------------|
| 네트워크 왕복 | 2회 (loader + API) | 1회 (loader만) |
| 구현 복잡도 | 클라이언트 fetch 추가 | loader에서 직접 처리 |
| 캐시 | API 응답 캐시 가능 | Remix loader 캐시 |

**근거**: 아이디어 상세 페이지 진입 시 항상 필요한 데이터이므로 loader에서 함께 조회하는 것이 효율적. `api.similar-sources.ts`의 핵심 로직을 유틸 함수로 추출하여 재사용.

---

## 2. Architecture

### 2.1 시스템 아키텍처

```
┌─ F20: Ideas Enhancement ──────────────────────────────────────────────┐
│                                                                        │
│  ┌─ ideas.tsx (목록 + 필터/검색) ──────────────────────────────────┐  │
│  │  URL Params: ?score=60&status=SCORED&q=AI                       │  │
│  │  loader: 동적 WHERE 조건 → radarItems 쿼리                     │  │
│  │  ┌─────────────┐  ┌────────────────────────────────────────┐    │  │
│  │  │ FilterBar    │  │ IdeaList (memo 인디케이터 포함)         │    │  │
│  │  │ 스코어 | 상태│  │ [📝 아이디어A] [아이디어B] [📝 아이디C] │    │  │
│  │  │ 검색        │  │                                        │    │  │
│  │  └─────────────┘  └────────────────────────────────────────┘    │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌─ ideas.$id.tsx (상세 + 유사 소스) ─────────────────────────────┐  │
│  │  loader: radarItem 조회 + Vectorize 유사 검색 (inline)         │  │
│  │  ┌────────────────────┐  ┌──────────────────────────────────┐  │  │
│  │  │ IdeaDetail          │  │ SimilarSources (3건)              │  │  │
│  │  │ 제목/요약/핵심포인트 │  │ [소스A 89%] [소스B 85%] [소스C]  │  │  │
│  │  └────────────────────┘  └──────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌─ API Layer ────────────────────────────────────────────────────┐  │
│  │  api.ideas.memo.ts (신규)   — PUT/GET 메모 저장/조회           │  │
│  │  api.similar-sources.ts (기존) — Vectorize 유사 검색 (재사용)  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌─ MemoPanel (우측 Context Panel) ──────────────────────────────┐  │
│  │  useFetcher → api.ideas.memo.ts                                │  │
│  │  debounce 1초 자동 저장 + 저장 상태 표시                        │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌─ Data Layer ──────────────────────────────────────────────────┐  │
│  │  radarItems (+memo 컬럼)                                       │  │
│  │  VECTORIZE_RADAR (기존, optional)                              │  │
│  └────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Data Flow

```
[메모 저장]
  MemoPanel (textarea onChange)
    → debounce 1초
    → useFetcher.submit({ itemId, memo }, { method: "PUT", action: "/api/ideas/memo" })
    → api.ideas.memo.ts: UPDATE radarItems SET memo = ? WHERE id = ?
    → 성공 → UI: "저장됨" 표시  /  실패 → UI: "저장 실패" + 로컬 state 유지

[필터/검색]
  FilterBar (select/input onChange)
    → useSearchParams로 URL 업데이트 (?score=60&status=SCORED&q=AI)
    → Remix가 자동으로 ideas.tsx loader 재호출
    → loader: URL params 추출 → 동적 WHERE 조건 구성 → radarItems 쿼리
    → useLoaderData로 필터된 결과 렌더링

[유사 소스 추천]
  ideas.$id.tsx loader
    → radarItem 조회
    → VECTORIZE_RADAR 존재? → Embedding 생성 → Vectorize query (top 4)
       → score >= 0.7 필터 + 자기 자신 제외 → 상위 3건
    → VECTORIZE_RADAR 미설정? → relevanceScore 기반 fallback (±20점 범위)
    → 결과를 loader data에 포함 → SimilarSources 컴포넌트 렌더링
```

### 2.3 파일 구조 (변경분)

```
app/
├── db/
│   └── schema.ts               ← radarItems에 memo 컬럼 추가 (수정)
├── routes/
│   ├── ideas.tsx               ← 필터/검색 UI + loader 확장 (수정)
│   ├── ideas.$id.tsx           ← 유사 소스 추천 추가 (수정)
│   └── api.ideas.memo.ts      ← 메모 CRUD API (신규)
├── components/ideas/
│   ├── MemoPanel.tsx           ← DB 연동 + 자동 저장 (수정)
│   ├── FilterBar.tsx           ← 스코어/상태/검색 필터 UI (신규)
│   └── SimilarSources.tsx      ← 유사 소스 카드 목록 (신규)
└── lib/embeddings/
    └── similar-items.ts        ← Vectorize 유사 검색 유틸 추출 (신규)

drizzle/
└── 0022_ideas_memo.sql         ← memo 컬럼 마이그레이션 (신규)

tests/helpers/
└── db.ts                       ← 마이그레이션 SQL 추가 (수정)
```

---

## 3. Data Model

### 3.1 설계 원칙

- **ADD COLUMN 전용**: `radarItems`에 `memo` 컬럼 1개만 추가, 기존 컬럼 변경/삭제 없음
- **D1/SQLite 호환**: nullable TEXT 컬럼 — 기존 행에 영향 없음
- **Drizzle ORM**: `app/db/schema.ts`에서 관리, JSON 수동 파싱 금지

### 3.2 radarItems 테이블 확장

#### 현재 스키마 (BD PoC 이후)

```typescript
// app/db/schema.ts — radarItems (현재)
export const radarItems = sqliteTable("radar_items", {
  id: text("id").primaryKey(),
  sourceId: text("source_id").notNull().references(() => radarSources.id),
  runId: text("run_id"),
  urlHash: text("url_hash").notNull().unique(),
  url: text("url").notNull(),
  title: text("title").notNull(),
  summary: text("summary"),
  titleKo: text("title_ko"),
  summaryKo: text("summary_ko"),
  relevanceScore: integer("relevance_score"),
  discoveryId: text("discovery_id").references(() => discoveries.id),
  status: text("status").notNull().default(RadarItemStatus.COLLECTED),
  collectedAt: integer("collected_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  // BD팀 PoC 추가분
  keyPoints: text("key_points", { mode: "json" }).$type<string[]>(),
  embeddingUpdatedAt: integer("embedding_updated_at", { mode: "timestamp" }),
}, (table) => ({
  sourceIdIdx: index("idx_radar_items_source_id").on(table.sourceId),
  urlHashIdx: index("idx_radar_items_url_hash").on(table.urlHash),
  statusIdx: index("idx_radar_items_status").on(table.status),
  collectedAtIdx: index("idx_radar_items_collected_at").on(table.collectedAt),
}));
```

#### F20 추가 컬럼

```typescript
// app/db/schema.ts — radarItems에 추가할 컬럼
memo: text("memo"),  // nullable, 사용자 메모 (최대 길이 제한은 UI에서 처리)
```

#### 변경 후 전체 스키마 (추가분만 표시)

```typescript
export const radarItems = sqliteTable("radar_items", {
  // ... 기존 컬럼 전부 유지 ...

  // BD팀 PoC 추가분
  keyPoints: text("key_points", { mode: "json" }).$type<string[]>(),
  embeddingUpdatedAt: integer("embedding_updated_at", { mode: "timestamp" }),

  // F20: 아이디어 메모
  memo: text("memo"),
}, (table) => ({
  // ... 기존 인덱스 전부 유지 (memo에 별도 인덱스 불필요) ...
}));
```

### 3.3 마이그레이션 SQL

파일: `drizzle/0022_ideas_memo.sql`

```sql
-- F20: radarItems 메모 컬럼 추가
ALTER TABLE radar_items ADD COLUMN memo TEXT;
```

> **참고**: SQLite에서 ADD COLUMN은 nullable 컬럼만 허용하며, 기존 행의 memo는 자동으로 NULL이 됨. 인덱스 추가 불필요 (memo 기반 검색 요구사항 없음).

### 3.4 테스트 헬퍼 업데이트

`tests/helpers/db.ts`의 마이그레이션 SQL 배열에 추가:

```typescript
// tests/helpers/db.ts — migrationFiles 배열에 추가
"drizzle/0022_ideas_memo.sql",
```

### 3.5 Entity Relationship (F20 변경분)

```
[radarItems] (기존 테이블)
  + memo: TEXT (nullable)
       │
       │  ideas.tsx에서 직접 조회 (JOIN 없음)
       │  MemoPanel → api.ideas.memo.ts → UPDATE
       │
       └── ideas.$id.tsx에서 Vectorize 유사 검색 기준으로 사용
           (titleKo + summaryKo → Embedding → VECTORIZE_RADAR query)
```

---

## 4. API Design

### 4.1 엔드포인트 목록

| Method | Path | 유형 | FR | 구현 파일 |
|--------|------|------|-----|----------|
| GET | `/api/ideas/memo?itemId=...` | **신규** | FR-01 | `api.ideas.memo.ts` |
| PUT | `/api/ideas/memo` | **신규** | FR-01, FR-02 | `api.ideas.memo.ts` |

> 필터/검색(FR-04~FR-06)은 별도 API 없이 `ideas.tsx` loader의 URL 파라미터로 처리.
> 유사 소스(FR-07)는 `ideas.$id.tsx` loader에서 inline 처리.

### 4.2 `GET /api/ideas/memo`

**Purpose**: 특정 Radar 아이템의 메모 조회

**Request (Query)**:
```
GET /api/ideas/memo?itemId=ri_abc123
```

**Response (200)**:
```json
{
  "itemId": "ri_abc123",
  "memo": "이 소스의 핵심은 제조업 AI 품질 검사 비용 절감..."
}
```

**Response (200, 메모 없음)**:
```json
{
  "itemId": "ri_abc123",
  "memo": null
}
```

**로직**:
1. `getUserFromSession` → 미인증 시 401
2. `itemId` query param 필수 검증
3. `radarItems`에서 `id = itemId`로 memo 컬럼만 SELECT
4. 아이템 미존재 시 404

**구현 코드 (Remix action pattern)**:
```typescript
// app/routes/api.ideas.memo.ts

import type { LoaderFunctionArgs, ActionFunctionArgs } from "@remix-run/cloudflare";
import { json } from "@remix-run/cloudflare";
import { eq } from "drizzle-orm";
import { getDb } from "~/db";
import { radarItems } from "~/db/schema";
import { getUserFromSession, getSessionSecret } from "~/lib/auth/session.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const itemId = url.searchParams.get("itemId");

  if (!itemId) {
    return json({ error: "itemId는 필수입니다." }, { status: 400 });
  }

  const item = await db
    .select({ id: radarItems.id, memo: radarItems.memo })
    .from(radarItems)
    .where(eq(radarItems.id, itemId))
    .limit(1);

  if (!item[0]) {
    return json({ error: "아이템을 찾을 수 없습니다." }, { status: 404 });
  }

  return json({ itemId, memo: item[0].memo ?? null });
}
```

### 4.3 `PUT /api/ideas/memo`

**Purpose**: Radar 아이템에 메모 저장 (UPSERT 의미 — 기존 memo 덮어쓰기)

**Request**:
```json
{
  "itemId": "ri_abc123",
  "memo": "이 소스의 핵심은 제조업 AI 품질 검사 비용 절감..."
}
```

**Response (200)**:
```json
{
  "success": true,
  "itemId": "ri_abc123"
}
```

**에러 응답**:
| Code | 원인 | Body |
|------|------|------|
| 401 | 미인증 | `"Unauthorized"` |
| 400 | itemId 누락 | `{ "error": "itemId는 필수입니다." }` |
| 400 | memo가 5000자 초과 | `{ "error": "메모는 5000자 이내여야 합니다." }` |
| 404 | 아이템 미존재 | `{ "error": "아이템을 찾을 수 없습니다." }` |

**로직**:
1. `getUserFromSession` → 미인증 시 401
2. JSON body에서 `itemId`, `memo` 추출
3. `itemId` 필수 검증, `memo` 길이 5000자 제한
4. `radarItems`에서 아이템 존재 확인
5. `UPDATE radarItems SET memo = ? WHERE id = ?`
6. 빈 문자열(`""`)도 유효 — null로 변환하지 않음

**구현 코드**:
```typescript
// app/routes/api.ideas.memo.ts (action 추가)

const MAX_MEMO_LENGTH = 5000;

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "PUT") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const db = getDb(context.cloudflare.env.DB);
  const secret = getSessionSecret(context.cloudflare.env);
  const user = await getUserFromSession(request, db, secret);

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = (await request.json()) as { itemId?: string; memo?: string };

  if (!body.itemId) {
    return json({ error: "itemId는 필수입니다." }, { status: 400 });
  }

  if (body.memo && body.memo.length > MAX_MEMO_LENGTH) {
    return json({ error: `메모는 ${MAX_MEMO_LENGTH}자 이내여야 합니다.` }, { status: 400 });
  }

  const item = await db
    .select({ id: radarItems.id })
    .from(radarItems)
    .where(eq(radarItems.id, body.itemId))
    .limit(1);

  if (!item[0]) {
    return json({ error: "아이템을 찾을 수 없습니다." }, { status: 404 });
  }

  await db
    .update(radarItems)
    .set({ memo: body.memo ?? null })
    .where(eq(radarItems.id, body.itemId));

  return json({ success: true, itemId: body.itemId });
}
```

---

## 5. UI Components

### 5.1 컴포넌트 트리

```
ideas.tsx (Layout Route)
├── AppShell
│   ├── contextPanel={<MemoPanel />}   ← 수정 (DB 연동)
│   └── children
│       ├── FilterBar                   ← 신규
│       │   ├── ScoreFilter (select)
│       │   ├── StatusTabs (button group)
│       │   └── SearchInput (input)
│       ├── IdeaList
│       │   └── IdeaListItem × N       ← 수정 (메모 인디케이터)
│       └── <Outlet />
│           └── ideas.$id.tsx (Detail)  ← 수정
│               ├── IdeaDetailHeader
│               ├── IdeaDetailBody
│               └── SimilarSources      ← 신규
│                   └── SimilarSourceCard × 3
```

### 5.2 MemoPanel (수정)

**파일**: `app/components/ideas/MemoPanel.tsx`

**변경 전**: `useState`만 사용, 페이지 이동 시 메모 소실
**변경 후**: `useFetcher`로 DB 연동, debounce 자동 저장, 저장 상태 표시

**Props 인터페이스**:
```typescript
interface MemoPanelProps {
  itemId?: string;
  initialMemo?: string | null;  // 추가: loader에서 전달
}
```

**상태 관리**:
```typescript
// 내부 상태
const [memo, setMemo] = useState(initialMemo ?? "");
const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
const fetcher = useFetcher();
const debounceRef = useRef<ReturnType<typeof setTimeout>>();

// itemId 변경 시 초기 메모 동기화
useEffect(() => {
  setMemo(initialMemo ?? "");
  setSaveStatus("idle");
}, [itemId, initialMemo]);

// debounce 자동 저장 (1초)
useEffect(() => {
  if (memo === (initialMemo ?? "")) return;  // 변경 없으면 스킵
  clearTimeout(debounceRef.current);
  debounceRef.current = setTimeout(() => {
    setSaveStatus("saving");
    fetcher.submit(
      { itemId, memo },
      { method: "PUT", action: "/api/ideas/memo", encType: "application/json" }
    );
  }, 1000);
  return () => clearTimeout(debounceRef.current);
}, [memo]);

// fetcher 응답 감시
useEffect(() => {
  if (fetcher.state === "idle" && fetcher.data) {
    setSaveStatus(fetcher.data.success ? "saved" : "error");
  }
}, [fetcher.state, fetcher.data]);
```

**UI 변경**:
```
┌─ MemoPanel ──────────────────────────┐
│  메모                     [저장됨 ✓]  │
│  ┌────────────────────────────────┐  │
│  │                                │  │
│  │  (textarea, 자동 저장)          │  │
│  │                                │  │
│  └────────────────────────────────┘  │
│  메모는 이 아이디어에만 연결됩니다.    │
│                          0 / 5000자  │
└──────────────────────────────────────┘
```

**저장 상태 표시**:
| 상태 | UI | 색상 |
|------|-----|------|
| `idle` | (표시 없음) | - |
| `saving` | "저장 중..." | `--axis-text-tertiary` |
| `saved` | "저장됨" | `--axis-text-success` (or `green-500`) |
| `error` | "저장 실패" | `--axis-text-danger` (or `red-500`) |

### 5.3 FilterBar (신규)

**파일**: `app/components/ideas/FilterBar.tsx`

**Props 인터페이스**:
```typescript
interface FilterBarProps {
  totalCount: number;
  filteredCount: number;
}
```

**하위 요소**:

#### ScoreFilter
```typescript
// URL param: ?score=0|40|60|80
// 드롭다운: 전체 | 40점 이상 | 60점 이상 | 80점 이상
<select
  value={searchParams.get("score") ?? "0"}
  onChange={(e) => setSearchParams(prev => {
    if (e.target.value === "0") prev.delete("score");
    else prev.set("score", e.target.value);
    return prev;
  })}
>
  <option value="0">전체 점수</option>
  <option value="40">40점 이상</option>
  <option value="60">60점 이상</option>
  <option value="80">80점 이상</option>
</select>
```

#### StatusTabs
```typescript
// URL param: ?status=ALL|COLLECTED|SCORED|SEEDED
// 버튼 그룹: [전체] [수집됨] [스코어] [시드]
type StatusFilter = "ALL" | "COLLECTED" | "SCORED" | "SEEDED";
```

#### SearchInput
```typescript
// URL param: ?q=검색어
// debounce 300ms로 URL 업데이트
<input
  type="search"
  placeholder="제목 또는 요약 검색..."
  value={searchTerm}
  onChange={(e) => {
    setSearchTerm(e.target.value);
    // debounce 300ms 후 setSearchParams
  }}
/>
```

**레이아웃**:
```
┌─ FilterBar ─────────────────────────────────────────────────┐
│  [전체 점수 ▾]  [전체|수집됨|스코어|시드]  [🔍 검색...]     │
│                                          12건 / 100건       │
└─────────────────────────────────────────────────────────────┘
```

### 5.4 IdeaListItem 메모 인디케이터 (수정)

**파일**: `app/routes/ideas.tsx` (inline)

**변경**: 메모가 존재하는 아이템에 인디케이터 아이콘 표시

```typescript
// ideas.tsx의 아이템 렌더링에 추가
{item.memo && (
  <span
    className="text-[var(--axis-text-brand)]"
    title="메모 있음"
  >
    📝
  </span>
)}
```

> **참고**: 이모지 대신 SVG 아이콘(`DocumentTextIcon` 등)이 더 적합할 수 있으나, 기존 codebase에서 이모지를 사용하는 패턴이 없으므로 Axis 아이콘이 있다면 해당 아이콘 사용. 없다면 작은 dot 인디케이터로 대체.

### 5.5 SimilarSources (신규)

**파일**: `app/components/ideas/SimilarSources.tsx`

**Props 인터페이스**:
```typescript
interface SimilarSource {
  id: string;
  title: string;
  summaryKo?: string | null;
  url?: string;
  score: number;
}

interface SimilarSourcesProps {
  sources: SimilarSource[];
  source: "vectorize" | "fallback" | "none";
}
```

**UI**:
```
┌─ 관련 소스 ──────────────────────────────────────────────────┐
│  Vectorize 기반 추천                                          │
│  ┌──────────────────┐ ┌──────────────────┐ ┌────────────────┐│
│  │ AI 제조업 품질..  │ │ ESG 규제 동향..  │ │ 물류 자동화..  ││
│  │ 유사도: 89%       │ │ 유사도: 85%       │ │ 유사도: 81%    ││
│  │ 요약 텍스트...    │ │ 요약 텍스트...    │ │ 요약 텍스트... ││
│  └──────────────────┘ └──────────────────┘ └────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

**빈 상태**: sources 배열이 비어있으면 컴포넌트 자체를 렌더링하지 않음.

### 5.6 ideas.tsx loader 확장 (필터/검색)

**URL 파라미터 → 동적 WHERE 조건**:

```typescript
// ideas.tsx loader 확장
export async function loader({ request, context }: LoaderFunctionArgs) {
  // ... 기존 인증 코드 ...

  const url = new URL(request.url);
  const scoreMin = Number(url.searchParams.get("score") || "0");
  const statusFilter = url.searchParams.get("status") || "ALL";
  const searchQuery = url.searchParams.get("q") || "";

  // 동적 WHERE 조건 구성
  const conditions = [sql`${radarItems.runId} IN ${tenantRunIds}`];

  if (scoreMin > 0) {
    conditions.push(sql`${radarItems.relevanceScore} >= ${scoreMin}`);
  }

  if (statusFilter !== "ALL") {
    conditions.push(sql`${radarItems.status} = ${statusFilter}`);
  }

  if (searchQuery.trim()) {
    const like = `%${searchQuery.trim()}%`;
    conditions.push(
      sql`(${radarItems.titleKo} LIKE ${like} OR ${radarItems.title} LIKE ${like} OR ${radarItems.summaryKo} LIKE ${like})`
    );
  }

  const items = await db
    .select({
      id: radarItems.id,
      title: radarItems.title,
      titleKo: radarItems.titleKo,
      summaryKo: radarItems.summaryKo,
      url: radarItems.url,
      relevanceScore: radarItems.relevanceScore,
      status: radarItems.status,
      collectedAt: radarItems.collectedAt,
      memo: radarItems.memo,  // F20: 메모 유무 판별용
    })
    .from(radarItems)
    .where(sql.join(conditions, sql` AND `))
    .orderBy(desc(radarItems.collectedAt))
    .limit(100);

  return json({ user: ctx.user, items, totalCount: items.length });
}
```

### 5.7 ideas.$id.tsx loader 확장 (유사 소스)

```typescript
// ideas.$id.tsx loader 확장
export async function loader({ params, request, context }: LoaderFunctionArgs) {
  // ... 기존 인증 + 아이템 조회 코드 ...

  // 유사 소스 추천
  let similarSources: SimilarSource[] = [];
  let similarSource: "vectorize" | "fallback" | "none" = "none";

  const env = context.cloudflare.env as unknown as Record<string, unknown>;

  if (env.VECTORIZE_RADAR && env.OPENAI_API_KEY) {
    try {
      const results = await findSimilarRadarItems(
        env as unknown as SimilarItemsEnv,
        item!,
        { limit: 3, minScore: 0.7 }
      );
      if (results.length > 0) {
        similarSources = results;
        similarSource = "vectorize";
      }
    } catch { /* Vectorize 실패 시 fallback */ }
  }

  // Fallback: relevanceScore 유사도 기반 (Vectorize 미설정 또는 결과 없을 때)
  if (similarSources.length === 0 && item!.relevanceScore) {
    const score = item!.relevanceScore;
    const fallbackItems = await db
      .select({
        id: radarItems.id,
        title: radarItems.title,
        titleKo: radarItems.titleKo,
        summaryKo: radarItems.summaryKo,
        url: radarItems.url,
        relevanceScore: radarItems.relevanceScore,
      })
      .from(radarItems)
      .where(
        sql`${radarItems.id} != ${item!.id}
          AND ${radarItems.relevanceScore} BETWEEN ${score - 20} AND ${score + 20}
          AND ${radarItems.relevanceScore} IS NOT NULL`
      )
      .orderBy(desc(radarItems.relevanceScore))
      .limit(3);

    similarSources = fallbackItems.map(fi => ({
      id: fi.id,
      title: fi.titleKo || fi.title,
      summaryKo: fi.summaryKo,
      url: fi.url,
      score: fi.relevanceScore ? Math.round((1 - Math.abs(fi.relevanceScore - score) / 100) * 100) / 100 : 0,
    }));
    similarSource = similarSources.length > 0 ? "fallback" : "none";
  }

  return json({ item, similarSources, similarSource });
}
```

---

## 6. Implementation Sequence

### Phase 1: 메모 저장 (DB + API + UI)

| # | 작업 | 파일 | 내용 | 의존성 |
|---|------|------|------|--------|
| 1-1 | `radarItems`에 `memo` 컬럼 추가 | `app/db/schema.ts` | `memo: text("memo")` nullable 추가 | - |
| 1-2 | 마이그레이션 SQL 작성 | `drizzle/0022_ideas_memo.sql` | `ALTER TABLE radar_items ADD COLUMN memo TEXT;` | 1-1 |
| 1-3 | 테스트 헬퍼 업데이트 | `tests/helpers/db.ts` | 마이그레이션 SQL 파일 경로 추가 | 1-2 |
| 1-4 | 메모 API 엔드포인트 | `app/routes/api.ideas.memo.ts` | GET (조회) + PUT (저장) | 1-1 |
| 1-5 | MemoPanel DB 연동 | `app/components/ideas/MemoPanel.tsx` | `useFetcher` + debounce 1초 자동 저장 + 저장 상태 표시 | 1-4 |
| 1-6 | ideas.tsx loader에 memo 필드 추가 | `app/routes/ideas.tsx` | select에 `memo: radarItems.memo` 추가 + 메모 인디케이터 | 1-1 |
| 1-7 | ideas.tsx에서 initialMemo를 MemoPanel에 전달 | `app/routes/ideas.tsx` | AppShell contextPanel에 `initialMemo` prop 추가 | 1-5, 1-6 |

**검증**: 마이그레이션 적용 → 테스트 실행 → MemoPanel에서 메모 입력 → 페이지 새로고침 → 메모 유지 확인

### Phase 2: 필터링 & 검색

| # | 작업 | 파일 | 내용 | 의존성 |
|---|------|------|------|--------|
| 2-1 | FilterBar 컴포넌트 생성 | `app/components/ideas/FilterBar.tsx` | 스코어 select + 상태 탭 + 검색 input | - |
| 2-2 | ideas.tsx loader 확장 | `app/routes/ideas.tsx` | URL params → 동적 WHERE 조건 (score, status, q) | - |
| 2-3 | ideas.tsx UI에 FilterBar 배치 | `app/routes/ideas.tsx` | 목록 상단에 FilterBar 렌더링 + useSearchParams 연동 | 2-1, 2-2 |

**검증**: 스코어 필터 60점 선택 → 목록 갱신 → 상태 탭 전환 → 검색어 입력 → 결과 확인

### Phase 3: 유사 소스 추천

| # | 작업 | 파일 | 내용 | 의존성 |
|---|------|------|------|--------|
| 3-1 | 유사 검색 유틸 추출 | `app/lib/embeddings/similar-items.ts` | `findSimilarRadarItems()` 함수 (api.similar-sources.ts 로직 재사용) | - |
| 3-2 | SimilarSources 컴포넌트 생성 | `app/components/ideas/SimilarSources.tsx` | 유사 소스 카드 3건 표시 | - |
| 3-3 | ideas.$id.tsx loader 확장 | `app/routes/ideas.$id.tsx` | Vectorize 유사 검색 + fallback (스코어 기반) | 3-1 |
| 3-4 | ideas.$id.tsx UI에 SimilarSources 배치 | `app/routes/ideas.$id.tsx` | 상세 페이지 하단에 SimilarSources 렌더링 | 3-2, 3-3 |

**검증**: 아이디어 상세 진입 → 하단에 관련 소스 표시 → VECTORIZE_RADAR 미설정 시 fallback 동작 확인

### 구현 순서 요약

```
Phase 1 (메모 저장)
  1-1 schema → 1-2 migration → 1-3 test helper → 1-4 API → 1-5 MemoPanel → 1-6, 1-7 ideas.tsx

Phase 2 (필터/검색) — Phase 1과 병렬 가능
  2-1 FilterBar → 2-2 loader → 2-3 ideas.tsx UI

Phase 3 (유사 소스) — Phase 1, 2 완료 후
  3-1 유틸 → 3-2 컴포넌트 → 3-3 loader → 3-4 UI
```

### 파일별 변경 요약

| 파일 | 유형 | Phase | 변경 내용 |
|------|------|-------|----------|
| `app/db/schema.ts` | 수정 | 1 | memo 컬럼 추가 |
| `drizzle/0022_ideas_memo.sql` | 신규 | 1 | ALTER TABLE |
| `tests/helpers/db.ts` | 수정 | 1 | 마이그레이션 경로 추가 |
| `app/routes/api.ideas.memo.ts` | 신규 | 1 | GET + PUT 메모 API |
| `app/components/ideas/MemoPanel.tsx` | 수정 | 1 | useFetcher + debounce |
| `app/routes/ideas.tsx` | 수정 | 1, 2 | memo 필드, FilterBar, 동적 쿼리 |
| `app/components/ideas/FilterBar.tsx` | 신규 | 2 | 필터/검색 UI |
| `app/lib/embeddings/similar-items.ts` | 신규 | 3 | Vectorize 유사 검색 유틸 |
| `app/components/ideas/SimilarSources.tsx` | 신규 | 3 | 유사 소스 카드 |
| `app/routes/ideas.$id.tsx` | 수정 | 3 | 유사 소스 loader + UI |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-02-10 | Initial draft — 메모 저장 + 필터/검색 + 유사 추천 상세 설계 | Claude |
