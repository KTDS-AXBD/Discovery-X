# Discovery-X 전략적 진화 Phase 3 설계서

> Plan 문서: `docs/01-plan/features/dx-strategic-evolution-p3.plan.md` 기반 상세 설계

## 1. 설계 개요

### 1.1 범위

Phase 3 (L3 확장 기반) 1개 기능의 상세 설계:
- F6. Multi-Tenant 기반 구조

### 1.2 설계 원칙

1. **비파괴적 마이그레이션**: 기존 42 테이블 + 62 Agent 도구와 충돌 없이 확장
2. **점진적 적용**: Root 엔티티만 tenant_id 추가, 자식은 FK cascade로 스코프 상속
3. **중앙화된 스코프**: `withTenantScope()` 헬퍼로 일관된 격리
4. **기존 경험 유지**: 단일 Tenant 사용자는 변화를 느끼지 못함

### 1.3 현재 시스템 기준

| 지표 | 값 |
|------|-----|
| DB 테이블 | 42 (core 26 + venture 16) |
| Agent 도구 | 62 (12개 파일) |
| Cron 작업 | 8 |
| 라우트 | ~82 |
| 인증 | Google OAuth + 세션 쿠키 (30일 TTL) |
| 역할 | 전역 4종 (admin/gatekeeper/user/pending) |
| 테넌트 | 없음 (Single-Tenant) |

### 1.4 스코프 상속 분석

현재 테이블 관계 분석 결과, **Root 엔티티**에만 `tenant_id`를 추가하면 자식 엔티티는 FK cascade를 통해 자동 격리됩니다.

**Root 엔티티 (직접 tenant_id 필요)**:
- `discoveries` — 핵심 엔티티 (22개 자식 테이블이 cascade)
- `conversations` — 채팅 세션 (messages가 cascade)
- `radarSources` — Radar 소스 (radarItems가 cascade)
- `radarRuns` — Radar 실행 기록
- `industryAdapters` — 산업 어댑터 (rules, patterns이 cascade)
- `alertRules` — 알림 규칙
- `webhookConfigs` — 웹훅 설정
- `vdSprints` — Venture 스프린트 (15개 자식 테이블이 cascade)
- `valueupAssessments` — Value-up 평가 (discoveryId가 SET NULL이므로 독립 필요)

**전역 테이블 (tenant_id 불필요)**:
- `users`, `sessions` — 전역 인증 (멤버십으로 연결)
- `stages`, `methodPacks`, `ontologyTypes` — 시스템 메타데이터
- `agentConfig` — 전역 Agent 설정

**자식 엔티티 (부모 FK로 스코프 상속)**:
- discoveries → experiments, evidence, eventLogs, methodRuns, gatePackages, contextNodes, contextEdges, discoveryKpis, alerts, decisionLogs, shadowRuns, shadowConfigs 등
- conversations → messages
- vdSprints → vdSprintScopes, vdSignals, vdProblems, vdThemes, vdOpportunities 등

---

## 2. 데이터 모델

### 2.1 신규 테이블: `tenants`

```sql
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,              -- URL-safe 식별자

  -- 설정
  settings TEXT DEFAULT '{}',             -- JSON: { branding, features, limits }
  plan TEXT NOT NULL DEFAULT 'free',      -- 'free' | 'starter' | 'pro' | 'enterprise'
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'suspended' | 'trial'

  -- 메타
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);
```

**Drizzle 정의**:
```typescript
export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  settings: text("settings", { mode: "json" }).$type<TenantSettings>().default({}),
  plan: text("plan").notNull().default("free"),
  status: text("status").notNull().default("active"),
  ownerUserId: text("owner_user_id").notNull().references(() => users.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  slugIdx: uniqueIndex("idx_tenants_slug_drizzle").on(table.slug),
  statusIdx: index("idx_tenants_status_drizzle").on(table.status),
}));
```

**TenantSettings 타입**:
```typescript
interface TenantSettings {
  branding?: {
    displayName?: string;
    logoUrl?: string;
    primaryColor?: string;
  };
  features?: {
    shadowMode?: boolean;
    valueupEngine?: boolean;
    radarEnabled?: boolean;
    maxDiscoveries?: number;
    maxUsers?: number;
  };
  agentOverrides?: {
    modelId?: string;
    maxRounds?: number;
    autonomyLevel?: number;
  };
}
```

### 2.2 신규 테이블: `tenant_members`

