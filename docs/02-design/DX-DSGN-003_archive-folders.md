---
code: DX-DSGN-003
title: 보관함 폴더 설계
version: 1.0
status: Active
category: DSGN
created: 2026-03-07
updated: 2026-03-07
author: Sinclair Seo
---

# F22: 보관함 폴더 CRUD — 상세 설계

> **Summary**: 하드코딩된 보관함 폴더를 DB 기반 CRUD로 전환하고, Discovery/RadarItem/Conversation/Proposal 등 다양한 엔티티를 폴더에 드래그하여 정리할 수 있는 기능의 상세 설계 문서
>
> **Project**: Discovery-X
> **Version**: v5.1
> **Author**: Claude
> **Date**: 2026-02-10
> **Status**: Draft
> **Planning Doc**: [f22-archive-folders.plan.md](../../01-plan/features/f22-archive-folders.plan.md)

---

## 1. Overview

### 1.1 Design Goals

1. **Feature Module 패턴**: `app/features/archive/db/schema.ts` 독립 디렉토리에 2개 테이블 스키마 정의
2. **DB 기반 CRUD**: 하드코딩된 `DEFAULT_FOLDERS` 상수를 제거하고, 사용자가 자유롭게 폴더 생성·수정·삭제
3. **다형성 아이템 분류**: `itemType` + `itemId` 패턴으로 Discovery, RadarItem, Conversation, Proposal 등 이기종 엔티티를 단일 폴더에 분류
4. **드래그앤드롭**: HTML5 네이티브 DnD API로 사이드바 대화 항목을 폴더에 드래그하여 분류
5. **기존 인프라 재사용**: AppShell 레이아웃, Axis 디자인 토큰, 인증 시스템, SidebarPanel 구조

### 1.2 Design Principles

- **Feature Module 격리**: Core 테이블과 분리된 독립 스키마 (`archiveSchema` 스프레드 머지)
- **Cascade 삭제**: `archive_folder_items`가 `archive_folders`에 `onDelete: "cascade"` — 폴더 삭제 시 연결만 해제 (원본 엔티티 미영향)
- **Tenant 스코핑**: 모든 쿼리에 `tenantId` 조건 강제 — 교차 테넌트 접근 원천 차단
- **최소 외부 의존성**: 드래그앤드롭에 HTML5 네이티브 API 사용 (라이브러리 추가 없음)
- **Remix 데이터 패턴**: 폴더 CRUD는 `useFetcher` 기반 비동기 호출

### 1.3 Architecture Decision Record

**결정**: Feature Module(`app/features/archive/`) 패턴 선택

| 기준 | Core Extension | Feature Module (선택) |
|------|---------------|---------------------|
| 테이블 전략 | 기존 테이블 ADD COLUMN | 신규 2개 테이블 생성 |
| 코드 격리 | 낮음 (core schema 수정) | 높음 (독립 디렉토리) |
| Core 영향 | ADD COLUMN | 없음 (스프레드 머지만) |
| 향후 확장 | 리팩토링 필요 | 모듈 단위 확장 용이 |
| 네임스페이스 | core 충돌 가능 | `archive_` 프리픽스로 분리 |

**근거**: 보관함 폴더는 기존 Discovery/Radar 엔티티와 직접 관련 없는 독립 정리 도구. 신규 2개 테이블 생성이므로 Proposals 모듈과 동일한 Feature Module 패턴이 적합. `app/features/proposals/db/schema.ts`의 구조를 그대로 따른다.

---

## 2. Architecture

### 2.1 시스템 아키텍처

```
┌─ Discovery-X v5.1 ─────────────────────────────────────────────────────┐
│                                                                         │
│  ┌─ SidebarPanel (기존 수정) ───────────────────────────────────────┐   │
│  │                                                                   │   │
│  │  ┌──────────────────────────────────────────────────────────┐     │   │
│  │  │  ArchiveFolderList (DB 연동)                              │     │   │
│  │  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐       │     │   │
│  │  │  │ 중요 (3) │ │리서치 (1)│ │ 완료 (5) │ │+ 폴더추가│       │     │   │
│  │  │  └─────────┘ └─────────┘ └─────────┘ └──────────┘       │     │   │
│  │  │  [드래그 타겟: onDragOver + onDrop]                       │     │   │
│  │  └──────────────────────────────────────────────────────────┘     │   │
│  │                                                                   │   │
│  │  ┌──────────────────────────────────────────────────────────┐     │   │
│  │  │  Conversation List (기존)                                 │     │   │
│  │  │  [draggable="true": dataTransfer → { itemType, itemId }] │     │   │
│  │  └──────────────────────────────────────────────────────────┘     │   │
│  └───────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─ API Endpoints (신규) ───────────────────────────────────────────┐   │
│  │  api.folders.ts           → GET (목록+카운트) / POST (생성)      │   │
│  │  api.folders.$id.ts       → PATCH (수정) / DELETE (삭제)         │   │
│  │  api.folders.$id.items.ts → GET (아이템 목록) / POST (추가)      │   │
│  │                              / DELETE (제거)                      │   │
│  │  api.folders.reorder.ts   → PATCH (순서 변경)                    │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─ Feature Module ─────────────────────────────────────────────────┐   │
│  │  app/features/archive/db/schema.ts                               │   │
│  │  → 2개 테이블 + 1개 Enum + 0개 Relations                         │   │
│  │  → app/db/index.ts에서 스프레드 머지                               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─ Cloudflare D1 (SQLite) ─────────────────────────────────────────┐   │
│  │  archive_folders, archive_folder_items                            │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Schema Merge 패턴

```typescript
// app/db/index.ts (수정)
import * as schema from "./schema";                              // Core (44 tables)
import * as ventureSchema from "~/features/venture/db/schema";   // Venture (16 tables)
import * as proposalSchema from "~/features/proposals/db/schema"; // Proposals (6 tables)
import * as archiveSchema from "~/features/archive/db/schema";    // Archive (2 tables) ← 추가

