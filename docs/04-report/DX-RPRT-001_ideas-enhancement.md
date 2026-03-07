---
code: DX-RPRT-001
title: 아이디어 기능 개선 완료 보고
version: 1.0
status: Active
category: RPRT
created: 2026-03-07
updated: 2026-03-07
author: Sinclair Seo
---

# F20 아이디어 고도화 PDCA 완료 보고서

> **Feature**: f20-ideas-enhancement (아이디어 메모 + 필터/검색 + 유사 소스)
> **Project**: Discovery-X v5.1
> **Report Date**: 2026-02-10
> **Duration**: 2026-02-10 (1 day)
> **Status**: COMPLETED ✅
> **Overall Match Rate**: 93% (vs Design)

---

## 1. Executive Summary

### 1.1 프로젝트 개요

아이디어 페이지(`/ideas`)의 실용성을 높이기 위해 3가지 핵심 기능을 구현했습니다:

1. **메모 영속 저장**: 클라이언트 상태로만 관리되어 유실되던 메모를 DB에 영속 저장 (debounce 자동 저장)
2. **필터/검색 통합 UI**: 스코어 범위 필터, 상태별 그룹핑, 텍스트 검색을 URL 파라미터 기반 서버 사이드 필터링으로 구현
3. **유사 소스 추천**: 아이디어 상세 페이지에서 Vectorize 기반 유사 소스 3건 표시 (fallback 포함)

기존 `radarItems` 테이블에 `memo` 컬럼 1개만 추가하는 최소 스키마 변경으로 전체 기능을 구현했습니다.

### 1.2 완료 상황

```
┌──────────────────────────────────────────────┐
│  Completion Rate: 100% (7/7 FR)              │
├──────────────────────────────────────────────┤
│  ✅ Complete:     7 / 7 items                 │
│  ⏸️ Out of Scope: 0 / 7 items                │
│  ❌ Cancelled:    0 / 7 items                 │
└──────────────────────────────────────────────┘
```

### 1.3 핵심 성과

| 항목 | 결과 |
|------|------|
| **FR 준수율** | 100% (7/7) |
| **Match Rate** | 93% (26/28 항목 일치) |
| **Critical/Major Gaps** | 0건 |
| **Minor Gaps** | 2건 (둘 다 구현 시 개선) |
| **스키마 변경** | ADD COLUMN 1개 (minimal) |
| **개발 기간** | 1일 |
| **기존 기능 재사용** | api.similar-sources.ts 패턴 재사용 |

---

## 2. Related Documents

| Phase | Document | Status |
|-------|----------|--------|
| Plan | [f20-ideas-enhancement.plan.md](../01-plan/features/f20-ideas-enhancement.plan.md) | ✅ Finalized |
| Design | [f20-ideas-enhancement.design.md](../02-design/features/f20-ideas-enhancement.design.md) | ✅ Implemented |
| Check | [f20-ideas-enhancement.analysis.md](./f20-ideas-enhancement.analysis.md) | ✅ Complete |
| Report | Current document | ✅ Complete |

---

## 3. PDCA Cycle Summary

### 3.1 Plan Phase (계획)

**문서**: `docs/01-plan/features/f20-ideas-enhancement.plan.md`
**기간**: 2026-02-10

#### 핵심 기획

- **목표**: 아이디어 페이지의 메모 영속 저장, 스코어 필터링, 상태 그룹핑, 텍스트 검색, 유사 소스 추천 기능 추가
- **범위**: FR-01 ~ FR-07 (7개 기능 요구사항)
- **데이터 모델 결정**: Option A (radarItems에 memo 컬럼 추가) 선택 — Single Owner 원칙에 부합, 별도 테이블은 오버엔지니어링

#### 작업 유형 분포

| 유형 | 건수 | 비율 |
|------|------|------|
| 수정 (modify) | 1 | 14% |
| 확장 (extend) | 2 | 29% |
| 신규 (new) | 4 | 57% |

#### 3단계 구현 계획

| Phase | 내용 | 파일 수 |
|-------|------|--------|
| Phase 1 | 메모 저장 (DB + API + UI) | 6개 작업 |
| Phase 2 | 필터링 & 검색 | 4개 작업 |
| Phase 3 | 유사 소스 추천 | 3개 작업 |

---

### 3.2 Design Phase (설계)

**문서**: `docs/02-design/features/f20-ideas-enhancement.design.md`
**기간**: 2026-02-10

#### 설계 원칙

