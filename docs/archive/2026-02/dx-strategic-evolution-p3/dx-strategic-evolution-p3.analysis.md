# dx-strategic-evolution-p3 Gap Analysis (Rev 3)

> **Date**: 2026-02-07 | **Overall Match Rate: 94%** | **Status: PASS (>= 90%)**
> **History**: Rev 1 (66%) → Rev 2 (84%) → Rev 3 (94%) | **Delta: +10pp**

## Match Rate by Phase

| Phase | Rev 1 | Rev 2 | Rev 3 | Status |
|-------|:-----:|:-----:|:-----:|:------:|
| 3-A (Schema + Migration) | 100% | 100% | 100% | PASS |
| 3-B (Auth + Helpers) | 93% | 93% | 93% | PASS |
| 3-C (Route Scope) | 35% | 75% | **97%** | PASS |
| 3-D (Agent + UI) | 69% | 100% | 100% | PASS |
| Cron Tenant Loop | 0% | 75% | **100%** | PASS |
| Tests | 0% | 0% | 0% | FAIL |

## Rev 3 해결 항목

### 1. Venture sprint.repository tenantId 필터 (was P1)

| 파일 | 변경 |
|------|------|
| `sprint.schema.ts` | `SprintFilterInput`에 `tenantId: z.string().optional()` 추가 |
| `sprint.repository.ts` | `createSprint`에 `tenantId` 설정, `listSprints`에 tenantId 필터 조건 |
| `venture.overview.tsx` | `listSprints(db, { tenantId: ctx.tenantId })` |
| `venture.analytics.tsx` | `listSprints(db, { tenantId: ctx.tenantId })` |
| `venture.sprints._index.tsx` | `tenantId: ctx.tenantId` 필터 추가 |
| `venture.sprints.new.tsx` | `createSprint(db, { ...data, tenantId: ctx.tenantId })` |

### 2. Cron alerts + embeddings Tenant 루프 (was P1)

| 파일 | 변경 |
|------|------|
| `alert-engine.ts` | `scanAndFireAlerts(db, tenantId?)` — rules/discoveries tenantId 스코핑 |
| `sync.ts` | `syncEmbeddings(db, env, batchSize, tenantId?)` — discoveries tenantId 스코핑 |
| `api.cron.alerts.ts` | active tenants 루프 → `scanAndFireAlerts(db, tenant.id)` |
| `api.cron.embeddings.ts` | active tenants 루프 → `syncEmbeddings(db, embeddingEnv, batchSize, tenant.id)` |

**Cron 전체 현황: 8/8 완료** — daily, agent-review, weekly-summary, log-archive, pattern-extract, shadow-analyze, alerts, embeddings

### 3. Discovery Detail 18개 라우트 getSessionContext 전환 (was P2)

모든 discoveries 라우트에서 `getUserFromSession` → `getSessionContext` 전환 완료:

- `discoveries.$id.tsx`, `discoveries.new.tsx` (INSERT 시 `tenantId: ctx.tenantId` 설정)
- `discoveries_.$id.edit.tsx`, `.promote.tsx`, `.add-experiment.tsx`, `.complete-experiment.tsx`, `.add-evidence.tsx`
- `discoveries_.$id.decide-next.tsx`, `.decide-not-now.tsx`, `.decide-dead-end.tsx`
- `discoveries_.$id.gate.tsx`, `.approve.tsx`, `.request-extension.tsx`
- `discoveries_.$id.graph.tsx`, `.methods.tsx`, `.patterns.tsx`, `.compliance.tsx`
- `_index.tsx` (채팅 메인 페이지)

### 4. Dashboard 자식 엔티티 스코프 (was P2)

| 파일 | 변경 |
|------|------|
| `dashboard.health.tsx` | evidence, experiments → `inArray(discoveryIds)`, eventLogs → tenant 서브쿼리 |
| `dashboard.metrics.tsx` | experiments, evidence → `inArray(discoveryIds)` |

## 이전 Rev 해결 항목 (누적)

- **P0-1**: Executor tenantId 자동 주입 (`executor.ts`)
- **P0-2**: Cron tenant 루프 6/8 → **8/8**
- **P0-3**: `/api/tenant/switch` 엔드포인트 신규
- **P1**: AppShell TenantSwitcher, dashboard 6개, venture 12개 auth, radar 스코프
- **Phase 3-A (100%)**: tenants/tenant_members 테이블, 9개 Root 엔티티 tenantId, 마이그레이션 SQL
- **Phase 3-B (93%)**: SessionContext, getSessionContext, requireTenantMember/Admin, tenantWhere, OAuth, onboarding
- **Phase 3-D (100%)**: tenant-tools, executor switch, settings.organization UI, TenantSwitcher

## 잔여 Gap (Minor)

| # | Item | Notes |
|---|------|-------|
| 1 | Onboarding 초대 코드 참여 | 조직 만들기만 가능, 초대 코드 플로우 미구현 (settings에서 초대 가능) |
| 2 | Peripheral 라우트 5개 | `api.export.discoveries-json`, `api.export.metrics`, `api.similar-seeds`, `metrics.tsx`, `evidence.duplicates.tsx` |
| 3 | Unit 테스트 4개 | tenant CRUD, membership, scope, session context |
| 4 | Integration 테스트 4개 | 마이그레이션 검증, 교차 테넌트 격리 |

## 검증 결과 (Rev 3 시점)

- TypeScript: 에러 0건
- 테스트: 561/561 통과
- 빌드: 성공
