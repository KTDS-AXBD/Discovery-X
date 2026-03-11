---
code: DX-DSGN-012
title: Radar 채널 관리 + 도메인 분류 + 수집 큐 설계
version: 1.1
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
| 도메인 CRUD API + UI (optional 태그 선택) | Source Health Dashboard |
| 큐 기반 수집 파이프라인 + 장애 대응 | Novelty 평가 |
| `enabled` → `status` 마이그레이션 | embedding 기반 near-duplicate |
| 기존 Cron 자동 수집 → 큐 기반 전환 | — |

### Phase 2A / 2B 분할 [R3]

Phase 2는 범위가 크므로 **2A(채널+도메인) / 2B(큐+워커)**로 나누어 진행:

| 단계 | 범위 | 예상 |
|------|------|------|
| **Phase 2A** | 마이그레이션 + Lifecycle + 채널 관리 UI + 도메인 CRUD | 1 세션 |
| **Phase 2B** | Crawl Queue 서비스 + Worker + Cron 전환 + 큐 모니터 | 1 세션 |

2A 완료 후 기존 수집 Cron과 병행 운영하면서 2B를 진행.

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
-- [F1] D1은 FK CASCADE 미지원 → 애플리케이션 레벨 삭제 (§1.5)
-- ============================================================================

CREATE TABLE radar_source_domains (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES radar_sources(id),
  domain_id TEXT NOT NULL REFERENCES radar_domains(id),
  UNIQUE(source_id, domain_id)
);

CREATE INDEX idx_rsd_source ON radar_source_domains(source_id);
CREATE INDEX idx_rsd_domain ON radar_source_domains(domain_id);

-- ============================================================================
-- 3. radar_crawl_queue — 수집 큐
-- [F1] D1은 FK CASCADE 미지원 → 애플리케이션 레벨 삭제 (§1.5)
-- ============================================================================

CREATE TABLE radar_crawl_queue (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES radar_sources(id),
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
  items_created INTEGER DEFAULT 0,          -- [F2] 이 큐 작업에서 생성된 아이템 수
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
    .references(() => radarSources.id),  // [F1] cascade 제거 — 앱 레벨 삭제
  domainId: text("domain_id")
    .notNull()
    .references(() => radarDomains.id),  // [F1] cascade 제거 — 앱 레벨 삭제
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
    .references(() => radarSources.id),  // [F1] cascade 제거 — 앱 레벨 삭제
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
  itemsCreated: integer("items_created").default(0),  // [F2]
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

### 1.5 애플리케이션 레벨 삭제 전략 [F1]

D1(SQLite)은 `PRAGMA foreign_keys = OFF`가 기본이고, Cloudflare D1은 이를 제어할 수 없다. `ON DELETE CASCADE`가 SQL DDL에 있어도 **실제로 동작하지 않는다**.

**대응**: 소스/도메인 삭제 시 애플리케이션에서 관련 레코드를 직접 삭제:

```typescript
async deleteSource(id: string) {
  // 1. radar_source_domains에서 관련 레코드 삭제
  await this.db.delete(radarSourceDomains)
    .where(eq(radarSourceDomains.sourceId, id));
  // 2. radar_crawl_queue에서 관련 레코드 삭제
  await this.db.delete(radarCrawlQueue)
    .where(eq(radarCrawlQueue.sourceId, id));
  // 3. 소스 삭제
  await this.db.delete(radarSources)
    .where(eq(radarSources.id, id));
}

async deleteDomain(id: string) {
  // 1. radar_source_domains에서 관련 레코드 삭제
  await this.db.delete(radarSourceDomains)
    .where(eq(radarSourceDomains.domainId, id));
  // 2. 도메인 삭제
  await this.db.delete(radarDomains)
    .where(eq(radarDomains.id, id));
}
```

---

## 2. Source Lifecycle

### 2.1 상태 전환 규칙 [R2 반영: FAILED→ACTIVE 허용]

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
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │            │            │
             ▼            ├─────┐      ▼
        ┌──────────┐      ▼     ▼  ┌──────────┐
        │  ACTIVE  │ ┌──────┐ ┌──┐ │  ACTIVE  │
        │ (재시작) │ │ACTIVE│ │AR│ │ (재활성) │
        └──────────┘ │(복구)│ └──┘ └──────────┘
                     └──────┘
```

### 2.2 허용 전환 테이블

```typescript
// app/features/radar/constants/source-lifecycle.ts

export const SOURCE_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  ACTIVE:   ["PAUSED", "REVIEW", "FAILED"],
  PAUSED:   ["ACTIVE"],
  REVIEW:   ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],             // 복구 불가 (새 소스 등록)
  FAILED:   ["ACTIVE"],     // [R2] 재활성 허용 (consecutiveFailures 리셋)
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