const allSchema = { ...schema, ...ventureSchema, ...proposalSchema, ...archiveSchema };
```

- 네임스페이스 충돌 방지: Venture는 `vd_` 프리픽스, Proposals는 `proposal_` 프리픽스, Archive는 `archive_` 프리픽스
- 모든 테이블이 단일 `getDb()` 인스턴스로 접근 가능

### 2.3 Data Flow

```
사용자 → "폴더 추가" 클릭 → 인라인 텍스트 입력 → Enter
  → POST /api/folders { name } → INSERT archive_folders
  → useFetcher revalidation → 폴더 목록 갱신

사용자 → 대화 항목 드래그 → 폴더에 드롭
  → POST /api/folders/:id/items { itemType: "conversation", itemId: "conv-uuid" }
  → INSERT archive_folder_items (UNIQUE 제약 → 중복 방지)
  → useFetcher revalidation → 폴더 아이템 카운트 갱신

사용자 → 폴더 삭제 → 확인 다이얼로그
  → DELETE /api/folders/:id → DELETE archive_folders (CASCADE → items 자동 삭제)
  → 원본 엔티티(Discovery, Conversation 등)는 영향 없음
```

### 2.4 파일 구조 (변경분)

```
app/
├── features/
│   └── archive/
│       └── db/
│           └── schema.ts          ← Drizzle 스키마 (archiveFolders, archiveFolderItems) [신규]
├── routes/
│   ├── api.folders.ts             ← 폴더 CRUD API (GET 목록/POST 생성) [신규]
│   ├── api.folders.$id.ts         ← 폴더 단건 API (PATCH 수정/DELETE 삭제) [신규]
│   ├── api.folders.$id.items.ts   ← 폴더 아이템 API (GET/POST/DELETE) [신규]
│   └── api.folders.reorder.ts     ← 폴더 순서 변경 API (PATCH) [신규]
├── components/layout/
│   ├── ArchiveFolderList.tsx      ← DB 연동, 하드코딩 제거, CRUD UI, 드래그 타겟 [수정]
│   └── SidebarPanel.tsx           ← folders 데이터 props 전달, draggable 속성 [수정]
├── db/
│   └── index.ts                   ← archiveSchema 머지 + re-export [수정]
drizzle/
│   └── 0022_archive_folders.sql   ← D1 마이그레이션 SQL [신규]
tests/
│   └── helpers/
│       └── db.ts                  ← 0022 마이그레이션 파일 경로 추가 [수정]
```

---

## 3. Data Model

### 3.1 설계 원칙

- **Feature Module 독립**: `app/features/archive/db/schema.ts`에서 정의, core schema와 스프레드 머지
- **D1/SQLite 호환**: `integer("field", { mode: "timestamp" })` + `` sql`(unixepoch())` `` 패턴 준수
- **UUID PK**: `text("id").primaryKey().$defaultFn(() => crypto.randomUUID())` — 기존 패턴 동일
- **다형성 참조**: `itemType` + `itemId`로 이기종 엔티티 통합 참조 (FK 없음, 앱 레벨 검증)
- **JSON 컬럼 없음**: 단순 구조이므로 JSON 직렬화 불필요

### 3.2 테이블 요약

| # | 테이블 | 역할 | PK | 행 규모 |
|---|--------|------|-----|---------|
| 1 | `archive_folders` | 폴더 메인 엔티티 | UUID text | 테넌트당 수십 |
| 2 | `archive_folder_items` | 폴더-아이템 연결 (M:N) | UUID text | 폴더당 다수 |

### 3.3 Enum 정의

```typescript
export const FolderItemType = {
  DISCOVERY: "discovery",
  RADAR_ITEM: "radar_item",
  CONVERSATION: "conversation",
  PROPOSAL: "proposal",
} as const;

