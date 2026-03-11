---
code: DX-DSGN-012
title: Radar 채널 관리 + 도메인 분류 + 수집 큐 설계
version: 1.0
status: Draft
category: DSGN
created: 2026-03-11
updated: 2026-03-11
author: Sinclair Seo
---

# Radar 채널 관리 + 도메인 분류 + 수집 큐 — 설계 문서

> F41 Phase 2 | DX-REQ-012 | [[DX-PLAN-009]] §7 항목 11~15
>
> Plan v0.3의 Phase 2 범위를 구현 수준으로 상세화한다.

---

## 0. Design Scope

이 문서는 DX-PLAN-009의 **Phase 2** 범위를 다룬다:

| 포함 | 제외 (Phase 3) |
|------|----------------|
| `radar_domains` + `radar_source_domains` 신규 테이블 | `radar_source_metrics` (채널 지표) |
| `radar_crawl_queue` 신규 테이블 | `radar_item_metrics` (아이템 품질) |
| Source Lifecycle 전환 로직 (5 상태) | AI 품질 평가 (Nightly Cron) |
| 채널 관리 탭 UI (카드 뷰 + 필터 + CRUD) | Health Score 4축 계산 |
| 도메인 CRUD API + UI (태그 선택) | Source Health Dashboard |
| 큐 기반 수집 파이프라인 + 장애 대응 | Novelty 평가 |
| `enabled` → `status` 마이그레이션 | embedding 기반 near-duplicate |

### Phase 1A/1B 완료 기반

Phase 2는 다음이 이미 구현된 상태에서 시작:
- `radar_sources` 확장 필드: `collectionType`, `status`, `crawlInterval`, `lastCollectedAt`, `consecutiveFailures` (마이그레이션 0055)
- `SourceStatus` 상수 5개: ACTIVE/PAUSED/REVIEW/ARCHIVED/FAILED (스키마 정의 완료, 전환 로직 미구현)
- `radar_items` 확장: `contentType`, `rawContent`, `parsedContent`, `excerpt`, `itemMetadata`, `dedupeKey`
- 수동 수집 서비스: `collectFromUrl()`, `collectFromText()`, `collectFromFile()`
- "아이디어로 보내기" 버튼: `sendToIdea()` + `idea_sources.linkType`

---

## 1. 스키마 변경

### 1.1 마이그레이션 SQL

하나의 마이그레이션 파일(`NNNN_radar_channel_management.sql`)로 통합:

```sql
-- ============================================================================
-- 1. radar_domains — 도메인 분류 마스터
-- ============================================================================

CREATE TABLE radar_domains (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT,                              -- UI 뱃지 색상 (hex)
  tenant_id TEXT REFERENCES tenants(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(name, tenant_id)
);

CREATE INDEX idx_radar_domains_tenant ON radar_domains(tenant_id);

-- ============================================================================
-- 2. radar_source_domains — 채널 ↔ 도메인 M:N
-- ============================================================================

CREATE TABLE radar_source_domains (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES radar_sources(id) ON DELETE CASCADE,
  domain_id TEXT NOT NULL REFERENCES radar_domains(id) ON DELETE CASCADE,
  UNIQUE(source_id, domain_id)
);

CREATE INDEX idx_rsd_source ON radar_source_domains(source_id);
CREATE INDEX idx_rsd_domain ON radar_source_domains(domain_id);

-- ============================================================================
-- 3. radar_crawl_queue — 수집 큐
-- ============================================================================

CREATE TABLE radar_crawl_queue (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES radar_sources(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  dedupe_key TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  -- PENDING | PROCESSING | COMPLETED | FAILED | DEAD
  priority INTEGER DEFAULT 0,
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  parser_type TEXT DEFAULT 'html',
  -- html | rss | youtube | pdf
  failure_code TEXT,
  -- TIMEOUT | PARSE_ERROR | AUTH_REQUIRED | RATE_LIMITED | NETWORK_ERROR
  error TEXT,
  batch_id TEXT,
  tenant_id TEXT REFERENCES tenants(id),
  scheduled_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER,
  next_retry_at INTEGER
);

CREATE INDEX idx_rcq_status ON radar_crawl_queue(status);
CREATE INDEX idx_rcq_source ON radar_crawl_queue(source_id);
CREATE INDEX idx_rcq_scheduled ON radar_crawl_queue(scheduled_at);
CREATE INDEX idx_rcq_tenant ON radar_crawl_queue(tenant_id);
CREATE INDEX idx_rcq_batch ON radar_crawl_queue(batch_id);

-- ============================================================================
-- 4. enabled → status 정합성 보정
-- ============================================================================

-- enabled=0인 소스를 PAUSED로 동기화 (Phase 1A 이전 데이터)
UPDATE radar_sources SET status = 'PAUSED' WHERE enabled = 0 AND status = 'ACTIVE';
```

