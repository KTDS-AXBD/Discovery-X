# EPIC 5 — 사업제안 기능 상세 설계

> **Summary**: Discovery-X 아이디어를 팀 단위 사업제안서로 발전시키는 협업 기능 — Feature Module 패턴 6개 테이블 + 3열 레이아웃
>
> **Project**: Discovery-X
> **Version**: v4.2
> **Author**: Claude
> **Date**: 2026-02-10
> **Status**: Implemented (후행 문서화)
> **Planning Doc**: [proposals.plan.md](../../01-plan/features/proposals.plan.md)

---

## 1. Overview

### 1.1 Design Goals

1. **Feature Module 패턴**: `app/features/proposals/` 독립 디렉토리에 6개 테이블 스키마 정의
2. **3열 레이아웃**: 사이드바(목록) + 본문(상세/생성) + 진행 패널(마일스톤/액션)
3. **협업 도구**: 5개 섹션 구조화 + 댓글 토론 + 액션 아이템 진행 추적
4. **기존 인프라 재사용**: AppShell 레이아웃, Axis 디자인 토큰, 인증 시스템

### 1.2 Design Principles

- **Feature Module**: Core 테이블과 분리된 독립 스키마 (`proposalSchema` 스프레드 머지)
- **Cascade 삭제**: 하위 5개 테이블 모두 `onDelete: "cascade"` — 부모 삭제 시 자동 정리
- **Remix 데이터 패턴**: 페이지 라우트는 `loader`/`action`, 비동기 작업은 `useFetcher`
- **Axis + DX 토큰**: `var(--dx-token, var(--axis-token))` 3단계 폴백 패턴

### 1.3 Architecture Decision Record

**결정**: Core Table Extension 대신 Feature Module 선택

| 기준 | Core Extension (ax-bd-poc) | Feature Module (proposals, 선택) |
|------|---------------------------|--------------------------------|
| 테이블 전략 | 기존 테이블 ADD COLUMN | 신규 6개 테이블 생성 |
| 코드 격리 | 낮음 (core 영향) | 높음 (독립 디렉토리) |
| 향후 분리 | 리팩토링 필요 | 모듈 단위 분리 용이 |
| Core 영향 | ADD COLUMN (최소) | 없음 (스프레드 머지만) |

**근거**: 사업제안은 기존 Discovery 엔티티와 직접 관련 없는 독립 도메인. 6개 테이블 신규 생성이므로 Feature Module이 적합.

---

## 2. Architecture

### 2.1 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Pages (Edge)                    │
│                                                               │
│  ┌─ Routes ──────────────────────────────────────────────┐   │
│  │  proposals.tsx (Layout)     → ProposalListSidebar     │   │
│  │  proposals._index.tsx       → Empty State             │   │
│  │  proposals.new.tsx (Action) → ProposalForm            │   │
│  │  proposals.$id.tsx (Loader) → ProposalDetail          │   │
│  │                               + ProgressPanel         │   │
│  │                               + TeamDiscussion        │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─ API Routes ──────────────────────────────────────────┐   │
│  │  api.proposals.ts          → GET (list) / DELETE      │   │
│  │  api.proposals.$id.comments.ts → GET / POST           │   │
│  │  api.proposals.$id.actions.ts  → POST (toggle)        │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─ Feature Module ──────────────────────────────────────┐   │
│  │  app/features/proposals/db/schema.ts                  │   │
│  │  → 6개 테이블 + 3개 Enum + 0개 Relations              │   │
│  │  → app/db/index.ts에서 스프레드 머지                    │   │
│  └───────────────────────────────────────────────────────┘   │
│                                                               │
│  ┌─ Cloudflare D1 (SQLite) ──────────────────────────────┐   │
│  │  proposals, proposal_sections, proposal_milestones,    │   │
│  │  proposal_actions, proposal_comments, proposal_members │   │
│  └───────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Schema Merge 패턴

```typescript
// app/db/index.ts
import * as schema from "./schema";                              // Core (44 tables)
import * as ventureSchema from "~/features/venture/db/schema";   // Venture (16 tables)
import * as proposalSchema from "~/features/proposals/db/schema"; // Proposals (6 tables)

const allSchema = { ...schema, ...ventureSchema, ...proposalSchema };
```

- 네임스페이스 충돌 방지: Venture는 `vd_` 프리픽스, Proposals는 `proposal_` 프리픽스
- 모든 테이블이 단일 `getDb()` 인스턴스로 접근 가능