- **ADD COLUMN 전용**: 기존 radarItems 테이블에 memo 컬럼 1개만 추가 (breaking change 없음)
- **Single Owner 원칙**: 메모는 radarItem당 1개 — 다중 사용자 분리 불필요
- **서버 사이드 필터링**: Remix loader에서 URL searchParams 기반으로 WHERE 조건 동적 구성
- **Vectorize Graceful Fallback**: VECTORIZE_RADAR 미설정 시 스코어 유사도 기반 대체 로직

#### 주요 설계 결정 (3건)

| # | 결정 | 선택 | 근거 |
|---|------|------|------|
| 1 | 메모 저장 방식 | radarItems에 memo 컬럼 추가 | JOIN 불필요, Single Owner, 최소 마이그레이션 |
| 2 | 메모 API 구조 | 전용 `api.ideas.memo.ts` 분리 | 기존 `api.radar.items.$id.status.ts` 패턴과 일관 |
| 3 | 유사 소스 호출 | ideas.$id.tsx loader inline | 네트워크 왕복 1회, 별도 API 불필요 |

#### 파일 구조 (변경분)

| 파일 | 유형 | Phase |
|------|------|-------|
| `app/db/schema.ts` | 수정 | 1 |
| `drizzle/0022_ideas_memo.sql` | 신규 | 1 |
| `tests/helpers/db.ts` | 수정 | 1 |
| `app/routes/api.ideas.memo.ts` | 신규 | 1 |
| `app/components/ideas/MemoPanel.tsx` | 수정 | 1 |
| `app/routes/ideas.tsx` | 수정 | 1, 2 |
| `app/components/ideas/FilterBar.tsx` | 신규 | 2 |
| `app/lib/embeddings/similar-items.ts` | 신규 | 3 |
| `app/components/ideas/SimilarSources.tsx` | 신규 | 3 |
| `app/routes/ideas.$id.tsx` | 수정 | 3 |

---

### 3.3 Do Phase (구현)

**기간**: 2026-02-10 (1일)

#### Phase 1: 메모 저장 (DB + API + UI) ✅

- **스키마**: `radarItems`에 `memo: text("memo")` nullable 컬럼 추가
- **마이그레이션**: `drizzle/0022_ideas_memo.sql` — `ALTER TABLE radar_items ADD COLUMN memo TEXT;`
- **테스트 헬퍼**: `tests/helpers/db.ts`에 마이그레이션 SQL 경로 추가
- **API**: `api.ideas.memo.ts` — GET (조회) + PUT (저장), 인증/검증/5000자 제한
- **MemoPanel**: `useFetcher` + debounce 1초 자동 저장 + 저장 상태 표시 (idle/saving/saved/error)
- **ideas.tsx**: loader에 memo 필드 포함, 메모 인디케이터 (dot) 표시

#### Phase 2: 필터링 & 검색 ✅

- **FilterBar 컴포넌트**: 스코어 드롭다운 (0/40/60/80) + 상태 탭 (ALL/COLLECTED/SCORED/SEEDED) + 텍스트 검색 (debounce 300ms)
- **ideas.tsx loader**: URL params (`score`, `status`, `q`) → 동적 WHERE 조건 구성
- **건수 표시**: 필터된 결과 수 / 전체 수 (별도 COUNT 쿼리)

#### Phase 3: 유사 소스 추천 ✅

- **유사 검색 유틸**: `app/lib/embeddings/similar-items.ts` — `findSimilarRadarItems()` 함수 추출
- **SimilarSources 컴포넌트**: 유사 소스 카드 3건 그리드 표시 (유사도 % 포함)
- **ideas.$id.tsx loader**: Vectorize 유사 검색 (minScore 0.7) + fallback (relevanceScore ±20 범위)
- **빈 상태**: sources 배열이 비어있으면 컴포넌트 자체를 렌더링하지 않음

---

### 3.4 Check Phase (검증)

**기간**: 2026-02-10
**분석 문서**: `docs/03-analysis/f20-ideas-enhancement.analysis.md`

#### Gap Analysis 결과 (Match Rate: 93%)

| Category | Items | Pass | Fail | Rate |
|----------|-------|------|------|------|
| Schema | 3 | 3 | 0 | 100% |
| Routes/Loaders | 6 | 5 | 1 | 83% |
| Components | 7 | 7 | 0 | 100% |
| API Endpoints | 4 | 4 | 0 | 100% |
| Business Logic | 8 | 7 | 1 | 88% |
| **Total** | **28** | **26** | **2** | **93%** |

#### 발견된 Gap (2건, 모두 Minor)