### 1.2 Drizzle 스키마 추가

**`app/features/radar/db/schema.ts`** 에 3개 테이블 추가:

```typescript
// ============================================================================
// CRAWL QUEUE CONSTANTS
// ============================================================================

export const CrawlQueueStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  DEAD: "DEAD",
} as const;

export const ParserType = {
  HTML: "html",
  RSS: "rss",
  YOUTUBE: "youtube",
  PDF: "pdf",
} as const;

export const FailureCode = {
  TIMEOUT: "TIMEOUT",
  PARSE_ERROR: "PARSE_ERROR",
  AUTH_REQUIRED: "AUTH_REQUIRED",
  RATE_LIMITED: "RATE_LIMITED",
  NETWORK_ERROR: "NETWORK_ERROR",
} as const;

// ============================================================================
// DOMAIN TABLES
// ============================================================================

export const radarDomains = sqliteTable("radar_domains", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  color: text("color"),
  tenantId: text("tenant_id").references(() => tenants.id),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
}, (table) => ({
  tenantIdx: index("idx_radar_domains_tenant").on(table.tenantId),
}));

export const radarSourceDomains = sqliteTable("radar_source_domains", {
  id: text("id").primaryKey(),
  sourceId: text("source_id")
    .notNull()
    .references(() => radarSources.id, { onDelete: "cascade" }),
  domainId: text("domain_id")
    .notNull()
    .references(() => radarDomains.id, { onDelete: "cascade" }),
}, (table) => ({
  sourceIdx: index("idx_rsd_source").on(table.sourceId),
  domainIdx: index("idx_rsd_domain").on(table.domainId),
}));

// ============================================================================
// CRAWL QUEUE TABLE
// ============================================================================

export const radarCrawlQueue = sqliteTable("radar_crawl_queue", {
  id: text("id").primaryKey(),
  sourceId: text("source_id")
    .notNull()
    .references(() => radarSources.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  dedupeKey: text("dedupe_key"),
  status: text("status").notNull().default(CrawlQueueStatus.PENDING),
  priority: integer("priority").default(0),
  retryCount: integer("retry_count").default(0),
  maxRetries: integer("max_retries").default(3),
  parserType: text("parser_type").default(ParserType.HTML),
  failureCode: text("failure_code"),
  error: text("error"),
  batchId: text("batch_id"),
  tenantId: text("tenant_id").references(() => tenants.id),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  nextRetryAt: integer("next_retry_at", { mode: "timestamp" }),
}, (table) => ({
  statusIdx: index("idx_rcq_status").on(table.status),
  sourceIdx: index("idx_rcq_source").on(table.sourceId),
  scheduledIdx: index("idx_rcq_scheduled").on(table.scheduledAt),
  tenantIdx: index("idx_rcq_tenant").on(table.tenantId),
  batchIdx: index("idx_rcq_batch").on(table.batchId),
}));
```

### 1.3 db/index.ts 스키마 머지

`radarSchema`에 3개 테이블 자동 포함 (같은 파일에서 export하므로 별도 머지 불필요).

### 1.4 `enabled` ↔ `status` 호환 전략

기존 `enabled` 불리언 필드는 **유지하되 `status` 기준으로 파생**:

