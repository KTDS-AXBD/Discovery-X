# Gap Analysis: f22-archive-folders

> **Feature**: f22-archive-folders (보관함 폴더 CRUD + 드래그앤드롭)
> **Date**: 2026-02-10
> **Method**: tmux Agent Teams (Worker 3)
> **Design Doc**: `docs/02-design/features/f22-archive-folders.design.md`

---

## 1. Executive Summary

F22 보관함 폴더 기능은 설계 대비 **높은 수준으로 구현 완료**되었습니다. DB 스키마(2개 테이블, 5개 인덱스, 1개 Enum), API 엔드포인트(8개 메서드), 컴포넌트(ArchiveFolderList CRUD UI + SidebarPanel 통합), 드래그앤드롭(HTML5 네이티브 DnD) 모두 설계 의도대로 동작합니다.

주요 갭은 다음과 같습니다:
1. **마이그레이션 파일명 변경**: 설계상 `0022_archive_folders.sql` → 실제 `0023_archive_folders.sql` (선행 마이그레이션 추가로 번호 밀림, 기능적 영향 없음)
2. ~~**테스트 헬퍼 미등록**~~: ~~`tests/helpers/db.ts`에 `0023_archive_folders.sql` 미등록~~ — **FALSE POSITIVE**: `tests/helpers/db.ts:48`에 이미 등록 확인됨
3. **인증 가드 패턴 차이**: 설계 `requireUser()` vs 실제 `getSessionContext()` + null 체크 (기능적으로 동등, 패턴만 상이)
4. **SidebarPanel props 간소화**: 설계는 folder CRUD 콜백을 props로 전달하나, 실제 구현은 `useFetcher`로 내부 처리 (더 깔끔한 구현)

### Match Rate

| Category | Items | Pass | Fail | Rate |
|----------|-------|------|------|------|
| Schema | 22 | 22 | 0 | 100% |
| API Endpoints | 18 | 17 | 1 | 94% |
| Components | 12 | 11 | 1 | 92% |
| Drag-and-Drop | 7 | 7 | 0 | 100% |
| Business Logic | 9 | 7 | 2 | 78% |
| **Total** | **68** | **64** | **4** | **94%** |

---

## 2. Detailed Findings

### 2.1 Schema

#### 2.1.1 `archive_folders` 테이블

| # | Design Requirement | Status | Evidence | Notes |
|---|-------------------|--------|----------|-------|
| 1 | `id` text PK `crypto.randomUUID()` | PASS | `app/features/archive/db/schema.ts:25` | 정확히 일치 |
| 2 | `tenant_id` text NOT NULL FK → tenants | PASS | `schema.ts:26` | `.references(() => tenants.id)` |
| 3 | `name` text NOT NULL | PASS | `schema.ts:27` | |
| 4 | `icon` text DEFAULT 'folder' | PASS | `schema.ts:28` | `.default("folder")` |
| 5 | `sort_order` integer NOT NULL DEFAULT 0 | PASS | `schema.ts:29` | |
| 6 | `created_by` text NOT NULL FK → users | PASS | `schema.ts:30` | `.references(() => users.id)` |
| 7 | `created_at` integer timestamp NOT NULL DEFAULT unixepoch() | PASS | `schema.ts:31` | mode: "timestamp" + sql 패턴 준수 |
| 8 | `updated_at` integer timestamp NOT NULL DEFAULT unixepoch() | PASS | `schema.ts:32` | 동일 |
| 9 | `idx_archive_folders_tenant` ON (tenant_id) | PASS | `schema.ts:35` | |
| 10 | `idx_archive_folders_tenant_order` ON (tenant_id, sort_order) | PASS | `schema.ts:36` | |

#### 2.1.2 `archive_folder_items` 테이블

