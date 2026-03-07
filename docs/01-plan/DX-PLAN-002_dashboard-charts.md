# F21: 대시보드 차트 실제 데이터 연결

> **Summary**: `/dashboard/metrics` 탭에 StatusDonut/WeeklyBar 차트를 실제 DB 데이터와 연결하고, ExperimentGantt를 대시보드에서도 활용할 수 있도록 구현
>
> **Project**: Discovery-X
> **Version**: v5.1
> **Author**: Claude
> **Date**: 2026-02-10
> **Status**: Draft
> **예상 수정 파일**: ~5개

---

## 1. Overview

### 1.1 Purpose

`/dashboard/metrics` 탭은 대시보드의 핵심 서브탭으로 Discovery 운영 지표를 보여주지만, 현재는 MetricCard(숫자)와 StatusBadge(텍스트)만 존재하여 시각적 인사이트가 부족하다. 이미 완성된 3개 차트 컴포넌트(StatusDonut, WeeklyBar, ExperimentGantt)를 이 탭에 연결하여 데이터 파악을 직관적으로 만든다.

### 1.2 Background

- **차트 컴포넌트 현황** (모두 SVG 기반, 완성):
  - `StatusDonut` (`app/components/charts/StatusDonut.tsx`): 5개 상태 그룹별 도넛 차트. props: `{ inbox, open, next, notNow, deadEnd }`. 호버 인터랙션, 범례, 빈 상태 처리 포함.
  - `WeeklyBar` (`app/components/charts/WeeklyBar.tsx`): 주간 생성 추이 바 차트. props: `{ data: { week: string; count: number }[] }`. 빈 상태 처리 포함.
  - `ExperimentGantt` (`app/components/charts/ExperimentGantt.tsx`): 실험 간트 차트. props: `{ experiments: Experiment[]; now: number }`. ACTIVE/COMPLETED 색상 구분, 오늘 마커 표시.

- **사용 현황**:
  - StatusDonut + WeeklyBar → `/metrics` 독립 라우트에서 사용 중 (`app/routes/metrics.tsx:351-363`). **전역 쿼리** (tenant 구분 없음)
  - ExperimentGantt → `/discoveries/:id` 상세 페이지에서 사용 중 (`app/routes/discoveries.$id.tsx:572`)
  - **`/dashboard/metrics` 탭에는 차트가 없음** — MetricCard 4개 + StatusBadge 목록 + Agent 토큰 바만 존재

- **기존 데이터 인프라**: `dashboard.metrics.tsx` loader가 이미 `allDiscoveries`, `allExperiments`, `allEvidence`를 전부 조회 중 (tenant-scoped). 차트용 데이터를 추가 DB 쿼리 없이 JS 집계로 생성 가능.

### 1.3 Related Documents

- SPEC: `SPEC.md`
- 기획서: `docs/Discovery-X_v1.4.md`
- 기존 차트 코드: `app/components/charts/StatusDonut.tsx`, `WeeklyBar.tsx`, `ExperimentGantt.tsx`
- 대시보드 Metrics: `app/routes/dashboard.metrics.tsx`
- 독립 Metrics: `app/routes/metrics.tsx` (참고: 이미 차트 + DB 연결 완료)

---

## 2. Scope

### 2.1 In Scope

- `/dashboard/metrics` 라우트에 StatusDonut 차트 추가 (상태별 Discovery 분포)
- `/dashboard/metrics` 라우트에 WeeklyBar 차트 추가 (주간 생성 추이)
- `/dashboard/metrics` loader에 차트용 집계 로직 추가 (추가 DB 쿼리 불필요, JS 집계)
- ExperimentGantt를 대시보드 Metrics에 조건부 표시 (활성 실험 존재 시)
- 차트 색상 토큰 라이트/다크모드 정상 동작 확인

### 2.2 Out of Scope

