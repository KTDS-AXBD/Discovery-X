---
code: DX-DSGN-013
title: Radar Health Score + AI 품질 평가 + Dashboard 설계
version: "1.0"
status: Draft
category: DSGN
created: 2026-03-11
updated: 2026-03-11
author: Sinclair Seo
---

# Radar Health Score + AI 품질 평가 + Source Health Dashboard — 설계 문서

> F41 Phase 3 | DX-REQ-012 | [[DX-PLAN-009]] §4, §5, §7
>
> Plan v0.3의 Phase 3 범위를 구현 수준으로 상세화한다.

---

## 0. Design Scope

이 문서는 DX-PLAN-009의 **Phase 3** 범위를 다룬다:

| 포함 | 제외 (완료됨) |
|------|-------------|
| `radar_source_metrics` 테이블 + Drizzle 스키마 | 수동 수집 (Phase 1A/1B ✅) |
| `radar_item_metrics` 테이블 + Drizzle 스키마 | 채널 관리 + 도메인 (Phase 2A ✅) |
| Health Score 4축 계산 서비스 | 큐 기반 수집 파이프라인 (Phase 2B ✅) |
| AI 아이템 품질 평가 (claude -p 배치) | |
| Source Health Dashboard 탭 UI | |
| Cron 건강도 일괄 갱신 + REVIEW 자동 전환 | |
| 운영 액션 4종 | |

---

## 1. 데이터 모델

### 1.1 마이그레이션 SQL

하나의 마이그레이션 파일(`0058_radar_health_metrics.sql`)로 통합:

```sql
-- 1. radar_source_metrics — 채널별 일별 건강도 스냅샷
CREATE TABLE IF NOT EXISTS radar_source_metrics (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES radar_sources(id),
  tenant_id TEXT REFERENCES tenants(id),
  date TEXT NOT NULL,
  total_items INTEGER DEFAULT 0,
  new_items_today INTEGER DEFAULT 0,
  total_ideas INTEGER DEFAULT 0,
  viewed_count INTEGER DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  dislike_count INTEGER DEFAULT 0,
  conversion_count_7d INTEGER DEFAULT 0,
  conversion_count_30d INTEGER DEFAULT 0,
  avg_relevance REAL DEFAULT 0,
  avg_novelty REAL DEFAULT 0,
  engagement_rate REAL DEFAULT 0,
  conversion_rate_7d REAL DEFAULT 0,
  conversion_rate_30d REAL DEFAULT 0,
  health_score REAL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(source_id, date)
);

CREATE INDEX IF NOT EXISTS idx_rsm_source ON radar_source_metrics(source_id);
CREATE INDEX IF NOT EXISTS idx_rsm_tenant_date ON radar_source_metrics(tenant_id, date);

-- 2. radar_item_metrics — 아이템별 AI 품질 지표
CREATE TABLE IF NOT EXISTS radar_item_metrics (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL UNIQUE REFERENCES radar_items(id),
  tenant_id TEXT REFERENCES tenants(id),
  topic_relevance REAL DEFAULT 0,
  novelty REAL DEFAULT 0,
  quality REAL DEFAULT 0,
  composite_score REAL DEFAULT 0,
  model_version TEXT,
  evaluated_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_rim_item ON radar_item_metrics(item_id);
CREATE INDEX IF NOT EXISTS idx_rim_tenant ON radar_item_metrics(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rim_evaluated ON radar_item_metrics(evaluated_at);
```

### 1.2 Drizzle 스키마 추가

**`app/features/radar/db/schema.ts`** 에 추가:

