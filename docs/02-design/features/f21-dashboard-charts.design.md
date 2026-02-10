# F21: 대시보드 차트 실제 데이터 연결 — Design Document

> **Summary**: `/dashboard/metrics` 탭의 기존 loader 데이터를 JS 집계하여 StatusDonut/WeeklyBar/ExperimentGantt 차트를 연결하는 상세 설계. 추가 DB 쿼리 0건, 수정 파일 1개.
>
> **Project**: Discovery-X
> **Version**: v5.1
> **Author**: Claude
> **Date**: 2026-02-10
> **Status**: Draft
> **Planning Doc**: [f21-dashboard-charts.plan.md](../../01-plan/features/f21-dashboard-charts.plan.md)

---

## 1. Overview

### 1.1 Design Goals

1. **추가 DB 쿼리 제로**: 기존 `dashboard.metrics.tsx` loader가 이미 조회하는 `allDiscoveries`/`allExperiments` 데이터를 JS로만 집계
2. **기존 차트 컴포넌트 재사용**: `StatusDonut`, `WeeklyBar`, `ExperimentGantt` 3개 완성 컴포넌트를 import하여 사용
3. **SSR-safe 데이터 전달**: 날짜 라벨(`MM/DD`)과 현재 시각(`serverNow`)을 loader에서 서버 사이드 계산
4. **기존 UI 비파괴**: MetricCard 그리드, 상태별 분포 Card, Agent 토큰 Card는 변경 없이 유지

### 1.2 Design Principles

- **Single File Change**: `dashboard.metrics.tsx` 1개 파일만 수정 (loader 확장 + UI 추가)
- **Proven Pattern 차용**: `/metrics` 독립 라우트(`metrics.tsx`)의 검증된 집계 로직을 tenant-scoped로 적용
- **Hydration Safety**: `Date.now()` 클라이언트 호출 금지 → loader에서 `serverNow` 전달 패턴 사용
- **Progressive Enhancement**: 데이터 0건 시 차트 컴포넌트 내장 빈 상태 처리에 위임

### 1.3 Architecture Decision Record

**결정**: 별도 API 엔드포인트 대신 기존 loader 내 JS 집계 선택

| 기준 | 별도 API (`/api/chart-data`) | Loader 내 JS 집계 (선택) |
|------|----------------------------|--------------------------|
| 추가 DB 쿼리 | 필요 (별도 SELECT) | 0건 (기존 데이터 재사용) |
| 네트워크 요청 | +1 fetch | 0 (SSR 렌더링에 포함) |
| 코드 복잡도 | API 라우트 신규 + 클라이언트 fetch | loader return 확장만 |
| 캐싱 | 별도 관리 필요 | Remix loader 캐싱과 동일 |
| 수정 파일 | 2-3개 | 1개 |

**근거**: `allDiscoveries`(전체 배열)가 이미 loader에 존재하므로, O(n) JS 순회만으로 3개 차트의 데이터를 모두 생성할 수 있다. 별도 API를 분리하면 동일 데이터를 중복 조회하게 되어 비효율적.

---

## 2. Architecture

### 2.1 데이터 흐름 다이어그램