| status | enabled 값 | 의미 |
|--------|-----------|------|
| ACTIVE | 1 | 수집 활성 |
| PAUSED | 0 | 사용자 일시정지 |
| REVIEW | 0 | 건강도 경고 (자동 전환) |
| ARCHIVED | 0 | 사용자 폐기 |
| FAILED | 0 | 영구 실패 (5회 연속) |

**전환 시 `enabled` 자동 동기화**: `updateSourceStatus()` 메서드에서 status 변경 시 enabled 값도 함께 업데이트.

기존 `toggleSource()`는 **deprecated** — `updateSourceStatus(id, 'PAUSED' | 'ACTIVE')`로 대체.

---

## 2. Source Lifecycle

### 2.1 상태 전환 규칙

```
                    ┌──────────────┐
                    │   ACTIVE     │◄───── 기본 상태
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  PAUSED  │ │  REVIEW  │ │  FAILED  │
        │ (수동)   │ │ (자동)   │ │ (자동)   │
        └────┬─────┘ └────┬─────┘ └──────────┘
             │            │
             ▼            ├───────────┐
        ┌──────────┐      ▼           ▼
        │  ACTIVE  │ ┌──────────┐ ┌──────────┐
        │ (재시작) │ │  ACTIVE  │ │ ARCHIVED │
        └──────────┘ │ (복구)   │ │ (폐기)   │
                     └──────────┘ └──────────┘
```

### 2.2 허용 전환 테이블

```typescript
// app/features/radar/constants/source-lifecycle.ts

export const SOURCE_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  ACTIVE:   ["PAUSED", "REVIEW", "FAILED"],
  PAUSED:   ["ACTIVE"],
  REVIEW:   ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],   // 복구 불가 (새 소스 등록)
  FAILED:   [],   // 복구 불가 (새 소스 등록)
} as const;

export function validateSourceTransition(
  from: string,
  to: string,
): { valid: boolean; reason?: string } {
  const allowed = SOURCE_ALLOWED_TRANSITIONS[from];
  if (!allowed) return { valid: false, reason: `알 수 없는 상태: ${from}` };
  if (!allowed.includes(to)) {
    return { valid: false, reason: `${from} → ${to} 전환 불가` };
  }
  return { valid: true };
}
```

### 2.3 자동 전환 트리거

| 조건 | 전환 | 트리거 |
|------|------|--------|
| `consecutiveFailures >= 5` | ACTIVE → FAILED | Cron 수집 후 |
| `consecutiveFailures >= 3` (but < 5) | ACTIVE → REVIEW | Cron 수집 후 |
| 최근 30일 수집 0건 + 전환 0건 | ACTIVE → REVIEW | Phase 3 Health Cron |

---

## 3. 서비스 레이어

### 3.1 RadarService 확장