| Gap | 설명 | 심각도 | 영향 |
|-----|------|--------|------|
| Gap 1 | `findSimilarRadarItems` 함수에 `db` 파라미터 추가 (설계는 3개, 구현은 4개 파라미터) | Minor | 없음 — DB 조회를 유틸 내부에서 처리하기 위한 개선 |
| Gap 2 | `totalCount`를 별도 COUNT(*) 쿼리로 조회 (설계는 items.length) | Minor | 긍정적 — 필터 전/후 건수를 정확히 비교 표시 가능 |

**Critical/Major Gap**: 0건

---

### 3.5 Act Phase (개선)

Match Rate 93%로 목표(90%) 초과 달성. 발견된 2건의 Gap은 모두 Minor 수준이며 구현 시 개선된 사항으로, 별도 iteration 불필요.

#### 권장 사항

1. **설계 문서 업데이트 (Low Priority)**: `findSimilarRadarItems`의 `db` 파라미터와 `totalCount` 별도 쿼리 방식을 설계 문서에 반영
2. **설계 문서 Status 변경**: Draft → Implemented
3. **프로덕션 배포 전 수동 검증 권장**:
   - 메모 입력 → 페이지 새로고침 → 메모 유지 확인
   - 스코어/상태/검색 필터 조합 테스트
   - VECTORIZE_RADAR 미설정 환경에서 fallback 동작 확인

---

## 4. Architecture Overview

```
┌─ F20: Ideas Enhancement ──────────────────────────────────────────────┐
│                                                                        │
│  ┌─ ideas.tsx (목록 + 필터/검색) ──────────────────────────────────┐  │
│  │  URL Params: ?score=60&status=SCORED&q=AI                       │  │
│  │  loader: 동적 WHERE 조건 → radarItems 쿼리                     │  │
│  │  ┌─────────────┐  ┌────────────────────────────────────────┐    │  │
│  │  │ FilterBar    │  │ IdeaList (memo 인디케이터 포함)         │    │  │
│  │  │ 스코어 | 상태│  │ [● 아이디어A] [아이디어B] [● 아이디어C] │    │  │
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
│  │  api.ideas.memo.ts (신규) — PATCH 메모 저장                    │  │
│  │  similar-items.ts (신규) — Vectorize 유사 검색 유틸 (재사용)   │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌─ MemoPanel (우측 Context Panel) ──────────────────────────────┐  │
│  │  useFetcher → api.ideas.memo.ts (debounce 1초 자동 저장)      │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌─ Data Layer ──────────────────────────────────────────────────┐  │
│  │  radarItems (+memo 컬럼) — ADD COLUMN 1개로 최소 변경          │  │
│  │  VECTORIZE_RADAR (기존, optional) — fallback 제공              │  │
│  └────────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
[메모 저장]
  MemoPanel (textarea onChange) → debounce 1초
    → useFetcher.submit({ itemId, memo }, PUT /api/ideas/memo)
    → UPDATE radarItems SET memo = ? WHERE id = ?
    → 성공: "저장됨" ✓  /  실패: "저장 실패" + 로컬 state 유지

[필터/검색]
  FilterBar (select/input) → useSearchParams로 URL 업데이트
    → Remix loader 재호출 → 동적 WHERE 조건 → 필터된 결과 렌더링

[유사 소스 추천]
  ideas.$id.tsx loader → VECTORIZE_RADAR 존재?
    → Yes: Embedding → Vectorize query (top 3, minScore 0.7)
    → No:  relevanceScore ±20 범위 fallback
    → SimilarSources 컴포넌트 렌더링
```

---

## 5. Key Implementation Highlights

### 5.1 최소 스키마 변경 전략

`radarItems` 테이블에 `memo` 컬럼 1개만 추가하여 기존 데이터에 영향 없이 기능을 확장했습니다. SQLite의 ADD COLUMN은 nullable 컬럼만 허용하며, 기존 행의 memo는 자동으로 NULL이 됩니다.

### 5.2 서버 사이드 필터링

URL 파라미터(`score`, `status`, `q`) 기반으로 Remix loader에서 동적 WHERE 조건을 구성하여, 클라이언트 필터링 대비 성능과 URL 공유성을 확보했습니다.

### 5.3 Vectorize Graceful Fallback

`VECTORIZE_RADAR` 인덱스 미설정 환경에서도 `relevanceScore` ±20 범위 기반 유사 소스를 제공하여, 인프라 의존성 없이 기능을 사용할 수 있습니다.

