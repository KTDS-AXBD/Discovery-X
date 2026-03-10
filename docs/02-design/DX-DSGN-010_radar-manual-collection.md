---
code: DX-DSGN-010
title: Radar 수동 수집 + Signal→Idea 연결 설계
version: 1.0
status: Draft
category: DSGN
created: 2026-03-10
updated: 2026-03-10
author: Sinclair Seo
---

# Radar 수동 수집 + Signal→Idea 연결 — 설계 문서

> F41 Phase 1A | DX-REQ-012 | [[DX-PLAN-008]]
>
> Plan v0.3의 Phase 1A 범위를 구현 수준으로 상세화한다.

---

## 0. Design Scope

이 문서는 DX-PLAN-008의 **Phase 1A** 범위만 다룬다:

| 포함 | 제외 (Phase 1B/2/3) |
|------|---------------------|
| URL 수동 수집 (크롤링) | 파일 업로드 (Phase 1B) |
| 텍스트 직접 입력 | 채널 관리 UI (Phase 2) |
| "아이디어로 보내기" 액션 | 도메인 분류 (Phase 2) |
| 스키마 확장 (3축 + lifecycle + 원문 + dedupe) | 큐 기반 파이프라인 (Phase 2) |
| idea_sources.link_type 확장 | AI 품질 평가 (Phase 3) |
| 시스템 소스 자동 생성 | Health Dashboard (Phase 3) |

---

## 1. 스키마 변경

### 1.1 마이그레이션 SQL

하나의 마이그레이션 파일(`NNNN_radar_manual_collection.sql`)로 통합:

```sql
-- 1. radar_sources 확장
ALTER TABLE radar_sources ADD COLUMN collection_type TEXT DEFAULT 'auto';
ALTER TABLE radar_sources ADD COLUMN status TEXT DEFAULT 'ACTIVE';
ALTER TABLE radar_sources ADD COLUMN crawl_interval INTEGER DEFAULT 86400;
ALTER TABLE radar_sources ADD COLUMN last_collected_at INTEGER;
ALTER TABLE radar_sources ADD COLUMN consecutive_failures INTEGER DEFAULT 0;

-- 2. radar_items 확장
ALTER TABLE radar_items ADD COLUMN content_type TEXT DEFAULT 'article';
ALTER TABLE radar_items ADD COLUMN raw_content TEXT;
ALTER TABLE radar_items ADD COLUMN parsed_content TEXT;
ALTER TABLE radar_items ADD COLUMN excerpt TEXT;
ALTER TABLE radar_items ADD COLUMN item_metadata TEXT;
ALTER TABLE radar_items ADD COLUMN dedupe_key TEXT;
-- 참고: metadata는 SQLite 예약어 근접 → item_metadata로 명명

-- 3. idea_sources 확장
ALTER TABLE idea_sources ADD COLUMN link_type TEXT DEFAULT 'primary';
ALTER TABLE idea_sources ADD COLUMN created_by TEXT DEFAULT 'user';

-- 4. 기존 데이터 마이그레이션
UPDATE radar_sources SET source_type = 'site' WHERE source_type = 'web';
UPDATE radar_sources SET collection_type = 'auto' WHERE collection_type IS NULL;
UPDATE radar_sources SET status = 'ACTIVE' WHERE status IS NULL;
UPDATE radar_items SET content_type = 'article' WHERE content_type IS NULL;
UPDATE radar_items SET content_type = 'video'
  WHERE id IN (SELECT ri.id FROM radar_items ri JOIN radar_sources rs ON ri.source_id = rs.id WHERE rs.source_type = 'youtube');
UPDATE idea_sources SET link_type = 'secondary' WHERE link_type IS NULL;
UPDATE idea_sources SET created_by = 'ai-pipeline' WHERE created_by IS NULL;

-- 5. 인덱스
CREATE INDEX IF NOT EXISTS idx_radar_items_content_type ON radar_items(content_type);
CREATE INDEX IF NOT EXISTS idx_radar_items_dedupe_key ON radar_items(dedupe_key);
CREATE INDEX IF NOT EXISTS idx_radar_sources_status ON radar_sources(status);
CREATE INDEX IF NOT EXISTS idx_idea_sources_link_type ON idea_sources(link_type);
```

### 1.2 Drizzle 스키마 변경