```typescript
// app/features/radar/service/radar.service.ts — 추가 메서드

// ---------- Source Lifecycle ----------

/** 소스 상태 변경 (lifecycle 전환) */
async updateSourceStatus(id: string, newStatus: string): Promise<void> {
  // 1. 현재 상태 조회
  // 2. validateSourceTransition(current, newStatus) 검증
  // 3. UPDATE status + enabled(파생) + updatedAt
}

/** 소스 상세 조회 (도메인 포함) */
async getSourceWithDomains(id: string): Promise<SourceWithDomains | null> {
  // 소스 + JOIN radar_source_domains + radar_domains
}

/** 테넌트별 소스 목록 + 도메인 조회 */
async listSourcesWithDomains(tenantId: string): Promise<SourceWithDomains[]> {
  // listSourcesByTenant + 도메인 매핑
}

/** 소스 수정 (확장: keywords, radarTags, crawlInterval, 도메인) */
async updateSourceFull(input: UpdateSourceFullInput): Promise<void> {
  // name, url, sourceType, keywords, radarTags, crawlInterval 업데이트
  // 도메인 동기화: 기존 삭제 + 새로 INSERT
}

// ---------- Domain CRUD ----------

/** 도메인 목록 */
async listDomains(tenantId: string): Promise<RadarDomain[]>

/** 도메인 생성 */
async createDomain(input: CreateDomainInput): Promise<string>

/** 도메인 삭제 */
async deleteDomain(id: string): Promise<void>

/** 소스-도메인 연결 */
async setSourceDomains(sourceId: string, domainIds: string[]): Promise<void> {
  // DELETE existing + INSERT new
}

// ---------- Crawl Queue ----------

/** 소스에서 큐 아이템 생성 */
async enqueueSource(sourceId: string, tenantId: string): Promise<number> {
  // 1. 소스 정보 조회 (url, sourceType, crawlInterval)
  // 2. 마지막 수집 시각 확인 → interval 미경과 시 스킵
  // 3. parserType 결정 (sourceType → parserType 매핑)
  // 4. INSERT radar_crawl_queue (PENDING)
  // 반환: 생성된 큐 아이템 수
}

/** PENDING 큐 아이템 가져오기 (배치) */
async dequeueBatch(tenantId: string, limit: number): Promise<QueueItem[]> {
  // 1. PENDING + scheduled_at <= now + next_retry_at IS NULL or <= now
  // 2. priority DESC, scheduled_at ASC
  // 3. 상태를 PROCESSING으로 변경 + started_at 설정
  // 4. 반환
}

/** 큐 아이템 완료 처리 */
async completeQueueItem(id: string, itemId?: string): Promise<void> {
  // status = COMPLETED, completed_at = now
}

/** 큐 아이템 실패 처리 */
async failQueueItem(id: string, failureCode: string, error: string): Promise<void> {
  // retry_count++
  // retry_count >= max_retries → status = DEAD
  //   + source.consecutiveFailures++ → 5이면 source FAILED 전환
  // else → status = FAILED, next_retry_at = 지수 백오프 계산
}

/** 큐 상태 요약 */
async getQueueStatus(tenantId: string): Promise<QueueStatusSummary> {
  // GROUP BY status → { pending, processing, completed, failed, dead }
}
```

### 3.2 큐 처리 워커 (Cron 인라인)

```typescript
// app/features/radar/service/crawl-worker.ts

export async function processCrawlQueue(
  db: DB,
  tenantId: string,
  options: { batchSize?: number; timeoutMs?: number } = {},
): Promise<CrawlResult> {
  const service = new RadarService(db);
  const batchSize = options.batchSize ?? 10;
  const timeoutMs = options.timeoutMs ?? 25_000; // CF 30s 타임아웃 - 5s 여유

  const startTime = Date.now();
  const batch = await service.dequeueBatch(tenantId, batchSize);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const item of batch) {
    // 타임아웃 가드
    if (Date.now() - startTime > timeoutMs) break;

    try {
      // parserType에 따른 수집 처리
      const result = await fetchAndParse(item);
      // 중복 체크 → INSERT radar_items
      await service.completeQueueItem(item.id, result?.itemId);
      succeeded++;
    } catch (err) {
      const code = classifyError(err);
      await service.failQueueItem(item.id, code, String(err));
      failed++;
    }
    processed++;
  }

  return { processed, succeeded, failed, batchSize: batch.length };
}

/** 에러 분류 */
function classifyError(err: unknown): string {
  const msg = String(err).toLowerCase();
  if (msg.includes("timeout") || msg.includes("aborted")) return "TIMEOUT";
  if (msg.includes("401") || msg.includes("403")) return "AUTH_REQUIRED";
  if (msg.includes("429") || msg.includes("rate")) return "RATE_LIMITED";
  if (msg.includes("parse") || msg.includes("invalid")) return "PARSE_ERROR";
  return "NETWORK_ERROR";
}

/** parserType 기반 fetch + parse */
async function fetchAndParse(item: QueueItem): Promise<ParseResult> {
  switch (item.parserType) {
    case "rss":  return fetchRss(item.url);
    case "html": return fetchHtml(item.url);
    default:     return fetchHtml(item.url);
  }
  // youtube, pdf는 Phase 3+에서 구현
}
```

