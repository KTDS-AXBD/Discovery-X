# F22: 보관함 폴더 CRUD 구현 (DB 스키마 + API + 아이템 드래그)

> **Summary**: 하드코딩된 보관함 폴더를 DB 기반 CRUD로 전환하고, Discovery/RadarItem 등 다양한 엔티티를 폴더에 드래그하여 정리할 수 있는 기능 구현
>
> **Project**: Discovery-X
> **Version**: v5.1
> **Author**: Claude
> **Date**: 2026-02-10
> **Status**: Draft

---

## 1. Overview

### 1.1 Purpose

현재 `ArchiveFolderList.tsx`에 하드코딩된 기본 폴더(중요/리서치/완료)를 DB 기반으로 전환하여, 사용자가 자유롭게 폴더를 생성·수정·삭제하고 Discovery, RadarItem 등 다양한 아이템을 폴더에 분류할 수 있도록 한다.

### 1.2 Background

- `app/components/layout/ArchiveFolderList.tsx`: `DEFAULT_FOLDERS` 상수로 3개 폴더가 하드코딩 됨
- "폴더 추가" 버튼이 UI에 존재하나 실제 기능 없음 (onClick 핸들러 미구현)
- `SidebarPanel.tsx`에서 `<ArchiveFolderList />` 컴포넌트를 렌더링 중
- 보관함은 개인 정리 도구이므로 tenant 스코핑 적용 (팀 단위 폴더 공유)
- 기존 22개 마이그레이션(0000~0021)에 이어 0022번으로 추가

### 1.3 Related Documents

- SPEC: `SPEC.md`
- PRD: `docs/Discovery-X_Prototype_PRD_v0.1.md`
- DB Schema: `app/db/schema.ts` (44개 테이블)
- Proposals Schema Pattern: `app/features/proposals/db/schema.ts`

---

## 2. Scope

### 2.1 In Scope

- [x] DB 스키마: `archive_folders` + `archive_folder_items` 테이블 신규 생성
- [x] Drizzle 마이그레이션: `0022_archive_folders.sql`
- [x] API 라우트: 폴더 CRUD + 아이템 추가/제거/이동
- [x] ArchiveFolderList 컴포넌트 DB 연동 (하드코딩 제거)
- [x] 드래그앤드롭으로 사이드바 대화·아이템을 폴더에 분류
- [x] 폴더당 아이템 카운트 표시
- [x] Tenant 스코핑 (모든 쿼리에 tenantId 조건)
- [x] 테스트 헬퍼 업데이트 (`tests/helpers/db.ts`)

### 2.2 Out of Scope

- 폴더 공유/권한 관리 (v5.2 이후)
- 폴더 내 아이템 정렬 커스터마이징 (기본 추가순)
- 중첩 폴더 (하위 폴더 구조)
- 폴더 아이콘 커스텀 (이모지/아이콘 피커) — 1단계에서는 기본 폴더 아이콘 사용
- 폴더 색상 지정

---

## 3. Requirements — Functional Requirements

| ID | 요구사항 | 우선순위 | 작업 유형 |
|----|---------|---------|----------|
| FR-01 | 폴더 생성 (이름 입력, 최대 20자) | High | 신규 |
| FR-02 | 폴더 목록 조회 (tenantId 기준, order순 정렬) | High | 신규 |
| FR-03 | 폴더 이름 수정 (인라인 편집) | Medium | 신규 |
| FR-04 | 폴더 삭제 (아이템 연결 해제, 폴더만 삭제) | Medium | 신규 |
| FR-05 | 폴더 순서 변경 (order 값 업데이트) | Low | 신규 |
| FR-06 | 아이템을 폴더에 추가 (itemType + itemId) | High | 신규 |
| FR-07 | 아이템을 폴더에서 제거 | Medium | 신규 |
| FR-08 | 아이템을 다른 폴더로 이동 | Medium | 신규 |
| FR-09 | 폴더당 아이템 카운트 집계 | High | 신규 |
| FR-10 | 드래그앤드롭으로 대화/Discovery를 폴더에 분류 | High | 신규 |
| FR-11 | ArchiveFolderList DB 연동 (하드코딩 제거) | High | 수정 |
| FR-12 | 폴더 클릭 시 해당 폴더 아이템 목록 표시 | Medium | 신규 |