export type FolderItemTypeValue = typeof FolderItemType[keyof typeof FolderItemType];
```

### 3.4 테이블 상세

#### `archive_folders` (폴더 메인 엔티티)

| 컬럼 | SQLite 타입 | Drizzle 모드 | Nullable | Default | 비고 |
|------|------------|-------------|----------|---------|------|
| `id` | text | string | NO | `crypto.randomUUID()` | PK |
| `tenant_id` | text | string | NO | — | FK → tenants, no action |
| `name` | text | string | NO | — | 폴더 이름 (최대 20자, 앱 레벨 검증) |
| `icon` | text | string | YES | `'folder'` | 아이콘 식별자 (향후 확장용) |
| `sort_order` | integer | number | NO | `0` | 정렬 순서 |
| `created_by` | text | string | NO | — | FK → users, no action |
| `created_at` | integer | timestamp | NO | `(unixepoch())` | 생성일시 |
| `updated_at` | integer | timestamp | NO | `(unixepoch())` | 수정일시 |

**인덱스**:
- `idx_archive_folders_tenant` ON (`tenant_id`) — 테넌트별 조회
- `idx_archive_folders_tenant_order` ON (`tenant_id`, `sort_order`) — 정렬된 목록 조회

#### `archive_folder_items` (폴더-아이템 연결)

| 컬럼 | SQLite 타입 | Drizzle 모드 | Nullable | Default | 비고 |
|------|------------|-------------|----------|---------|------|
| `id` | text | string | NO | `crypto.randomUUID()` | PK |
| `folder_id` | text | string | NO | — | FK → archive_folders, **cascade** |
| `item_type` | text | string | NO | — | `FolderItemType` enum 값 |
| `item_id` | text | string | NO | — | 대상 엔티티 ID (다형성 참조) |
| `added_by` | text | string | NO | — | FK → users, no action |
| `added_at` | integer | timestamp | NO | `(unixepoch())` | 추가일시 |

**인덱스**:
- `idx_folder_items_folder` ON (`folder_id`) — 폴더별 아이템 조회
- `idx_folder_items_type_id` ON (`item_type`, `item_id`) — 특정 아이템이 속한 폴더 역조회
- `uniq_folder_items` UNIQUE ON (`folder_id`, `item_type`, `item_id`) — 중복 방지

### 3.5 Entity-Relationship 다이어그램

```
┌──────────┐       ┌──────────────────────┐       ┌──────────┐
│ tenants  │◄─────┤   archive_folders    ├──────►│  users   │
│          │  1:N  │                      │  N:1   │          │
└──────────┘       │ tenant_id (FK)       │(createdBy)└────────┘
                   │ created_by (FK)──────┘
                   └──────────┬───────────┘
                              │ 1:N (CASCADE)
                              ▼
                   ┌──────────────────────┐
                   │ archive_folder_items │
                   │                      │
                   │ folder_id (FK) ──────┘
                   │ item_type ─┐
                   │ item_id   ─┤  (다형성 참조, FK 없음)
                   │ added_by ──┘→ users.id
                   └──────────────────────┘
                              │ 다형성 참조
              ┌───────────────┼───────────────┬─────────────┐
              ▼               ▼               ▼             ▼
        [discoveries]   [radar_items]   [conversations]  [proposals]
```

### 3.6 Cascade 삭제 체인

```
archive_folders (DELETE)
  → archive_folder_items (CASCADE) — 연결 레코드만 삭제
  → 원본 엔티티(discoveries, radar_items 등)는 영향 없음
```

**중요**: 폴더 삭제는 "연결 해제"만 수행합니다. 원본 Discovery, Conversation 등은 절대 삭제되지 않습니다.

### 3.7 Drizzle 스키마 코드

**파일**: `app/features/archive/db/schema.ts`

```typescript
import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { users, tenants } from "~/db/schema";

// ============================================================================
// ARCHIVE FOLDER ENUMS
// ============================================================================

export const FolderItemType = {
  DISCOVERY: "discovery",
  RADAR_ITEM: "radar_item",
  CONVERSATION: "conversation",
  PROPOSAL: "proposal",
} as const;

export type FolderItemTypeValue = typeof FolderItemType[keyof typeof FolderItemType];

// ============================================================================
// ARCHIVE FOLDERS TABLE
// ============================================================================

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

// ============================================================================
// ARCHIVE FOLDER ITEMS TABLE
// ============================================================================

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

### 3.8 마이그레이션 SQL

**파일**: `drizzle/0022_archive_folders.sql`

```sql
-- F22: Archive Folders — 보관함 폴더 CRUD
-- 2개 테이블 + 5개 인덱스

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
--> statement-breakpoint
CREATE TABLE `archive_folder_items` (
  `id` text PRIMARY KEY NOT NULL,
  `folder_id` text NOT NULL REFERENCES `archive_folders`(`id`) ON DELETE CASCADE,
  `item_type` text NOT NULL,
  `item_id` text NOT NULL,
  `added_by` text NOT NULL REFERENCES `users`(`id`),
  `added_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX `idx_archive_folders_tenant` ON `archive_folders` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_archive_folders_tenant_order` ON `archive_folders` (`tenant_id`, `sort_order`);
--> statement-breakpoint
CREATE INDEX `idx_folder_items_folder` ON `archive_folder_items` (`folder_id`);
--> statement-breakpoint
CREATE INDEX `idx_folder_items_type_id` ON `archive_folder_items` (`item_type`, `item_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uniq_folder_items` ON `archive_folder_items` (`folder_id`, `item_type`, `item_id`);
```

**중요**: `--> statement-breakpoint`는 Drizzle 마이그레이션 표준 구분자로, `tests/helpers/db.ts`의 `runMigrationSQL` 함수가 이를 기준으로 SQL 문을 분리 실행합니다.

### 3.9 테스트 헬퍼 업데이트

**파일**: `tests/helpers/db.ts` — 기존 마이그레이션 목록 끝에 추가:

```typescript
// 기존 (0021까지)
runMigrationSQL(sqlite, resolve(migrationsDir, "0021_proposals.sql"));
// 추가
runMigrationSQL(sqlite, resolve(migrationsDir, "0022_archive_folders.sql"));
```

### 3.10 app/db/index.ts 업데이트

```typescript
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";
import * as ventureSchema from "~/features/venture/db/schema";
import * as proposalSchema from "~/features/proposals/db/schema";
import * as archiveSchema from "~/features/archive/db/schema";      // ← 추가

const allSchema = { ...schema, ...ventureSchema, ...proposalSchema, ...archiveSchema };

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema: allSchema });
}

export type DB = ReturnType<typeof getDb>;

export * from "./schema";
export * from "~/features/venture/db/schema";
export * from "~/features/proposals/db/schema";
export * from "~/features/archive/db/schema";                        // ← 추가
```