### 5.4 MemoPanel DB 연동

기존 `useState` 기반 MemoPanel을 `useFetcher` + debounce 1초 자동 저장으로 전환하여, 사용자가 별도 저장 액션 없이도 메모가 영속됩니다. 저장 상태(idle/saving/saved/error)를 UI에 실시간 표시합니다.

### 5.5 totalCount 개선

설계에서는 `items.length`를 totalCount로 사용했으나, 구현에서는 별도 COUNT(*) 쿼리로 필터 전 전체 수를 조회하여 "12건 / 100건" 형식의 정확한 비교 표시를 제공합니다.

---

## 6. Quality Metrics

### 6.1 Final Analysis Results

| Metric | Target | Result | Status |
|--------|--------|--------|--------|
| **Match Rate** | 90% | **93%** | Exceeded ✅ |
| **FR Compliance** | 100% | 100% (7/7) | ✅ |
| **Critical Gaps** | 0 | 0 | ✅ |
| **Major Gaps** | 0 | 0 | ✅ |
| **Minor Gaps** | ≤3 | 2 | ✅ |

### 6.2 Gap Analysis Breakdown

| Category | Items | Pass | Fail | Rate |
|----------|:-----:|:----:|:----:|:----:|
| Schema | 3 | 3 | 0 | 100% |
| Routes/Loaders | 6 | 5 | 1 | 83% |
| Components | 7 | 7 | 0 | 100% |
| API Endpoints | 4 | 4 | 0 | 100% |
| Business Logic | 8 | 7 | 1 | 88% |
| **Total** | **28** | **26** | **2** | **93%** |

### 6.3 Functional Requirements

| FR | 요구사항 | 구현 | 상태 |
|----|---------|------|------|
| FR-01 | MemoPanel에서 작성한 메모를 DB에 저장/불러오기 | `api.ideas.memo.ts` + MemoPanel useFetcher | ✅ |
| FR-02 | 메모 자동 저장 (debounce 1초) | MemoPanel debounce 1000ms | ✅ |
| FR-03 | 아이디어 목록에서 메모 유무 표시 | ideas.tsx dot 인디케이터 | ✅ |
| FR-04 | relevanceScore 범위 필터 | FilterBar 스코어 드롭다운 (0/40/60/80) | ✅ |
| FR-05 | 상태(status)별 그룹핑/탭 전환 | FilterBar 상태 탭 (ALL/COLLECTED/SCORED/SEEDED) | ✅ |
| FR-06 | 제목+요약 텍스트 검색 | FilterBar 검색 input (debounce 300ms) | ✅ |
| FR-07 | 아이디어 상세에서 유사 소스 3건 표시 | SimilarSources 컴포넌트 + Vectorize/fallback | ✅ |

### 6.4 Deliverables

| Deliverable | Location | 수량 | 상태 |
|-------------|----------|:----:|------|
| **신규 파일** | | 5 | ✅ |
| API 엔드포인트 | `app/routes/api.ideas.memo.ts` | 1 | ✅ |
| UI 컴포넌트 | `app/components/ideas/FilterBar.tsx`, `SimilarSources.tsx` | 2 | ✅ |
| 유틸 함수 | `app/lib/embeddings/similar-items.ts` | 1 | ✅ |
| 마이그레이션 | `drizzle/0022_ideas_memo.sql` | 1 | ✅ |
| **수정 파일** | | 5 | ✅ |
| DB 스키마 | `app/db/schema.ts` (memo 컬럼) | 1 | ✅ |
| 라우트 | `app/routes/ideas.tsx`, `ideas.$id.tsx` | 2 | ✅ |
| 컴포넌트 | `app/components/ideas/MemoPanel.tsx` | 1 | ✅ |
| 테스트 헬퍼 | `tests/helpers/db.ts` | 1 | ✅ |

---

## 7. Lessons Learned

### 7.1 What Worked Well

#### 1. 최소 스키마 변경 전략 성공

기존 `radarItems` 테이블에 ADD COLUMN 1개만 추가하여 전체 메모 기능을 구현했습니다. 별도 테이블을 만들지 않아 JOIN 비용이 없고, 기존 쿼리에 memo 필드만 추가하면 되어 구현이 단순했습니다.

#### 2. 기존 패턴 재사용

- `api.radar.items.$id.status.ts`의 PATCH API 패턴을 `api.ideas.memo.ts`에 적용
- `api.similar-sources.ts`의 Vectorize 유사 검색 로직을 `similar-items.ts` 유틸로 추출하여 재사용
- Remix loader의 URL params 기반 서버 사이드 필터링 패턴 활용