---

## 3. Data Model

### 3.1 테이블 요약

| # | 테이블 | 역할 | PK | 행 규모 |
|---|--------|------|-----|---------|
| 1 | `proposals` | 메인 엔티티 | UUID text | Low (수십) |
| 2 | `proposal_sections` | 구조화 섹션 (5종) | UUID text | 제안당 5개 |
| 3 | `proposal_milestones` | 타임라인 마일스톤 | UUID text | 제안당 수개 |
| 4 | `proposal_actions` | 액션 아이템/태스크 | UUID text | 제안당 다수 |
| 5 | `proposal_comments` | 토론 댓글 | UUID text | 제안당 다수 |
| 6 | `proposal_members` | M:N 멤버 (제안 ↔ 사용자) | **없음** | 제안당 수명 |

### 3.2 Enum 정의

```typescript
// 상태 관리
export const ProposalStatus = {
  DRAFT: "DRAFT",           // 작성 중 (초기)
  REVIEWING: "REVIEWING",   // 검토 중
  APPROVED: "APPROVED",     // 승인됨
  REJECTED: "REJECTED",     // 반려됨
} as const;

export const MilestoneStatus = {
  COMPLETED: "COMPLETED",   // 완료
  ACTIVE: "ACTIVE",         // 진행 중
  PENDING: "PENDING",       // 대기
} as const;

// 섹션 타입 (lowercase — Status enums과 케이스 불일치)
export const ProposalSectionType = {
  MARKET: "market",         // 시장 기회
  TARGET: "target",         // 목표 고객
  MODEL: "model",           // 사업 모델
  ADVANTAGE: "advantage",   // 경쟁 우위
  FINANCE: "finance",       // 재무 계획
} as const;
```

### 3.3 테이블 상세

#### `proposals` (메인 엔티티)

| 컬럼 | SQLite 타입 | Drizzle 모드 | Nullable | Default | 비고 |
|------|------------|-------------|----------|---------|------|
| `id` | text | string | NO | `crypto.randomUUID()` | PK |
| `tenant_id` | text | string | NO | — | FK → tenants, no action |
| `title` | text | string | NO | — | — |
| `description` | text | string | YES | — | — |
| `status` | text | string | NO | `'DRAFT'` | ProposalStatus enum |
| `team_size` | integer | number | YES | — | 생성 시 미정 가능 |
| `start_date` | text | string | YES | — | 자유 형식 날짜 |
| `budget` | text | string | YES | — | 자유 형식 ("1억", "$100K") |
| `owner_id` | text | string | NO | — | FK → users, no action |
| `created_at` | integer | timestamp | NO | `(unixepoch())` | — |
| `updated_at` | integer | timestamp | NO | `(unixepoch())` | — |

**인덱스**: `idx_proposals_tenant`, `idx_proposals_owner`, `idx_proposals_status`

#### `proposal_sections` (구조화 섹션)

| 컬럼 | SQLite 타입 | Nullable | Default | 비고 |
|------|------------|----------|---------|------|
| `id` | text | NO | UUID | PK |
| `proposal_id` | text | NO | — | FK → proposals, **cascade** |
| `type` | text | NO | — | ProposalSectionType (DB 제약 없음) |
| `content` | text | NO | `''` | 빈 문자열 기본값 |
| `sort_order` | integer | NO | `0` | 섹션 정렬 |

#### `proposal_milestones` (타임라인)

| 컬럼 | SQLite 타입 | Nullable | Default | 비고 |
|------|------------|----------|---------|------|
| `id` | text | NO | UUID | PK |
| `proposal_id` | text | NO | — | FK → proposals, **cascade** |
| `title` | text | NO | — | — |
| `status` | text | NO | `'PENDING'` | MilestoneStatus enum |
| `start_date` | text | YES | — | 자유 형식 날짜 |
| `end_date` | text | YES | — | 자유 형식 날짜 |
| `sort_order` | integer | NO | `0` | — |

#### `proposal_actions` (액션 아이템)

| 컬럼 | SQLite 타입 | Nullable | Default | 비고 |
|------|------------|----------|---------|------|
| `id` | text | NO | UUID | PK |
| `proposal_id` | text | NO | — | FK → proposals, **cascade** |
| `title` | text | NO | — | — |
| `assignee_id` | text | YES | — | FK → users, no action |
| `completed` | integer | NO | `0` | Boolean (0/1), `mode: "number"` |
| `due_date` | text | YES | — | 자유 형식 날짜 |
| `created_at` | integer | NO | `(unixepoch())` | — |