```
┌─────────────────────────────────────────────────────────────────────┐
│                  dashboard.metrics.tsx loader                       │
│                                                                     │
│  [기존 — 변경 없음]                                                  │
│  allDiscoveries ← db.select().from(discoveries)                    │
│                    .where(tenantWhere(discoveries, ctx.tenantId))   │
│  allExperiments ← db.select().from(experiments)                    │
│                    .where(inArray(experiments.discoveryId, ids))    │
│  allEvidence    ← db.select().from(evidence)                       │
│                    .where(inArray(evidence.discoveryId, ids))       │
│                                                                     │
│  [추가 — JS 집계, DB 쿼리 0건]                                       │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │                                                          │      │
│  │  allDiscoveries ──┬── statusGroupMap() ──→ donutData     │      │
│  │                   │   (11단계 → 5그룹)      { inbox,     │      │
│  │                   │                          open,       │      │
│  │                   │                          next,       │      │
│  │                   │                          notNow,     │      │
│  │                   │                          deadEnd }   │      │
│  │                   │                                      │      │
│  │                   └── weeklyBuckets() ──→ weeklyData     │      │
│  │                       (createdAt 8주)      [{ week,      │      │
│  │                                              count }]    │      │
│  │                                                          │      │
│  │  allExperiments ──── activeFilter() ──→ ganttExperiments │      │
│  │                      (completedAt null,    Experiment[]  │      │
│  │                       최대 10개)                          │      │
│  │                                                          │      │
│  │  Date.now() ─────────────────────────→ serverNow         │      │
│  │                                         number           │      │
│  └──────────────────────────────────────────────────────────┘      │
│                              │                                      │
│                              ▼ json({ metrics: { ...기존, + 차트 } })│
└─────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  dashboard.metrics.tsx UI                            │
│                                                                     │
│  [기존 — 변경 없음]                                                  │
│  ┌──────────────────────────────────────────────────┐               │
│  │ MetricCard × 4 (전체/Agent/실험/강한근거)         │               │
│  └──────────────────────────────────────────────────┘               │
│                                                                     │
│  [기존 — 내부 확장]                                                  │
│  ┌──────────────────────────────────────────────────┐               │
│  │ "상태별 분포" Card                                │               │
│  │   StatusBadge 목록 (유지)                         │               │
│  │ + StatusDonut(donutData) 추가                     │               │
│  └──────────────────────────────────────────────────┘               │
│                                                                     │
│  [신규 Card]                                                        │
│  ┌─────────────────────┐  ┌─────────────────────────┐              │
│  │ "주간 생성 추이"      │  │ "실험 타임라인"           │              │
│  │ WeeklyBar(weeklyData)│  │ ExperimentGantt(gantt,  │              │
│  │                      │  │                 now)    │              │
│  └─────────────────────┘  └─────────────────────────┘              │
│  grid-cols-1 sm:grid-cols-2                                         │
│  (gantt: 조건부 — ganttExperiments.length > 0 일 때만)               │
│                                                                     │
│  [기존 — 변경 없음]                                                  │
│  ┌──────────────────────────────────────────────────┐               │
│  │ "Agent 토큰 사용량" Card                          │               │
│  └──────────────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 수정 대상 파일

| 파일 | 변경 내용 | 영향도 |
|------|----------|--------|
| `app/routes/dashboard.metrics.tsx` | loader: 5그룹 donutData + 8주 weeklyData + ganttExperiments + serverNow 집계 추가. UI: StatusDonut/WeeklyBar/ExperimentGantt import + Card 렌더링 | **핵심 (유일)** |

### 2.3 참조 파일 (변경 없음)

| 파일 | 참조 용도 |
|------|----------|
| `app/components/charts/StatusDonut.tsx` | import — Props: `{ inbox, open, next, notNow, deadEnd }` |
| `app/components/charts/WeeklyBar.tsx` | import — Props: `{ data: { week: string; count: number }[] }` |
| `app/components/charts/ExperimentGantt.tsx` | import — Props: `{ experiments: Experiment[]; now: number }` |
| `app/routes/metrics.tsx` | 집계 로직 참조 (상태 매핑 :30-34, 주간 집계 :87-103) |
| `app/styles/dx-custom-tokens.css` | 차트 CSS 토큰 참조 (라이트 :82-88, 다크 :253-259) |
| `app/db/schema.ts` | DiscoveryStatus 11단계 (:8-24), experiments 테이블 (:260-279) |

---

## 3. Data Aggregation

### 3.1 StatusDonut용: 11단계 → 5그룹 상태 매핑

`allDiscoveries` 배열을 순회하며 `status` 필드를 5개 그룹으로 분류한다.

#### 매핑 테이블

| 5그룹 | StatusDonut prop | 포함 DiscoveryStatus | 스키마 원문 카테고리 |
|-------|-----------------|---------------------|-------------------|
| Inbox | `inbox` | `DISCOVERY` | Ideation |
| 진행 중 | `open` | `IDEA_CARD`, `HYPOTHESIS`, `EXPERIMENT`, `EVIDENCE_REVIEW` | Ideation + Validation |
| 전진 | `next` | `GATE1`, `SPRINT`, `GATE2`, `HANDOFF` | Execution |
| 보류 | `notNow` | `HOLD` | Terminal |
| 중단 | `deadEnd` | `DROP` | Terminal |

#### 의사 코드

```typescript
// loader 내부 (기존 statusCounts 로직 아래)
const STATUS_GROUP_MAP: Record<string, keyof typeof donutData> = {
  DISCOVERY: "inbox",
  IDEA_CARD: "open",
  HYPOTHESIS: "open",
  EXPERIMENT: "open",
  EVIDENCE_REVIEW: "open",
  GATE1: "next",
  SPRINT: "next",
  GATE2: "next",
  HANDOFF: "next",
  HOLD: "notNow",
  DROP: "deadEnd",
};