```typescript
// ============================================================================
// HEALTH METRICS TABLES (F41 Phase 3)
// ============================================================================

export const radarSourceMetrics = sqliteTable("radar_source_metrics", {
  id: text("id").primaryKey(),
  sourceId: text("source_id")
    .notNull()
    .references(() => radarSources.id),
  tenantId: text("tenant_id").references(() => tenants.id),
  date: text("date").notNull(),                        // YYYY-MM-DD
  totalItems: integer("total_items").default(0),
  newItemsToday: integer("new_items_today").default(0),
  totalIdeas: integer("total_ideas").default(0),
  viewedCount: integer("viewed_count").default(0),
  likeCount: integer("like_count").default(0),
  dislikeCount: integer("dislike_count").default(0),
  conversionCount7d: integer("conversion_count_7d").default(0),
  conversionCount30d: integer("conversion_count_30d").default(0),
  avgRelevance: real("avg_relevance").default(0),
  avgNovelty: real("avg_novelty").default(0),
  engagementRate: real("engagement_rate").default(0),
  conversionRate7d: real("conversion_rate_7d").default(0),
  conversionRate30d: real("conversion_rate_30d").default(0),
  healthScore: real("health_score").default(0),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
}, (table) => ({
  sourceIdx: index("idx_rsm_source_drizzle").on(table.sourceId),
  tenantDateIdx: index("idx_rsm_tenant_date_drizzle").on(table.tenantId, table.date),
}));

export const radarItemMetrics = sqliteTable("radar_item_metrics", {
  id: text("id").primaryKey(),
  itemId: text("item_id")
    .notNull()
    .unique()
    .references(() => radarItems.id),
  tenantId: text("tenant_id").references(() => tenants.id),
  topicRelevance: real("topic_relevance").default(0),
  novelty: real("novelty").default(0),
  quality: real("quality").default(0),
  compositeScore: real("composite_score").default(0),
  modelVersion: text("model_version"),
  evaluatedAt: integer("evaluated_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
}, (table) => ({
  itemIdx: index("idx_rim_item_drizzle").on(table.itemId),
  tenantIdx: index("idx_rim_tenant_drizzle").on(table.tenantId),
}));

// Types
export type RadarSourceMetric = typeof radarSourceMetrics.$inferSelect;
export type NewRadarSourceMetric = typeof radarSourceMetrics.$inferInsert;
export type RadarItemMetric = typeof radarItemMetrics.$inferSelect;
export type NewRadarItemMetric = typeof radarItemMetrics.$inferInsert;
```

### 1.3 DB Merge 등록

`app/db/index.ts` 스키마 머지에 추가: `radarSourceMetrics`, `radarItemMetrics`
— 기존 `radarSchema`에서 re-export되므로 별도 import 불필요.

---

## 2. Health Score 계산 서비스

### 2.1 HealthScoreCalculator

```typescript
// app/features/radar/service/health-score.ts

interface HealthInput {
  avgRelevance: number;    // 0~1, AI 평가 평균
  avgNovelty: number;      // 0~1, AI 평가 평균
  engagementRate: number;  // 0~1, (viewed + liked) / total
  conversionRate30d: number; // 0~1, unique ideas / unique items (30일)
}

interface HealthWeights {
  relevance: number;    // 기본 0.30
  novelty: number;      // 기본 0.20
  engagement: number;   // 기본 0.20
  conversion: number;   // 기본 0.30
}

const DEFAULT_WEIGHTS: HealthWeights = {
  relevance: 0.30,
  novelty: 0.20,
  engagement: 0.20,
  conversion: 0.30,
};

/**
 * 4축 Health Score 계산
 *
 * AI 미평가 시: relevance=0, novelty=0 → 나머지 2축으로만 점수 산출 (최대 0.50)
 * → UI에서 "AI 평가 대기 중" 표시
 */
export function calculateHealthScore(
  input: HealthInput,
  weights: HealthWeights = DEFAULT_WEIGHTS,
): number {
  const score =
    input.avgRelevance * weights.relevance +
    input.avgNovelty * weights.novelty +
    input.engagementRate * weights.engagement +
    input.conversionRate30d * weights.conversion;

  return Math.round(score * 1000) / 1000; // 소수점 3자리
}
```

### 2.2 Engagement Rate 계산

```typescript
/**
 * Engagement Rate = (viewed + liked) / total
 *
 * viewed: radar_item_user_status.status = 'viewed' 인 고유 아이템
 * liked: reaction = 'like'
 * total: source에 속한 전체 아이템 수
 *
 * 사용자 피드백 우선: dislike 비율 > 50%면 engagement에 패널티
 */
export function calculateEngagement(params: {
  totalItems: number;
  viewedCount: number;
  likeCount: number;
  dislikeCount: number;
}): number {
  if (params.totalItems === 0) return 0;

  const interacted = params.viewedCount + params.likeCount;
  let rate = Math.min(1, interacted / params.totalItems);

  // dislike 패널티 (DX-PLAN-009 §4.2: "사용자 피드백 우선")
  const totalReactions = params.likeCount + params.dislikeCount;
  if (totalReactions > 0) {
    const dislikeRatio = params.dislikeCount / totalReactions;
    if (dislikeRatio > 0.5) {
      rate *= 1 - (dislikeRatio - 0.5); // 50% 초과분만큼 감점
    }
  }

  return Math.round(rate * 1000) / 1000;
}
```