**`app/features/radar/db/schema.ts`** 수정:

```typescript
// SourceType 확장 (web → site 전환)
export const SourceType = {
  RSS: "rss",
  SITE: "site",      // 기존 "web" → "site"
  YOUTUBE: "youtube",
  SNS: "sns",
} as const;

export const CollectionType = {
  AUTO: "auto",
  MANUAL: "manual",
} as const;

export const ContentType = {
  ARTICLE: "article",
  VIDEO: "video",
  DOCUMENT: "document",
  MEMO: "memo",
} as const;

export const SourceStatus = {
  ACTIVE: "ACTIVE",
  PAUSED: "PAUSED",
  REVIEW: "REVIEW",
  ARCHIVED: "ARCHIVED",
  FAILED: "FAILED",
} as const;

// radar_sources 확장 필드
// collectionType, status, crawlInterval, lastCollectedAt, consecutiveFailures 추가

// radar_items 확장 필드
// contentType, rawContent, parsedContent, excerpt, itemMetadata, dedupeKey 추가
```

**`app/features/ideas/db/schema.ts`** 수정 (idea_sources):

```typescript
// idea_sources 확장
// linkType: text("link_type").default("primary")
//   - primary: 사용자 "아이디어로 보내기" 버튼
//   - secondary: AI 파이프라인 자동
//   - reference: 아이디어 본문 참조
// createdBy: text("created_by").default("user")
//   - user | ai-pipeline | system
```

### 1.3 기존 sourceType = "web" → "site" 전환 영향 분석

**변경 필요 파일**:

| 파일 | 변경 | 이유 |
|------|------|------|
| `app/features/radar/db/schema.ts` | `RadarSourceType.WEB` → `SITE` | 상수 변경 |
| `app/routes/api.radar.sources.ts` | 유효성 검증 목록에 `"site"` 추가, `"web"` 유지(하위호환) | API 입력 |
| `app/features/radar/service/radar.service.ts` | RSS/Site 분기 로직 확인 | 수집 로직 |
| `app/routes/radar.tsx` | UI 라벨 "웹" → "사이트" | 표시 |

**하위 호환**: API에서 `sourceType: "web"`을 받으면 자동으로 `"site"`로 변환

---

## 2. 수동 수집 서비스

### 2.1 RadarService 확장

```typescript
// app/features/radar/service/radar.service.ts

class RadarService {
  // ... 기존 메서드 유지 ...

  /** 시스템 소스 조회/생성 (__manual__ per tenant) */
  async getOrCreateManualSource(tenantId: string): Promise<string> {
    // radar_sources에서 source_type='site', collection_type='manual', name='__manual__' 조회
    // 없으면 생성 후 id 반환
  }

  /** URL 수동 수집 */
  async collectFromUrl(input: {
    url: string;
    userId: string;
    tenantId: string;
  }): Promise<RadarItem> {
    // 1. URL Canonicalization (utm_* 제거, 프로토콜 정규화)
    // 2. dedupe_key 생성 (urlHash 기존 + title hash)
    // 3. 중복 체크 (urlHash 또는 dedupe_key)
    // 4. fetch(url) → HTML 가져오기
    // 5. HTML 파싱 → title, summary, rawContent, parsedContent, excerpt, metadata 추출
    // 6. radar_items INSERT (sourceId = __manual__, contentType = 'article')
    // 7. 반환
  }

  /** 텍스트 수동 수집 */
  async collectFromText(input: {
    title: string;
    content: string;
    userId: string;
    tenantId: string;
  }): Promise<RadarItem> {
    // 1. dedupe_key = SHA256(title_normalized)
    // 2. 중복 체크
    // 3. radar_items INSERT
    //    - contentType = 'memo'
    //    - rawContent = content
    //    - parsedContent = content
    //    - excerpt = content.slice(0, 200)
    //    - url = `manual://${id}` (수동 수집용 가상 URL)
    //    - urlHash = SHA256(url)
    // 4. 반환
  }

  /** Signal → Idea 전환 */
  async sendToIdea(input: {
    itemId: string;
    userId: string;
    tenantId: string;
  }): Promise<{ ideaId: string }> {
    // 1. radar_item 조회 (title, summary, parsedContent)
    // 2. ideas INSERT (title=아이템 제목, status='ACTIVE', createdByAgent=0)
    // 3. idea_sources INSERT (linkType='primary', createdBy='user')
    // 4. 반환 { ideaId }
  }
}
```

### 2.2 URL 파싱 유틸

```typescript
// app/features/radar/service/url-parser.ts