const donutData = { inbox: 0, open: 0, next: 0, notNow: 0, deadEnd: 0 };
for (const d of allDiscoveries) {
  const group = STATUS_GROUP_MAP[d.status];
  if (group) donutData[group]++;
}
```

**차이점 vs `/metrics`**: `metrics.tsx:30-34`는 단순 1:1 매핑 (`DISCOVERY→inbox`, `IDEA_CARD→open`, `GATE1→next`)으로 HYPOTHESIS/EXPERIMENT/EVIDENCE_REVIEW/SPRINT/GATE2/HANDOFF를 누락한다. 이 설계에서는 11단계 전체를 정확히 5그룹으로 분류한다.

### 3.2 WeeklyBar용: 최근 8주 주간 생성 건수

`allDiscoveries` 배열의 `createdAt` 필드를 기준으로 최근 8주를 버킷팅한다.

#### 의사 코드

```typescript
// loader 내부
const weeklyData: { week: string; count: number }[] = [];
const serverNow = Date.now();

for (let i = 7; i >= 0; i--) {
  const weekStart = new Date(serverNow);
  weekStart.setDate(weekStart.getDate() - (i + 1) * 7);
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(serverNow);
  weekEnd.setDate(weekEnd.getDate() - i * 7);
  weekEnd.setHours(0, 0, 0, 0);

  const count = allDiscoveries.filter((d) => {
    if (!d.createdAt) return false;
    const created = d.createdAt instanceof Date ? d.createdAt : new Date(d.createdAt);
    return created >= weekStart && created < weekEnd;
  }).length;

  // SSR-safe: MM/DD 라벨을 서버에서 계산 (toLocaleDateString 사용 금지)
  const label = `${(weekStart.getMonth() + 1).toString().padStart(2, "0")}/${weekStart.getDate().toString().padStart(2, "0")}`;
  weeklyData.push({ week: label, count });
}
```

**Hydration 안전**: `metrics.tsx:101` 패턴 준수 — 주간 라벨을 `MM/DD` 문자열로 서버에서 계산하여 전달. `new Date().toLocaleDateString()` 사용 금지.

### 3.3 ExperimentGantt용: 활성 실험 필터링

`allExperiments` 배열에서 활성(미완료) 실험을 추출하고, `serverNow`를 함께 전달한다.

#### 의사 코드

```typescript
// loader 내부
const ganttExperiments = allExperiments
  .filter((e) => !e.completedAt) // 활성 실험만
  .slice(0, 10)                  // SVG 성능: 최대 10개
  .map((e) => ({
    id: e.id,
    hypothesis: e.hypothesis,
    createdAt: e.createdAt,
    deadline: e.deadline,
    completedAt: e.completedAt,
  }));