---

## 4. API Design

### 4.1 엔드포인트 목록

| Method | Path | 기능 | 인증 | 테넌트 격리 | 구현 파일 |
|--------|------|------|------|------------|----------|
| GET | `/api/folders` | 폴더 목록 (+ 아이템 카운트) | `requireUser()` | YES | `api.folders.ts` |
| POST | `/api/folders` | 폴더 생성 | `requireUser()` | YES | `api.folders.ts` |
| PATCH | `/api/folders/:id` | 폴더 이름/아이콘 수정 | `requireUser()` | YES | `api.folders.$id.ts` |
| DELETE | `/api/folders/:id` | 폴더 삭제 (CASCADE) | `requireUser()` | YES | `api.folders.$id.ts` |
| PATCH | `/api/folders/reorder` | 폴더 순서 변경 | `requireUser()` | YES | `api.folders.reorder.ts` |
| GET | `/api/folders/:id/items` | 폴더 아이템 목록 | `requireUser()` | YES | `api.folders.$id.items.ts` |
| POST | `/api/folders/:id/items` | 아이템 추가 | `requireUser()` | YES | `api.folders.$id.items.ts` |
| DELETE | `/api/folders/:id/items` | 아이템 제거 | `requireUser()` | YES | `api.folders.$id.items.ts` |

**보안**: 모든 엔드포인트에 `requireUser()` + `tenantId` 스코핑 적용. Proposals 모듈에서 발견된 교차 테넌트 갭(GAP-1~4)을 반면교사로 삼아, 단건 조회/수정/삭제 시에도 반드시 `AND tenant_id = ?` 조건을 포함합니다.

### 4.2 `GET /api/folders` — 폴더 목록 조회

**Purpose**: 현재 테넌트의 모든 폴더를 아이템 카운트와 함께 조회

**Request**: 없음 (세션에서 tenantId 추출)

**Response (200)**:
```json
{
  "folders": [
    {
      "id": "folder-uuid-1",
      "tenantId": "tenant-uuid",
      "name": "중요",
      "icon": "folder",
      "sortOrder": 0,
      "createdBy": "user-uuid",
      "createdAt": "2026-02-10T00:00:00.000Z",
      "updatedAt": "2026-02-10T00:00:00.000Z",
      "itemCount": 3
    }
  ]
}
```

**쿼리 로직**:
```sql
SELECT af.*, COUNT(afi.id) as item_count
FROM archive_folders af
LEFT JOIN archive_folder_items afi ON af.id = afi.folder_id
WHERE af.tenant_id = ?
GROUP BY af.id
ORDER BY af.sort_order ASC, af.created_at ASC
```

### 4.3 `POST /api/folders` — 폴더 생성

**Purpose**: 새 폴더 생성

**Request (JSON)**:
```json
{
  "name": "리서치 메모"
}
```

**Validation**:
- `name`: 필수, 1~20자, 공백 트림

**Response (201)**:
```json
{
  "folder": {
    "id": "folder-uuid-new",
    "tenantId": "tenant-uuid",
    "name": "리서치 메모",
    "icon": "folder",
    "sortOrder": 3,
    "createdBy": "user-uuid",
    "createdAt": "2026-02-10T12:00:00.000Z",
    "updatedAt": "2026-02-10T12:00:00.000Z"
  }
}
```

**로직**:
1. `name` 검증 (1~20자)
2. 현재 테넌트의 최대 `sortOrder` 조회 → `+1`로 새 sortOrder 결정
3. INSERT `archive_folders`
4. 생성된 폴더 반환

**에러**:
| Code | Cause |
|------|-------|
| 400 | name 누락 또는 20자 초과 |
| 401 | 미인증 |

### 4.4 `PATCH /api/folders/:id` — 폴더 수정

**Purpose**: 폴더 이름 또는 아이콘 수정

**Request (JSON)**:
```json
{
  "name": "중요 자료",
  "icon": "star"
}
```

**Validation**:
- `name`: 선택, 제공 시 1~20자
- `icon`: 선택, 문자열

**Response (200)**:
```json
{
  "folder": {
    "id": "folder-uuid",
    "name": "중요 자료",
    "icon": "star",
    "updatedAt": "2026-02-10T13:00:00.000Z"
  }
}
```

**로직**:
1. `params.id` + `tenantId`로 폴더 존재 확인
2. 제공된 필드만 UPDATE + `updatedAt = unixepoch()`
3. 수정된 폴더 반환

**에러**:
| Code | Cause |
|------|-------|
| 400 | name 20자 초과 |
| 404 | 폴더 없음 또는 다른 테넌트 |

### 4.5 `DELETE /api/folders/:id` — 폴더 삭제

**Purpose**: 폴더 삭제 (CASCADE로 아이템 연결 자동 해제)

**Request**: 없음

**Response (200)**:
```json
{ "success": true }
```

**로직**:
1. `params.id` + `tenantId`로 폴더 존재 확인
2. DELETE `archive_folders` WHERE `id = ? AND tenant_id = ?`
3. CASCADE → `archive_folder_items` 자동 삭제

**에러**:
| Code | Cause |
|------|-------|
| 404 | 폴더 없음 또는 다른 테넌트 |

### 4.6 `PATCH /api/folders/reorder` — 폴더 순서 변경

**Purpose**: 폴더 목록의 순서 일괄 변경