### 2.3 Conversion Rate 계산

```typescript
/**
 * Conversion Rate = unique ideas / unique items (기간별)
 *
 * 전환 인정: link_type = 'primary' 또는 'secondary' (reference 제외)
 * 기간: 7일(단기), 30일(장기)
 * Source 귀속: 아이템의 source_id로 채널에 귀속
 */
export interface ConversionRates {
  rate7d: number;
  rate30d: number;
  count7d: number;
  count30d: number;
}
```

### 2.4 Source Metrics 갱신 쿼리 (Cron에서 실행)

채널별로 다음 데이터를 집계:

```sql
-- 1. 총 아이템 수 (source별)
SELECT source_id, COUNT(*) as total_items
FROM radar_items
GROUP BY source_id;

-- 2. 오늘 수집된 아이템 수
SELECT source_id, COUNT(*) as new_items_today
FROM radar_items
WHERE DATE(collected_at, 'unixepoch') = DATE('now')
GROUP BY source_id;

-- 3. Engagement 집계 (viewed + like/dislike)
SELECT ri.source_id,
  COUNT(DISTINCT CASE WHEN rius.status = 'viewed' THEN ri.id END) as viewed_count,
  COUNT(DISTINCT CASE WHEN rius.reaction = 'like' THEN ri.id END) as like_count,
  COUNT(DISTINCT CASE WHEN rius.reaction = 'dislike' THEN ri.id END) as dislike_count
FROM radar_items ri
LEFT JOIN radar_item_user_status rius ON ri.id = rius.item_id
GROUP BY ri.source_id;

-- 4. Conversion (7d/30d)
SELECT ri.source_id,
  COUNT(DISTINCT CASE WHEN isrc.added_at >= unixepoch() - 7*86400
    AND isrc.link_type IN ('primary','secondary') THEN isrc.idea_id END) as conv_7d,
  COUNT(DISTINCT CASE WHEN isrc.added_at >= unixepoch() - 30*86400
    AND isrc.link_type IN ('primary','secondary') THEN isrc.idea_id END) as conv_30d
FROM radar_items ri
LEFT JOIN idea_sources isrc ON ri.id = isrc.radar_item_id
GROUP BY ri.source_id;

-- 5. AI 품질 평균 (item_metrics 존재하는 아이템만)
SELECT ri.source_id,
  AVG(rim.topic_relevance) as avg_relevance,
  AVG(rim.novelty) as avg_novelty
FROM radar_items ri
INNER JOIN radar_item_metrics rim ON ri.id = rim.item_id
WHERE rim.evaluated_at IS NOT NULL
GROUP BY ri.source_id;
```

### 2.5 활성화 조건

- 수집 아이템 ≥ **20건** → Health Score 계산 시작 (DX-PLAN-009 §4.1)
- 20건 미만 → `health_score = NULL` → UI에서 "데이터 수집 중 (N/20)" 표시
- AI 미평가 → 부분 점수 (engagement + conversion만, 최대 0.50)

---

## 3. AI 아이템 품질 평가

### 3.1 평가 모델: `claude -p` 배치 (DX-REQ-011 패턴)

기존 `/ax-batch-analysis` 스킬 패턴을 재사용:

- **실행 방식**: Nightly Cron → `claude -p` 프로세스 호출 (Claude Code 구독 토큰)
- **API 크레딧 소비 없음**: 구독 토큰 기반
- **배치 크기**: 최대 50건/실행 (운영 초기 30~50채널 × 일 2~3건 = 60~150건/일)

### 3.2 평가 프롬프트

```typescript
interface ItemEvaluation {
  topicRelevance: number;  // 0~1: BD/신사업 발굴 관련도
  novelty: number;         // 0~1: 새로운 정보/관점 정도
  quality: number;         // 0~1: 내용의 깊이/신뢰성
  reasoning: string;       // 평가 근거 (저장하지 않음, 로그용)
}

const EVAL_PROMPT = `
당신은 AX BD팀의 신사업 발굴 정보 품질 평가 전문가입니다.