const serverNow = Date.now();
```

**SSR-safe**: `ExperimentGantt`의 `now` prop에 `Date.now()` 직접 전달이 아닌, loader에서 서버 타임스탬프로 계산. `discoveries.$id.tsx:572` 패턴 참조.

### 3.4 loader return 확장

```typescript
return json({
  metrics: {
    // === 기존 필드 (변경 없음) ===
    total,
    statusCounts,
    agentCreated,
    humanCreated,
    totalExperiments,
    completedExperiments,
    totalEvidence,
    strongEvidence,
    agentTokensToday,
    agentTokenBudget,
    trends,

    // === 차트 데이터 (추가) ===
    donutData,        // { inbox, open, next, notNow, deadEnd }
    weeklyData,       // [{ week: "MM/DD", count: number }] × 8
    ganttExperiments, // Experiment[] (활성, 최대 10개)
    serverNow,        // number (Date.now() 서버 사이드)
  },
});
```

### 3.5 성능 분석

| 집계 | 시간 복잡도 | 메모리 | 비고 |
|------|-----------|--------|------|
| donutData | O(n) | O(1) | n = Discovery 수. 목표 5-10건이므로 무시 가능 |
| weeklyData | O(8n) = O(n) | O(8) | 8주 × n 필터. n ≤ 50 수준 (실험 기간 내) |
| ganttExperiments | O(m) | O(10) | m = Experiment 수. `.slice(0, 10)` 제한 |
| 전체 추가 부하 | O(n + m) | O(19) | 추가 DB 쿼리 0건. 무시 가능 |

---

## 4. API/Loader Design

### 4.1 결정: 기존 loader 확장 (별도 API 분리 없음)

**이유**:
1. `dashboard.metrics.tsx` loader가 이미 `allDiscoveries`, `allExperiments` 전체 배열을 조회 중 (`:24-32`)
2. 차트 데이터는 이 배열의 JS 집계 결과이므로 추가 DB 쿼리 불필요
3. Remix loader의 SSR 렌더링에 포함되어 별도 fetch 불필요
4. 단일 파일 수정으로 완결

### 4.2 기존 loader 코드 구조 (현재)

```
dashboard.metrics.tsx loader (line 18-106)
  ├─ Session 인증 (line 19-22)
  ├─ DB 쿼리 3개 (line 24-32)
  │   ├─ allDiscoveries (tenant-scoped)
  │   ├─ allExperiments (discoveryId IN)
  │   └─ allEvidence (discoveryId IN)
  ├─ 기존 집계 (line 34-78)
  │   ├─ statusCounts (Record<string, number>)
  │   ├─ agentCreated / completedExperiments / strongEvidence
  │   └─ trends (thisWeek vs prevWeek)
  ├─ Agent 토큰 조회 (line 80-84)
  └─ return json({ metrics: {...} }) (line 86-106)
```

### 4.3 확장 포인트

차트 집계 코드는 기존 집계 블록(line 34-78)과 Agent 토큰 조회(line 80-84) 사이에 삽입한다.

```
dashboard.metrics.tsx loader (확장 후)
  ├─ Session 인증
  ├─ DB 쿼리 3개 (변경 없음)
  ├─ 기존 집계 (변경 없음)
  ├─ ★ 차트 데이터 집계 (신규 삽입)
  │   ├─ donutData: 11단계 → 5그룹 매핑
  │   ├─ weeklyData: 8주 버킷팅
  │   ├─ ganttExperiments: 활성 실험 필터
  │   └─ serverNow: Date.now()
  ├─ Agent 토큰 조회 (변경 없음)
  └─ return json({ metrics: { ...기존, ...차트 } })