| # | Design Requirement | Status | Evidence | Notes |
|---|-------------------|--------|----------|-------|
| 11 | `id` text PK `crypto.randomUUID()` | PASS | `schema.ts:47` | |
| 12 | `folder_id` text NOT NULL FK → archive_folders ON DELETE CASCADE | PASS | `schema.ts:48` | `{ onDelete: "cascade" }` 확인 |
| 13 | `item_type` text NOT NULL | PASS | `schema.ts:49` | |
| 14 | `item_id` text NOT NULL | PASS | `schema.ts:50` | |
| 15 | `added_by` text NOT NULL FK → users | PASS | `schema.ts:51` | |
| 16 | `added_at` integer timestamp NOT NULL DEFAULT unixepoch() | PASS | `schema.ts:52` | |
| 17 | `idx_folder_items_folder` ON (folder_id) | PASS | `schema.ts:55` | |
| 18 | `idx_folder_items_type_id` ON (item_type, item_id) | PASS | `schema.ts:56` | |
| 19 | `uniq_folder_items` UNIQUE ON (folder_id, item_type, item_id) | PASS | `schema.ts:57` | uniqueIndex 사용 |

#### 2.1.3 Enum / Schema Merge / Migration

| # | Design Requirement | Status | Evidence | Notes |
|---|-------------------|--------|----------|-------|
| 20 | `FolderItemType` enum (discovery, radar_item, conversation, proposal) | PASS | `schema.ts:9-14` | 4개 값 정확히 일치 |
| 21 | `app/db/index.ts` archiveSchema spread merge + re-export | PASS | `app/db/index.ts:5,7,18` | import, spread, re-export 모두 확인 |
| 22 | Migration SQL: 2 tables + 5 indexes | PASS | `drizzle/0023_archive_folders.sql:1-26` | 파일명만 0022→0023 변경 (번호 충돌 회피) |

### 2.2 API Endpoints

| # | Design Requirement | Status | Evidence | Notes |
|---|-------------------|--------|----------|-------|
| 1 | `GET /api/folders` — 폴더 목록 + 아이템 카운트 | PASS | `api.folders.ts:8-44` | LEFT JOIN subquery + coalesce 패턴, ORDER BY sort_order ASC, created_at ASC |
| 2 | `GET /api/folders` — tenantId 스코핑 | PASS | `api.folders.ts:40` | `.where(eq(archiveFolders.tenantId, ctx.tenantId))` |
| 3 | `POST /api/folders` — 폴더 생성, name 검증 1~20자 | PASS | `api.folders.ts:46-88` | name trim + length 체크, 201 응답 |
| 4 | `POST /api/folders` — sortOrder 자동 결정 (MAX+1) | PASS | `api.folders.ts:69-75` | `max(archiveFolders.sortOrder)` + 1 |
| 5 | `PATCH /api/folders/:id` — 이름/아이콘 수정, tenantId 스코핑 | PASS | `api.folders.$id.ts:19-42` | `where(and(eq(id), eq(tenantId)))`, updatedAt 갱신 |
| 6 | `PATCH /api/folders/:id` — 404 응답 (없거나 다른 테넌트) | PASS | `api.folders.$id.ts:37-39` | `result.length === 0` → 404 |
| 7 | `DELETE /api/folders/:id` — CASCADE 삭제, tenantId 스코핑 | PASS | `api.folders.$id.ts:44-55` | `where(and(eq(id), eq(tenantId)))` |
| 8 | `PATCH /api/folders/reorder` — 순서 일괄 변경, tenantId per item | PASS | `api.folders.reorder.ts:8-36` | `db.batch()` 트랜잭션, 각 항목 tenantId 조건 |
| 9 | `PATCH /api/folders/reorder` — orderedIds 배열 검증 | PASS | `api.folders.reorder.ts:23-25` | `Array.isArray + length > 0` |
| 10 | `GET /api/folders/:id/items` — 아이템 목록, 폴더 소유권 확인 | PASS | `api.folders.$id.items.ts:24-46` | `verifyFolderOwnership()` + orderBy desc addedAt |
| 11 | `POST /api/folders/:id/items` — 아이템 추가, itemType 검증 | PASS | `api.folders.$id.items.ts:63-94` | `VALID_ITEM_TYPES.has()` + 201 응답 |
| 12 | `POST /api/folders/:id/items` — UNIQUE 위반 → 409 Conflict | PASS | `api.folders.$id.items.ts:89-92` | `UNIQUE constraint failed` catch → 409 |
| 13 | `DELETE /api/folders/:id/items` — 아이템 제거, 폴더 소유권 확인 | PASS | `api.folders.$id.items.ts:97-115` | `verifyFolderOwnership()` 호출 |
| 14 | 모든 엔드포인트 인증 체크 (401 응답) | PASS | 전 파일 `getSessionContext` + null → 401 | 설계 `requireUser()` vs 실제 `getSessionContext()` — 기능 동등 |
| 15 | `GET /api/folders` — 응답 형식 `{ folders: [...] }` | PASS | `api.folders.ts:43` | `json({ folders })` |
| 16 | `POST /api/folders` — 응답 형식 `{ folder: ... }`, 201 | PASS | `api.folders.ts:87` | `json({ folder }, { status: 201 })` |
| 17 | `DELETE /api/folders/:id` — 응답 형식 `{ success: true }` | PASS | `api.folders.$id.ts:54` | |
| 18 | `DELETE /api/folders/:id/items` — itemType/itemId 검증 | FAIL | `api.folders.$id.items.ts:100-101` | 검증은 있으나, **itemType enum 검증 없음** (POST에만 적용). 설계에는 명시 안 됨이지만 일관성 측면 Minor |