### 3.1 작업 유형 요약

| 유형 | 건수 | 비율 |
|------|------|------|
| **신규** (new) | 11 | 92% |
| **수정** (modify) | 1 | 8% |

---

## 4. Architecture

### 4.1 수정 대상 파일

| 파일 | 변경 내용 |
|------|----------|
| `app/components/layout/ArchiveFolderList.tsx` | DB 연동, 하드코딩 제거, CRUD UI, 드래그 타겟 |
| `app/components/layout/SidebarPanel.tsx` | ArchiveFolderList에 props 전달 (folders 데이터, 콜백) |
| `app/db/index.ts` | archiveSchema 머지 (기존 패턴: `{ ...schema, ...ventureSchema, ...proposalSchema, ...archiveSchema }`) |
| `tests/helpers/db.ts` | `0022_archive_folders.sql` 마이그레이션 파일 경로 추가 |

### 4.2 새 파일

| 파일 | 역할 |
|------|------|
| `app/features/archive/db/schema.ts` | Drizzle 스키마 (`archiveFolders` + `archiveFolderItems`) |
| `drizzle/0022_archive_folders.sql` | D1 마이그레이션 SQL |
| `app/routes/api.folders.ts` | 폴더 CRUD API (GET 목록/POST 생성) |
| `app/routes/api.folders.$id.ts` | 폴더 단건 API (PATCH 수정/DELETE 삭제) |
| `app/routes/api.folders.$id.items.ts` | 폴더 아이템 API (GET 목록/POST 추가/DELETE 제거) |
| `app/routes/api.folders.reorder.ts` | 폴더 순서 변경 API (PATCH) |

### 4.3 데이터 모델 변경

#### 4.3.1 `archive_folders` 테이블

| 컬럼 | 타입 | 제약 조건 | 설명 |
|------|------|----------|------|
| `id` | TEXT | PK, `crypto.randomUUID()` | 폴더 고유 ID |
| `tenant_id` | TEXT | NOT NULL, FK → `tenants.id` | 테넌트 스코핑 |
| `name` | TEXT | NOT NULL | 폴더 이름 (최대 20자, 앱 레벨 검증) |
| `icon` | TEXT | DEFAULT `'folder'` | 아이콘 식별자 (향후 확장용) |
| `sort_order` | INTEGER | NOT NULL, DEFAULT 0 | 정렬 순서 |
| `created_by` | TEXT | NOT NULL, FK → `users.id` | 생성자 |
| `created_at` | INTEGER (timestamp) | NOT NULL, DEFAULT `unixepoch()` | 생성일시 |
| `updated_at` | INTEGER (timestamp) | NOT NULL, DEFAULT `unixepoch()` | 수정일시 |

**인덱스**:
- `idx_archive_folders_tenant` ON (`tenant_id`)
- `idx_archive_folders_tenant_order` ON (`tenant_id`, `sort_order`)

#### 4.3.2 `archive_folder_items` 테이블

| 컬럼 | 타입 | 제약 조건 | 설명 |
|------|------|----------|------|
| `id` | TEXT | PK, `crypto.randomUUID()` | 연결 고유 ID |
| `folder_id` | TEXT | NOT NULL, FK → `archive_folders.id` ON DELETE CASCADE | 폴더 참조 |
| `item_type` | TEXT | NOT NULL | 아이템 타입 (`discovery`, `radar_item`, `conversation`, `proposal`) |
| `item_id` | TEXT | NOT NULL | 아이템 ID (다형성 참조) |
| `added_by` | TEXT | NOT NULL, FK → `users.id` | 추가한 사용자 |
| `added_at` | INTEGER (timestamp) | NOT NULL, DEFAULT `unixepoch()` | 추가일시 |