```sql
CREATE TABLE tenant_members (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 역할
  role TEXT NOT NULL DEFAULT 'member',    -- 'owner' | 'admin' | 'gatekeeper' | 'member' | 'viewer'

  -- 메타
  joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
  invited_by TEXT REFERENCES users(id),

  UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_tenant_members_tenant ON tenant_members(tenant_id);
CREATE INDEX idx_tenant_members_user ON tenant_members(user_id);
CREATE UNIQUE INDEX idx_tenant_members_unique ON tenant_members(tenant_id, user_id);
```

**Drizzle 정의**:
```typescript
export const tenantMembers = sqliteTable("tenant_members", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: text("role").notNull().default("member"),
  joinedAt: integer("joined_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  invitedBy: text("invited_by").references(() => users.id),
}, (table) => ({
  tenantIdx: index("idx_tenant_members_tenant_drizzle").on(table.tenantId),
  userIdx: index("idx_tenant_members_user_drizzle").on(table.userId),
  uniqueIdx: uniqueIndex("idx_tenant_members_unique_drizzle").on(table.tenantId, table.userId),
}));
```

### 2.3 기존 테이블 ALTER — Root 엔티티에 tenant_id 추가

**마이그레이션 파일**: `drizzle/0019_multi_tenant.sql`

```sql
-- ============================
-- Phase 3: Multi-Tenant 기반 구조
-- ============================

-- 1. 신규 테이블
CREATE TABLE tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  settings TEXT DEFAULT '{}',
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  owner_user_id TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);

CREATE TABLE tenant_members (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member',
  joined_at INTEGER NOT NULL DEFAULT (unixepoch()),
  invited_by TEXT REFERENCES users(id),
  UNIQUE(tenant_id, user_id)
);

CREATE INDEX idx_tenant_members_tenant ON tenant_members(tenant_id);
CREATE INDEX idx_tenant_members_user ON tenant_members(user_id);

-- 2. 기본 Tenant 생성 (기존 데이터 마이그레이션)
INSERT INTO tenants (id, name, slug, plan, status, owner_user_id, created_at, updated_at)
SELECT 'default-tenant', 'Discovery-X', 'discovery-x', 'enterprise', 'active',
       COALESCE((SELECT id FROM users WHERE role = 'admin' LIMIT 1), 'system'),
       unixepoch(), unixepoch()
WHERE EXISTS (SELECT 1 FROM users LIMIT 1);

-- 3. Root 엔티티에 tenant_id 추가 (NULL 허용 — D1 ALTER 제약)
ALTER TABLE discoveries ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE conversations ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE radar_sources ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE radar_runs ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE industry_adapters ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE alert_rules ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE webhook_configs ADD COLUMN tenant_id TEXT REFERENCES tenants(id);
ALTER TABLE valueup_assessments ADD COLUMN tenant_id TEXT REFERENCES tenants(id);

-- 4. Venture Sprint에 tenant_id 추가
ALTER TABLE vd_sprints ADD COLUMN tenant_id TEXT REFERENCES tenants(id);

-- 5. 기존 데이터에 기본 tenant_id 할당
UPDATE discoveries SET tenant_id = 'default-tenant' WHERE tenant_id IS NULL;
UPDATE conversations SET tenant_id = 'default-tenant' WHERE tenant_id IS NULL;
UPDATE radar_sources SET tenant_id = 'default-tenant' WHERE tenant_id IS NULL;
UPDATE radar_runs SET tenant_id = 'default-tenant' WHERE tenant_id IS NULL;
UPDATE industry_adapters SET tenant_id = 'default-tenant' WHERE tenant_id IS NULL;
UPDATE alert_rules SET tenant_id = 'default-tenant' WHERE tenant_id IS NULL;
UPDATE webhook_configs SET tenant_id = 'default-tenant' WHERE tenant_id IS NULL;
UPDATE valueup_assessments SET tenant_id = 'default-tenant' WHERE tenant_id IS NULL;
UPDATE vd_sprints SET tenant_id = 'default-tenant' WHERE tenant_id IS NULL;

-- 6. 기존 사용자를 기본 Tenant 멤버로 등록
INSERT INTO tenant_members (id, tenant_id, user_id, role, joined_at)
SELECT 'tm-' || substr(id, 1, 8), 'default-tenant', id,
       CASE role
         WHEN 'admin' THEN 'owner'
         WHEN 'gatekeeper' THEN 'gatekeeper'
         ELSE 'member'
       END,
       unixepoch()
FROM users WHERE role != 'pending';

-- 7. 복합 인덱스 추가 (tenant 스코프 쿼리 최적화)
CREATE INDEX idx_discoveries_tenant ON discoveries(tenant_id);
CREATE INDEX idx_conversations_tenant ON conversations(tenant_id);
CREATE INDEX idx_vd_sprints_tenant ON vd_sprints(tenant_id);
CREATE INDEX idx_radar_sources_tenant ON radar_sources(tenant_id);
CREATE INDEX idx_valueup_assessments_tenant ON valueup_assessments(tenant_id);
```