**Request (JSON)**:
```json
{
  "orderedIds": ["folder-uuid-3", "folder-uuid-1", "folder-uuid-2"]
}
```

**Response (200)**:
```json
{ "success": true }
```

**로직**:
1. `orderedIds` 배열 검증 (비어있지 않은 문자열 배열)
2. 단일 트랜잭션 내에서 각 폴더의 `sortOrder`를 배열 인덱스로 UPDATE
3. WHERE 조건에 `tenant_id = ?` 포함 (교차 테넌트 방지)

```sql
-- 트랜잭션 내 순차 실행
UPDATE archive_folders SET sort_order = 0 WHERE id = ? AND tenant_id = ?;
UPDATE archive_folders SET sort_order = 1 WHERE id = ? AND tenant_id = ?;
UPDATE archive_folders SET sort_order = 2 WHERE id = ? AND tenant_id = ?;
```

### 4.7 `GET /api/folders/:id/items` — 폴더 아이템 목록

**Purpose**: 특정 폴더의 아이템 목록 조회

**Request**: 없음

**Response (200)**:
```json
{
  "items": [
    {
      "id": "item-uuid",
      "folderId": "folder-uuid",
      "itemType": "conversation",
      "itemId": "conv-uuid",
      "addedBy": "user-uuid",
      "addedAt": "2026-02-10T14:00:00.000Z"
    }
  ]
}
```

**로직**:
1. `params.id` + `tenantId`로 폴더 소유권 확인 (JOIN `archive_folders`)
2. SELECT `archive_folder_items` WHERE `folder_id = ?` ORDER BY `added_at DESC`

### 4.8 `POST /api/folders/:id/items` — 아이템 추가

**Purpose**: 폴더에 아이템 추가

**Request (JSON)**:
```json
{
  "itemType": "conversation",
  "itemId": "conv-uuid"
}
```

**Validation**:
- `itemType`: 필수, `FolderItemType` 값 중 하나
- `itemId`: 필수, 비어있지 않은 문자열

**Response (201)**:
```json
{
  "item": {
    "id": "item-uuid-new",
    "folderId": "folder-uuid",
    "itemType": "conversation",
    "itemId": "conv-uuid",
    "addedBy": "user-uuid",
    "addedAt": "2026-02-10T14:30:00.000Z"
  }
}
```

**로직**:
1. `params.id` + `tenantId`로 폴더 소유권 확인
2. `itemType` 값 검증 (`FolderItemType` enum)
3. INSERT `archive_folder_items`
4. UNIQUE 제약 위반 시 → 409 Conflict

**에러**:
| Code | Cause |
|------|-------|
| 400 | itemType/itemId 누락 또는 잘못된 itemType |
| 404 | 폴더 없음 또는 다른 테넌트 |
| 409 | 이미 해당 폴더에 동일 아이템 존재 |

### 4.9 `DELETE /api/folders/:id/items` — 아이템 제거

**Purpose**: 폴더에서 아이템 연결 해제

**Request (JSON)**:
```json
{
  "itemType": "conversation",
  "itemId": "conv-uuid"
}
```

**Response (200)**:
```json
{ "success": true }
```

**로직**:
1. `params.id` + `tenantId`로 폴더 소유권 확인
2. DELETE `archive_folder_items` WHERE `folder_id = ? AND item_type = ? AND item_id = ?`

---

## 5. UI Design

### 5.1 컴포넌트 구조 변경

```
SidebarPanel.tsx (수정)
├── "새 채팅" 버튼
├── SearchInput
├── ArchiveFolderList (수정 — DB 연동)
│   ├── 폴더 목록 (드래그 타겟)
│   │   ├── FolderItem × N (onDragOver + onDrop)
│   │   └── 폴더 아이템 카운트 배지
│   ├── "폴더 추가" 버튼 → 인라인 텍스트 입력
│   └── 폴더 컨텍스트 메뉴 (이름 변경, 삭제)
├── 채팅 히스토리 라벨
└── Conversation List (수정 — draggable 추가)
    └── ConversationItem × N (draggable="true")
```

### 5.2 ArchiveFolderList 리팩토링

**현재 상태** (`ArchiveFolderList.tsx:10-14`):
```typescript
const DEFAULT_FOLDERS: Folder[] = [
  { id: "starred", name: "중요", count: 0 },
  { id: "research", name: "리서치", count: 0 },
  { id: "archive", name: "완료", count: 0 },
];
```

**리팩토링 후 Props**:

```typescript
interface ArchiveFolder {
  id: string;
  name: string;
  icon: string;
  sortOrder: number;
  itemCount: number;
}

interface ArchiveFolderListProps {
  folders: ArchiveFolder[];
  activeFolderId?: string;
  onCreateFolder: (name: string) => void;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onDropItem: (folderId: string, itemType: string, itemId: string) => void;
  onSelectFolder?: (id: string) => void;
}
```

**주요 변경사항**:
1. `DEFAULT_FOLDERS` 상수 제거 → props로 `folders` 수신
2. "폴더 추가" 버튼에 onClick 핸들러 연결 → 인라인 텍스트 입력
3. 각 폴더에 드래그 타겟 이벤트 추가 (`onDragOver`, `onDrop`)
4. 폴더 이름 인라인 편집 (더블클릭 → 텍스트 입력 전환)
5. 폴더 삭제 확인 (SidebarPanel의 대화 삭제 UX와 동일 패턴)

### 5.3 폴더 생성 UX