**FAILED → ACTIVE 전환 시** [R2]:
- `consecutiveFailures`를 0으로 리셋
- `enabled`를 1로 복원
- 사용자가 URL 수정 후 재시도 가능 (수집 이력 보존)

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
  // 4. [R2] FAILED→ACTIVE인 경우 consecutiveFailures = 0 리셋
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

/** 소스 삭제 [F1] — 관련 레코드 직접 삭제 */
async deleteSource(id: string): Promise<void> {
  // 1. radar_source_domains 삭제
  // 2. radar_crawl_queue 삭제
  // 3. radar_sources 삭제
}

// ---------- Domain CRUD ----------

/** 도메인 목록 */
async listDomains(tenantId: string): Promise<RadarDomain[]>

/** 도메인 생성 */
async createDomain(input: CreateDomainInput): Promise<string>

/** 도메인 삭제 [F1] — 관련 조인 레코드 직접 삭제 */
async deleteDomain(id: string): Promise<void>

/** 소스-도메인 연결 */
async setSourceDomains(sourceId: string, domainIds: string[]): Promise<void> {
  // DELETE existing + INSERT new
}

// ---------- Crawl Queue ----------

/**
 * 소스에서 큐 아이템 생성 [F2]
 *
 * 1소스 = 1큐 아이템. 큐 아이템의 url은 소스의 URL.
 * Worker가 소스 URL을 fetch → parserType에 따라 처리:
 * - RSS: 피드 파싱 후 N개 radar_items 생성
 * - HTML/Site: 단일 페이지 파싱 후 1개 radar_item 생성
 */
async enqueueSource(sourceId: string, tenantId: string): Promise<number> {
  // 1. 소스 정보 조회 (url, sourceType, crawlInterval)
  // 2. 마지막 수집 시각 확인 → interval 미경과 시 스킵
  // 3. parserType 결정 (sourceType → parserType 매핑):
  //    rss → "rss", site → "html", youtube → "youtube", sns → "html"
  // 4. INSERT radar_crawl_queue (PENDING, url=소스 URL)
  // 반환: 생성된 큐 아이템 수 (0 또는 1)
}

/**
 * PENDING 큐 아이템 가져오기 (배치) [F3]
 * stale PROCESSING 아이템도 함께 복구.
 */
async dequeueBatch(tenantId: string, limit: number): Promise<QueueItem[]> {
  // [F3] 0. stale 복구: PROCESSING이면서 started_at이 10분 이상 전인 아이템 → PENDING 리셋
  // 1. PENDING + scheduled_at <= now + (next_retry_at IS NULL or <= now)
  // 2. priority DESC, scheduled_at ASC
  // 3. 상태를 PROCESSING으로 변경 + started_at 설정
  // 4. 반환
}

/** 큐 아이템 완료 처리 */
async completeQueueItem(id: string, itemsCreated: number): Promise<void> {
  // status = COMPLETED, completed_at = now, items_created = itemsCreated
  // source.consecutiveFailures = 0 (성공하면 리셋)
  // source.lastCollectedAt = now
}

/** 큐 아이템 실패 처리 */
async failQueueItem(id: string, failureCode: string, error: string): Promise<void> {
  // retry_count++
  // retry_count >= max_retries → status = DEAD
  //   + source.consecutiveFailures++ → 5이면 source FAILED 전환
  //   + 3이면 source REVIEW 전환
  // else → status = FAILED, next_retry_at = 지수 백오프 계산
}

/** 큐 상태 요약 */
async getQueueStatus(tenantId: string): Promise<QueueStatusSummary> {
  // GROUP BY status → { pending, processing, completed, failed, dead }
}

/**
 * 큐 정리 [R5]
 * COMPLETED 7일 이상, DEAD 30일 이상 된 아이템 삭제.
 */