interface ParsedPage {
  title: string;
  summary: string;        // meta description 또는 첫 문단
  rawContent: string;      // 원본 HTML
  parsedContent: string;   // 텍스트 추출
  excerpt: string;         // 앞 200자
  metadata: {
    author?: string;
    publishedAt?: string;
    wordCount: number;
    language?: string;
    siteName?: string;
  };
}

export async function parseUrl(url: string): Promise<ParsedPage> {
  // 1. fetch(url, { headers: { 'User-Agent': 'Discovery-X/0.7.0' } })
  // 2. Content-Type 확인 (text/html만 처리)
  // 3. HTML → DOM 파싱:
  //    - <title>, <meta name="description">, <meta property="og:title">
  //    - <meta name="author">, <meta property="article:published_time">
  //    - <article> 또는 <main> 본문 추출 (없으면 <body>)
  // 4. HTML 태그 제거 → 텍스트
  // 5. excerpt = parsedContent.slice(0, 200)
  // 6. 반환
}

export function canonicalizeUrl(url: string): string {
  // utm_*, fbclid, gclid 등 트래킹 파라미터 제거
  // 프로토콜 정규화 (http → https)
  // trailing slash 통일
  // www. 제거/추가 정규화
}

export function generateDedupeKey(title: string, publishedAt?: string): string {
  // SHA256(normalize(title) + (publishedAt || ''))
}
```

### 2.3 Dedupe 전략 (Phase 1A 범위)

Phase 1A에서는 2단계만 구현:

| 단계 | 방법 | 적용 시점 |
|------|------|----------|
| 1 | **URL Canonicalization** → `urlHash` | 수집 전 (기존 로직) |
| 2 | **Title + Date Hash** → `dedupe_key` | 수집 후 (신규) |

Phase 3에서 3단계 추가: embedding 기반 near-duplicate

---

## 3. API 라우트

### 3.1 `POST /api/radar/manual-collect`

```typescript
// app/routes/api.radar.manual-collect.ts

// intent: "url" | "text"
// url 모드: { intent: "url", url: string }
// text 모드: { intent: "text", title: string, content: string }

export async function action({ request, context }: ActionFunctionArgs) {
  const user = await requireUser(request, db, secret);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const service = new RadarService(db);

  if (intent === "url") {
    const url = String(formData.get("url") || "").trim();
    if (!url) return json({ error: "URL은 필수" }, { status: 400 });
    // URL 형식 검증
    try { new URL(url); } catch { return json({ error: "유효하지 않은 URL" }, { status: 400 }); }

    const item = await service.collectFromUrl({ url, userId: user.id, tenantId });
    return json({ success: true, item });
  }

  if (intent === "text") {
    const title = String(formData.get("title") || "").trim();
    const content = String(formData.get("content") || "").trim();
    if (!title || !content) return json({ error: "제목과 내용은 필수" }, { status: 400 });

    const item = await service.collectFromText({ title, content, userId: user.id, tenantId });
    return json({ success: true, item });
  }

  return json({ error: "Unknown intent" }, { status: 400 });
}
```

### 3.2 `POST /api/radar/items/:id/send-to-idea`

```typescript
// app/routes/api.radar.items.$id.send-to-idea.ts