```
[보관함] ▼
  📁 중요 (3)
  📁 리서치 (1)
  📁 완료 (5)
  [+ 폴더 추가] ← 클릭

↓

  📁 중요 (3)
  📁 리서치 (1)
  📁 완료 (5)
  [█ 새 폴더 이름 입력... █] ← 인라인 텍스트 입력 (autofocus)
                               Enter → POST /api/folders
                               Escape → 취소
```

**구현 방식**:
- `useState<boolean>(false)` — 입력 모드 토글
- `<input>` 자동 포커스 (`autoFocus`)
- Enter 키 → `onCreateFolder(name)` 호출 → 입력 모드 해제
- Escape 키 → 입력 모드 해제
- 빈 문자열 제출 방지

### 5.4 폴더 인라인 편집 UX

```
  📁 중요 (3) ← 더블클릭

↓

  [█ 중요 █] (3) ← 인라인 텍스트 입력
                   Enter → PATCH /api/folders/:id
                   Escape → 취소 (원래 이름 복원)
```

### 5.5 폴더 삭제 UX

```
  📁 중요 (3) [🗑] ← hover 시 삭제 버튼 표시 (기존 대화 삭제와 동일 패턴)

↓ 클릭 시

  [삭제?] [확인] [취소] ← 인라인 확인 (SidebarPanel.tsx:170-188 패턴)
```

### 5.6 드래그앤드롭 구현

#### 드래그 소스 (SidebarPanel — 대화 항목)

```typescript
// SidebarPanel.tsx 대화 항목에 추가
<div
  draggable="true"
  onDragStart={(e) => {
    e.dataTransfer.setData("application/json", JSON.stringify({
      itemType: "conversation",
      itemId: conv.id,
    }));
    e.dataTransfer.effectAllowed = "move";
  }}
  // ... 기존 className, onClick 등
>
```

#### 드래그 타겟 (ArchiveFolderList — 폴더 항목)

```typescript
// ArchiveFolderList.tsx 각 폴더에 추가
const [dragOver, setDragOver] = useState<string | null>(null);

<button
  onDragOver={(e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(folder.id);
  }}
  onDragLeave={() => setDragOver(null)}
  onDrop={(e) => {
    e.preventDefault();
    setDragOver(null);
    try {
      const data = JSON.parse(e.dataTransfer.getData("application/json"));
      if (data.itemType && data.itemId) {
        onDropItem(folder.id, data.itemType, data.itemId);
      }
    } catch { /* invalid data */ }
  }}
  className={cn(
    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 ...",
    dragOver === folder.id && "bg-[var(--axis-surface-brand)] ring-1 ring-[var(--axis-border-brand)]"
  )}
>
```

**시각 피드백**:
- 드래그 중 폴더 위에 올리면: 배경색 변경 + 테두리 하이라이트
- `ring-1 ring-[var(--axis-border-brand)]` — Axis 브랜드 컬러 테두리
- 드래그 영역 벗어나면 즉시 원상 복귀

### 5.7 SidebarPanel props 변경

**현재** (`SidebarPanel.tsx:144`):
```tsx
<ArchiveFolderList />
```

**변경 후**:
```tsx
<ArchiveFolderList
  folders={folders}
  activeFolderId={activeFolderId}
  onCreateFolder={handleCreateFolder}
  onRenameFolder={handleRenameFolder}
  onDeleteFolder={handleDeleteFolder}
  onDropItem={handleDropItem}
  onSelectFolder={handleSelectFolder}
/>
```

**SidebarPanelProps 확장**:
```typescript
interface SidebarPanelProps {
  // ... 기존 props
  folders?: ArchiveFolder[];           // 폴더 목록
  activeFolderId?: string;             // 현재 선택된 폴더
  onCreateFolder?: (name: string) => void;
  onRenameFolder?: (id: string, name: string) => void;
  onDeleteFolder?: (id: string) => void;
  onDropItem?: (folderId: string, itemType: string, itemId: string) => void;
  onSelectFolder?: (id: string) => void;
}
```

### 5.8 폴더 클릭 시 아이템 목록

폴더 클릭 시 해당 폴더의 아이템 목록을 대화 목록 영역에 표시합니다.

```
[보관함] ▼
  📁 중요 (3) ← 클릭 (활성)
  📁 리서치 (1)

──── 중요 폴더 ────
  💬 AI 사업 관련 대화
  🔍 제조업 트렌드
  📋 시장 분석 Discovery
──────────────────
```

- `activeFolderId` 상태로 현재 선택된 폴더 추적
- 폴더 선택 시 `GET /api/folders/:id/items`로 아이템 목록 조회
- 아이템 목록에서 아이템 클릭 시 해당 엔티티로 네비게이션
- "전체 채팅" 링크로 폴더 필터 해제

### 5.9 모바일 대응 (HTML5 DnD 미지원)

HTML5 Drag and Drop API는 터치 디바이스에서 지원되지 않습니다.

**대안**: 터치 디바이스에서는 대화 항목의 컨텍스트 메뉴(long-press)에 "폴더에 추가" 옵션을 제공합니다.

```
대화 항목 길게 누르기 →
  ┌──────────────┐
  │ 폴더에 추가 → │ → 폴더 선택 서브메뉴
  │ 대화 삭제     │
  └──────────────┘
```

이 기능은 Phase 4에서 구현하되, 첫 MVP에서는 데스크탑 드래그앤드롭만 지원하고 모바일 지원은 후속 개선으로 분류합니다.

### 5.10 디자인 토큰 사용