async cleanupQueue(tenantId: string): Promise<number> {
  // DELETE WHERE status='COMPLETED' AND completed_at < now - 7일
  // DELETE WHERE status='DEAD' AND completed_at < now - 30일
  // 반환: 삭제된 행 수
}
```

### 3.2 큐 처리 워커 (Cron 인라인) [F2][F3][F5 반영]

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
  // [F3] dequeueBatch 내부에서 stale PROCESSING 아이템 자동 복구
  const batch = await service.dequeueBatch(tenantId, batchSize);

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const item of batch) {
    // 타임아웃 가드
    if (Date.now() - startTime > timeoutMs) break;

    try {
      // [F2] parserType에 따른 수집 처리 — 1소스 fetch → N개 아이템 생성
      const result = await fetchAndParse(db, item, tenantId);
      await service.completeQueueItem(item.id, result.itemsCreated);
      succeeded++;
    } catch (err) {
      const code = classifyError(err);  // [F5] 구조화된 에러 분류
      await service.failQueueItem(item.id, code, String(err));
      failed++;
    }
    processed++;
  }

  return { processed, succeeded, failed, batchSize: batch.length };
}

/**
 * 에러 분류 [F5]
 * 구조화된 에러 타입 기반 분류. 문자열 매칭 fallback.
 */
function classifyError(err: unknown): string {
  // 1. CrawlError 인스턴스면 코드 직접 반환
  if (err instanceof CrawlError) return err.code;

  // 2. Response 객체면 HTTP 상태 코드 기반 분류
  if (err instanceof Response || (err && typeof err === "object" && "status" in err)) {
    const status = (err as { status: number }).status;
    if (status === 401 || status === 403) return "AUTH_REQUIRED";
    if (status === 429) return "RATE_LIMITED";
    if (status >= 500) return "NETWORK_ERROR";
  }

  // 3. Fallback: 메시지 기반 (최후 수단)
  const msg = String(err).toLowerCase();
  if (msg.includes("timeout") || msg.includes("aborted")) return "TIMEOUT";
  if (msg.includes("parse")) return "PARSE_ERROR";
  return "NETWORK_ERROR";
}

/** 커스텀 에러 클래스 [F5] */
export class CrawlError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = "CrawlError";
  }
}

/**
 * parserType 기반 fetch + parse [F2]
 *
 * RSS 소스: 피드 fetch → XML 파싱 → N개 아이템 추출 → 각각 dedupe + INSERT
 * HTML 소스: 페이지 fetch → HTML 파싱 → 1개 아이템 추출 → dedupe + INSERT
 */
async function fetchAndParse(
  db: DB,
  item: QueueItem,
  tenantId: string,
): Promise<{ itemsCreated: number }> {
  const service = new RadarService(db);
  const runId = await service.findOrCreateDailyRun(tenantId);

  switch (item.parserType) {
    case "rss": {
      // 1. fetch RSS XML
      // 2. 각 <item>에서 url, title, summary 추출
      // 3. 각각에 대해 dedupe 체크 (urlHash + dedupeKey)
      // 4. 신규만 radar_items INSERT
      // 반환: { itemsCreated: N }
      return fetchRss(db, item, runId);
    }
    case "html":
    default: {
      // 1. fetch HTML (기존 parseUrl() 재사용)
      // 2. dedupe 체크
      // 3. radar_items INSERT (1건)
      // 반환: { itemsCreated: 0 | 1 }
      return fetchHtml(db, item, runId);
    }
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

| 라우트 | 메서드 | 기능 | Phase |
|--------|--------|------|:-----:|
| `api.radar.domains.ts` | GET/POST/DELETE | 도메인 CRUD | 2A |
| `api.radar.queue.status.ts` | GET | 큐 상태 요약 | 2B |
| `api.cron.radar-collect.ts` | GET | 큐 스케줄링 + 수집 처리 | 2B |

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

### 4.3 Cron: 기존 수집 → 큐 기반 전환 [F4]

**현재 상태**: `api.cron.daily.ts`에서 `system-radar` actor로 자동 수집이 이루어지고 있음.

**전환 전략** (점진적):

1. **Phase 2A**: 기존 daily cron의 radar 수집 로직 유지 (변경 없음)
2. **Phase 2B**: 신규 `api.cron.radar-collect.ts` 라우트 추가
   - ACTIVE 소스 → crawlInterval 체크 → enqueueSource() → processCrawlQueue()
   - 큐 정리: cleanupQueue() 호출 (COMPLETED 7일, DEAD 30일)
3. **Phase 2B 완료 후**: 기존 daily cron에서 radar 수집 로직 제거 (system-radar 코드 비활성화)

```typescript
// app/routes/api.cron.radar-collect.ts (Phase 2B)
// 1. CRON_SECRET 인증
// 2. 활성 테넌트 순회
// 3. ACTIVE 소스 → enqueueSource()
// 4. processCrawlQueue() → 큐 처리
// 5. cleanupQueue() → [R5] 오래된 큐 아이템 정리
// 6. 결과 반환 (enqueued, processed, succeeded, failed, cleaned)
```

cron-job.org 등록: 매일 09:00 KST (ai-pipeline 09:30보다 앞서 실행).

---

## 5. UI 설계

### 5.1 탭 구조 변경 [R1 반영: 큐 모니터 통합]

현재 3탭 유지 (이름만 변경):

```
/radar
├── 탭 1: 피드 (기존, 기본 탭)
├── 탭 2: 수동 등록 (Phase 1A/1B, 기존)
└── 탭 3: 채널 관리 (Phase 2, ★ — 기존 "소스 관리" 대체 + 큐 모니터 통합)
```

**큐 모니터는 독립 탭이 아닌 채널 관리 탭 하단에 접이식 섹션**으로 배치 [R1]:
- 5명 사용자 규모에 4탭은 과함
- 큐 현황은 운영 정보 — 채널 관리 문맥에서 확인하는 것이 자연스러움
- 관리자(gatekeeper+)에게만 수집 현황 섹션 표시

### 5.2 채널 관리 탭

```
┌───────────────────────────────────────────────────┐
│  피드  │ 수동 등록 │ ★ 채널 관리                   │
├───────────────────────────────────────────────────┤
│                                                   │
│ ┌─ 필터 바 ────────────────────────────────────┐  │
│ │ [유형 ▾] [상태 ▾] [도메인 ▾] [검색... ] [+]  │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ┌─ 채널 카드 ──────────────────────────────────┐  │
│ │ GeekNews                      [RSS] [ACTIVE] │  │
│ │ https://news.hada.io/rss                     │  │
│ │ 키워드: AI, SaaS  |  도메인: 기술 트렌드      │  │
│ │ 수집 간격: 1일  |  마지막 수집: 2시간 전       │  │
│ │                                               │  │
│ │ [편집] [일시정지] [삭제]                       │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ┌─ 채널 카드 ──────────────────────────────────┐  │
│ │ TechCrunch                  [사이트] [FAILED] │  │
│ │ https://techcrunch.com                        │  │
│ │ ⚠️ 연속 5회 수집 실패                         │  │
│ │                                               │  │
│ │ [URL 수정 후 재활성] [삭제]                    │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
│ ┌─ 수집 현황 (접이식) ─── [▸ 펼치기] ─────────┐  │
│ │ 대기: 12 │ 처리 중: 2 │ 완료: 345           │  │
│ │ 실패: 3  │ 영구 실패: 1                      │  │
│ │                                               │  │
│ │ 최근 실패:                                    │  │
│ │ · TechCrunch — TIMEOUT (재시도 2/3, 6시간 후) │  │
│ │ · 블로그X — AUTH_REQUIRED ☠ DEAD (3/3)        │  │
│ └──────────────────────────────────────────────┘  │
│                                                   │
└───────────────────────────────────────────────────┘
```

### 5.3 채널 추가/편집 모달 [R4 반영: 도메인 optional]

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
│  도메인(선택): [기술 트렌드 ×] [+ 추가]            │
│  ※ 도메인 분류는 선택사항입니다                     │
│                                                   │
│         [취소]                    [저장]           │
└───────────────────────────────────────────────────┘
```