```

### 4.4 Tenant Scoping

| 데이터 | Tenant 처리 | 근거 |
|--------|------------|------|
| donutData | ✅ tenant-scoped | `allDiscoveries`가 이미 `tenantWhere()` 적용 |
| weeklyData | ✅ tenant-scoped | 동일 `allDiscoveries` 사용 |
| ganttExperiments | ✅ tenant-scoped | `allExperiments`가 `discoveryIds` (tenant-scoped) IN 조건 |

`/metrics` 라우트(전역 쿼리)와 달리, `/dashboard/metrics`는 자동으로 tenant-scoped된다.

---

## 5. UI Components

### 5.1 차트 배치 레이아웃

```
┌──────────────────────────────────────────────────────────┐
│ <h2>지표</h2>                                             │
│                                                           │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │
│ │MetricCard│ │MetricCard│ │MetricCard│ │MetricCard│        │  ← 기존
│ │ 전체    │ │ Agent   │ │ 실험    │ │ 강한근거│         │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘         │
│                                                           │
│ ┌──────────────────────┐ ┌────────────────────────────┐  │
│ │ 상태별 분포 Card      │ │ 주간 생성 추이 Card         │  │  ← 확장+신규
│ │ ┌─────────────────┐  │ │ ┌────────────────────────┐ │  │
│ │ │ StatusDonut     │  │ │ │ WeeklyBar              │ │  │
│ │ └─────────────────┘  │ │ └────────────────────────┘ │  │
│ │ StatusBadge × N      │ │                            │  │
│ └──────────────────────┘ └────────────────────────────┘  │
│                                                           │
│ ┌────────────────────────────────────────────────────┐   │
│ │ 실험 타임라인 Card (조건부: 활성 실험 > 0)           │   │  ← 신규
│ │ ┌──────────────────────────────────────────────┐   │   │
│ │ │ ExperimentGantt                               │   │   │
│ │ └──────────────────────────────────────────────┘   │   │
│ └────────────────────────────────────────────────────┘   │
│                                                           │
│ ┌────────────────────────────────────────────────────┐   │
│ │ Agent 토큰 사용량 Card                              │   │  ← 기존
│ └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 5.2 반응형 레이아웃

| 영역 | Grid 클래스 | sm (≥640px) | Default (<640px) |
|------|------------|-------------|-------------------|
| 도넛+바 | `grid grid-cols-1 sm:grid-cols-2 gap-6` | 2열 (좌: 도넛, 우: 바) | 1열 (세로 쌓기) |
| 간트 | `col-span-full` (그리드 밖) | full-width | full-width |

### 5.3 "상태별 분포" Card 확장 상세

기존 Card (`:159-175`)를 확장하여 StatusDonut을 추가한다.

**변경 전** (현재):
```jsx
<Card className="mt-6">
  <CardHeader>
    <CardTitle>상태별 분포</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="flex flex-wrap gap-3">
      {Object.entries(statusCounts).map(...StatusBadge...)}
    </div>
  </CardContent>
</Card>
```

**변경 후** (설계):
```jsx
{/* 차트 섹션 — 상태별 분포 + 주간 추이 */}
<div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
  {/* 상태별 분포 (도넛) */}
  <Card>
    <CardHeader>
      <CardTitle className="text-base">상태별 분포</CardTitle>
    </CardHeader>
    <CardContent>
      <StatusDonut
        inbox={metrics.donutData.inbox}
        open={metrics.donutData.open}
        next={metrics.donutData.next}
        notNow={metrics.donutData.notNow}
        deadEnd={metrics.donutData.deadEnd}
      />
      {/* 기존 StatusBadge 상세 목록 유지 */}
      <div className="mt-4 flex flex-wrap gap-3">
        {Object.entries(metrics.statusCounts).map(([status, count]) => (
          <div key={status} className="flex items-center gap-2">
            <StatusBadge status={status} />
            <span className="text-sm font-medium text-[var(--axis-text-primary)]">
              {count as number}
            </span>
          </div>
        ))}
      </div>
    </CardContent>
  </Card>

  {/* 주간 생성 추이 (바) */}
  <Card>
    <CardHeader>
      <CardTitle className="text-base">주간 생성 추이</CardTitle>
    </CardHeader>
    <CardContent>
      <WeeklyBar data={metrics.weeklyData} />
    </CardContent>
  </Card>
</div>
```

### 5.4 "실험 타임라인" Card 조건부 렌더링

ExperimentGantt는 `experiments.length === 0`일 때 내부적으로 `null`을 반환하므로, 데이터가 있을 때만 Card를 렌더링한다.

```jsx
{/* 실험 타임라인 (조건부) */}
{metrics.ganttExperiments.length > 0 && (
  <Card className="mt-6">
    <CardHeader>
      <CardTitle className="text-base">실험 타임라인</CardTitle>
    </CardHeader>
    <CardContent>
      <ExperimentGantt
        experiments={metrics.ganttExperiments}
        now={metrics.serverNow}
      />
    </CardContent>
  </Card>
)}
```