### 2.3 Components

| # | Design Requirement | Status | Evidence | Notes |
|---|-------------------|--------|----------|-------|
| 1 | `DEFAULT_FOLDERS` 상수 제거 | PASS | `ArchiveFolderList.tsx` 전체 | grep 결과 0건 |
| 2 | `ArchiveFolderListProps` — folders, activeFolderId, onCreateFolder, onRenameFolder, onDeleteFolder, onDropItem, onSelectFolder | PASS | `ArchiveFolderList.tsx:12-20` | 설계와 정확히 동일한 7개 props |
| 3 | 폴더 생성 — 인라인 텍스트 입력, Enter/Escape 처리 | PASS | `ArchiveFolderList.tsx:169-197` | autoFocus(ref), Enter→create, Escape→cancel, 빈값 방지 |
| 4 | 폴더 인라인 편집 — 더블클릭 → 텍스트 입력 | PASS | `ArchiveFolderList.tsx:136,116-127` | onDoubleClick→setEditingId, Enter/Escape/Blur 처리 |
| 5 | 폴더 삭제 — 인라인 확인 (삭제?/확인/취소) | PASS | `ArchiveFolderList.tsx:97-115` | pendingDeleteId 패턴, 확인/취소 버튼 |
| 6 | 아이템 카운트 배지 (10px text) | PASS | `ArchiveFolderList.tsx:149-151` | `text-[10px]`, `folder.itemCount > 0` 조건부 표시 |
| 7 | SidebarPanel — ArchiveFolderList 통합 | PASS | `SidebarPanel.tsx:179-187` | 7개 props 모두 전달 |
| 8 | SidebarPanel — folders props 수신 | PASS | `SidebarPanel.tsx:25,60` | `folders?: ArchiveFolder[]`, default `[]` |
| 9 | SidebarPanel — useFetcher 기반 folder CRUD 핸들러 | PASS | `SidebarPanel.tsx:69-98` | create/rename/delete/dropItem 4개 핸들러 |
| 10 | SidebarPanel — activeFolderId 상태 관리 | PASS | `SidebarPanel.tsx:67` | `useState<string \| undefined>()` |
| 11 | 디자인 토큰 사용 (Axis 토큰 기반) | PASS | `ArchiveFolderList.tsx` 전체 | `--axis-surface-*`, `--axis-text-*`, `--axis-border-*`, `--axis-button-destructive-*` |
| 12 | SidebarPanel — onCreateFolder/onRenameFolder/onDeleteFolder/onDropItem/onSelectFolder props 인터페이스 | FAIL | `SidebarPanel.tsx:17-26` | 설계는 이들을 SidebarPanelProps에 포함하나 실제로는 내부 useFetcher로 처리. **folders만 props**로 수신. 기능적으로 문제 없음 (오히려 더 깔끔한 구현) |