### 5.4 컴포넌트 구조

```
app/features/radar/ui/
├── ManualCollectTab.tsx           — 기존 (수동 등록)
├── UrlCollectForm.tsx             — 기존
├── TextCollectForm.tsx            — 기존
├── FileUploadForm.tsx             — 기존
├── SendToIdeaButton.tsx           — 기존
├── ChannelManagementTab.tsx       — ★ 채널 관리 탭 (카드 목록 + 필터 + 큐 현황)
├── ChannelCard.tsx                — ★ 채널 카드 (상태 뱃지 + lifecycle 액션)
├── ChannelFormModal.tsx           — ★ 채널 추가/편집 모달
├── DomainTagSelect.tsx            — ★ 도메인 태그 선택 (Combobox, optional)
└── QueueStatusPanel.tsx           — ★ 수집 현황 접이식 패널 [R1]
```

### 5.5 도메인 관리 UI [R4]

도메인은 **Phase 2에서 optional**로 제공:
- 채널 편집 모달의 도메인 선택은 비필수 (빈 값 허용)
- 필터 바의 "도메인" 드롭다운에서 [+ 도메인 추가] 인라인 생성
- Phase 3 Health Dashboard에서 "도메인별 커버리지" 분석 시 본격 활용

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

[재활성] 버튼 (FAILED 소스) → POST api.radar.sources (intent=update-status, status=ACTIVE)
  → RadarService.updateSourceStatus()
    → validateSourceTransition(FAILED, ACTIVE) ✅ [R2]
    → UPDATE status=ACTIVE, enabled=1, consecutiveFailures=0