### 3.3 지수 백오프 계산

```typescript
/** 재시도 지연 계산 (지수 백오프) */
function calculateNextRetry(retryCount: number): Date {
  // 1차: 1시간, 2차: 6시간, 3차: 24시간
  const delays = [3600, 21600, 86400]; // 초
  const delaySec = delays[Math.min(retryCount, delays.length - 1)];
  return new Date(Date.now() + delaySec * 1000);
}
```

---

## 4. API 라우트

### 4.1 기존 라우트 확장

**`api.radar.sources.ts`** — update intent에 status 변경 추가:

```typescript
// intent: "update-status"
if (intent === "update-status") {
  const id = String(formData.get("id"));
  const newStatus = String(formData.get("status"));
  await service.updateSourceStatus(id, newStatus);
  return json({ success: true });
}

// intent: "update-full" — 소스 전체 편집
if (intent === "update-full") {
  const id = String(formData.get("id"));
  // name, url, sourceType, keywords, radarTags, crawlInterval, domainIds
  await service.updateSourceFull({ id, ... });
  return json({ success: true });
}
```

### 4.2 신규 라우트

| 라우트 | 메서드 | 기능 |
|--------|--------|------|
| `api.radar.domains.ts` | GET/POST/DELETE | 도메인 CRUD |
| `api.radar.queue.status.ts` | GET | 큐 상태 요약 |

**`api.radar.domains.ts`**:

```typescript
// GET: 도메인 목록
// POST intent="create": 도메인 생성 { name, description?, color? }
// POST intent="delete": 도메인 삭제 { id }
```

**`api.radar.queue.status.ts`**:

```typescript
// GET: { pending, processing, completed, failed, dead, lastRunAt }
```

### 4.3 Cron 통합 (기존 daily에 추가)

기존 `api.cron.daily.ts`에 큐 스케줄링 단계 추가:

```typescript
// Step: Radar 큐 스케줄링 + 처리
// 1. 활성 소스(ACTIVE) → crawlInterval 경과 체크 → enqueueSource()
// 2. processCrawlQueue(db, tenantId) 호출
// 3. source.lastCollectedAt 갱신
```

대안: 별도 `api.cron.radar-collect.ts` 라우트 — **이 방식을 채택** (분리 원칙):

```typescript
// app/routes/api.cron.radar-collect.ts
// 1. CRON_SECRET 인증
// 2. 활성 테넌트 순회
// 3. ACTIVE 소스 → enqueueSource()
// 4. processCrawlQueue() → 큐 처리
// 5. 결과 반환
```

cron-job.org에 등록: 매일 09:00 KST (ai-pipeline 09:30보다 앞서 실행).

---

## 5. UI 설계

### 5.1 탭 구조 변경

현재 3탭 → 4탭으로 확장:

```
/radar
├── 탭 1: 피드 (기존, 기본 탭)
├── 탭 2: 수동 등록 (Phase 1A/1B, 기존)
├── 탭 3: 채널 관리 (Phase 2, ★ 신규 — 기존 "소스 관리" 대체)
└── 탭 4: 큐 모니터 (Phase 2, ★ 신규)
```

기존 "소스 관리" 탭 → "채널 관리"로 **이름 변경 + 기능 확장**.

### 5.2 채널 관리 탭

