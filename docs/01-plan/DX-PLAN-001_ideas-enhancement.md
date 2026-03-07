# F20: 아이디어 페이지 고도화 (Radar 연동 심화 + 메모 저장)

> **Summary**: 아이디어 페이지에 메모 영속 저장, 스코어 필터링, 상태 그룹핑, 검색, 유사 소스 추천 기능 추가
>
> **Project**: Discovery-X
> **Version**: v5.1
> **Author**: Claude
> **Date**: 2026-02-10
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

아이디어 페이지(`/ideas`)의 실용성을 높인다. 현재 클라이언트 상태로만 관리되어 유실되는 메모를 DB에 영속 저장하고, Radar 아이템의 스코어/상태 기반 필터링·검색·그룹핑을 추가하며, Embeddings 기반 유사 소스 추천으로 아이디어 탐색 경험을 강화한다.

### 1.2 Background

- `ideas.tsx`는 `radarItems` 테이블을 직접 조회하는 뷰 역할 — 별도 아이디어 테이블 없음
- `MemoPanel`은 `useState`만 사용하여 페이지 이동/새로고침 시 메모 소실
- BD팀 PoC(F19)에서 `radarItems`에 `keyPoints`, `embeddingUpdatedAt` 컬럼 추가됨
- Vectorize 인덱스(`dx-discovery-embeddings`, `dx-evidence-embeddings`) 운영 중, Radar 아이템용 인덱스는 `wrangler.toml`에 `VECTORIZE_RADAR` 미설정 상태
- `radarItemUserStatus` 테이블은 존재하나, Ideas UI에서 활용하지 않음

### 1.3 Related Documents

- Plan (BD PoC): `docs/01-plan/features/ax-bd-poc.plan.md`
- PRD: `docs/Discovery-X_Prototype_PRD_v0.1.md`
- SPEC: `SPEC.md`

---

## 2. Scope

### 2.1 In Scope

- **메모 저장**: `radarItems`에 `memo` 컬럼 추가 + API 엔드포인트 + MemoPanel 연동
- **스코어 기반 필터링**: relevanceScore 범위 필터 (0-100)
- **상태별 그룹핑**: COLLECTED / SCORED / SEEDED 별 그룹 표시
- **텍스트 검색**: 제목(titleKo/title) + 요약(summaryKo) 기반 검색
- **유사 소스 추천**: 아이디어 상세 페이지에서 Embeddings 기반 관련 소스 3건 표시

### 2.2 Out of Scope

- 별도 `ideas` 테이블 신설 (기존 `radarItems` 활용 유지)
- 메모에 대한 다중 사용자 공유/권한 (Single Owner 원칙)
- 아이디어 → Discovery 자동 전환 (기존 "아이디어로 전환" 버튼 유지)
- Radar 수집 로직 변경 (Cron, 스코어링 파이프라인)
- 새로운 Vectorize 인덱스 생성 (기존 인덱스 활용, 없으면 fallback)

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | 요구사항 | 우선순위 | 작업 유형 | 상태 |
|----|---------|---------|----------|------|
| **메모 저장** ||||
| FR-01 | MemoPanel에서 작성한 메모를 DB에 저장/불러오기 | High | 확장 | Pending |
| FR-02 | 메모 자동 저장 (debounce 1초) 또는 저장 버튼 | High | 신규 | Pending |
| FR-03 | 아이디어 목록에서 메모 유무 표시 (아이콘/인디케이터) | Medium | 수정 | Pending |
| **필터링 & 검색** ||||
| FR-04 | relevanceScore 범위 필터 (슬라이더 또는 드롭다운) | High | 신규 | Pending |
| FR-05 | 상태(status)별 그룹핑/탭 전환 | Medium | 신규 | Pending |
| FR-06 | 제목+요약 텍스트 검색 | Medium | 신규 | Pending |
| **유사 소스 추천** ||||
| FR-07 | 아이디어 상세에서 Embeddings 기반 유사 소스 3건 표시 | Medium | 확장 | Pending |

### 3.2 작업 유형 요약

| 유형 | 건수 | 비율 |
|------|------|------|
| **수정** (modify) | 1 | 14% |
| **확장** (extend) | 2 | 29% |
| **신규** (new) | 4 | 57% |

---

## 4. Architecture

### 4.1 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `app/db/schema.ts` | `radarItems`에 `memo` 컬럼 추가 (text, nullable) |
| `app/routes/ideas.tsx` | 필터/검색 UI 추가, 메모 유무 인디케이터, 상태 그룹핑 |
| `app/routes/ideas.$id.tsx` | 유사 소스 추천 섹션 추가 |
| `app/components/ideas/MemoPanel.tsx` | DB 연동 (fetch/save), 자동 저장 로직 |

### 4.2 새 파일

| 파일 | 역할 |
|------|------|
| `app/routes/api.ideas.memo.ts` | 메모 CRUD API (GET/PUT by itemId) |

### 4.3 데이터 모델 변경

#### Option A: `radarItems`에 `memo` 컬럼 추가 (권장)