export async function action({ request, params, context }: ActionFunctionArgs) {
  const user = await requireUser(request, db, secret);
  const itemId = params.id;
  const service = new RadarService(db);

  const result = await service.sendToIdea({
    itemId,
    userId: user.id,
    tenantId,
  });

  return json({ success: true, ideaId: result.ideaId });
}
```

---

## 4. UI 설계

### 4.1 수동 등록 탭

`/radar` 페이지의 탭 2에 배치.

```
┌─────────────────────────────────────────────┐
│  피드  │ ★ 수동 등록 │ Source Health │ 채널  │
├─────────────────────────────────────────────┤
│                                             │
│  ┌─ URL 등록 ─────────────────────────────┐ │
│  │ [URL 입력 필드 ........................]│ │
│  │ [등록] 버튼                            │ │
│  │                                        │ │
│  │ (등록 후 미리보기:)                     │ │
│  │ ┌ 제목: {파싱된 제목}                 ┐│ │
│  │ │ 요약: {meta description}            ││ │
│  │ │ [확인] [아이디어로 보내기] [취소]    ││ │
│  │ └────────────────────────────────────┘│ │
│  └────────────────────────────────────────┘ │
│                                             │
│  ┌─ 텍스트 메모 ──────────────────────────┐ │
│  │ 제목: [입력 필드]                      │ │
│  │ 내용: [텍스트에어리어]                  │ │
│  │ [등록] 버튼                            │ │
│  └────────────────────────────────────────┘ │
│                                             │
└─────────────────────────────────────────────┘
```

### 4.2 "아이디어로 보내기" 버튼

피드 탭의 각 아이템 카드에 추가:

```
┌─ Radar Item Card ──────────────────────────┐
│ [AI/ML] 새로운 LLM 추론 최적화 기법 발표    │
│ DeepSeek이 MoE 아키텍처의 새로운...         │
│ rss · site · 2시간 전                       │
│                                             │
│ [👍 3] [👎 0] [💡 아이디어로 보내기]         │
└─────────────────────────────────────────────┘
```

**동작 흐름**:
1. 사용자가 "아이디어로 보내기" 클릭
2. `POST /api/radar/items/{id}/send-to-idea` 호출
3. 성공 시 토스트: "아이디어가 생성되었습니다" + 링크
4. idea_sources에 link_type='primary', created_by='user' 기록

### 4.3 컴포넌트 구조

```
app/features/radar/ui/
├── ManualCollectTab.tsx        — 수동 등록 탭 컨테이너
│   ├── UrlCollectForm.tsx      — URL 입력 + 미리보기
│   └── TextCollectForm.tsx     — 텍스트 메모 입력
└── SendToIdeaButton.tsx        — "아이디어로 보내기" 버튼
```

---

## 5. 구현 순서

```
1. 마이그레이션 생성 + 로컬 적용 + test helper 동기화
   └── /ax-p1-migrate

2. Drizzle 스키마 수정
   ├── app/features/radar/db/schema.ts (SourceType/CollectionType/ContentType/SourceStatus + 필드 추가)
   └── app/features/ideas/db/schema.ts (idea_sources link_type/created_by)

3. 기존 코드 호환성 수정
   ├── RadarSourceType.WEB → SITE 참조 전환
   └── api.radar.sources.ts 유효성 검증 확장

4. URL 파싱 유틸
   └── app/features/radar/service/url-parser.ts

5. RadarService 확장
   ├── getOrCreateManualSource()
   ├── collectFromUrl()
   ├── collectFromText()
   └── sendToIdea()

6. API 라우트
   ├── api.radar.manual-collect.ts
   └── api.radar.items.$id.send-to-idea.ts

7. UI 컴포넌트
   ├── ManualCollectTab.tsx (URL + 텍스트)
   ├── SendToIdeaButton.tsx
   └── radar.tsx 탭 추가

8. 검증
   └── /ax-04-verify all
```

---

## 6. 테스트 계획

| 영역 | 테스트 | 파일 |
|------|--------|------|
| URL 파싱 | canonicalize, parseUrl, dedupeKey 생성 | `tests/unit/radar/url-parser.test.ts` |
| 수동 수집 서비스 | collectFromUrl, collectFromText, 중복 체크 | `tests/unit/radar/manual-collect.test.ts` |
| Signal→Idea | sendToIdea, link_type 검증 | `tests/unit/radar/send-to-idea.test.ts` |
| API 통합 | POST manual-collect, send-to-idea | `tests/integration/api-radar-manual.test.ts` |

---

## 7. 리스크

| 리스크 | 대응 |
|--------|------|
| URL fetch CORS/JS 렌더링 실패 | 서버사이드 fetch (CF Worker), 실패 시 "텍스트로 직접 입력" 안내 |
| 기존 `sourceType = "web"` → `"site"` 전환 영향 | 마이그레이션 SQL에 UPDATE 포함 + API에서 "web" 입력 시 자동 변환 |
| idea_sources ALTER 영향 | DEFAULT 값 설정으로 기존 데이터 무결성 유지 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-10 | Initial — Phase 1A 설계 (수동 수집 + Signal→Idea) | Sinclair Seo |