```
┌─────────────────────────────────────────────────────┐
│  피드  │ 수동 등록 │ ★ 채널 관리 │ 큐 모니터       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─ 필터 바 ──────────────────────────────────────┐ │
│  │ [유형 ▾] [상태 ▾] [도메인 ▾] [검색...    ] [+] │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  ┌─ 채널 카드 ────────────────────────────────────┐ │
│  │ GeekNews                          [RSS] [ACTIVE]│ │
│  │ https://news.hada.io/rss                        │ │
│  │ 키워드: AI, SaaS  |  도메인: 기술 트렌드        │ │
│  │ 수집 간격: 1일  |  마지막 수집: 2시간 전         │ │
│  │                                                  │ │
│  │ [편집] [일시정지] [삭제]                         │ │
│  └──────────────────────────────────────────────────┘ │
│                                                     │
│  ┌─ 채널 카드 ────────────────────────────────────┐ │
│  │ TechCrunch                       [사이트] [REVIEW]│
│  │ https://techcrunch.com                           │ │
│  │ ⚠️ 연속 3회 수집 실패 — 확인이 필요합니다        │ │
│  │                                                  │ │
│  │ [복구 (ACTIVE)] [폐기 (ARCHIVED)]                │ │
│  └──────────────────────────────────────────────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 5.3 채널 추가/편집 모달

```
┌─ 채널 추가 ─────────────────────────────────────┐
│                                                   │
│  이름 *:     [GeekNews                        ]   │
│  URL *:      [https://news.hada.io/rss        ]   │
│  유형 *:     [RSS ▾]                              │
│  수집 간격:  [24시간 ▾]  (1시간/6시간/12시간/24시간/3일/7일) │
│                                                   │
│  키워드:     [AI, SaaS, 제조업            ]        │
│  태그:       [시장분석, 경쟁사            ]        │
│                                                   │
│  도메인:     [기술 트렌드 ×] [시장 분석 ×] [+ 추가] │
│                                                   │
│         [취소]                    [저장]           │
└───────────────────────────────────────────────────┘
```

### 5.4 큐 모니터 탭

```
┌─────────────────────────────────────────────────────┐
│  피드  │ 수동 등록 │ 채널 관리 │ ★ 큐 모니터       │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─ 큐 상태 요약 ─────────────────────────────────┐ │
│  │ 대기: 12  │  처리 중: 2  │  완료: 345  │       │ │
│  │ 실패: 3   │  영구 실패: 1                       │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  ┌─ 최근 실패 항목 ───────────────────────────────┐ │
│  │ TechCrunch — TIMEOUT (재시도 2/3, 6시간 후)     │ │
│  │ Hacker News — RATE_LIMITED (재시도 1/3, 1시간 후)│ │
│  │ 블로그X — AUTH_REQUIRED ☠️ DEAD (3/3 소진)      │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 5.5 컴포넌트 구조

```
app/features/radar/ui/
├── ManualCollectTab.tsx           — 기존 (수동 등록)
├── UrlCollectForm.tsx             — 기존
├── TextCollectForm.tsx            — 기존
├── FileUploadForm.tsx             — 기존
├── SendToIdeaButton.tsx           — 기존
├── ChannelManagementTab.tsx       — ★ 채널 관리 탭 (카드 목록 + 필터)
├── ChannelCard.tsx                — ★ 채널 카드 (상태 뱃지 + 액션 버튼)
├── ChannelFormModal.tsx           — ★ 채널 추가/편집 모달
├── DomainTagSelect.tsx            — ★ 도메인 태그 선택 (Combobox)
└── QueueMonitorTab.tsx            — ★ 큐 상태 모니터
```

### 5.6 도메인 관리 UI

도메인은 별도 페이지가 아닌 **채널 관리 탭 내 인라인**으로 처리:
- 필터 바의 "도메인" 드롭다운에서 [+ 도메인 추가] 버튼
- 채널 편집 모달의 도메인 선택에서 [+ 새 도메인] 인라인 생성
- 미사용 도메인(소스 0개)은 도메인 드롭다운에서 삭제 가능

---

## 6. 데이터 흐름

### 6.1 채널 등록 플로우

```
사용자 → [+ 채널 추가] 버튼
  → ChannelFormModal (이름/URL/유형/간격/키워드/태그/도메인)
  → POST api.radar.sources (intent=create)
  → RadarService.createSource() + setSourceDomains()
  → 화면 리프레시 (Remix revalidation)
```

### 6.2 Lifecycle 전환 플로우

```
[일시정지] 버튼 → POST api.radar.sources (intent=update-status, status=PAUSED)
  → RadarService.updateSourceStatus()
    → validateSourceTransition(ACTIVE, PAUSED) ✅
    → UPDATE status=PAUSED, enabled=0
```

### 6.3 큐 기반 수집 플로우

```
Cron (09:00 KST)
  → api.cron.radar-collect
  → 1. 활성 테넌트 조회
  → 2. 테넌트별 ACTIVE 소스 조회
  → 3. crawlInterval 경과 소스 → enqueueSource()
        → INSERT radar_crawl_queue (PENDING)
  → 4. processCrawlQueue()
        → dequeueBatch(10)
        → 각 아이템: fetch → parse → dedupe → INSERT radar_items
        → completeQueueItem() 또는 failQueueItem()
  → 5. source.lastCollectedAt 갱신
```

---

## 7. 구현 순서

```
1. 마이그레이션 생성 + 적용 + test helper 동기화
   └── /ax-p1-migrate

2. Drizzle 스키마 수정
   ├── app/features/radar/db/schema.ts (3 테이블 + 상수 추가)
   └── app/db/index.ts (스키마 머지 — 이미 radarSchema에 포함)

3. Source Lifecycle 로직
   └── app/features/radar/constants/source-lifecycle.ts (전환 규칙)

4. RadarService 확장 — Source 관리
   ├── updateSourceStatus()
   ├── getSourceWithDomains()
   ├── listSourcesWithDomains()
   └── updateSourceFull()

5. RadarService 확장 — Domain CRUD
   ├── listDomains()
   ├── createDomain()
   ├── deleteDomain()
   └── setSourceDomains()

6. RadarService 확장 — Crawl Queue
   ├── enqueueSource()
   ├── dequeueBatch()
   ├── completeQueueItem()
   ├── failQueueItem()
   └── getQueueStatus()

7. Crawl Worker 로직
   └── app/features/radar/service/crawl-worker.ts

8. API 라우트
   ├── api.radar.sources.ts (intent 확장: update-status, update-full)
   ├── api.radar.domains.ts (신규)
   ├── api.radar.queue.status.ts (신규)
   └── api.cron.radar-collect.ts (신규)

9. UI 컴포넌트
   ├── ChannelManagementTab.tsx + ChannelCard.tsx
   ├── ChannelFormModal.tsx + DomainTagSelect.tsx
   ├── QueueMonitorTab.tsx
   └── radar.tsx (탭 구조 변경: sources → channels + queue 추가)

10. 검증
    └── /ax-04-verify all
```

---

## 8. 테스트 계획

| 영역 | 테스트 | 파일 |
|------|--------|------|
| Source Lifecycle | 전환 규칙 (5 상태 × N 전환), validateSourceTransition | `tests/unit/features/radar/source-lifecycle.test.ts` |
| Domain CRUD | 생성/삭제/M:N 연결 | `tests/unit/features/radar/domain.test.ts` |
| Crawl Queue | enqueue/dequeue/complete/fail/지수 백오프 | `tests/unit/features/radar/crawl-queue.test.ts` |
| Crawl Worker | processCrawlQueue, classifyError, 타임아웃 가드 | `tests/unit/features/radar/crawl-worker.test.ts` |
| Source CRUD 확장 | updateSourceFull, updateSourceStatus, enabled 동기화 | 기존 `radar-service.test.ts` 확장 |

예상 테스트 수: 40~60개

---

## 9. 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| D1 큐 폴링 경합 (동시 Cron) | Medium | batchId 기반 락 + PROCESSING 상태로 원자적 전환 |
| 큐 poison message (무한 재시도) | Medium | max_retries=3, DEAD 상태 + source FAILED 자동 전환 |
| 마이그레이션 3개 테이블 동시 | Low | 신규 테이블만 (기존 ALTER 없음), 독립적 |
| `enabled` → `status` 전환 | Medium | 자동 동기화 + 마이그레이션에서 기존 데이터 보정 |
| CF Workers 30초 타임아웃 | High | batchSize=10 + 25초 타임아웃 가드 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-11 | Initial — Phase 2 설계 (채널 관리 + 도메인 + 큐) | Sinclair Seo |