## 평가 기준

1. **Topic Relevance** (0~1): BD/신사업 발굴에 얼마나 관련이 있는지
   - 1.0: 직접적인 신사업 기회, 시장 변화, 기술 트렌드
   - 0.7: 간접 관련 (산업 동향, 경쟁사 동향)
   - 0.3: 약한 관련 (일반 기술 뉴스)
   - 0.0: 무관 (스포츠, 연예 등)

2. **Novelty** (0~1): 기존에 알려지지 않은 새로운 정보/관점 정도
   - 1.0: 완전히 새로운 발견/발표
   - 0.7: 새로운 분석/해석
   - 0.3: 이미 알려진 정보의 업데이트
   - 0.0: 재탕/중복

3. **Quality** (0~1): 내용의 깊이와 신뢰성
   - 1.0: 데이터 기반, 전문가 분석, 출처 명확
   - 0.7: 합리적 분석, 일부 데이터
   - 0.3: 의견 중심, 데이터 부족
   - 0.0: 광고/홍보/근거 없는 주장

## 입력 형식

제목: {title}
요약: {summary}
본문 발췌: {excerpt}
소스: {sourceName}

## 출력 형식 (JSON)

{ "topicRelevance": 0.7, "novelty": 0.5, "quality": 0.8, "reasoning": "..." }
`;
```

### 3.3 Composite Score 계산

```
composite = (topicRelevance × 0.4) + (novelty × 0.3) + (quality × 0.3)
```

### 3.4 평가 운영 정책 (DX-PLAN-009 §4.2)

| 정책 항목 | 값 |
|----------|-----|
| 평가 시점 | 배치 (Nightly, `claude -p`) |
| 평가 실패 fallback | `composite_score = 0`, `evaluated_at = NULL` → 다음 배치 재시도 |
| 재평가 주기 | 기본 1회 (최초 평가 후 고정). `model_version` 변경 시 전체 재평가 |
| 모델 버전 관리 | `radar_item_metrics.model_version` (예: `claude-sonnet-4-6`) |
| 일 처리 상한 | 200건 (운영 초기 충분) |
| Novelty 과감지 | `novelty > 0.95 + relevance < 0.3` → 잡음 의심 플래그 |

### 3.5 배치 Cron 통합

기존 `/ax-batch-analysis` 스킬의 `ontology` 모드와 동일한 패턴:

```
[Cron 트리거 or 수동 실행]
  → claude -p "radar_items에서 미평가 아이템 N건 조회 → 평가 → INSERT"
  → radar_item_metrics UPSERT
```

단, Cron 라우트(`api.cron.radar-health`)에서는 **비-AI 부분만 실행**:
- 집계 쿼리 (engagement, conversion)
- Health Score 계산
- `radar_source_metrics` INSERT
- REVIEW 자동 전환

AI 평가는 별도 배치(`/ax-batch-analysis radar` 모드)로 분리.

---

## 4. Cron: 건강도 일괄 갱신

### 4.1 라우트: `api.cron.radar-health`

```typescript
// app/routes/api.cron.radar-health.ts
//
// 매일 10:00 KST (radar-collect 09:00, ai-pipeline 09:30 이후)
// 1. 활성 테넌트 순회
// 2. 테넌트별 ACTIVE 소스 목록 조회
// 3. 소스별 집계 (total, engagement, conversion, AI avg)
// 4. Health Score 계산 + radar_source_metrics UPSERT
// 5. REVIEW 자동 전환 (health < threshold or 전환 0건 30일)
// 6. FAILED 소스 중 consecutive_failures >= 5 확인 (이미 Phase 2B에서 처리)
```

### 4.2 REVIEW 자동 전환 조건 (DX-PLAN-009 §3.4)

| 조건 | 동작 |
|------|------|
| `health_score < 0.2` (활성화된 소스, 아이템 ≥ 20) | ACTIVE → REVIEW |
| 전환 0건 30일 연속 (`conversion_count_30d = 0`, 아이템 ≥ 20) | ACTIVE → REVIEW |
| `consecutive_failures >= 3` | ACTIVE → REVIEW (이미 Phase 2B에서 구현) |
| `consecutive_failures >= 5` | ACTIVE → FAILED (이미 Phase 2B에서 구현) |