- 새로운 차트 유형 추가 (파이, 라인 등)
- 외부 차트 라이브러리 도입 (Chart.js, Recharts 등)
- `/metrics` 독립 라우트 변경 (이미 차트 연결 완료)
- 모바일 전용 차트 레이아웃 최적화
- 실시간 차트 업데이트 (WebSocket 등)
- 차트 컴포넌트 자체의 수정 (현재 완성 상태 유지)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | 요구사항 | 우선순위 | 현재 상태 | 작업 유형 |
|----|---------|---------|----------|----------|
| FR-01 | `/dashboard/metrics`에 StatusDonut 표시 — Discovery 11단계 상태를 5그룹으로 매핑하여 도넛 차트로 시각화 | High | `statusCounts` 객체는 loader에 존재하나 StatusBadge(텍스트)로만 표시 | **수정** |
| FR-02 | `/dashboard/metrics`에 WeeklyBar 표시 — 최근 8주간 Discovery 생성 추이를 바 차트로 시각화 | High | 주간 데이터 집계 로직 없음. `allDiscoveries`는 이미 조회됨 | **확장** |
| FR-03 | `/dashboard/metrics`에 ExperimentGantt 표시 — 활성 실험 타임라인을 간트 차트로 시각화 | Medium | ExperimentGantt 컴포넌트 존재, `allExperiments`도 이미 조회됨, 대시보드 미연결 | **확장** |
| FR-04 | 차트 데이터를 기존 loader에 통합 — 별도 API 분리 없이 기존 `allDiscoveries`/`allExperiments` 데이터에서 JS 집계 | High | loader에 이미 전체 데이터 조회 중 (`dashboard.metrics.tsx:24-32`) | **수정** |
| FR-05 | 다크모드 차트 색상 정상 동작 — `--axis-chart-*` CSS 토큰 활용 | Low | 토큰 라이트/다크 모두 `dx-custom-tokens.css`에 정의 완료 | **확인** |

### 3.2 11단계 → 5그룹 상태 매핑 정의

StatusDonut은 5개 그룹을 받으므로 DiscoveryStatus 11단계를 매핑해야 한다:

| 5그룹 | StatusDonut prop | 포함 상태 | 의미 |
|-------|-----------------|----------|------|
| Inbox | `inbox` | `DISCOVERY` | 초기 씨앗 단계 |
| 진행 중 | `open` | `IDEA_CARD`, `HYPOTHESIS`, `EXPERIMENT`, `EVIDENCE_REVIEW` | 검증 진행 중 |
| 전진 | `next` | `GATE1`, `SPRINT`, `GATE2`, `HANDOFF` | 실행/핸드오프 단계 |
| 보류 | `notNow` | `HOLD` | 일시 중단 |
| 중단 | `deadEnd` | `DROP` | 폐기 |

> **참고**: `/metrics` 독립 라우트(`metrics.tsx:30-34`)는 단순 매핑(DISCOVERY→inbox, IDEA_CARD→open, GATE1→next)을 사용하지만, `/dashboard/metrics`는 11단계 전체를 정확히 5그룹으로 분류해야 한다.

### 3.3 작업 유형 요약

| 유형 | 건수 | 비율 |
|------|------|------|
| **수정** (기존 loader/UI 변경) | 2 | 40% |
| **확장** (기존 코드에 새 로직 추가) | 2 | 40% |
| **확인** (동작 검증) | 1 | 20% |

---

## 4. Architecture

### 4.1 수정 대상 파일

| 파일 | 변경 내용 | 영향도 |
|------|----------|--------|
| `app/routes/dashboard.metrics.tsx` | loader에 donutData + weeklyData + ganttData 집계 추가, UI에 StatusDonut/WeeklyBar/ExperimentGantt 렌더링 | **핵심** |

### 4.2 새 파일

없음 — 기존 차트 컴포넌트 import하여 사용.

### 4.3 데이터 모델 변경

없음 — 기존 테이블(discoveries, experiments)에서 집계만 수행.

### 4.4 데이터 흐름

```
dashboard.metrics.tsx loader (기존)
  ├─ allDiscoveries ← db.select().from(discoveries).where(tenantWhere(...))
  ├─ allExperiments ← db.select().from(experiments).where(inArray(...))
  └─ allEvidence    ← db.select().from(evidence).where(inArray(...))
       │
       ▼ (JS 집계 — 추가 DB 쿼리 없음)
  ├─ donutData:  { inbox, open, next, notNow, deadEnd }  ← allDiscoveries 상태 매핑
  ├─ weeklyData: { week: string; count: number }[]        ← allDiscoveries.createdAt 8주 집계
  ├─ ganttData:  Experiment[]                              ← allExperiments (활성 10개)
  └─ serverNow:  number                                   ← Date.now() (SSR-safe)
       │
       ▼ (UI 렌더링)
  StatusDonut(donutData) + WeeklyBar(weeklyData) + ExperimentGantt(ganttData, serverNow)
```

### 4.5 기존 코드와의 관계