**인덱스**:
- `idx_folder_items_folder` ON (`folder_id`)
- `idx_folder_items_type_id` ON (`item_type`, `item_id`)
- `uniq_folder_items` UNIQUE ON (`folder_id`, `item_type`, `item_id`) — 중복 방지

#### 4.3.3 Drizzle 스키마 (app/features/archive/db/schema.ts)

```typescript
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users, tenants } from "~/db/schema";

export const FolderItemType = {
  DISCOVERY: "discovery",
  RADAR_ITEM: "radar_item",
  CONVERSATION: "conversation",
  PROPOSAL: "proposal",
} as const;

export const archiveFolders = sqliteTable(
  "archive_folders",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    tenantId: text("tenant_id").notNull().references(() => tenants.id),
    name: text("name").notNull(),
    icon: text("icon").default("folder"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    tenantIdx: index("idx_archive_folders_tenant").on(table.tenantId),
    tenantOrderIdx: index("idx_archive_folders_tenant_order").on(table.tenantId, table.sortOrder),
  }),
);

export const archiveFolderItems = sqliteTable(
  "archive_folder_items",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    folderId: text("folder_id").notNull().references(() => archiveFolders.id, { onDelete: "cascade" }),
    itemType: text("item_type").notNull(),
    itemId: text("item_id").notNull(),
    addedBy: text("added_by").notNull().references(() => users.id),
    addedAt: integer("added_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  },
  (table) => ({
    folderIdx: index("idx_folder_items_folder").on(table.folderId),
    typeIdIdx: index("idx_folder_items_type_id").on(table.itemType, table.itemId),
    uniqueIdx: uniqueIndex("uniq_folder_items").on(table.folderId, table.itemType, table.itemId),
  }),
);
```

#### 4.3.4 마이그레이션 SQL (drizzle/0022_archive_folders.sql)

```sql
CREATE TABLE `archive_folders` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL REFERENCES `tenants`(`id`),
  `name` text NOT NULL,
  `icon` text DEFAULT 'folder',
  `sort_order` integer NOT NULL DEFAULT 0,
  `created_by` text NOT NULL REFERENCES `users`(`id`),
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE `archive_folder_items` (
  `id` text PRIMARY KEY NOT NULL,
  `folder_id` text NOT NULL REFERENCES `archive_folders`(`id`) ON DELETE CASCADE,
  `item_type` text NOT NULL,
  `item_id` text NOT NULL,
  `added_by` text NOT NULL REFERENCES `users`(`id`),
  `added_at` integer NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX `idx_archive_folders_tenant` ON `archive_folders` (`tenant_id`);
CREATE INDEX `idx_archive_folders_tenant_order` ON `archive_folders` (`tenant_id`, `sort_order`);
CREATE INDEX `idx_folder_items_folder` ON `archive_folder_items` (`folder_id`);
CREATE INDEX `idx_folder_items_type_id` ON `archive_folder_items` (`item_type`, `item_id`);
CREATE UNIQUE INDEX `uniq_folder_items` ON `archive_folder_items` (`folder_id`, `item_type`, `item_id`);
```

---

## 5. Implementation Plan

### Phase 1: DB 스키마 + 마이그레이션 (예상 파일 3개)

| 작업 | 파일 | 내용 |
|------|------|------|
| 1-1 | `app/features/archive/db/schema.ts` | Drizzle 스키마 정의 (archiveFolders, archiveFolderItems) |
| 1-2 | `app/db/index.ts` | archiveSchema 임포트 및 머지 |
| 1-3 | `drizzle/0022_archive_folders.sql` | 마이그레이션 SQL 생성 (`pnpm db:generate`) |
| 1-4 | `tests/helpers/db.ts` | 마이그레이션 SQL 파일 경로 추가 |
| 1-5 | 마이그레이션 적용 | `pnpm db:migrate` (로컬) |

**검증**: `pnpm db:studio`에서 `archive_folders`, `archive_folder_items` 테이블 확인

### Phase 2: 폴더 CRUD API (예상 파일 3개)