### 4.3 HealthMetricsService

```typescript
// app/features/radar/service/health-metrics.ts

export class HealthMetricsService {
  constructor(private db: DB) {}

  /**
   * 소스별 일일 메트릭 집계 + Health Score 계산 + UPSERT
   * Cron에서 호출
   */
  async refreshMetrics(tenantId: string, date: string): Promise<{
    sourcesProcessed: number;
    reviewTransitions: number;
  }>;

  /**
   * 단일 소스 메트릭 집계 (내부용)
   */
  async calculateSourceMetrics(sourceId: string, date: string): Promise<{
    totalItems: number;
    newItemsToday: number;
    viewedCount: number;
    likeCount: number;
    dislikeCount: number;
    conversionCount7d: number;
    conversionCount30d: number;
    avgRelevance: number;
    avgNovelty: number;
    engagementRate: number;
    conversionRate7d: number;
    conversionRate30d: number;
    healthScore: number;
  }>;

  /**
   * REVIEW 자동 전환 판단 + 실행
   */
  async evaluateReviewTransitions(tenantId: string, date: string): Promise<number>;

  /**
   * Dashboard 데이터 조회
   */
  async getDashboardData(tenantId: string): Promise<{
    summary: HealthSummary;
    sources: SourceHealthRow[];
    trend: TrendData[];
  }>;
}
```

---

## 5. Source Health Dashboard UI

### 5.1 탭 위치

`/radar` 페이지 탭 3 (`Source Health`) — 기존 탭 구조:

```
피드 │ 수동 등록 │ ★ Source Health │ 채널 관리
```

### 5.2 레이아웃

```
┌─────────────────────────────────────────────────┐
│  Source Health Dashboard                         │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌─ 요약 카드 (4칸) ──────────────────────────┐  │
│  │ 전체 채널  │ 건강한 채널 │  주의 필요  │ 실패 │  │
│  │   32       │    24      │    6       │  2   │  │
│  │            │  (≥0.5)    │  (<0.5)    │      │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌─ 운영 액션 (접이식) ──────────────────────┐    │
│  │ ⚠️ 비활성화 추천 (3건)      [모두 보기 →] │    │
│  │ ⚠️ 전환 0건 소스 (5건)      [모두 보기 →] │    │
│  │ ⭐ 고성과 소스 (2건)         [유사 등록 →] │    │
│  │ 📊 도메인 커버리지           [확인하기 →]  │    │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌─ 채널 건강도 목록 ────────────────────────┐    │
│  │ 정렬: [건강도↑] [건강도↓] [최근 수집]      │    │
│  │                                            │    │
│  │ ┌ TechCrunch (RSS)  ────── 0.82 ■■■■□ ┐  │    │
│  │ │ 아이템 45 │ 전환 8건 │ 관련도 0.7     │  │    │
│  │ └──────────────────────────────────────┘  │    │
│  │                                            │    │
│  │ ┌ 조선비즈 (Site)  ──────── 0.41 ■■□□□ ┐  │    │
│  │ │ 아이템 23 │ 전환 1건 │ ⚠ 검토 필요    │  │    │
│  │ └──────────────────────────────────────┘  │    │
│  │ ...                                        │    │
│  └────────────────────────────────────────────┘  │
│                                                  │
└─────────────────────────────────────────────────┘
```

### 5.3 운영 액션 4종 (DX-PLAN-009 §5.2)

| # | 액션 | 설명 | 조건 |
|---|------|------|------|
| A1 | 비활성화 추천 | `health < 0.3` 소스 목록 + 원클릭 PAUSED | 아이템 ≥ 20 |
| A2 | 전환 0건 소스 | 최근 30일 전환 없는 소스 보기 | 아이템 ≥ 10 |
| A3 | 고성과 소스 복제 | conversion 상위 소스의 키워드/도메인 기반 유사 소스 등록 유도 | conversion > 0.1 |
| A4 | 도메인 커버리지 | 등록된 도메인 중 소스 부족 영역 경고 | 도메인 ≥ 3 |

### 5.4 컴포넌트 구조