**참고 패턴**: `/metrics` 라우트 (`app/routes/metrics.tsx`)에서 동일한 집계를 수행 중:
- 상태별 count: `metrics.tsx:30-34`
- 주간 집계: `metrics.tsx:87-103` (8주 루프 + `MM/DD` 라벨)
- StatusDonut 렌더링: `metrics.tsx:351-357`
- WeeklyBar 렌더링: `metrics.tsx:363`

**핵심 차이점**:
- `/metrics`는 전역 쿼리 (`db.select().from(discoveries)`)
- `/dashboard/metrics`는 tenant-scoped (`tenantWhere(discoveries, ctx.tenantId)`)
- 집계 로직은 동일하지만 데이터 소스가 다름

**ExperimentGantt 참고 패턴**: `discoveries.$id.tsx:572`에서 `serverNow` prop으로 SSR-safe 현재 시각 전달.

### 4.6 SSR/CSR Hydration 주의사항

- **WeeklyBar 주간 라벨**: `new Date()`로 주 시작일 계산 시 서버/클라이언트 시간차 발생 가능
  - **해결**: loader에서 주간 라벨을 `MM/DD` 문자열로 미리 계산하여 전달 (`metrics.tsx:101` 패턴)
- **ExperimentGantt `now` prop**: `Date.now()` 클라이언트 직접 호출 금지
  - **해결**: loader에서 서버 timestamp를 `serverNow`로 전달 (`discoveries.$id.tsx` 패턴)
- **CLAUDE.md Gotcha**: "날짜 포맷은 `toLocaleDateString()` 대신 수동 포맷 사용 (SSR/CSR hydration mismatch 방지)"

---

## 5. Implementation Plan

### Phase 1: Loader 데이터 확장 (FR-01, FR-02, FR-03, FR-04)

| 단계 | 작업 | 파일 | 상세 |
|------|------|------|------|
| 1-1 | StatusDonut용 5그룹 count 매핑 | `dashboard.metrics.tsx` | 기존 `allDiscoveries`에서 11단계 → 5그룹 집계. §3.2 매핑표 적용. 기존 `statusCounts` 로직 아래에 추가 |
| 1-2 | WeeklyBar용 주간 8주 집계 | `dashboard.metrics.tsx` | 기존 `allDiscoveries`의 `createdAt` 기준 최근 8주간 주별 count. `metrics.tsx:87-103` 패턴 차용. `MM/DD` 라벨 서버에서 계산 |
| 1-3 | ExperimentGantt용 활성 실험 + serverNow | `dashboard.metrics.tsx` | 기존 `allExperiments`에서 `completedAt === null` 필터 → 최대 10개. `Date.now()`로 `serverNow` 전달 |
| 1-4 | loader return 객체에 차트 데이터 추가 | `dashboard.metrics.tsx` | `donutData`, `weeklyData`, `ganttExperiments`, `serverNow` 추가 |

### Phase 2: UI 차트 렌더링 (FR-01, FR-02, FR-03)

| 단계 | 작업 | 파일 | 상세 |
|------|------|------|------|
| 2-1 | import 추가 | `dashboard.metrics.tsx` | `StatusDonut`, `WeeklyBar`, `ExperimentGantt` import |
| 2-2 | 상태별 분포 Card 확장 | `dashboard.metrics.tsx` | 기존 "상태별 분포" Card (line 159-175) 내부에 StatusBadge 목록 유지하면서 StatusDonut 추가 |
| 2-3 | 주간 생성 추이 Card 추가 | `dashboard.metrics.tsx` | "상태별 분포" Card 아래에 "주간 생성 추이" Card 신규 추가 |
| 2-4 | 실험 타임라인 Card 조건부 렌더링 | `dashboard.metrics.tsx` | `ganttExperiments.length > 0` 시 "실험 타임라인" Card 표시 |
| 2-5 | 레이아웃 배치 | `dashboard.metrics.tsx` | 도넛+바 → `grid-cols-1 sm:grid-cols-2`, 간트 → full-width |

### Phase 3: 검증 (FR-05)

| 단계 | 작업 | 상세 |
|------|------|------|
| 3-1 | 다크모드 차트 색상 확인 | `--axis-chart-*` 토큰이 다크모드에서 정상 렌더링되는지 확인 |
| 3-2 | 데이터 없음 상태 확인 | Discovery 0건/실험 0건일 때 StatusDonut "데이터 없음", WeeklyBar "데이터 없음", ExperimentGantt 숨김 동작 |
| 3-3 | 빌드/타입체크/린트 | `pnpm build && pnpm typecheck && pnpm lint` 성공 확인 |
| 3-4 | Hydration mismatch 확인 | 개발 서버에서 콘솔 hydration 경고 없음 확인 |