```
radarItems 테이블:
  + memo: text("memo")  -- nullable, 사용자 메모
```

**근거**:
- `ideas.tsx`가 이미 `radarItems`를 직접 조회하므로 JOIN 불필요
- 현재 단일 사용자(Single Owner) 운영이므로 다중 사용자 메모 분리 불필요
- 마이그레이션이 ADD COLUMN 한 개로 최소화

#### Option B: 별도 `ideaMemos` 테이블 (대안)

```
ideaMemos:
  id: text PK
  itemId: text FK → radarItems.id
  userId: text FK → users.id
  content: text
  createdAt: integer (timestamp)
  updatedAt: integer (timestamp)
```

**비교**:
| 기준 | Option A (컬럼 추가) | Option B (별도 테이블) |
|------|---------------------|---------------------|
| 구현 복잡도 | 낮음 (1 컬럼) | 중간 (테이블+FK+인덱스) |
| 다중 사용자 | 불가 | 가능 |
| 쿼리 비용 | 없음 (기존 쿼리) | JOIN 필요 |
| 히스토리 추적 | 불가 | 가능 (updatedAt) |
| 현재 요구사항 부합 | 충분 | 오버엔지니어링 |

**결정: Option A** — Single Owner 운영 원칙에 맞고, 추후 다중 사용자 필요 시 마이그레이션 가능.

---

## 5. Implementation Plan

### Phase 1: 메모 저장 (DB + API + UI)

**예상 작업량**: 핵심 기능, ~2개 파일 수정 + 1개 신규

| # | 작업 | 파일 | 내용 |
|---|------|------|------|
| 1-1 | `radarItems`에 `memo` 컬럼 추가 | `app/db/schema.ts` | `memo: text("memo")` nullable 추가 |
| 1-2 | Drizzle 마이그레이션 생성 + 적용 | `drizzle/` | `pnpm db:generate && pnpm db:migrate` |
| 1-3 | 테스트 헬퍼 업데이트 | `tests/helpers/db.ts` | 마이그레이션 SQL 추가 |
| 1-4 | 메모 API 엔드포인트 | `app/routes/api.ideas.memo.ts` | GET: itemId로 메모 조회, PUT: 메모 저장 |
| 1-5 | MemoPanel DB 연동 | `app/components/ideas/MemoPanel.tsx` | useState → useFetcher 연동, debounce 자동 저장 |
| 1-6 | 목록에 메모 인디케이터 | `app/routes/ideas.tsx` | loader에서 memo 필드 포함, 아이콘 표시 |

### Phase 2: 필터링 & 검색

**예상 작업량**: UI 중심, ideas.tsx 수정

| # | 작업 | 파일 | 내용 |
|---|------|------|------|
| 2-1 | 스코어 필터 UI | `app/routes/ideas.tsx` | URL 검색 파라미터 기반 relevanceScore 필터 (≥40/≥60/≥80) |
| 2-2 | 상태 그룹핑 | `app/routes/ideas.tsx` | COLLECTED/SCORED/SEEDED 탭 또는 섹션 구분 |
| 2-3 | 텍스트 검색 | `app/routes/ideas.tsx` | 검색 입력 → loader에서 LIKE 쿼리 (titleKo, summaryKo) |
| 2-4 | loader 쿼리 확장 | `app/routes/ideas.tsx` | URL params에서 필터/검색 조건 추출, 동적 where 조건 |

### Phase 3: 유사 소스 추천

**예상 작업량**: ideas.$id.tsx 확장

| # | 작업 | 파일 | 내용 |
|---|------|------|------|
| 3-1 | 유사 소스 조회 로직 | `app/routes/ideas.$id.tsx` | loader에서 Vectorize 쿼리 (embeddingUpdatedAt 있는 아이템 대상) |
| 3-2 | 유사 소스 UI | `app/routes/ideas.$id.tsx` | 상세 하단에 "관련 소스" 카드 3건 표시 |
| 3-3 | Fallback 처리 | `app/routes/ideas.$id.tsx` | Vectorize 미연동 시 relevanceScore 유사도 기반 대체 |

---

## 6. Risk & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| `radarItems`에 memo 컬럼 추가 시 기존 데이터 영향 | Low | Low | ADD COLUMN nullable — 기존 행 영향 없음 |
| debounce 자동 저장 시 네트워크 실패로 메모 유실 | Medium | Low | 저장 실패 시 UI 에러 표시 + 로컬 state 유지 |
| Vectorize 인덱스 미설정 환경에서 유사 소스 크래시 | Medium | Medium | try-catch + Fallback (스코어 기반 대체 로직) |
| 검색 쿼리 LIKE 성능 저하 (대량 데이터) | Low | Low | 현재 100건 limit 유지, 필요 시 FTS5 확장 |
| 테스트 헬퍼 마이그레이션 누락으로 테스트 실패 | High | Medium | Phase 1에서 즉시 반영 (기존 gotcha 패턴) |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-02-10 | Initial draft — 메모 저장 + 필터/검색 + 유사 추천 | Claude |