### 2.4 Drag-and-Drop

| # | Design Requirement | Status | Evidence | Notes |
|---|-------------------|--------|----------|-------|
| 1 | HTML5 네이티브 DnD API (외부 라이브러리 없음) | PASS | `ArchiveFolderList.tsx`, `SidebarPanel.tsx` | 추가 import 없음, 네이티브 이벤트만 사용 |
| 2 | 대화 항목 `draggable="true"` | PASS | `SidebarPanel.tsx:205` | |
| 3 | `onDragStart` — `application/json` + `{ itemType: "conversation", itemId }` | PASS | `SidebarPanel.tsx:206-211` | `setData("application/json", JSON.stringify({...}))`, `effectAllowed = "move"` |
| 4 | 폴더 `onDragOver` — preventDefault + dropEffect "move" + 하이라이트 | PASS | `ArchiveFolderList.tsx:137-141` | `setDragOverId(folder.id)` |
| 5 | 폴더 `onDragLeave` — 하이라이트 해제 | PASS | `ArchiveFolderList.tsx:142` | `setDragOverId(null)` |
| 6 | 폴더 `onDrop` — JSON 파싱 + `onDropItem` 호출 | PASS | `ArchiveFolderList.tsx:63-74,143` | try/catch로 invalid data 방어 |
| 7 | 드래그 오버 시각 피드백 — `bg-[var(--axis-surface-brand)] ring-1 ring-[var(--axis-border-brand)]` | PASS | `ArchiveFolderList.tsx:133` | `dragOverId === folder.id && "bg-[...] ring-1 ring-[...]"` |

### 2.5 Business Logic

| # | Design Requirement | Status | Evidence | Notes |
|---|-------------------|--------|----------|-------|
| 1 | Tenant 스코핑 — 모든 쿼리에 tenantId 조건 | PASS | 전 API 파일 | GET list, POST create, PATCH update, DELETE, reorder, items 모두 확인 |
| 2 | Cascade 삭제 — 폴더 삭제 시 items만 삭제, 원본 미영향 | PASS | `schema.ts:48` + `api.folders.$id.ts:44-55` | `onDelete: "cascade"` FK, DELETE WHERE id AND tenant_id |
| 3 | Feature Module 패턴 — `app/features/archive/db/schema.ts` 독립 | PASS | 디렉토리 구조 | Proposals 모듈과 동일 패턴 |
| 4 | Schema Merge — `{ ...schema, ...ventureSchema, ...proposalSchema, ...archiveSchema }` | PASS | `app/db/index.ts:7` | |
| 5 | 폴더 생성 시 sortOrder 자동 결정 (MAX+1) | PASS | `api.folders.ts:69-75` | `(maxOrder?.val ?? -1) + 1` |
| 6 | 아이템 중복 방지 (UNIQUE index + 409 응답) | PASS | `schema.ts:57` + `api.folders.$id.items.ts:89-92` | |
| 7 | 폴더 이름 검증 1~20자 | PASS | `api.folders.ts:62-67`, `api.folders.$id.ts:23-25` | create + update 모두 검증 |
| 8 | 마이그레이션 파일 존재 | PASS | `drizzle/0023_archive_folders.sql` | 설계 0022 → 실제 0023 (번호 밀림) |
| 9 | `tests/helpers/db.ts` 마이그레이션 등록 | **FAIL** | `tests/helpers/db.ts:47` | 0022_ideas_memo.sql까지만 등록. **0023_archive_folders.sql 미등록** — 테스트 환경에서 archive 테이블 미생성 |

