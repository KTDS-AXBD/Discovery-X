# F22 보관함 폴더 PDCA 완료 보고서

> **Feature**: f22-archive-folders (보관함 폴더 CRUD + 드래그앤드롭)
> **Project**: Discovery-X v5.1
> **Report Date**: 2026-02-10
> **Duration**: 2026-02-10 (1 day)
> **Status**: COMPLETED ✅
> **Overall Match Rate**: 94% (vs Design)

---

## 1. Executive Summary

### 1.1 프로젝트 개요

하드코딩된 보관함 폴더(중요/리서치/완료)를 DB 기반 CRUD로 전환하고, Discovery/RadarItem/Conversation/Proposal 등 다양한 엔티티를 폴더에 드래그하여 정리할 수 있는 기능을 구현했습니다. Feature Module 패턴(`app/features/archive/`)을 적용하여 Core 스키마와 완전히 분리된 독립 모듈로 구성했습니다.

### 1.2 완료 상황

```
┌──────────────────────────────────────────────┐
│  Completion Rate: 100% (12/12 FR)            │
├──────────────────────────────────────────────┤
│  ✅ Complete:     12 / 12 items               │
│  ⏸️ Out of Scope:  0 / 12 items              │
│  ❌ Cancelled:     0 / 12 items               │
└──────────────────────────────────────────────┘

Match Rate Breakdown:
┌──────────────────────┬───────┬──────┬──────┬──────┐
│ Category             │ Items │ Pass │ Fail │ Rate │
├──────────────────────┼───────┼──────┼──────┼──────┤
│ Schema               │    22 │   22 │    0 │ 100% │
│ API Endpoints        │    18 │   17 │    1 │  94% │
│ Components           │    12 │   11 │    1 │  92% │
│ Drag-and-Drop        │     7 │    7 │    0 │ 100% │
│ Business Logic       │     9 │    7 │    2 │  78% │
├──────────────────────┼───────┼──────┼──────┼──────┤
│ Total                │    68 │   64 │    4 │  94% │
└──────────────────────┴───────┴──────┴──────┴──────┘
```

### 1.3 핵심 성과

| 항목 | 결과 |
|------|------|
| **FR 준수율** | 100% (12/12) |
| **Match Rate** | 94% (64/68) |
| **코드 품질** | Zero lint errors |
| **개발 기간** | 1일 (단일 세션 완료) |
| **Schema 일치율** | 100% (22/22) |
| **DnD 일치율** | 100% (7/7) |
| **테스트 헬퍼 동기화** | 완료 (`tests/helpers/db.ts:48`) |

---

## 2. Related Documents

| Phase | Document | Status |
|-------|----------|--------|
| Plan | [f22-archive-folders.plan.md](../01-plan/features/f22-archive-folders.plan.md) | ✅ Finalized |
| Design | [f22-archive-folders.design.md](../02-design/features/f22-archive-folders.design.md) | ✅ Complete (v0.1) |
| Check | [f22-archive-folders.analysis.md](./f22-archive-folders.analysis.md) | ✅ Complete |
| Act | Current document | ✅ Complete |

---

## 3. PDCA Cycle Summary

### 3.1 Plan Phase

**문서**: `docs/01-plan/features/f22-archive-folders.plan.md`
**기간**: 2026-02-10

#### 핵심 기획

- **목표**: 하드코딩된 `DEFAULT_FOLDERS` 상수를 DB 기반 CRUD로 전환, 드래그앤드롭 분류 기능 추가
- **범위**: FR-01 ~ FR-12 (폴더 CRUD, 아이템 관리, DnD, UI 연동)
- **아키텍처**: Feature Module 패턴 (`app/features/archive/db/schema.ts`) — Proposals 모듈과 동일 구조
- **작업 유형 분포**:
  - 신규 (new): 92% (11건)
  - 수정 (modify): 8% (1건)

#### 4단계 구현 계획

| Phase | 내용 | 파일 수 |
|-------|------|---------|
| Phase 1 | DB 스키마 + 마이그레이션 | 4개 |
| Phase 2 | 폴더 CRUD API | 3개 |
| Phase 3 | 폴더 아이템 API | 1개 |
| Phase 4 | UI 연동 — ArchiveFolderList + DnD | 2개 |

---

### 3.2 Design Phase

**문서**: `docs/02-design/features/f22-archive-folders.design.md` (v0.1)
**기간**: 2026-02-10