```

### 6.3 큐 기반 수집 플로우 [F2 반영]

```
Cron (09:00 KST)
  → api.cron.radar-collect
  → 1. 활성 테넌트 조회
  → 2. 테넌트별 ACTIVE 소스 조회
  → 3. crawlInterval 경과 소스 → enqueueSource()
        → INSERT radar_crawl_queue (PENDING, url=소스 URL)
        → 1소스 = 1큐 아이템
  → 4. processCrawlQueue()
        → dequeueBatch(10)
        → [F3] stale PROCESSING 아이템 자동 복구 (10분 초과)
        → 각 큐 아이템:
            RSS 소스: fetch XML → 파싱 → N개 radar_items INSERT (중복 스킵)
            HTML 소스: fetch HTML → 파싱 → 1개 radar_item INSERT (중복 스킵)
        → completeQueueItem(id, itemsCreated) 또는 failQueueItem()
  → 5. cleanupQueue() — [R5] COMPLETED 7일 / DEAD 30일 정리
  → 6. 결과 반환
```

---

## 7. 구현 순서 [R3 반영: 2A/2B 분할]

### Phase 2A: 채널 관리 + 도메인 (1 세션)

```
1. 마이그레이션 생성 + 적용 + test helper 동기화
   └── /ax-p1-migrate (radar_domains + radar_source_domains + radar_crawl_queue)

2. Drizzle 스키마 수정
   ├── app/features/radar/db/schema.ts (3 테이블 + 상수 추가)
   └── app/db/index.ts (스키마 머지 — 이미 radarSchema에 포함)

3. Source Lifecycle 로직
   └── app/features/radar/constants/source-lifecycle.ts (전환 규칙)

4. RadarService 확장 — Source 관리
   ├── updateSourceStatus() (lifecycle + enabled 동기화 + FAILED→ACTIVE [R2])
   ├── deleteSource() [F1] (앱 레벨 cascade 삭제)
   ├── getSourceWithDomains()
   ├── listSourcesWithDomains()
   └── updateSourceFull()

5. RadarService 확장 — Domain CRUD
   ├── listDomains()
   ├── createDomain()
   ├── deleteDomain() [F1] (앱 레벨 cascade 삭제)
   └── setSourceDomains()

6. API 라우트
   ├── api.radar.sources.ts (intent 확장: update-status, update-full)
   └── api.radar.domains.ts (신규)

7. UI 컴포넌트
   ├── ChannelManagementTab.tsx + ChannelCard.tsx
   ├── ChannelFormModal.tsx + DomainTagSelect.tsx [R4] (도메인 optional)
   └── radar.tsx (탭 이름 변경: sources → 채널 관리)

8. 검증
   └── /ax-04-verify all
```

### Phase 2B: 큐 + 워커 (1 세션)

```
1. RadarService 확장 — Crawl Queue
   ├── enqueueSource() [F2] (1소스=1큐 아이템)
   ├── dequeueBatch() [F3] (stale 복구 포함)
   ├── completeQueueItem()
   ├── failQueueItem()
   ├── getQueueStatus()
   └── cleanupQueue() [R5] (TTL 정리)

2. Crawl Worker 로직
   ├── app/features/radar/service/crawl-worker.ts
   ├── CrawlError 클래스 [F5]
   ├── fetchRss() — RSS 파싱 → N개 아이템
   └── fetchHtml() — HTML 파싱 → 1개 아이템

3. API 라우트
   ├── api.radar.queue.status.ts (신규)
   └── api.cron.radar-collect.ts (신규) [F4]

4. 기존 Cron 전환 [F4]
   └── api.cron.daily.ts에서 system-radar 수집 로직 비활성화