### 5.5 빈 상태 처리

| 차트 | 데이터 0건 시 동작 | 처리 위치 |
|------|------------------|----------|
| StatusDonut | 회색 원 + "0건" + "데이터 없음" 텍스트 표시 | `StatusDonut.tsx:24-42` (컴포넌트 내장) |
| WeeklyBar | "데이터 없음" 텍스트 표시 | `WeeklyBar.tsx:6-8` (컴포넌트 내장) |
| ExperimentGantt | Card 자체를 렌더링하지 않음 | `dashboard.metrics.tsx` 조건부 렌더링 (§5.4) |

추가적인 빈 상태 UI 구현 불필요 — 3개 차트 모두 빈 상태 처리가 이미 내장되어 있다.

### 5.6 다크모드 대응

| 토큰 | 라이트 | 다크 | 사용 컴포넌트 |
|------|--------|------|-------------|
| `--axis-chart-inbox` | `#93C5FD` | `#3B82F6` | StatusDonut |
| `--axis-chart-open` | `#FCD34D` | `#EAB308` | StatusDonut |
| `--axis-chart-next` | `#6EE7B7` | `#22C55E` | StatusDonut |
| `--axis-chart-not-now` | `#D1D5DB` | `#6B7280` | StatusDonut |
| `--axis-chart-dead-end` | `#FCA5A5` | `#EF4444` | StatusDonut |
| `--axis-chart-bar` | `#60A5FA` | `#3B82F6` | WeeklyBar |
| `--axis-chart-empty` | `#E5E7EB` | `#374151` | StatusDonut (빈 상태) |
| `--axis-text-success` | - | `#22c55e` | ExperimentGantt (COMPLETED) |
| `--axis-text-brand` | - | `#6366f1` | ExperimentGantt (오늘 마커) |

차트 컴포넌트가 CSS 변수를 직접 참조하므로 다크모드 전환 시 자동 적용. 추가 코드 불필요.

### 5.7 import 변경

```typescript
// dashboard.metrics.tsx 상단에 추가
import { StatusDonut } from "~/components/charts/StatusDonut";
import { WeeklyBar } from "~/components/charts/WeeklyBar";
import { ExperimentGantt } from "~/components/charts/ExperimentGantt";
```

---

## 6. Implementation Sequence

### Phase 1: Loader 데이터 확장

| 순서 | 작업 | 파일 위치 | 상세 |
|------|------|----------|------|
| 1-1 | StatusDonut용 5그룹 매핑 | `dashboard.metrics.tsx` loader, line ~38 이후 | §3.1 의사 코드. `STATUS_GROUP_MAP` 상수 + `donutData` 순회 |
| 1-2 | WeeklyBar용 8주 집계 | `dashboard.metrics.tsx` loader, 1-1 이후 | §3.2 의사 코드. `serverNow` 기반 주간 루프, `MM/DD` 라벨 서버 계산 |
| 1-3 | ExperimentGantt용 활성 실험 필터 | `dashboard.metrics.tsx` loader, 1-2 이후 | §3.3 의사 코드. `completedAt === null` 필터 + `.slice(0, 10)` |
| 1-4 | `serverNow` 계산 | `dashboard.metrics.tsx` loader, 1-3과 동시 | `const serverNow = Date.now();` (weeklyData 계산에도 사용) |
| 1-5 | loader return 확장 | `dashboard.metrics.tsx` json return | §3.4. 기존 metrics 객체에 `donutData`, `weeklyData`, `ganttExperiments`, `serverNow` 추가 |

### Phase 2: UI 차트 렌더링

| 순서 | 작업 | 파일 위치 | 상세 |
|------|------|----------|------|
| 2-1 | import 추가 | `dashboard.metrics.tsx` 상단 | §5.7. StatusDonut, WeeklyBar, ExperimentGantt import |
| 2-2 | 상태별 분포 Card 교체 | `dashboard.metrics.tsx` line 159-175 | §5.3. 기존 단독 Card → grid-cols-2 그리드로 변경. 좌: 도넛+배지, 우: 바 차트 |
| 2-3 | 실험 타임라인 Card 추가 | `dashboard.metrics.tsx` 2-2 아래 | §5.4. 조건부 렌더링 (`ganttExperiments.length > 0`) |
| 2-4 | useLoaderData 타입 확인 | `dashboard.metrics.tsx` 컴포넌트 | `typeof loader` 추론으로 신규 필드 자동 타입 확인 |