#### 설계 원칙

- **Feature Module 격리**: `app/features/archive/` 독립 디렉토리, Core 스키마와 스프레드 머지
- **Cascade 삭제**: 폴더 삭제 시 연결 레코드만 삭제 (원본 엔티티 미영향)
- **Tenant 스코핑**: 모든 쿼리에 `tenantId` 조건 강제 — Proposals 보안 갭 교훈 반영
- **최소 외부 의존성**: HTML5 네이티브 DnD API (라이브러리 추가 없음)
- **Remix 데이터 패턴**: `useFetcher` 기반 비동기 CRUD

#### 주요 설계 결정

1. **데이터 모델**: 2개 신규 테이블 (`archive_folders`, `archive_folder_items`) + 5개 인덱스
2. **API 설계**: 4개 라우트 파일, 8개 HTTP 메서드
3. **다형성 참조**: `itemType` + `itemId` 패턴으로 이기종 엔티티 통합 분류
4. **UI 패턴**: 인라인 CRUD (생성/편집/삭제), 드래그 시각 피드백 (Axis 토큰)
5. **네임스페이스**: `archive_` 프리픽스로 Core/Venture/Proposals와 충돌 방지

---

### 3.3 Do Phase

**기간**: 2026-02-10 (1일)

#### Phase 1: DB 스키마 + 마이그레이션 ✅

**신규 테이블** (2개):
- `archive_folders` — 폴더 메인 엔티티 (8개 컬럼, 2개 인덱스)
- `archive_folder_items` — 폴더-아이템 연결 (6개 컬럼, 3개 인덱스)

**Feature Module**:
- `app/features/archive/db/schema.ts` — Drizzle 스키마 + `FolderItemType` enum
- `app/db/index.ts` — `archiveSchema` 스프레드 머지 + re-export

**마이그레이션**: `drizzle/0023_archive_folders.sql` (설계상 0022 → 선행 마이그레이션 추가로 0023번으로 밀림)

**테스트 헬퍼**: `tests/helpers/db.ts:48` — `0023_archive_folders.sql` 등록 완료

#### Phase 2: 폴더 CRUD API ✅

**신규 API** (3개 파일, 5개 메서드):
1. `GET /api/folders` — 폴더 목록 + LEFT JOIN 아이템 카운트
2. `POST /api/folders` — 폴더 생성 (name 1~20자, sortOrder 자동 결정)
3. `PATCH /api/folders/:id` — 이름/아이콘 수정 (tenantId 스코핑)
4. `DELETE /api/folders/:id` — CASCADE 삭제 (tenantId 스코핑)
5. `PATCH /api/folders/reorder` — `db.batch()` 트랜잭션 순서 변경

#### Phase 3: 폴더 아이템 API ✅

**신규 API** (1개 파일, 3개 메서드):
1. `GET /api/folders/:id/items` — 폴더 아이템 목록 (소유권 사전 검증)
2. `POST /api/folders/:id/items` — 아이템 추가 (itemType enum 검증, UNIQUE → 409)
3. `DELETE /api/folders/:id/items` — 아이템 제거 (소유권 사전 검증)

#### Phase 4: UI 연동 ✅

**ArchiveFolderList.tsx** (전면 리팩토링):
- `DEFAULT_FOLDERS` 상수 제거, props 기반 DB 연동
- 인라인 폴더 생성 (autoFocus, Enter/Escape)
- 인라인 폴더 편집 (더블클릭)
- 인라인 삭제 확인 (pendingDeleteId 패턴)
- 드래그 타겟 (onDragOver/onDragLeave/onDrop)
- 아이템 카운트 배지 (10px text)
- Axis 디자인 토큰 기반 시각 피드백

**SidebarPanel.tsx** (통합):
- `useFetcher` 기반 4개 핸들러 (create/rename/delete/dropItem)
- `activeFolderId` 상태 관리
- 대화 항목 `draggable="true"` + `dataTransfer` 설정
- 7개 props ArchiveFolderList에 전달

---

### 3.4 Check Phase

**분석 문서**: `docs/03-analysis/f22-archive-folders.analysis.md`
**기간**: 2026-02-10
**방법**: tmux Agent Teams (Worker 3)

#### Gap Analysis 결과 (Match Rate: 94%)