5. UI 컴포넌트
   └── QueueStatusPanel.tsx (채널 관리 탭 내 접이식) [R1]

6. 검증
   └── /ax-04-verify all
```

---

## 8. 테스트 계획

### Phase 2A 테스트

| 영역 | 테스트 | 파일 |
|------|--------|------|
| Source Lifecycle | 전환 규칙 (5 상태 × N 전환, FAILED→ACTIVE [R2]), validateSourceTransition | `tests/unit/features/radar/source-lifecycle.test.ts` |
| Domain CRUD | 생성/삭제/M:N 연결, 앱 레벨 cascade [F1] | `tests/unit/features/radar/domain.test.ts` |
| Source CRUD 확장 | updateSourceFull, updateSourceStatus, deleteSource [F1], enabled 동기화 | 기존 `radar-service.test.ts` 확장 |

### Phase 2B 테스트

| 영역 | 테스트 | 파일 |
|------|--------|------|
| Crawl Queue | enqueue/dequeue/complete/fail/지수 백오프/stale 복구 [F3]/cleanup [R5] | `tests/unit/features/radar/crawl-queue.test.ts` |
| Crawl Worker | processCrawlQueue, CrawlError [F5], classifyError, 타임아웃 가드, RSS→N아이템 [F2] | `tests/unit/features/radar/crawl-worker.test.ts` |

예상 테스트 수: 2A 20~30개 + 2B 25~35개 = 총 45~65개

---

## 9. 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| D1 FK CASCADE 미작동 [F1] | High | 애플리케이션 레벨 삭제 (§1.5) |
| RSS→N아이템 파싱 시간 [F2] | Medium | 아이템당 dedupe는 빠름 (index hit), 배치 사이즈로 조절 |
| PROCESSING 고아 [F3] | Medium | dequeueBatch에서 10분 stale 자동 복구 |
| 기존 Cron 전환 충돌 [F4] | Medium | Phase 2B에서 점진적 전환 (병행 운영 후 비활성화) |
| 에러 분류 정확도 [F5] | Low | CrawlError 구조화 + HTTP status 우선, 문자열 fallback |
| 큐 테이블 비대화 [R5] | Low | COMPLETED 7일 / DEAD 30일 TTL 자동 정리 |
| CF Workers 30초 타임아웃 | High | batchSize=10 + 25초 타임아웃 가드 |
| 마이그레이션 3개 테이블 동시 | Low | 신규 테이블만 (기존 ALTER 없음), 독립적 |

---

## 10. 검토 의견 대응 매트릭스

| # | 검토 의견 (Six Hats) | 대응 | 반영 위치 |
|---|---------------------|------|----------|
| F1 | D1 FK CASCADE 미작동 | 앱 레벨 삭제 로직 추가 | §1.1, §1.2, §1.5, §3.1 |
| F2 | RSS/Site 큐 처리 단위 불명확 | 1소스=1큐, Worker가 N개 생성 | §3.1, §3.2, §6.3 |
| F3 | PROCESSING 고아 복구 | dequeueBatch에서 10분 stale 자동 복구 | §3.1, §3.2 |
| F4 | 기존 Cron 전환 경로 미정의 | 점진적 전환 (병행→비활성화) | §4.3 |
| F5 | classifyError 문자열 매칭 취약 | CrawlError + HTTP status + fallback | §3.2 |
| R1 | 4탭 과다 (큐 모니터) | 채널 관리 탭 내 접이식 섹션 | §5.1, §5.2, §5.4 |
| R2 | FAILED 복구 불가 | FAILED→ACTIVE 허용 (failures 리셋) | §2.1, §2.2, §3.1 |
| R3 | 2세션 범위 과부하 | Phase 2A(채널) / 2B(큐) 분할 | §0, §7 |
| R4 | 도메인 UI 과잉 설계 | Phase 2에서 optional, Phase 3 본격화 | §5.3, §5.5 |
| R5 | 큐 정리 정책 없음 | COMPLETED 7일 / DEAD 30일 TTL | §3.1, §4.3, §6.3 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-11 | Initial — Phase 2 설계 (채널 관리 + 도메인 + 큐) | Sinclair Seo |
| 1.1 | 2026-03-11 | Six Hats 검토 반영 — F1~F5 필수 수정 + R1~R5 설계 변경 (10건) | Sinclair Seo |