---

## 6. Risk & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Loader 응답 지연 (데이터 집계 추가) | Medium | Low | 추가 DB 쿼리 없음. 기존 `allDiscoveries`/`allExperiments` JS 집계만 추가. O(n) 순회 |
| 11단계 → 5그룹 매핑 누락/오류 | Low | Low | `/metrics` 라우트의 기존 매핑 참조. §3.2 매핑표 명시. 미매핑 상태는 0으로 처리 |
| SSR/CSR hydration mismatch (날짜) | Medium | Medium | 주간 라벨 `MM/DD` + serverNow를 loader에서 서버 사이드 계산하여 전달. `new Date()` 클라이언트 호출 금지 |
| ExperimentGantt 대량 실험 시 SVG 성능 | Low | Low | 활성 실험 최대 10개로 제한 (`.slice(0, 10)`) |
| 다크모드에서 차트 색상 가독성 저하 | Low | Low | 이미 `dx-custom-tokens.css`에 라이트/다크 `--axis-chart-*` 토큰 정의 완료. StatusDonut/WeeklyBar 모두 토큰 사용 중 |
| dashboard.metrics.tsx 기존 UI 레이아웃 깨짐 | Low | Low | 차트 Card를 기존 Card 아래에 추가 방식. 기존 MetricCard 그리드/Token Card 구조 변경 없음 |

---

## 7. 변경 대상 파일 요약

### 수정 파일 (1개)

| 파일 | 변경 내용 |
|------|----------|
| `app/routes/dashboard.metrics.tsx` | loader: 5그룹 donutData + 8주 weeklyData + ganttExperiments + serverNow 추가. UI: StatusDonut, WeeklyBar, ExperimentGantt import 및 Card 렌더링 |

### 신규 파일 (0개)

없음

### 참조 파일 (변경 없음)

| 파일 | 참조 용도 |
|------|----------|
| `app/components/charts/StatusDonut.tsx` | import하여 사용. Props: `{ inbox, open, next, notNow, deadEnd }` |
| `app/components/charts/WeeklyBar.tsx` | import하여 사용. Props: `{ data: { week, count }[] }` |
| `app/components/charts/ExperimentGantt.tsx` | import하여 사용. Props: `{ experiments, now }` |
| `app/routes/metrics.tsx` | 집계 로직 참고 (상태 매핑 line 30-34, 주간 집계 line 87-103) |
| `app/styles/dx-custom-tokens.css` | 차트 디자인 토큰 참조 |
| `app/db/schema.ts` | DiscoveryStatus 11단계 (line 8-24), experiments 테이블 구조 (line 260-275) |

---

## 8. Success Criteria

### 8.1 Definition of Done

- [ ] `/dashboard/metrics`에서 StatusDonut 차트로 상태별 Discovery 분포 표시 (11단계 → 5그룹)
- [ ] `/dashboard/metrics`에서 WeeklyBar 차트로 최근 8주 생성 추이 표시
- [ ] `/dashboard/metrics`에서 ExperimentGantt 차트로 활성 실험 타임라인 표시 (데이터 있을 때만)
- [ ] Discovery 0건일 때 빈 상태 정상 표시 (도넛 "0건", 바 "데이터 없음")
- [ ] 다크모드에서 차트 색상 정상 렌더링

### 8.2 Quality Criteria

- [ ] `pnpm build` 성공
- [ ] `pnpm typecheck` 에러 없음
- [ ] `pnpm lint` 에러 없음
- [ ] SSR/CSR hydration mismatch 없음 (콘솔 경고 0)

---

## 9. Next Steps

1. [ ] 이 Plan 문서 리뷰 및 승인
2. [ ] Phase 1 구현: loader 데이터 확장 (JS 집계 추가)
3. [ ] Phase 2 구현: UI 차트 렌더링 (import + Card 배치)
4. [ ] Phase 3 검증: 다크모드/빈 상태/빌드/hydration

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-02-10 | Initial draft — 기존 차트 컴포넌트 대시보드 연결 계획 | Claude |
| 0.2 | 2026-02-10 | 코드 분석 보강 — 11단계→5그룹 매핑 상세 정의, 기존 loader 데이터 재사용 전략 확정, metrics.tsx 참조 라인 추가, SSR hydration 주의사항 구체화 | Claude |