| Gap ID | 설명 | Severity | 상태 |
|--------|------|----------|------|
| GAP-1 | 테스트 헬퍼 마이그레이션 미등록 | Critical | **이미 수정됨** ✅ |
| GAP-2 | SidebarPanelProps 간소화 | Minor | 수용 (개선된 구현) |
| GAP-3 | DELETE items itemType enum 미검증 | Minor | 영향 없음 (무해) |
| GAP-4 | 마이그레이션 파일명 변경 (0022→0023) | Info | 비기능적 차이 |

#### 카테고리별 결과

| Category | Items | Pass | Fail | Rate |
|----------|:-----:|:----:|:----:|:----:|
| Schema | 22 | 22 | 0 | 100% |
| API Endpoints | 18 | 17 | 1 | 94% |
| Components | 12 | 11 | 1 | 92% |
| Drag-and-Drop | 7 | 7 | 0 | 100% |
| Business Logic | 9 | 7 | 2 | 78% |
| **Total** | **68** | **64** | **4** | **94%** |

---

### 3.5 Act Phase

**이터레이션**: 0회 필요 (Match Rate 94% ≥ 90% 목표)

#### GAP-1 해소 확인 (Critical → 이미 수정됨)

분석 보고서에서 `tests/helpers/db.ts`에 `0023_archive_folders.sql` 미등록으로 Critical 분류되었으나, **실제 확인 결과 이미 등록 완료**:

```
tests/helpers/db.ts:48
  runMigrationSQL(sqlite, resolve(migrationsDir, "0023_archive_folders.sql"));
```

분석 시점과 실제 구현 사이의 타이밍 차이로, 구현 Phase 1-4 단계에서 이미 등록이 포함되어 있었습니다. 따라서 별도 Act 이터레이션이 불필요합니다.

#### 나머지 Gap 수용 판단

| Gap | 판단 | 근거 |
|-----|------|------|
| GAP-2: SidebarPanelProps 간소화 | **수용** (As-Is) | `useFetcher` 내부 처리가 더 깔끔한 구현. props drilling 감소. |
| GAP-3: DELETE itemType enum 미검증 | **수용** (As-Is) | 잘못된 itemType으로 DELETE 시 매칭 안 되어 무해하게 종료. 데이터 무결성 영향 없음. |
| GAP-4: 마이그레이션 파일명 0022→0023 | **수용** (As-Is) | 선행 마이그레이션(`0022_ideas_memo.sql`) 추가로 번호 밀림. SQL 내용 100% 일치. |

---

## 4. Architecture Overview

### 4.1 Feature Module 구조

```
app/features/archive/
  └── db/
      └── schema.ts           ← 2개 테이블 + 1개 Enum + 5개 인덱스

app/routes/
  ├── api.folders.ts           ← GET (목록+카운트) / POST (생성)
  ├── api.folders.$id.ts       ← PATCH (수정) / DELETE (삭제)
  ├── api.folders.$id.items.ts ← GET / POST / DELETE (아이템 CRUD)
  └── api.folders.reorder.ts   ← PATCH (순서 변경)

app/components/layout/
  ├── ArchiveFolderList.tsx    ← DB 연동 CRUD UI + DnD 타겟
  └── SidebarPanel.tsx         ← useFetcher 핸들러 + draggable 소스

drizzle/
  └── 0023_archive_folders.sql ← D1 마이그레이션 (2 tables + 5 indexes)
```

### 4.2 Schema Merge 패턴

```typescript
// app/db/index.ts
const allSchema = {
  ...schema,           // Core (44 tables)
  ...ventureSchema,    // Venture (16 tables)
  ...proposalSchema,   // Proposals (6 tables)
  ...archiveSchema,    // Archive (2 tables)  ← 추가
};
```

### 4.3 Data Flow

```
[사용자 드래그] → SidebarPanel (draggable="true")
  → dataTransfer { itemType, itemId }
  → ArchiveFolderList (onDrop)
  → useFetcher POST /api/folders/:id/items
  → INSERT archive_folder_items (UNIQUE 제약)
  → revalidation → 폴더 카운트 갱신

[폴더 CRUD] → ArchiveFolderList (인라인 UI)
  → useFetcher → api.folders.* API
  → Drizzle ORM → Cloudflare D1
  → tenantId 스코핑 (모든 쿼리)
```

---

## 5. Key Implementation Highlights

### 5.1 HTML5 네이티브 드래그앤드롭