| 요소 | Axis 토큰 | 비고 |
|------|-----------|------|
| 폴더 배경 (기본) | `var(--axis-surface-secondary)` | hover 시 |
| 폴더 배경 (드래그 오버) | `var(--axis-surface-brand)` | 드래그 시각 피드백 |
| 폴더 테두리 (드래그 오버) | `var(--axis-border-brand)` | ring-1 |
| 폴더 텍스트 | `var(--axis-text-secondary)` | 기존 패턴 유지 |
| 아이콘 색상 | `var(--axis-text-tertiary)` | 기존 패턴 유지 |
| 카운트 배지 | `var(--axis-text-tertiary)` | 10px 텍스트 |
| 삭제 확인 | `var(--axis-button-destructive-bg-default)` | SidebarPanel 패턴 |

---

## 6. Security Design

### 6.1 인증 매트릭스

| Route/API | 인증 체크 | 실패 응답 | 가드 레벨 |
|-----------|----------|----------|----------|
| `GET /api/folders` | `requireUser()` | JSON 401 / redirect `/login` | User |
| `POST /api/folders` | `requireUser()` | JSON 401 / redirect `/login` | User |
| `PATCH /api/folders/:id` | `requireUser()` | JSON 401 / redirect `/login` | User |
| `DELETE /api/folders/:id` | `requireUser()` | JSON 401 / redirect `/login` | User |
| `PATCH /api/folders/reorder` | `requireUser()` | JSON 401 / redirect `/login` | User |
| `GET /api/folders/:id/items` | `requireUser()` | JSON 401 / redirect `/login` | User |
| `POST /api/folders/:id/items` | `requireUser()` | JSON 401 / redirect `/login` | User |
| `DELETE /api/folders/:id/items` | `requireUser()` | JSON 401 / redirect `/login` | User |

### 6.2 테넌트 격리 검증

**Proposals 모듈의 보안 갭(GAP-1~4)을 반면교사로**, 모든 엔드포인트에 테넌트 격리를 적용합니다.

| 작업 | 테넌트 필터 | 검증 패턴 |
|------|-----------|----------|
| 폴더 목록 조회 | YES | `WHERE tenant_id = ctx.tenantId` |
| 폴더 생성 | YES | `INSERT ... tenantId: ctx.tenantId` |
| 폴더 수정 | YES | `WHERE id = ? AND tenant_id = ?` |
| 폴더 삭제 | YES | `WHERE id = ? AND tenant_id = ?` |
| 폴더 순서 변경 | YES | `WHERE id = ? AND tenant_id = ?` (각 항목) |
| 아이템 목록 조회 | YES | `JOIN archive_folders WHERE tenant_id = ?` |
| 아이템 추가 | YES | 폴더 소유권 사전 검증 |
| 아이템 제거 | YES | 폴더 소유권 사전 검증 |

---

## 7. Error Handling

### 7.1 API 에러 코드

| Code | Endpoint | Cause | Handling |
|------|----------|-------|----------|
| 400 | `POST /api/folders` | name 누락/20자 초과 | JSON `{ error: "..." }` |
| 400 | `POST /api/folders/:id/items` | itemType/itemId 누락 또는 잘못된 itemType | JSON 에러 |
| 400 | `PATCH /api/folders/reorder` | orderedIds 비어있음 | JSON 에러 |
| 401 | 모든 엔드포인트 | 미인증 | redirect `/login` 또는 JSON 401 |
| 404 | 단건 조회/수정/삭제 | 폴더 없음 또는 다른 테넌트 | JSON `{ error: "폴더를 찾을 수 없습니다" }` |
| 409 | `POST /api/folders/:id/items` | UNIQUE 제약 위반 (중복 아이템) | JSON `{ error: "이미 폴더에 추가된 아이템입니다" }` |

### 7.2 클라이언트 에러 처리

- `useFetcher`의 `fetcher.data` 검사로 에러 상태 핸들링
- 409 에러 시 사용자에게 토스트/알림 표시 ("이미 추가된 아이템입니다")
- 네트워크 에러 시 재시도 없이 에러 상태 표시

---

## 8. Implementation Sequence

### Phase 1: DB 스키마 + 마이그레이션 (파일 4개)

| 순서 | 작업 | 파일 | 변경 유형 |
|------|------|------|----------|
| 1-1 | Drizzle 스키마 정의 | `app/features/archive/db/schema.ts` | 신규 |
| 1-2 | 스키마 머지 + re-export | `app/db/index.ts` | 수정 |
| 1-3 | 마이그레이션 SQL 생성 | `drizzle/0022_archive_folders.sql` | 신규 |
| 1-4 | 테스트 헬퍼 업데이트 | `tests/helpers/db.ts` | 수정 |

**검증**: `pnpm db:migrate` → `pnpm db:studio`에서 `archive_folders`, `archive_folder_items` 테이블 확인

### Phase 2: 폴더 CRUD API (파일 3개)

| 순서 | 작업 | 파일 | 변경 유형 |
|------|------|------|----------|
| 2-1 | 폴더 목록 + 생성 API | `app/routes/api.folders.ts` | 신규 |
| 2-2 | 폴더 수정 + 삭제 API | `app/routes/api.folders.$id.ts` | 신규 |
| 2-3 | 폴더 순서 변경 API | `app/routes/api.folders.reorder.ts` | 신규 |

**검증**: curl / REST 클라이언트로 CRUD 동작 확인

### Phase 3: 폴더 아이템 API (파일 1개)