```
app/features/radar/ui/
├── SourceHealthTab.tsx           — 탭 컨테이너
│   ├── HealthSummaryCards.tsx    — 4칸 요약 카드
│   ├── OperationActions.tsx      — 운영 액션 4종
│   ├── SourceHealthList.tsx      — 채널 건강도 목록
│   └── SourceHealthRow.tsx       — 개별 채널 건강도 카드
└── HealthScoreBadge.tsx          — 건강도 점수 배지 (재사용)
```

### 5.5 API 라우트

| 라우트 | 메서드 | 기능 | Phase |
|--------|--------|------|:-----:|
| `api.radar.health` | GET | Dashboard 데이터 조회 | 3A |
| `api.radar.health.actions` | POST | 운영 액션 실행 (일괄 PAUSE 등) | 3B |
| `api.cron.radar-health` | GET | Cron: 건강도 일괄 갱신 | 3A |

---

## 6. 구현 순서 (Phase 3A/3B 분할)

### Phase 3A — 데이터 기반 (1 세션)

```
1. 마이그레이션 생성 + 적용 + test helper 동기화
   └── /ax-p1-migrate (0058_radar_health_metrics.sql)

2. Drizzle 스키마 추가 (schema.ts + db/index.ts 머지)
   ├── radarSourceMetrics
   └── radarItemMetrics

3. Health Score 계산 서비스
   └── app/features/radar/service/health-score.ts
       ├── calculateHealthScore()
       ├── calculateEngagement()
       └── ConversionRates 인터페이스

4. HealthMetricsService (집계 + UPSERT)
   └── app/features/radar/service/health-metrics.ts
       ├── refreshMetrics()
       ├── calculateSourceMetrics()
       ├── evaluateReviewTransitions()
       └── getDashboardData()

5. Cron 라우트
   └── app/routes/api.cron.radar-health.ts

6. Health Dashboard API
   └── app/routes/api.radar.health.ts

7. 테스트
   ├── tests/unit/radar/health-score.test.ts
   └── tests/unit/radar/health-metrics.test.ts

8. 검증
   └── /ax-04-verify all
```

### Phase 3B — AI 평가 + UI (1 세션)

```
1. AI 품질 평가 배치 스크립트
   └── /ax-batch-analysis radar 모드 추가

2. Source Health Dashboard UI
   ├── SourceHealthTab.tsx
   ├── HealthSummaryCards.tsx
   ├── OperationActions.tsx
   ├── SourceHealthList.tsx
   └── HealthScoreBadge.tsx

3. radar.tsx 탭 통합

4. 운영 액션 API
   └── app/routes/api.radar.health.actions.ts

5. 테스트 + 갭 분석

6. 검증
   └── /ax-04-verify all
```

---

## 7. 테스트 계획

| 영역 | 테스트 | 파일 | Phase |
|------|--------|------|:-----:|
| Health Score | 4축 계산, 경계값, AI 미평가 시 부분 점수 | `tests/unit/radar/health-score.test.ts` | 3A |
| Engagement | viewed/like/dislike 조합, dislike 패널티 | 위 파일에 포함 | 3A |
| Conversion | 7d/30d 윈도우, link_type 필터 | 위 파일에 포함 | 3A |
| HealthMetricsService | refreshMetrics, REVIEW 자동 전환 | `tests/unit/radar/health-metrics.test.ts` | 3A |
| Cron | radar-health 라우트 정상 동작 | 기존 패턴 참고 | 3A |
| AI 평가 | 프롬프트 파싱, composite_score 계산 | `tests/unit/radar/item-evaluator.test.ts` | 3B |
| Dashboard UI | 스냅샷 테스트 | 향후 | 3B |

---

## 8. 리스크

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 운영 초기 데이터 부족 (< 20건) | Health Score 미활성 | UI에 "데이터 수집 중" + 진행률 표시 |
| AI 평가 비용 (claude -p 토큰) | 구독 토큰 한도 | 일 200건 상한, 우선순위 큐 |
| D1 집계 쿼리 성능 | 아이템 수 증가 시 | 일별 스냅샷으로 최신 1행만 조회 |
| Health Score 초기 보정 | 적절한 threshold 불확실 | 0.3/0.5 기본값 → 2주 운영 후 조정 |
| REVIEW 자동 전환 오작동 | 정상 소스가 REVIEW로 전환 | 아이템 ≥ 20 활성화 조건 + 관리자 알림 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-11 | Initial — Phase 3 설계 (Health Score + AI 평가 + Dashboard) | Sinclair Seo |