외부 라이브러리 없이 HTML5 DnD API만으로 구현. 드래그 소스(대화 항목)에서 `application/json` 형식으로 `{ itemType, itemId }`를 전달하고, 드래그 타겟(폴더)에서 `onDrop`으로 수신하여 API 호출. Axis 디자인 토큰 기반 시각 피드백(`--axis-surface-brand`, `--axis-border-brand`) 적용.

### 5.2 Tenant 스코핑 철저 적용

Proposals 모듈의 보안 갭(GAP-1~4)을 반면교사로 삼아, 모든 8개 API 메서드에 `tenantId` 조건을 적용. 단건 조회/수정/삭제 시에도 `AND tenant_id = ?` 조건 포함. 아이템 API는 폴더 소유권 사전 검증 함수(`verifyFolderOwnership`)를 통해 이중 보호.

### 5.3 useFetcher 기반 내부 핸들러

설계에서는 SidebarPanelProps로 CRUD 콜백을 전달하는 패턴이었으나, 실제 구현에서는 `useFetcher`로 SidebarPanel 내부에서 API 호출을 직접 관리. 부모 컴포넌트의 props drilling 부담을 줄이고, 폴더 관련 상태 관리를 단일 컴포넌트에 캡슐화한 개선된 구현.

### 5.4 UNIQUE 제약 기반 중복 방지

`uniq_folder_items` UNIQUE 인덱스(`folder_id`, `item_type`, `item_id`)로 DB 레벨에서 아이템 중복을 원천 차단. UNIQUE 위반 시 409 Conflict 응답으로 클라이언트에 명확한 에러 전달.

### 5.5 db.batch() 트랜잭션

폴더 순서 변경 API(`PATCH /api/folders/reorder`)에서 `db.batch()`로 단일 트랜잭션 내 순차 UPDATE 실행. 각 항목에 `tenantId` 조건을 포함하여 교차 테넌트 순서 조작 차단.

---

## 6. Quality Metrics

### 6.1 Final Analysis Results

| Metric | Target | Result | Status |
|--------|--------|--------|--------|
| **Match Rate** | 90% | **94%** | ✅ Exceeded |
| **Schema 일치율** | 100% | 100% | ✅ |
| **DnD 일치율** | 100% | 100% | ✅ |
| **API 일치율** | 90% | 94% | ✅ |
| **FR 준수율** | 100% | 100% | ✅ |
| **테스트 헬퍼 동기화** | Yes | Yes | ✅ |
| **Lint Errors** | 0 | 0 | ✅ |

### 6.2 Gap Resolution Summary

| Gap ID | Severity | Resolution | Status |
|--------|----------|------------|--------|
| GAP-1 | Critical | 이미 수정됨 (`tests/helpers/db.ts:48`) | ✅ Resolved |
| GAP-2 | Minor | 수용 — useFetcher 패턴이 더 우수 | ✅ Accepted |
| GAP-3 | Minor | 수용 — 잘못된 itemType은 무해하게 종료 | ✅ Accepted |
| GAP-4 | Info | 수용 — 번호 밀림, SQL 내용 100% 일치 | ✅ Accepted |

### 6.3 Deliverables

| Deliverable | Location | 수량 | 상태 |
|-------------|----------|:----:|------|
| **신규 파일** | | 6 | ✅ |
| Feature Module 스키마 | `app/features/archive/db/schema.ts` | 1 | ✅ |
| API 라우트 | `app/routes/api.folders.*.ts` | 4 | ✅ |
| 마이그레이션 | `drizzle/0023_archive_folders.sql` | 1 | ✅ |
| **수정 파일** | | 4 | ✅ |
| DB 머지 + re-export | `app/db/index.ts` | 1 | ✅ |
| UI 컴포넌트 | `app/components/layout/ArchiveFolderList.tsx` | 1 | ✅ |
| UI 통합 | `app/components/layout/SidebarPanel.tsx` | 1 | ✅ |
| 테스트 헬퍼 | `tests/helpers/db.ts` | 1 | ✅ |

---

## 7. Lessons Learned

### 7.1 What Worked Well

#### 1. Feature Module 패턴 재사용 성공

Proposals 모듈(`app/features/proposals/`)의 구조를 그대로 따라 Archive 모듈을 구성. 스키마 정의, db/index.ts 머지, 네임스페이스 프리픽스(`archive_`) 적용까지 검증된 패턴을 재사용하여 아키텍처 일관성 유지.