### 2.4 Drizzle 스키마 수정

기존 Root 엔티티 테이블에 `tenantId` 컬럼 추가:

```typescript
// discoveries 테이블에 추가
tenantId: text("tenant_id").references(() => tenants.id),

// conversations 테이블에 추가
tenantId: text("tenant_id").references(() => tenants.id),

// radarSources 테이블에 추가
tenantId: text("tenant_id").references(() => tenants.id),

// radarRuns 테이블에 추가
tenantId: text("tenant_id").references(() => tenants.id),

// industryAdapters 테이블에 추가
tenantId: text("tenant_id").references(() => tenants.id),

// alertRules 테이블에 추가
tenantId: text("tenant_id").references(() => tenants.id),

// webhookConfigs 테이블에 추가
tenantId: text("tenant_id").references(() => tenants.id),

// valueupAssessments 테이블에 추가
tenantId: text("tenant_id").references(() => tenants.id),

// vdSprints 테이블에 추가 (venture schema)
tenantId: text("tenant_id"),  // FK는 앱 레벨 검증 (cross-schema 참조 제약)
```

---

## 3. 세션 및 인증 확장

### 3.1 세션 데이터 확장

**현재 세션 쿠키 데이터**:
```typescript
{ sessionId: string }
```

**확장 세션 쿠키 데이터**:
```typescript
{ sessionId: string; tenantId: string }
```

### 3.2 인증 헬퍼 확장

**파일**: `app/lib/auth/session.server.ts`

```typescript
// 기존 getUserFromSession 반환 타입 확장
export interface SessionContext {
  user: User;
  tenantId: string;
  tenantRole: string;  // 'owner' | 'admin' | 'gatekeeper' | 'member' | 'viewer'
}

// 신규: 세션에서 Tenant 컨텍스트 포함하여 반환
export async function getSessionContext(
  request: Request,
  db: DB,
  secret: string
): Promise<SessionContext | null> {
  const user = await getUserFromSession(request, db, secret);
  if (!user) return null;

  const session = await getSession(request, secret);
  const tenantId = session.get("tenantId");

  if (!tenantId) {
    // tenantId 없으면 기본 Tenant 조회
    const membership = await db.query.tenantMembers.findFirst({
      where: eq(tenantMembers.userId, user.id),
    });
    if (!membership) return null;
    return { user, tenantId: membership.tenantId, tenantRole: membership.role };
  }

  // tenantId 있으면 멤버십 검증
  const membership = await db.query.tenantMembers.findFirst({
    where: and(
      eq(tenantMembers.tenantId, tenantId),
      eq(tenantMembers.userId, user.id)
    ),
  });
  if (!membership) return null;

  return { user, tenantId, tenantRole: membership.role };
}

// 신규: Tenant 멤버 가드
export async function requireTenantMember(
  request: Request,
  db: DB,
  secret: string
): Promise<SessionContext> {
  const ctx = await getSessionContext(request, db, secret);
  if (!ctx) throw redirect("/login");
  if (ctx.user.role === "pending") throw redirect("/pending");
  return ctx;
}

// 신규: Tenant Admin 가드
export async function requireTenantAdmin(
  request: Request,
  db: DB,
  secret: string
): Promise<SessionContext> {
  const ctx = await requireTenantMember(request, db, secret);
  if (!["owner", "admin"].includes(ctx.tenantRole)) {
    throw json({ error: "조직 관리자 권한이 필요합니다" }, { status: 403 });
  }
  return ctx;
}
```

### 3.3 OAuth 콜백 수정

**파일**: `app/routes/auth.google.callback.tsx`