| 작업 | 파일 | 내용 |
|------|------|------|
| 2-1 | `app/routes/api.folders.ts` | GET: 폴더 목록 (tenantId + order), POST: 폴더 생성 |
| 2-2 | `app/routes/api.folders.$id.ts` | PATCH: 이름 수정, DELETE: 폴더 삭제 (CASCADE로 아이템 연결 해제) |
| 2-3 | `app/routes/api.folders.reorder.ts` | PATCH: 순서 변경 (sortOrder 배열 업데이트) |

**API 설계**:
- `GET /api/folders` → `{ folders: Array<Folder & { itemCount: number }> }`
- `POST /api/folders` → `{ name: string }` → `{ folder: Folder }`
- `PATCH /api/folders/:id` → `{ name?: string, icon?: string }` → `{ folder: Folder }`
- `DELETE /api/folders/:id` → `{ success: true }`
- `PATCH /api/folders/reorder` → `{ orderedIds: string[] }` → `{ success: true }`

**인증**: 모든 엔드포인트에 `requireUser()` + tenantId 스코핑 적용

### Phase 3: 폴더 아이템 API (예상 파일 1개)

| 작업 | 파일 | 내용 |
|------|------|------|
| 3-1 | `app/routes/api.folders.$id.items.ts` | GET: 아이템 목록, POST: 아이템 추가, DELETE: 아이템 제거 |

**API 설계**:
- `GET /api/folders/:id/items` → `{ items: Array<FolderItem> }`
- `POST /api/folders/:id/items` → `{ itemType: string, itemId: string }` → `{ item: FolderItem }`
- `DELETE /api/folders/:id/items` → `{ itemType: string, itemId: string }` → `{ success: true }`

**중복 방지**: UNIQUE 인덱스(`uniq_folder_items`)로 같은 아이템 중복 추가 차단. 충돌 시 409 응답.

### Phase 4: UI 연동 — ArchiveFolderList + 드래그앤드롭 (수정 파일 2개)

| 작업 | 파일 | 내용 |
|------|------|------|
| 4-1 | `app/components/layout/ArchiveFolderList.tsx` | DB 연동: props로 folders 수신, 폴더 생성/수정/삭제 UI, 드래그 타겟(HTML5 DnD API) |
| 4-2 | `app/components/layout/SidebarPanel.tsx` | ArchiveFolderList에 folders 데이터 + 콜백 props 전달, 대화 항목에 draggable 속성 |

**드래그앤드롭 구현 방식**: HTML5 네이티브 Drag and Drop API 사용 (추가 의존성 없음)
- 대화 항목 (`draggable="true"`) → `dataTransfer`에 `{ itemType, itemId }` 설정
- 폴더 항목 → `onDragOver` + `onDrop`에서 API 호출
- 드래그 중 폴더 하이라이트 (시각 피드백)

**폴더 생성 UX**: "폴더 추가" 버튼 클릭 → 인라인 텍스트 입력 → Enter로 확정 / Escape로 취소

---

## 6. Risk & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 마이그레이션 추가 후 테스트 헬퍼 누락 | High | Medium | Phase 1에서 `tests/helpers/db.ts` 업데이트를 필수 단계로 포함 |
| 다형성 참조(itemType+itemId)로 조인 복잡도 증가 | Medium | Low | 폴더 아이템 조회 시 itemType별 분기 조인 또는 클라이언트 사이드 리졸브 |
| CASCADE 삭제로 의도치 않은 아이템 연결 해제 | Low | Low | 폴더 삭제 시 확인 다이얼로그 표시, `archive_folder_items`만 삭제 (원본 엔티티 미영향) |
| 폴더 순서 변경 시 동시성 충돌 | Low | Low | sortOrder를 배열 인덱스 기반으로 일괄 업데이트 (단일 트랜잭션) |
| HTML5 DnD API 모바일 미지원 | Medium | High | 터치 디바이스에서는 "폴더에 추가" 컨텍스트 메뉴 대안 제공 |
| tenant 스코핑 누락으로 데이터 노출 | High | Low | 모든 쿼리에 `.where(eq(archiveFolders.tenantId, tenantId))` 패턴 강제 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-02-10 | Initial draft — 보관함 폴더 CRUD 구현 계획 | Claude |