#### `proposal_comments` (토론)

| 컬럼 | SQLite 타입 | Nullable | Default | 비고 |
|------|------------|----------|---------|------|
| `id` | text | NO | UUID | PK |
| `proposal_id` | text | NO | — | FK → proposals, **cascade** |
| `author_id` | text | NO | — | FK → users, no action |
| `content` | text | NO | — | — |
| `created_at` | integer | NO | `(unixepoch())` | — |

#### `proposal_members` (M:N 멤버)

| 컬럼 | SQLite 타입 | Nullable | Default | 비고 |
|------|------------|----------|---------|------|
| `proposal_id` | text | NO | — | FK → proposals, **cascade** |
| `user_id` | text | NO | — | FK → users, no action |
| `joined_at` | integer | NO | `(unixepoch())` | — |

**PK 없음** — 중복 멤버 삽입 가능 (Known Issue #9)

### 3.4 Entity-Relationship 다이어그램

```
┌──────────┐       ┌──────────────────┐       ┌──────────┐
│ tenants  │◄─────┤    proposals     ├──────►│  users   │
│          │  1:N  │                  │  N:1   │          │
└──────────┘       │ tenant_id (FK)   │(owner) └──────┬───┘
                   │ owner_id (FK)────┘              │
                   └──────┬───────────┘              │
                          │                          │
          ┌───────────────┼───────────────┬──────────┤
          │ 1:N           │ 1:N           │ 1:N      │ M:N
          ▼               ▼               ▼          ▼
 ┌─────────────┐ ┌──────────────┐ ┌────────────┐ ┌──────────────┐
 │  sections   │ │  milestones  │ │  actions   │ │  members     │
 │ (5종/제안)   │ │              │ │ →assignee  │ │ (PK 없음)    │
 └─────────────┘ └──────────────┘ └──────┬─────┘ └──────────────┘
                                         │ 1:N
                                         ▼
                                  ┌──────────────┐
                                  │  comments    │
                                  │ →author (FK) │
                                  └──────────────┘
```

### 3.5 Cascade 삭제 체인

```
proposals (DELETE)
  → proposal_sections   (CASCADE)
  → proposal_milestones (CASCADE)
  → proposal_actions    (CASCADE)
  → proposal_comments   (CASCADE)
  → proposal_members    (CASCADE)
```

### 3.6 날짜 타입 설계

| 용도 | 타입 | 패턴 | 이유 |
|------|------|------|------|
| 시스템 타임스탬프 | `integer` (timestamp) | `created_at`, `updated_at`, `joined_at` | 정확한 정렬/계산 |
| 사용자 입력 날짜 | `text` (string) | `start_date`, `end_date`, `due_date` | 자유 형식 입력 허용 |

의도된 비일관성: 시스템 vs 사용자 데이터 구분.

### 3.7 Drizzle Relations

**현재: 미정의 (0개)**. Drizzle `relations()` 없음 → `db.query.proposals.findMany({ with: { sections: true } })` 사용 불가. 모든 조인은 수동 `.leftJoin()` 패턴.

---

## 4. API Design

### 4.1 엔드포인트 목록

| Method | Path | 기능 | 인증 | 테넌트 격리 |
|--------|------|------|------|------------|
| GET | `/api/proposals` | 제안 목록 | Session | YES |
| DELETE | `/api/proposals` | 제안 삭제 | Session | **NO** |
| GET | `/api/proposals/:id/comments` | 댓글 조회 | Session | **NO** |
| POST | `/api/proposals/:id/comments` | 댓글 작성 | Session | **NO** |
| POST | `/api/proposals/:id/actions` | 액션 완료 토글 | Session | **NO** |

### 4.2 페이지 라우트

| 라우트 | URL | Loader | Action | 컴포넌트 |
|--------|-----|--------|--------|----------|
| `proposals.tsx` | `/proposals` | 제안 목록 (tenantId 필터) | — | AppShell + ProposalListSidebar + Outlet |
| `proposals._index.tsx` | `/proposals` | — | — | Empty State 안내 |
| `proposals.new.tsx` | `/proposals/new` | — | INSERT proposal + 5 sections | ProposalForm |
| `proposals.$id.tsx` | `/proposals/:id` | 5개 쿼리 (proposal + 하위 4개) | — | ProposalDetail + ProgressPanel |

### 4.3 데이터 플로우

#### 상세 페이지 로딩

```
User → /proposals/:id
         │
         ├─ proposals.tsx loader (병렬 — Remix nested routes)
         │   └─ SELECT proposals WHERE tenant_id = ? ORDER BY updated_at DESC
         │
         └─ proposals.$id.tsx loader
             ├─ Q1: SELECT * FROM proposals WHERE id = ? → 404 if null
             ├─ Q2: SELECT * FROM proposal_sections WHERE proposal_id = ?
             ├─ Q3: SELECT * FROM proposal_milestones WHERE proposal_id = ?
             ├─ Q4: SELECT * FROM proposal_actions WHERE proposal_id = ?
             └─ Q5: SELECT comments + LEFT JOIN users WHERE proposal_id = ?
             → computed: totalProgress = completedActions / totalActions * 100
             → computed: daysRemaining = max(0, startDate + 30일 - now)
```

**성능 이슈**: Q2~Q5는 독립적이지만 순차 실행 중. `Promise.all` 적용 시 ~4배 개선 가능.

#### 제안 생성

```
ProposalForm → POST /proposals/new
  1. Validate title (required)
  2. INSERT proposals (1 row)
  3. INSERT proposal_sections × 5 (순차 루프)
  4. redirect → /proposals/:newId
```

**성능 이슈**: 5개 섹션 순차 INSERT → 배치 INSERT 가능.

#### 댓글 작성 (비동기)

```
TeamDiscussion → useFetcher.submit()
  → POST /api/proposals/:id/comments (FormData: { content })
  → INSERT proposal_comments
  → json({ success: true })
  → Remix revalidation → 부모 loader 재실행
```

### 4.4 Request/Response 형식

#### GET `/api/proposals`

```json
// Response
{
  "proposals": [
    { "id": "uuid", "tenantId": "uuid", "title": "...", "status": "DRAFT", ... }
  ]
}
```

#### DELETE `/api/proposals`

```json
// Request (JSON body)
{ "id": "proposal-uuid" }
// Response
{ "success": true }
```

#### POST `/api/proposals/:id/comments`

```
// Request (FormData)
content: "댓글 내용"
// Response
{ "success": true }
```

#### POST `/api/proposals/:id/actions`

```json
// Request (JSON body)
{ "actionId": "action-uuid", "completed": true }
// Response
{ "success": true }
```

---

## 5. UI Design

### 5.1 3열 레이아웃

```
┌────────────────────────────────────────────────────────────────────┐
│                         TopNav (56px)                               │
├──────────┬─────────────────────────────┬──────────────────────────┤
│          │                             │                           │
│ Sidebar  │       Main Content          │   Progress Panel          │
│  240px   │       (flex-1)              │      280px                │
│          │                             │                           │
│ Proposal │  ProposalDetail             │   ProgressPanel           │
│  List    │  OR ProposalForm            │   (lg:block only)         │
│ Sidebar  │                             │                           │
│          │  max-w-3xl mx-auto          │                           │
│          │  px-6 py-6                  │                           │
│          │                             │   hidden < lg             │
│ sm:static│                             │                           │
│ mobile:  │                             │                           │
│ overlay  │                             │                           │
└──────────┴─────────────────────────────┴──────────────────────────┘
```

### 5.2 CSS 커스텀 프로퍼티

| 토큰 | 값 | 용도 |
|------|-----|------|
| `--dx-nav-height` | `56px` | 상단 네비게이션 높이 |
| `--dx-sidebar-width` | `240px` | 좌측 사이드바 폭 |
| `--dx-context-panel-width` | `280px` | 우측 진행 패널 폭 |
| `--dx-card-radius` | `12px` | 카드 모서리 반경 |

### 5.3 컴포넌트 트리

```
proposals.tsx (Layout Route)
├── AppShell
│   ├── TopNav
│   ├── ProposalListSidebar (sidebarContent prop)
│   └── <main> → <Outlet />
│       ├── proposals._index.tsx → Empty State
│       ├── proposals.new.tsx → ProposalForm
│       └── proposals.$id.tsx
│           ├── ProposalDetail (flex-1)
│           │   └── TeamDiscussion (embedded)
│           └── ProgressPanel (inline right panel)
```

### 5.4 컴포넌트 상세

#### ProposalListSidebar (115 lines)

| Props | 내부 상태 | Remix 패턴 |
|-------|----------|-----------|
| `proposals[]`, `activeId?` | `useLocation()`, `useSidebar()` | `<Link>` 네비게이션 |

- 모바일: 오버레이 사이드바 (`fixed z-50 + backdrop`)
- 데스크탑: 정적 사이드바 (`sm:static`)
- 활성 항목 하이라이트: `pathname` 매칭

#### ProposalForm (121 lines)

| Props | 내부 상태 | Remix 패턴 |
|-------|----------|-----------|
| `defaultValues?`, `action?` | `useNavigation()` | `<Form method="post">` |

- Uncontrolled 폼 (defaultValue 사용)
- 메타 필드: 3열 그리드 (`grid-cols-3`)
- 5개 섹션 textarea 동적 생성
- 제출 중 버튼 비활성화

#### ProposalDetail (148 lines)

| Props | 내부 상태 | Remix 패턴 |
|-------|----------|-----------|
| `proposal`, `sections[]`, `comments[]`, `currentUserId` | 없음 (읽기 전용) | — |

- 제목 + 상태 배지 (Badge 컴포넌트)
- 메타 카드 3열: 팀 구성 / 시작일 / 예산
- 섹션 카드: sortOrder 정렬 후 렌더링
- TeamDiscussion 임베드

#### ProgressPanel (118 lines)

| Props | 내부 상태 | Remix 패턴 |
|-------|----------|-----------|
| `milestones[]`, `actions[]`, `totalProgress`, `daysRemaining` | 없음 (읽기 전용) | — |

- 진행률 바: 동적 width (inline style)
- 마일스톤: 상태별 아이콘 (완료=green check, 활성=brand border, 대기=default)
- 액션 체크박스: **readOnly** (onChange 미연결)
- `hidden lg:block` — 1024px 미만에서 숨김

#### TeamDiscussion (86 lines)

| Props | 내부 상태 | Remix 패턴 |
|-------|----------|-----------|
| `proposalId`, `comments[]`, `currentUserId` | `useState(content)`, `useFetcher()` | `fetcher.submit()` → POST |

- 댓글 목록: 아바타(이니셜) + 이름 + 날짜 + 내용
- 입력 폼: controlled input + submit 버튼
- API: `POST /api/proposals/:id/comments`
- 제출 후 input 즉시 클리어 (낙관적)

### 5.5 디자인 토큰 사용

3단계 토큰 폴백 패턴:

```css
/* 1순위: DX 커스텀 토큰 → 2순위: Axis 토큰 → 3순위: 하드코딩 폴백 */
var(--dx-surface-card, var(--axis-surface-default))
var(--dx-border-subtle, var(--axis-border-default))
var(--axis-badge-secondary-bg, #E5E7EB)
```

| 컴포넌트 | Axis 토큰 | DX 토큰 | 하드코딩 |
|----------|-----------|---------|---------|
| ProposalListSidebar | Yes | Yes (5개) | `black/50` (backdrop) |
| ProposalForm | Yes | No | — |
| ProposalDetail | Yes | No | — |
| ProgressPanel | Yes | No | `bg-green-500` |
| TeamDiscussion | Yes | No | — |

### 5.6 반응형 동작

| 브레이크포인트 | 사이드바 | 메인 콘텐츠 | 진행 패널 |
|--------------|---------|-----------|----------|
| `< sm` (640px) | 오버레이 + 배경 | 전체 폭 | 숨김 |
| `sm ~ lg` | 정적 좌측 | flex-1 | 숨김 |
| `>= lg` (1024px) | 정적 좌측 | flex-1 | 표시 (280px) |

### 5.7 상태 시각 매핑

| 상태 | 사이드바 배지 | 상세 Badge variant |
|------|-------------|-------------------|
| DRAFT | secondary (gray) | `secondary` |
| REVIEWING | warning (yellow) | `warning` |
| APPROVED | success (green) | `success` |
| REJECTED | destructive (red) | `destructive` |

---

## 6. Security Design

### 6.1 인증 매트릭스

| Route/API | 인증 체크 | 실패 응답 | 가드 레벨 |
|-----------|----------|----------|----------|
| 페이지 라우트 (4개) | `getSessionContext` | redirect `/login` | User (모든 역할) |
| API 라우트 (3개) | `getSessionContext` | json 401 | User (모든 역할) |

### 6.2 테넌트 격리 현황

| 작업 | 테넌트 필터 | 현재 상태 |
|------|-----------|----------|
| 제안 목록 (layout loader) | YES | `WHERE tenant_id = ctx.tenantId` |
| 제안 목록 (API GET) | YES | `WHERE tenant_id = ctx.tenantId` |
| 제안 생성 | YES | `tenantId: ctx.tenantId` INSERT |
| 제안 상세 조회 | **NO** | `WHERE id = params.id` (테넌트 무시) |
| 제안 삭제 | **NO** | `WHERE id = body.id` (테넌트/소유자 무시) |
| 댓글 조회/작성 | **NO** | `WHERE proposal_id = params.id` |
| 액션 토글 | **NO** | `WHERE id = body.actionId` (proposal_id도 무시) |

### 6.3 Critical 보안 갭

| # | 갭 | 심각도 | 영향 | 수정 방안 |
|---|-----|--------|------|----------|
| GAP-1 | 교차 테넌트 제안 접근 | CRITICAL | 타 테넌트 제안 열람 가능 | 상세 로더에 `AND tenant_id = ?` 추가 |
| GAP-2 | 교차 테넌트 제안 삭제 | CRITICAL | 아무 사용자가 아무 제안 삭제 가능 | DELETE에 tenantId + ownerId 검증 |
| GAP-3 | 교차 테넌트 댓글 삽입 | HIGH | 타 테넌트 제안에 댓글 가능 | INSERT 전 제안 tenantId 검증 |
| GAP-4 | 무스코프 액션 토글 | HIGH | params.id 무시, actionId만으로 토글 | JOIN으로 proposal tenantId 검증 |

---

## 7. Performance Design

### 7.1 페이지별 쿼리 수

| 페이지 | 쿼리 수 | 패턴 | 이슈 |
|--------|---------|------|------|
| `/proposals` (layout) | 1 | 단일 SELECT | OK |
| `/proposals/:id` | 5+1=6 | 5 순차 + 1 layout | Promise.all 미사용 |
| `/proposals/new` | 0+1=1 | 0 loader + 1 layout | OK |
| 제안 생성 (action) | 6 | 1 INSERT + 5 순차 INSERT | 배치 INSERT 가능 |

### 7.2 최적화 기회

| # | 최적화 | 대상 | 예상 효과 |
|---|--------|------|----------|
| P1 | 상세 로더 Promise.all | `proposals.$id.tsx` | ~4배 빨라짐 (5 순차 → 1+1 병렬) |
| P2 | 섹션 배치 INSERT | `proposals.new.tsx` | 6 쿼리 → 2 쿼리 |

---

## 8. Remix 패턴 사용

### 8.1 패턴별 사용처

| 패턴 | proposals.tsx | _index.tsx | new.tsx | $id.tsx | API 라우트 |
|------|:-----------:|:---------:|:------:|:------:|:---------:|
| `loader` | Yes | — | — | Yes | Yes |
| `action` | — | — | Yes | — | Yes |
| `useLoaderData` | Yes | — | — | Yes | — |
| `useNavigation` | — | — | Yes* | — | — |
| `useFetcher` | — | — | — | Yes* | — |
| `<Form>` | — | — | Yes* | — | — |
| `<Link>` | — | Yes | — | — | — |
| `<Outlet>` | Yes | — | — | — | — |

*: 컴포넌트 내부 사용 (ProposalForm, TeamDiscussion)

### 8.2 데이터 로딩 전략

```
proposals.tsx (parent loader)  ← Remix가 자동 병렬 실행
     ↓ parallel
proposals.$id.tsx (child loader)

Revalidation: useFetcher.submit() 후 Remix가 양쪽 loader 재실행
```

### 8.3 폼 제출 패턴

| 컴포넌트 | 방식 | 대상 | 데이터 형식 |
|----------|------|------|-----------|
| ProposalForm | `<Form method="post">` | 동일 라우트 action | FormData |
| TeamDiscussion | `useFetcher.submit()` | `/api/proposals/:id/comments` | FormData |
| ProgressPanel | 없음 (readOnly) | — | — |

---

## 9. Known Issues & Gaps

### 9.1 데이터 모델

| # | 이슈 | 심각도 | 비고 |
|---|------|--------|------|
| 1 | `proposal_members` PK 없음 | HIGH | 중복 멤버 삽입 가능 — composite PK 필요 |
| 2 | Drizzle `relations()` 미정의 | MEDIUM | Query API 사용 불가, 수동 JOIN만 |
| 3 | `(proposal_id, type)` unique 없음 | MEDIUM | 섹션 타입 중복 가능 |
| 4 | User FK `ON DELETE no action` | MEDIUM | 사용자 삭제 시 고아 레코드 |
| 5 | `completed` integer (mode: "number") | LOW | `mode: "boolean"` 미사용 |
| 6 | Enum 케이스 불일치 | LOW | Status=UPPERCASE, Section=lowercase |
| 7 | 하위 테이블 `updated_at` 없음 | LOW | 변경 추적 불가 |
| 8 | `budget` text 타입 | LOW | 수치 집계 불가 |

### 9.2 API/라우트

| # | 이슈 | 심각도 | 비고 |
|---|------|--------|------|
| 9 | 제안 UPDATE API 미구현 | HIGH | 생성 후 편집 불가 |
| 10 | 상태 전환 API 없음 | HIGH | DRAFT→REVIEWING 워크플로우 없음 |
| 11 | 마일스톤 CRUD 미구현 | MEDIUM | 조회만 가능 |
| 12 | 액션 생성/삭제 미구현 | MEDIUM | 완료 토글만 가능 |
| 13 | 멤버 관리 CRUD 없음 | MEDIUM | 스키마만 존재 |
| 14 | 댓글 수정/삭제 없음 | LOW | 생성 전용 |
| 15 | DELETE UI 없음 | LOW | API만 존재 |

### 9.3 UI

| # | 이슈 | 심각도 | 비고 |
|---|------|--------|------|
| 16 | ProgressPanel 체크박스 readOnly | HIGH | API 존재하나 UI 미연결 |
| 17 | 상수 3파일 중복 정의 | MEDIUM | STATUS_LABELS, SECTION_ICONS 등 |
| 18 | `grid-cols-3` 모바일 미대응 | MEDIUM | 메타 필드/카드 좁은 화면에서 찌그러짐 |
| 19 | 진행 패널 태블릿 접근 불가 | MEDIUM | `hidden lg:block` — 대안 UI 없음 |
| 20 | `toLocaleDateString` 사용 | LOW | SSR/CSR hydration mismatch 가능 |
| 21 | `bg-green-500` 하드코딩 | LOW | Axis 토큰 미사용 |
| 22 | 헤딩 계층 스킵 (h1→h3) | LOW | WCAG 위반 |
| 23 | ProgressPanel inline 렌더링 | LOW | AppShell contextPanel prop 미사용 |

---

## 10. File Inventory

### 신규 파일 (13개)

| 파일 | Lines | 역할 |
|------|:-----:|------|
| `app/features/proposals/db/schema.ts` | 148 | 6개 테이블 + 3개 Enum |
| `app/routes/proposals.tsx` | 69 | 레이아웃 (사이드바 + Outlet) |
| `app/routes/proposals._index.tsx` | 31 | 빈 상태 안내 |
| `app/routes/proposals.new.tsx` | 59 | 생성 (Action + Form) |
| `app/routes/proposals.$id.tsx` | 126 | 상세 (5개 쿼리 + 진행 패널) |
| `app/routes/api.proposals.ts` | 43 | GET/DELETE API |
| `app/routes/api.proposals.$id.comments.ts` | 60 | 댓글 GET/POST |
| `app/routes/api.proposals.$id.actions.ts` | 29 | 액션 토글 POST |
| `app/components/proposals/ProposalForm.tsx` | 121 | 생성 폼 |
| `app/components/proposals/ProposalDetail.tsx` | 148 | 상세 뷰 |
| `app/components/proposals/ProposalListSidebar.tsx` | 115 | 사이드바 |
| `app/components/proposals/ProgressPanel.tsx` | 118 | 진행 패널 |
| `app/components/proposals/TeamDiscussion.tsx` | 86 | 댓글 토론 |

### 수정 파일 (3개)

| 파일 | 변경 |
|------|------|
| `app/db/index.ts` | proposalSchema 스프레드 머지 |
| `drizzle/0021_proposals.sql` | 6개 테이블 마이그레이션 |
| `tests/helpers/db.ts` | 마이그레이션 SQL 등록 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-02-10 | 후행 설계 문서화 — 3 Worker 병렬 분석 통합 | Claude |