```typescript
// 기존: 사용자 생성 후 세션 생성
const sessionId = await createSession(user.id, db);
session.set("sessionId", sessionId);

// 확장: 기본 Tenant 자동 할당
const membership = await db.query.tenantMembers.findFirst({
  where: eq(tenantMembers.userId, user.id),
});
if (membership) {
  session.set("tenantId", membership.tenantId);
}
// 멤버십 없으면 tenantId 미설정 → 온보딩 플로우로
```

---

## 4. Tenant 스코프 헬퍼

### 4.1 withTenantScope 유틸리티

**파일**: `app/lib/query/tenant-scope.ts`

```typescript
import { eq, and, SQL } from "drizzle-orm";

/**
 * Root 엔티티 쿼리에 tenant 스코프를 적용하는 헬퍼
 * 자식 엔티티는 부모 FK로 자동 격리되므로 이 헬퍼 불필요
 */
export function tenantWhere<T extends { tenantId: any }>(
  table: T,
  tenantId: string,
  additionalWhere?: SQL
): SQL {
  const tenantCondition = eq(table.tenantId, tenantId);
  return additionalWhere
    ? and(tenantCondition, additionalWhere)!
    : tenantCondition;
}
```

**사용 예시**:
```typescript
// 기존 (tenant 없음)
const results = await db.select().from(discoveries);

// 변경 후
const results = await db.select().from(discoveries)
  .where(tenantWhere(discoveries, ctx.tenantId));

// 추가 조건과 결합
const results = await db.select().from(discoveries)
  .where(tenantWhere(discoveries, ctx.tenantId, eq(discoveries.status, "EXPERIMENT")));
```

### 4.2 적용 대상

**Route Loaders** (~20개 파일):
- `dashboard._index.tsx`, `discoveries._index.tsx` 등 데이터 조회 라우트
- `api.chat.ts` — 대화 생성/조회 시 tenant 스코프

**Agent Tools** (executor.ts 수준):
- executor에서 tenantId를 toolInput에 자동 주입
- 각 도구 함수는 input.tenantId로 접근

```typescript
// executor.ts 수정
case "list_discoveries":
  return listDiscoveries(db, {
    ...toolInput,
    tenantId: tenantId,  // 자동 주입
  } as unknown as Parameters<typeof listDiscoveries>[1]);
```

**Cron Jobs** (8개):
- 각 Cron에서 tenant 목록 조회 후 루프

```typescript
const activeTenants = await db.select().from(tenants)
  .where(eq(tenants.status, "active"));

for (const tenant of activeTenants) {
  // tenant 스코프로 작업 수행
  const tenantDiscoveries = await db.select().from(discoveries)
    .where(eq(discoveries.tenantId, tenant.id));
  // ...
}
```

---

## 5. Agent 도구 설계 (2개)

### 5.1 `get_tenant_info`

```typescript
{
  name: "get_tenant_info",
  description: "현재 조직 정보를 조회합니다. 멤버 목록, 설정, 사용량을 확인합니다.",
  input_schema: {
    type: "object",
    properties: {
      includeMembers: { type: "boolean", default: true },
      includeUsage: { type: "boolean", default: false }
    }
  }
}
```

**TOOL_MIN_AUTONOMY**: 0 (조회 전용)

### 5.2 `manage_tenant_members`

```typescript
{
  name: "manage_tenant_members",
  description: "조직 멤버를 관리합니다. 초대, 역할 변경, 제거 작업을 수행합니다.",
  input_schema: {
    type: "object",
    required: ["action"],
    properties: {
      action: {
        type: "string",
        enum: ["invite", "update_role", "remove"]
      },
      userEmail: { type: "string", description: "대상 사용자 이메일 (invite/remove)" },
      userId: { type: "string", description: "대상 사용자 ID (update_role/remove)" },
      role: {
        type: "string",
        enum: ["admin", "gatekeeper", "member", "viewer"],
        description: "부여할 역할 (invite/update_role)"
      }
    }
  }
}
```

**TOOL_MIN_AUTONOMY**: 3 (관리 작업)

---

## 6. UI 설계

### 6.1 조직 설정 페이지

**라우트**: `app/routes/settings.organization.tsx`