---

## 3. Gaps Found

### GAP-1: 테스트 헬퍼 마이그레이션 미등록 (Severity: **Critical**)

- **설계**: `tests/helpers/db.ts`에 `0022_archive_folders.sql` (실제로는 0023) 등록 필수
- **실제**: `0022_ideas_memo.sql`까지만 등록되어 있고 `0023_archive_folders.sql` 누락
- **영향**: 테스트 환경에서 `archive_folders`, `archive_folder_items` 테이블 미생성 → 관련 통합 테스트 시 "no such table" 에러 발생
- **파일**: `tests/helpers/db.ts:47` 다음 줄에 추가 필요

### GAP-2: SidebarPanelProps 간소화 (Severity: **Minor**)

- **설계**: SidebarPanelProps에 `activeFolderId`, `onCreateFolder`, `onRenameFolder`, `onDeleteFolder`, `onDropItem`, `onSelectFolder` 포함
- **실제**: `folders` 만 props로 수신하고 나머지는 `useFetcher` 기반 내부 핸들러로 처리
- **영향**: 기능적으로 문제 없음. 오히려 SidebarPanel이 folder API 호출을 내부적으로 관리하므로 부모 컴포넌트의 부담이 줄어드는 **개선된 구현**. 다만 설계-구현 불일치.

### GAP-3: DELETE items 엔드포인트 itemType enum 미검증 (Severity: **Minor**)

- **설계**: `DELETE /api/folders/:id/items`에서 `itemType`/`itemId` 필수 검증
- **실제**: 존재 여부 체크는 하지만 `itemType`이 `FolderItemType` enum 내 유효한 값인지 검증하지 않음 (POST에만 적용)
- **영향**: 잘못된 itemType으로 DELETE 시도 시 매칭 안 되어 무해하게 종료 (데이터 무결성 영향 없음). 일관성 측면에서 Minor.

### GAP-4: 마이그레이션 파일명 변경 (Severity: **Info**)

- **설계**: `drizzle/0022_archive_folders.sql`
- **실제**: `drizzle/0023_archive_folders.sql` (선행 `0022_ideas_memo.sql` 추가로 번호 밀림)
- **영향**: 없음. 마이그레이션 순서만 1칸 밀린 것이며, 내용은 설계와 100% 일치.

---

## 4. Recommendations

### 즉시 조치 (Critical)

1. **테스트 헬퍼 마이그레이션 등록**: `tests/helpers/db.ts`에 다음 줄 추가
   ```typescript
   runMigrationSQL(sqlite, resolve(migrationsDir, "0023_archive_folders.sql"));
   ```
   위치: 47번 줄 (`0022_ideas_memo.sql`) 다음

### 선택적 개선 (Minor)

2. **DELETE items itemType 검증 추가**: `api.folders.$id.items.ts` DELETE 핸들러에 `VALID_ITEM_TYPES.has(body.itemType)` 체크 추가 (POST와 일관성)

3. **설계 문서 업데이트**: 마이그레이션 파일명을 `0023_archive_folders.sql`로 수정하고, SidebarPanelProps의 실제 구현 패턴(useFetcher 내부 처리)을 반영

### 후속 과제 (Out of Scope)

4. 폴더 클릭 시 아이템 목록 표시 (설계 §5.8) — 현재 `onSelectFolder` 콜백은 `activeFolderId` 상태를 업데이트하지만, 아이템 목록을 대화 목록 영역에 표시하는 UI는 미구현 (설계에서도 Phase 4 이후로 분류)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-02-10 | Initial gap analysis — 68항목 검증, 94% 일치율 | Claude (tmux Agent Teams Worker 3) |