#### 2. Proposals 보안 갭 교훈 반영

Proposals 분석에서 발견된 교차 테넌트 접근 갭(GAP-1~4)을 반면교사로 삼아, Archive API 설계 시점부터 모든 엔드포인트에 `tenantId` 스코핑을 필수 포함. 결과적으로 보안 관련 Gap 0건.

#### 3. HTML5 네이티브 DnD로 의존성 최소화

외부 DnD 라이브러리(dnd-kit, react-beautiful-dnd 등) 없이 HTML5 네이티브 API만으로 구현. 번들 사이즈 증가 없음, 추가 의존성 관리 불필요. Schema/DnD 카테고리 모두 100% 일치율 달성.

#### 4. useFetcher 패턴 적용

설계의 props drilling 패턴 대신 `useFetcher` 기반 내부 핸들러로 구현하여 컴포넌트 캡슐화 향상. Gap Analysis에서도 "오히려 더 깔끔한 구현"으로 평가.

#### 5. 단일 세션 완료

Plan → Design → Do → Check 전 과정을 1일 내 완료. Feature Module 패턴 재사용 + 명확한 스코프 정의 + 4단계 구현 계획이 빠른 진행을 가능하게 함.

### 7.2 What Could Be Improved

#### 1. 마이그레이션 번호 관리

설계 시점에 `0022`로 계획했으나, 병렬 작업(`0022_ideas_memo.sql`)으로 `0023`으로 밀림. 병렬 feature 개발 시 마이그레이션 번호 예약 또는 최종 생성 시점에 번호 결정하는 프로세스 필요.

#### 2. DELETE 엔드포인트 itemType 검증 일관성

POST에서는 `VALID_ITEM_TYPES.has()` 검증을 적용했으나, DELETE에서는 누락. 기능적 영향은 없지만 API 일관성 측면에서 개선 가능. 향후 API 설계 시 CRUD 전 메서드에 동일한 검증 적용 가이드라인 필요.

#### 3. 폴더 아이템 목록 UI 미구현

설계 §5.8에서 "폴더 클릭 시 아이템 목록 표시" 기능이 정의되었으나, `activeFolderId` 상태 관리까지만 구현되고 아이템 목록을 대화 목록 영역에 표시하는 UI는 미완성. 설계에서도 Phase 4 이후로 분류한 항목이므로 후속 작업으로 적절.

---

## 8. Next Steps / Recommendations

### 8.1 Immediate Actions

- [x] DB 스키마 + 마이그레이션 ✅
- [x] API 8개 메서드 구현 ✅
- [x] ArchiveFolderList DB 연동 + DnD ✅
- [x] SidebarPanel 통합 ✅
- [x] 테스트 헬퍼 동기화 ✅
- [x] Gap Analysis 94% 달성 ✅
- [ ] 프로덕션 DB 마이그레이션 (`pnpm db:migrate:prod`)
- [ ] 프로덕션 배포 (`pnpm run deploy`)

### 8.2 Short-term (Next Sprint)

| 작업 | 우선순위 | 예상 |
|------|---------|------|
| 폴더 클릭 시 아이템 목록 표시 UI | Medium | 2시간 |
| DELETE items itemType enum 검증 추가 | Low | 15분 |
| 모바일 터치 대응 ("폴더에 추가" 컨텍스트 메뉴) | Medium | 2시간 |
| 고아 아이템 참조 자동 정리 | Low | 1시간 |

### 8.3 Future Considerations (v5.2+)

| 항목 | 목적 |
|------|------|
| 폴더 공유/권한 관리 | 팀 단위 폴더 공유 |
| 중첩 폴더 (하위 폴더 구조) | 더 세밀한 분류 체계 |
| 폴더 아이콘 커스텀 (이모지/피커) | 시각적 구분 강화 |
| 폴더 색상 지정 | 시각적 구분 강화 |
| 폴더 내 아이템 정렬 커스터마이징 | 사용자 선호 반영 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-02-10 | 초안 작성 — 전체 PDCA 완료 보고서 | Claude |

---

**Report Status**: ✅ COMPLETED
**Recommendation**: Ready for production deployment (94% match rate, all critical gaps resolved)
**Next Review**: 배포 후 폴더 아이템 목록 UI 구현 + 모바일 터치 대응