```
┌──────────────────────────────────────────────────┐
│  조직 설정                                        │
├──────────────────────────────────────────────────┤
│                                                   │
│  ┌─ 기본 정보 ─────────────────────────────────┐ │
│  │ 조직명: [Discovery-X        ]               │ │
│  │ Slug:   [discovery-x        ]               │ │
│  │ Plan:   Enterprise                           │ │
│  └──────────────────────────────────────────────┘ │
│                                                   │
│  ┌─ 멤버 관리 ─────────────────────────────────┐ │
│  │ [+ 멤버 초대]                                │ │
│  │                                               │ │
│  │ 이름        │ 이메일              │ 역할     │ │
│  │ 윤대범      │ dbdb@gmail.com     │ Owner    │ │
│  │ 김기욱      │ ghim@gmail.com     │ Admin    │ │
│  │ 김경임      │ bbusi@gmail.com    │ Member   │ │
│  └──────────────────────────────────────────────┘ │
│                                                   │
│  ┌─ 기능 설정 ─────────────────────────────────┐ │
│  │ Shadow Mode:   [✓] 활성                      │ │
│  │ Value-up:      [✓] 활성                      │ │
│  │ Radar:         [✓] 활성                      │ │
│  │ Max Discovery:  10                            │ │
│  └──────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### 6.2 조직 전환 UI

**위치**: `app/components/layout/AppShell.tsx` 또는 `TopNav`

```
┌─ TopNav ────────────────────────────────────────┐
│ Discovery-X  [Discovery-X ▾]  윤대범  [로그아웃]│
│               ├─ Discovery-X (현재)             │
│               ├─ PartnerCo                      │
│               └─ + 새 조직 만들기               │
└──────────────────────────────────────────────────┘
```

### 6.3 멤버 초대 다이얼로그

**컴포넌트**: `app/components/tenant/InviteMemberDialog.tsx`

```
┌─ 멤버 초대 ───────────────────────┐
│                                    │
│ 이메일: [user@example.com       ] │
│ 역할:   [Member ▾              ]  │
│         ├─ Admin                   │
│         ├─ Gatekeeper              │
│         ├─ Member                  │
│         └─ Viewer                  │
│                                    │
│           [취소]  [초대 전송]      │
└────────────────────────────────────┘
```

### 6.4 조직 온보딩

**라우트**: `app/routes/onboarding.tsx`

새로운 사용자가 Tenant 멤버십이 없을 때 리다이렉트:

```
┌──────────────────────────────────────────────────┐
│  Discovery-X에 오신 것을 환영합니다               │
├──────────────────────────────────────────────────┤
│                                                   │
│  [새 조직 만들기]                                 │
│                                                   │
│  조직명: [                    ]                   │
│                                                   │
│           또는                                    │
│                                                   │
│  초대 코드로 참여: [            ]  [참여]         │
│                                                   │
└──────────────────────────────────────────────────┘
```

### 6.5 컴포넌트 목록

| 컴포넌트 | 위치 | 용도 |
|---------|------|------|
| TenantSwitcher | `app/components/tenant/TenantSwitcher.tsx` | 조직 전환 드롭다운 |
| MemberList | `app/components/tenant/MemberList.tsx` | 멤버 목록 + 역할 배지 |
| InviteMemberDialog | `app/components/tenant/InviteMemberDialog.tsx` | 초대 다이얼로그 |
| TenantSettingsForm | `app/components/tenant/TenantSettingsForm.tsx` | 조직 설정 폼 |

---

## 7. 구현 순서

### 7.1 Phase 3-A: 스키마 + 마이그레이션

```
drizzle/0019_multi_tenant.sql
├── tenants 테이블 생성 (2 인덱스)
├── tenant_members 테이블 생성 (3 인덱스)
├── 기본 Tenant 생성 (default-tenant)
├── 9개 Root 테이블에 tenant_id ALTER
├── 기존 데이터에 default-tenant 할당
├── 기존 사용자 → 기본 Tenant 멤버 등록
└── 복합 인덱스 5개 추가

app/db/schema.ts (수정)
├── tenants, tenantMembers 테이블 정의
└── 9개 Root 테이블에 tenantId 컬럼 추가

app/features/venture/db/schema.ts (수정)
└── vdSprints에 tenantId 컬럼 추가

tests/helpers/db.ts (수정)
└── 0019_multi_tenant.sql 등록
```

### 7.2 Phase 3-B: 인증 + 스코프 헬퍼

```
app/lib/auth/session.server.ts (수정)
├── SessionContext 인터페이스
├── getSessionContext()
├── requireTenantMember()
└── requireTenantAdmin()

app/lib/query/tenant-scope.ts (신규)
└── tenantWhere() 헬퍼

app/routes/auth.google.callback.tsx (수정)
└── tenantId 세션 설정