### Phase 3: 검증

| 순서 | 작업 | 상세 |
|------|------|------|
| 3-1 | 빌드 검증 | `pnpm build` 성공 |
| 3-2 | 타입 체크 | `pnpm typecheck` 에러 없음 |
| 3-3 | 린트 | `pnpm lint` 에러 없음 |
| 3-4 | 다크모드 확인 | 개발 서버에서 라이트/다크 전환 시 차트 색상 정상 렌더링 |
| 3-5 | 빈 상태 확인 | Discovery 0건: 도넛 "0건", 바 "데이터 없음", 간트 미표시 |
| 3-6 | Hydration 확인 | 개발 서버 콘솔에 hydration mismatch 경고 없음 |

### Phase 의존성 그래프

```
Phase 1 (Loader)
  1-1 donutData ─┐
  1-2 weeklyData ─┼─→ 1-5 return 확장 ─→ Phase 2 (UI)
  1-3 ganttData ──┤                       2-1 import ─┐
  1-4 serverNow ──┘                       2-2 도넛+바 ─┼─→ Phase 3 (검증)
                                          2-3 간트    ─┤
                                          2-4 타입    ─┘
```

---

## 7. Risk & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| SSR/CSR hydration mismatch (날짜 라벨) | Medium | Medium | 주간 라벨을 `MM/DD` 문자열로 loader에서 서버 사이드 계산. `toLocaleDateString()` 사용 금지. `metrics.tsx:101` 검증 패턴 참조 |
| ExperimentGantt `now` hydration | Medium | Medium | `Date.now()` 클라이언트 호출 금지. loader에서 `serverNow` 숫자로 전달. `discoveries.$id.tsx:572` 패턴 참조 |
| 11단계 → 5그룹 매핑 누락 | Low | Low | `STATUS_GROUP_MAP`에 11단계 전체 명시. 미매핑 상태는 count에 포함되지 않음 (향후 상태 추가 시 수동 추가 필요) |
| Loader 응답 지연 | Low | Low | 추가 DB 쿼리 0건. JS 순회 O(n). 운영 실험 기간 내 Discovery ≤50건 예상 |
| ExperimentGantt SVG 성능 | Low | Low | `.slice(0, 10)` 제한. 10개 이하 SVG 요소는 무시 가능 |
| 기존 UI 레이아웃 깨짐 | Low | Low | MetricCard 그리드 변경 없음. "상태별 분포" Card를 grid로 교체하되 내부 콘텐츠 유지 |

---

## 8. Success Criteria

### 8.1 Functional

- [ ] `/dashboard/metrics`에 StatusDonut 차트로 11단계 → 5그룹 상태 분포 표시
- [ ] `/dashboard/metrics`에 WeeklyBar 차트로 최근 8주 생성 추이 표시
- [ ] `/dashboard/metrics`에 ExperimentGantt로 활성 실험 타임라인 표시 (데이터 있을 때만)
- [ ] Discovery 0건일 때 도넛 "0건", 바 "데이터 없음", 간트 미표시
- [ ] 다크모드에서 차트 색상 정상 렌더링

### 8.2 Quality

- [ ] `pnpm build` 성공
- [ ] `pnpm typecheck` 에러 없음
- [ ] `pnpm lint` 에러 없음
- [ ] SSR/CSR hydration mismatch 없음 (콘솔 경고 0)

### 8.3 Performance

- [ ] 추가 DB 쿼리 0건 (기존 loader 데이터 JS 집계만)
- [ ] Loader 응답 시간 증가 ≤ 5ms

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-02-10 | Initial design — 데이터 집계 설계, UI 배치, 구현 순서 정의 | Claude |