#### 3. 설계-구현 고일치율 (93%)

Plan → Design → Do 순서로 진행하여, 설계 문서의 API 스펙, 컴포넌트 Props, 데이터 모델이 구현과 높은 일치율을 보였습니다. 발견된 2건의 Gap도 구현 시 개선으로 판단됩니다.

#### 4. Vectorize Fallback 전략

VECTORIZE_RADAR 미설정 환경에서도 relevanceScore 기반 fallback을 제공하여, 프로덕션/로컬 환경 모두에서 유사 소스 기능이 동작합니다.

### 7.2 What Could Be Improved

#### 1. 설계 문서의 구현 세부사항 보완 필요

`findSimilarRadarItems`의 `db` 파라미터가 설계에서 누락되었습니다. 유틸 함수의 의존성 주입 패턴을 설계 시점에 더 명확히 정의하면 Match Rate를 높일 수 있습니다.

#### 2. totalCount 쿼리 전략 명시 필요

설계에서 `items.length`를 totalCount로 사용했으나, FilterBar의 "12건 / 100건" 표시를 위해 별도 COUNT 쿼리가 필요했습니다. UI 요구사항과 데이터 쿼리 전략의 정합성을 설계 시점에 검증해야 합니다.

#### 3. 테스트 커버리지 확장

F20 기능에 대한 단위/통합 테스트가 별도로 추가되지 않았습니다. 메모 API, 필터링 로직, 유사 검색 fallback에 대한 테스트 추가를 권장합니다.

---

## 8. Next Steps / Recommendations

### 8.1 Immediate Actions (배포 전)

- [x] 마이그레이션 적용 (`drizzle/0022_ideas_memo.sql`) ✅
- [x] 전체 기능 구현 완료 (FR-01 ~ FR-07) ✅
- [x] Gap Analysis 완료 (93%) ✅
- [ ] 프로덕션 빌드 성공 확인 (`pnpm build`)
- [ ] DB 마이그레이션 프로덕션 적용 (`pnpm db:migrate:prod`)
- [ ] 수동 기능 검증 (메모 저장, 필터, 유사 소스)

### 8.2 Short-term (1~2주)

| 작업 | 우선순위 | 예상 노력 |
|------|---------|----------|
| 설계 문서 업데이트 (db 파라미터, totalCount) | Low | 15분 |
| F20 기능 테스트 추가 (메모 API, 필터 로직) | Medium | 1시간 |
| MemoPanel 글자 수 카운터 UI 개선 | Low | 15분 |

### 8.3 Future Considerations

| 항목 | 목적 | 비고 |
|------|------|------|
| 메모 히스토리 (버전 관리) | 메모 변경 이력 추적 | 별도 테이블 필요 시 Option B 전환 |
| 다중 사용자 메모 | 사용자별 독립 메모 | Single Owner 원칙 변경 시 |
| VECTORIZE_RADAR 인덱스 설정 | 유사 소스 품질 향상 | wrangler.toml 바인딩 추가 필요 |
| 메모 전문 검색 (FTS5) | 메모 내용 기반 검색 | 대량 데이터 시 성능 개선 |

---

## File Changes Summary

### 신규 파일 (5개)

```
app/routes/api.ideas.memo.ts              — 메모 GET/PUT API
app/components/ideas/FilterBar.tsx         — 스코어/상태/검색 필터 UI
app/components/ideas/SimilarSources.tsx    — 유사 소스 카드 3건
app/lib/embeddings/similar-items.ts        — Vectorize 유사 검색 유틸
drizzle/0022_ideas_memo.sql                — memo 컬럼 마이그레이션
```

### 수정 파일 (5개)

```
app/db/schema.ts                           — radarItems에 memo 컬럼 추가
app/routes/ideas.tsx                       — 필터/검색 UI + loader 확장 + 메모 인디케이터
app/routes/ideas.$id.tsx                   — 유사 소스 loader + SimilarSources 렌더링
app/components/ideas/MemoPanel.tsx         — useFetcher + debounce 자동 저장
tests/helpers/db.ts                        — 마이그레이션 SQL 경로 추가
```

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-02-10 | 초안 작성 (전체 PDCA 완료 보고서) | Claude |

---

**Report Status**: ✅ COMPLETED
**Recommendation**: Ready for deployment (Match Rate 93%, Zero Critical/Major gaps)
**Next Review**: 배포 후 1주 (수동 기능 검증 + 테스트 추가)