app/routes/onboarding.tsx (신규)
└── Tenant 없는 사용자 온보딩
```

### 7.3 Phase 3-C: Route Loader 스코프 적용

```
app/routes/ (~20개 파일 수정)
├── dashboard 계열 — tenantWhere 적용
├── discoveries 계열 — tenantWhere 적용
├── venture 계열 — tenantWhere 적용
├── api.chat.ts — tenantWhere 적용
└── api.cron.*.ts — tenant 루프 적용
```

### 7.4 Phase 3-D: Agent 도구 스코프 + UI

```
app/lib/agent/executor.ts (수정)
└── tenantId를 toolInput에 자동 주입

app/lib/agent/tools/tenant-tools.ts (신규)
├── getTenantInfo()
└── manageTenantMembers()

app/lib/agent/tool-registry.ts (수정)
└── 2개 도구 등록

app/routes/settings.organization.tsx (신규)
└── 조직 설정 페이지

app/components/tenant/ (신규 4개)
├── TenantSwitcher.tsx
├── MemberList.tsx
├── InviteMemberDialog.tsx
└── TenantSettingsForm.tsx

app/components/layout/AppShell.tsx (수정)
└── TenantSwitcher 통합
```

---

## 8. 테스트 계획

### 8.1 Unit 테스트

| 영역 | 테스트 파일 | 테스트 케이스 |
|------|------------|-------------|
| Tenant CRUD | `tenant.test.ts` | 생성, 업데이트, slug 유니크 검증 |
| Membership | `tenant-members.test.ts` | 가입, 역할 변경, 제거, 중복 방지 |
| Tenant Scope | `tenant-scope.test.ts` | tenantWhere 필터, 교차 테넌트 격리 |
| Session Context | `session-context.test.ts` | getSessionContext, requireTenantMember |

### 8.2 Integration 테스트

| 시나리오 | 설명 |
|---------|------|
| 마이그레이션 검증 | 기존 데이터 → default-tenant 할당 확인 |
| 교차 테넌트 격리 | Tenant A의 discovery가 Tenant B에서 보이지 않음 |
| Agent 스코프 | Agent 도구가 현재 테넌트 데이터만 접근 |
| 조직 전환 | 사용자가 다른 조직으로 전환 후 데이터 격리 확인 |

---

## 9. 성공 지표

| 지표 | 기준 |
|------|------|
| 신규 테이블 | 2개 (tenants, tenant_members) |
| ALTER 테이블 | 9개 Root 엔티티 (tenant_id 추가) |
| 신규 Agent 도구 | 2개 (62→64) |
| 신규 라우트 | 2개 (settings.organization, onboarding) |
| 신규 컴포넌트 | 4개 (TenantSwitcher, MemberList, InviteMemberDialog, TenantSettingsForm) |
| Route 수정 | ~20개 (tenant 스코프 적용) |
| 기존 데이터 보존 | 100% (마이그레이션으로 default-tenant 할당) |
| 테스트 커버리지 | 신규 코드 80% 이상 |

---

## 10. 의존성 및 제약

### 10.1 Phase 1+2 의존성

| 산출물 | Phase 3 활용 |
|--------|-------------|
| industryAdapters | tenant_id 추가 (조직별 산업 설정) |
| shadowRuns/Configs | discoveryId cascade로 간접 격리 |
| valueupAssessments | 직접 tenant_id 추가 (독립 엔티티) |
| decisionLogs | discoveryId cascade로 간접 격리 |

### 10.2 제약

- D1 ALTER TABLE은 ADD COLUMN만 지원 (NOT NULL 변경 불가 → NULL 허용 + 앱 검증)
- Venture 스키마의 vdSprints는 cross-module FK 제약 → 앱 레벨 검증
- 기존 세션 무효화 필요 (tenantId 추가 시 재로그인 유도)
- Agent 62개 도구의 일괄 수정은 executor 레벨 주입으로 최소화

---

## 참조 문서

- Plan: `docs/01-plan/features/dx-strategic-evolution-p3.plan.md`
- Phase 1 Design: `docs/02-design/features/dx-strategic-evolution.design.md`
- Phase 2 Design: `docs/02-design/features/dx-strategic-evolution-p2.design.md`
- 현재 스키마: `app/db/schema.ts` (42개 테이블)
- Agent 도구: `app/lib/agent/tool-registry.ts` (62개)
- 인증: `app/lib/auth/session.server.ts`

---

*Design 작성일: 2026-02-06*
*PDCA Feature: dx-strategic-evolution-p3*