| 순서 | 작업 | 파일 | 변경 유형 |
|------|------|------|----------|
| 3-1 | 아이템 CRUD API | `app/routes/api.folders.$id.items.ts` | 신규 |

**검증**: 아이템 추가/제거/중복 방지(409) 확인

### Phase 4: UI 연동 — ArchiveFolderList + 드래그앤드롭 (파일 2개)

| 순서 | 작업 | 파일 | 변경 유형 |
|------|------|------|----------|
| 4-1 | ArchiveFolderList DB 연동 + CRUD UI + 드래그 타겟 | `app/components/layout/ArchiveFolderList.tsx` | 수정 |
| 4-2 | folders 데이터 전달 + draggable 속성 | `app/components/layout/SidebarPanel.tsx` | 수정 |

**검증**: 폴더 생성/수정/삭제 UI 동작 + 드래그앤드롭 동작 확인

### Phase 의존성 다이어그램

```
Phase 1 (DB 스키마)
    │
    ├──► Phase 2 (폴더 CRUD API)
    │        │
    │        └──► Phase 4 (UI 연동)
    │
    └──► Phase 3 (아이템 API)
              │
              └──► Phase 4 (UI 연동)
```

Phase 2와 Phase 3은 병렬 진행 가능.

---

## 9. Performance Design

### 9.1 쿼리 수 분석

| 작업 | 쿼리 수 | 패턴 | 비고 |
|------|---------|------|------|
| 폴더 목록 (+ 카운트) | 1 | LEFT JOIN + GROUP BY | OK |
| 폴더 생성 | 2 | MAX(sortOrder) + INSERT | OK |
| 폴더 삭제 | 1+N | SELECT 확인 + DELETE (CASCADE) | N = 아이템 수 (DB 내부) |
| 폴더 순서 변경 | N+1 | tenantId 확인 + N × UPDATE | 트랜잭션 처리 |
| 아이템 추가 | 2 | 폴더 소유권 확인 + INSERT | OK |
| 아이템 목록 | 2 | 폴더 소유권 확인 + SELECT | OK |

### 9.2 인덱스 활용

| 쿼리 | 사용 인덱스 | 예상 성능 |
|------|-----------|----------|
| 폴더 목록 (tenantId) | `idx_archive_folders_tenant_order` | O(1) — covering index |
| 아이템 목록 (folderId) | `idx_folder_items_folder` | O(1) |
| 중복 체크 | `uniq_folder_items` | O(1) — UNIQUE 제약 |
| 아이템 역조회 | `idx_folder_items_type_id` | O(1) |

### 9.3 예상 데이터 규모

- 테넌트당 폴더: 5~20개 (소규모)
- 폴더당 아이템: 10~100개 (중규모)
- 전체 `archive_folder_items`: 수백~수천 행 (성능 이슈 없음)

---

## 10. File Inventory

### 신규 파일 (5개)

| 파일 | 역할 |
|------|------|
| `app/features/archive/db/schema.ts` | 2개 테이블 + 1개 Enum |
| `drizzle/0022_archive_folders.sql` | D1 마이그레이션 SQL |
| `app/routes/api.folders.ts` | 폴더 목록/생성 API |
| `app/routes/api.folders.$id.ts` | 폴더 수정/삭제 API |
| `app/routes/api.folders.$id.items.ts` | 아이템 CRUD API |
| `app/routes/api.folders.reorder.ts` | 폴더 순서 변경 API |

### 수정 파일 (4개)

| 파일 | 변경 |
|------|------|
| `app/db/index.ts` | archiveSchema 스프레드 머지 + re-export |
| `app/components/layout/ArchiveFolderList.tsx` | DB 연동, DEFAULT_FOLDERS 제거, CRUD UI, 드래그 타겟 |
| `app/components/layout/SidebarPanel.tsx` | folders props 전달, 대화 항목 draggable 속성 |
| `tests/helpers/db.ts` | `0022_archive_folders.sql` 마이그레이션 경로 추가 |

---

## 11. Risk & Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 마이그레이션 추가 후 테스트 헬퍼 누락 | High | Medium | Phase 1에서 `tests/helpers/db.ts` 업데이트를 필수 단계로 포함 |
| 다형성 참조(itemType+itemId)로 조인 복잡도 증가 | Medium | Low | 폴더 아이템 조회 시 itemType별 분기 또는 클라이언트 사이드 리졸브 |
| CASCADE 삭제로 의도치 않은 데이터 손실 | Low | Low | 폴더 삭제 시 확인 다이얼로그 표시. CASCADE는 `archive_folder_items`만 삭제 (원본 엔티티 미영향) |
| 폴더 순서 변경 시 동시성 충돌 | Low | Low | sortOrder를 배열 인덱스 기반으로 일괄 업데이트 (단일 트랜잭션) |
| HTML5 DnD API 모바일 미지원 | Medium | High | 터치 디바이스에서는 "폴더에 추가" 컨텍스트 메뉴 대안 제공 (Phase 4 이후) |
| tenant 스코핑 누락으로 데이터 노출 | High | Low | 모든 쿼리에 `.where(eq(archiveFolders.tenantId, tenantId))` 패턴 강제. Proposals 보안 갭 교훈 반영 |
| 고아 아이템 참조 (원본 엔티티 삭제됨) | Low | Medium | 아이템 목록 표시 시 원본 조회 실패 → "삭제된 아이템" 표시 + 자동 정리 옵션 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-02-10 | Initial design — DB 스키마, API, UI 상세 설계 | Claude |
