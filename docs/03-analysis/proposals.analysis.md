# Gap Analysis: proposals

> **Feature**: proposals (사업제안 CRUD + 협업)
> **Date**: 2026-02-10
> **Method**: tmux Agent Teams (Worker 1)
> **Design Doc**: `docs/02-design/features/proposals.design.md`

---

## 1. Executive Summary

The proposals feature implementation **closely matches** the design document, with several notable improvements over the original design — particularly around security (tenant isolation and owner verification for DELETE/comments/actions APIs). The design documented several critical security gaps (GAP-1 through GAP-4) that have since been **resolved** in the implementation. Additionally, the sequential query performance issue (P1) has been addressed with `Promise.all`. One new API endpoint (PUT for update) was added beyond the design spec. A `constants.ts` file was also added to centralize status labels and section config, addressing the design's noted issue of duplicate constant definitions. The ProgressPanel checkbox is no longer readOnly — it now uses `useFetcher` to toggle actions.

### Match Rate

| Category | Items | Pass | Fail | Rate |
|----------|-------|------|------|------|
| Schema | 42 | 42 | 0 | 100% |
| Routes | 8 | 8 | 0 | 100% |
| Components | 23 | 22 | 1 | 96% |
| API Endpoints | 6 | 6 | 0 | 100% |
| Business Logic | 12 | 12 | 0 | 100% |
| **Total** | **91** | **90** | **1** | **99%** |

## 2. Detailed Findings

### 2.1 Schema

#### 2.1.1 `proposals` Table

| # | Design Requirement | Status | Evidence | Notes |
|---|-------------------|--------|----------|-------|
| 1 | `id` text PK with `crypto.randomUUID()` | PASS | `schema.ts:37` | `text("id").primaryKey().$defaultFn(() => crypto.randomUUID())` |
| 2 | `tenant_id` text NOT NULL, FK → tenants | PASS | `schema.ts:38` | `.notNull().references(() => tenants.id)` |
| 3 | `title` text NOT NULL | PASS | `schema.ts:39` | `.notNull()` |
| 4 | `description` text nullable | PASS | `schema.ts:40` | No `.notNull()` — nullable by default |
| 5 | `status` text NOT NULL default `'DRAFT'` | PASS | `schema.ts:41` | `.notNull().default(ProposalStatus.DRAFT)` |
| 6 | `team_size` integer nullable | PASS | `schema.ts:42` | `integer("team_size")` — nullable |
| 7 | `start_date` text nullable | PASS | `schema.ts:43` | `text("start_date")` — nullable |
| 8 | `budget` text nullable | PASS | `schema.ts:44` | `text("budget")` — nullable |
| 9 | `owner_id` text NOT NULL, FK → users | PASS | `schema.ts:45` | `.notNull().references(() => users.id)` |
| 10 | `created_at` integer timestamp NOT NULL default unixepoch | PASS | `schema.ts:46` | `integer("created_at", { mode: "timestamp" }).notNull().default(sql\`(unixepoch())\`)` |
| 11 | `updated_at` integer timestamp NOT NULL default unixepoch | PASS | `schema.ts:47` | Same pattern as `created_at` |
| 12 | Index: `idx_proposals_tenant` | PASS | `schema.ts:50` | `index("idx_proposals_tenant").on(table.tenantId)` |
| 13 | Index: `idx_proposals_owner` | PASS | `schema.ts:51` | `index("idx_proposals_owner").on(table.ownerId)` |
| 14 | Index: `idx_proposals_status` | PASS | `schema.ts:52` | `index("idx_proposals_status").on(table.status)` |

#### 2.1.2 `proposal_sections` Table

| # | Design Requirement | Status | Evidence | Notes |
|---|-------------------|--------|----------|-------|
| 15 | `id` text PK UUID | PASS | `schema.ts:63` | Same PK pattern |
| 16 | `proposal_id` FK → proposals, cascade | PASS | `schema.ts:64` | `{ onDelete: "cascade" }` |
| 17 | `type` text NOT NULL | PASS | `schema.ts:65` | `.notNull()` |
| 18 | `content` text NOT NULL default `''` | PASS | `schema.ts:66` | `.notNull().default("")` |
| 19 | `sort_order` integer NOT NULL default 0 | PASS | `schema.ts:67` | `.notNull().default(0)` |

#### 2.1.3 `proposal_milestones` Table

| # | Design Requirement | Status | Evidence | Notes |
|---|-------------------|--------|----------|-------|
| 20 | `id` text PK UUID | PASS | `schema.ts:81` | Same PK pattern |
| 21 | `proposal_id` FK → proposals, cascade | PASS | `schema.ts:82` | `{ onDelete: "cascade" }` |
| 22 | `title` text NOT NULL | PASS | `schema.ts:83` | `.notNull()` |
| 23 | `status` text NOT NULL default `'PENDING'` | PASS | `schema.ts:84` | `.default(MilestoneStatus.PENDING)` |
| 24 | `start_date` text nullable | PASS | `schema.ts:85` | `text("start_date")` |
| 25 | `end_date` text nullable | PASS | `schema.ts:86` | `text("end_date")` |
| 26 | `sort_order` integer NOT NULL default 0 | PASS | `schema.ts:87` | `.notNull().default(0)` |

#### 2.1.4 `proposal_actions` Table

| # | Design Requirement | Status | Evidence | Notes |
|---|-------------------|--------|----------|-------|
| 27 | `id` text PK UUID | PASS | `schema.ts:101` | Same PK pattern |
| 28 | `proposal_id` FK → proposals, cascade | PASS | `schema.ts:102` | `{ onDelete: "cascade" }` |
| 29 | `title` text NOT NULL | PASS | `schema.ts:103` | `.notNull()` |
| 30 | `assignee_id` FK → users, nullable | PASS | `schema.ts:104` | `.references(() => users.id)` |
| 31 | `completed` integer NOT NULL default 0 | PASS | `schema.ts:105` | `.notNull().default(0)` — mode: "number" (not explicitly set, defaults to number) |
| 32 | `due_date` text nullable | PASS | `schema.ts:106` | `text("due_date")` |
| 33 | `created_at` integer timestamp NOT NULL | PASS | `schema.ts:107` | `{ mode: "timestamp" }` |

#### 2.1.5 `proposal_comments` Table

| # | Design Requirement | Status | Evidence | Notes |
|---|-------------------|--------|----------|-------|
| 34 | `id` text PK UUID | PASS | `schema.ts:121` | Same PK pattern |
| 35 | `proposal_id` FK → proposals, cascade | PASS | `schema.ts:122` | `{ onDelete: "cascade" }` |
| 36 | `author_id` text NOT NULL, FK → users | PASS | `schema.ts:123` | `.notNull().references(() => users.id)` |
| 37 | `content` text NOT NULL | PASS | `schema.ts:124` | `.notNull()` |
| 38 | `created_at` integer timestamp NOT NULL | PASS | `schema.ts:125` | `{ mode: "timestamp" }` |

#### 2.1.6 `proposal_members` Table

| # | Design Requirement | Status | Evidence | Notes |
|---|-------------------|--------|----------|-------|
| 39 | `proposal_id` FK → proposals, cascade | PASS | `schema.ts:139` | `{ onDelete: "cascade" }` |
| 40 | `user_id` FK → users, NOT NULL | PASS | `schema.ts:140` | `.notNull().references(() => users.id)` |
| 41 | `joined_at` integer timestamp NOT NULL | PASS | `schema.ts:141` | `{ mode: "timestamp" }` |
| 42 | PK 없음 (Known Issue) | PASS | `schema.ts:136-147` | No `.primaryKey()` — matches design (Known Issue #1) |

#### 2.1.7 Enums

| # | Design Requirement | Status | Evidence | Notes |
|---|-------------------|--------|----------|-------|
| — | `ProposalStatus` (4 values: DRAFT/REVIEWING/APPROVED/REJECTED) | PASS | `schema.ts:9-14` | Exact match |
| — | `MilestoneStatus` (3 values: COMPLETED/ACTIVE/PENDING) | PASS | `schema.ts:16-20` | Exact match |
| — | `ProposalSectionType` (5 values: market/target/model/advantage/finance) | PASS | `schema.ts:22-28` | Exact match, lowercase |

#### 2.1.8 Schema Merge

| # | Design Requirement | Status | Evidence | Notes |
|---|-------------------|--------|----------|-------|
| — | `proposalSchema` spread merge in `app/db/index.ts` | PASS | `db/index.ts:4,7,17` | `import * as proposalSchema` + spread + re-export |

### 2.2 Routes

| # | Design Requirement | Status | Evidence | Notes |
|---|-------------------|--------|----------|-------|
| 1 | `proposals.tsx` — layout with loader (tenantId filter) | PASS | `routes/proposals.tsx:11-44` | `WHERE tenant_id = ctx.tenantId` + AppShell + ProposalListSidebar + Outlet |
| 2 | `proposals._index.tsx` — empty state | PASS | `routes/proposals._index.tsx:1-31` | Link to `/proposals/new` |
| 3 | `proposals.new.tsx` — action (INSERT proposal + 5 sections) | PASS | `routes/proposals.new.tsx:8-52` | Title validation + 1 INSERT proposals + batch INSERT sections |
| 4 | `proposals.$id.tsx` — loader (5 queries) + detail + progress | PASS | `routes/proposals.$id.tsx:19-76` | 5 queries via Promise.all (improved from sequential!) |
| 5 | `api.proposals.ts` — GET (list) | PASS | `routes/api.proposals.ts:8-24` | `WHERE tenant_id = ctx.tenantId` |
| 6 | `api.proposals.ts` — DELETE | PASS | `routes/api.proposals.ts:79-93` | Now with tenantId + ownerId verification |
| 7 | `api.proposals.$id.comments.ts` — GET/POST | PASS | `routes/api.proposals.$id.comments.ts:9-72` | Now with tenant verification |
| 8 | `api.proposals.$id.actions.ts` — POST toggle | PASS | `routes/api.proposals.$id.actions.ts:8-43` | Now with tenant + proposalId verification |

### 2.3 Components

| # | Design Requirement | Status | Evidence | Notes |
|---|-------------------|--------|----------|-------|
| 1 | `ProposalListSidebar` — props: proposals[], activeId? | PASS | `ProposalListSidebar.tsx:14-17` | Interface matches |
| 2 | `ProposalListSidebar` — useLocation + useSidebar | PASS | `ProposalListSidebar.tsx:21-22` | Both hooks used |
| 3 | `ProposalListSidebar` — mobile overlay (fixed z-50 + backdrop) | PASS | `ProposalListSidebar.tsx:27-33` | `bg-black/50 sm:hidden` |
| 4 | `ProposalListSidebar` — desktop static (sm:static) | PASS | `ProposalListSidebar.tsx:38` | `sm:static sm:z-auto` |
| 5 | `ProposalListSidebar` — active item highlight | PASS | `ProposalListSidebar.tsx:61-72` | `isActive` check + conditional class |
| 6 | `ProposalListSidebar` — status badge colors | PASS | `ProposalListSidebar.tsx:78-83` | Uses `PROPOSAL_STATUS_COLORS` from constants |
| 7 | `ProposalForm` — props: defaultValues?, action? | PASS | `ProposalForm.tsx:7-17` | Interface matches |
| 8 | `ProposalForm` — useNavigation for submitting state | PASS | `ProposalForm.tsx:21-22` | `navigation.state === "submitting"` |
| 9 | `ProposalForm` — uncontrolled form (defaultValue) | PASS | `ProposalForm.tsx:37,45,61,69,75` | All inputs use `defaultValue` |
| 10 | `ProposalForm` — meta fields 3-column grid | PASS | `ProposalForm.tsx:54` | `grid-cols-1 sm:grid-cols-3` (responsive improvement) |
| 11 | `ProposalForm` — 5 section textareas | PASS | `ProposalForm.tsx:86-104` | `SECTION_CONFIG.map()` — 5 sections |
| 12 | `ProposalForm` — submit disabled while submitting | PASS | `ProposalForm.tsx:109` | `disabled={isSubmitting}` |
| 13 | `ProposalDetail` — props: proposal, sections[], comments[], currentUserId | PASS | `ProposalDetail.tsx:21-34` | Interface matches |
| 14 | `ProposalDetail` — title + status Badge | PASS | `ProposalDetail.tsx:48-53` | Uses Badge component + status variants |
| 15 | `ProposalDetail` — meta cards 3-column | PASS | `ProposalDetail.tsx:63` | `grid-cols-1 sm:grid-cols-3` (responsive improvement) |
| 16 | `ProposalDetail` — sections sorted by sortOrder | PASS | `ProposalDetail.tsx:43` | `[...sections].sort((a, b) => a.sortOrder - b.sortOrder)` |
| 17 | `ProposalDetail` — TeamDiscussion embedded | PASS | `ProposalDetail.tsx:113-117` | Embedded at bottom of detail |
| 18 | `ProgressPanel` — props: milestones[], actions[], totalProgress, daysRemaining | PASS | `ProgressPanel.tsx:20-26` | Interface matches + extra `proposalId` prop |
| 19 | `ProgressPanel` — progress bar dynamic width | PASS | `ProgressPanel.tsx:49-52` | `style={{ width: \`${totalProgress}%\` }}` |
| 20 | `ProgressPanel` — milestone status icons | PASS | `ProgressPanel.tsx:66-76` | COMPLETED=green check, ACTIVE=brand, default=border |
| 21 | `ProgressPanel` — action checkboxes **readOnly** | **FAIL** | `ProgressPanel.tsx:99-112` | **IMPROVED**: Now uses `useFetcher` to toggle — no longer readOnly |
| 22 | `TeamDiscussion` — props: proposalId, comments[], currentUserId | PASS | `TeamDiscussion.tsx:12-16` | Interface matches |
| 23 | `TeamDiscussion` — useState + useFetcher + submit clear | PASS | `TeamDiscussion.tsx:27-41` | `setContent("")` after submit |

### 2.4 API Endpoints

| # | Design Requirement | Status | Evidence | Notes |
|---|-------------------|--------|----------|-------|
| 1 | `GET /api/proposals` — list with tenantId filter | PASS | `api.proposals.ts:8-24` | `WHERE tenant_id = ctx.tenantId` |
| 2 | `DELETE /api/proposals` — delete by id | PASS | `api.proposals.ts:79-93` | **IMPROVED**: Now checks tenantId + ownerId |
| 3 | `GET /api/proposals/:id/comments` — with author JOIN | PASS | `api.proposals.$id.comments.ts:9-37` | LEFT JOIN users + tenant check |
| 4 | `POST /api/proposals/:id/comments` — FormData content | PASS | `api.proposals.$id.comments.ts:39-72` | Content validation + tenant check |
| 5 | `POST /api/proposals/:id/actions` — toggle completed | PASS | `api.proposals.$id.actions.ts:8-43` | **IMPROVED**: Verifies proposal tenantId + actionId belongs to proposal |
| 6 | `PUT /api/proposals` — update proposal + sections | PASS | `api.proposals.ts:35-77` | **BONUS**: Not in design — new UPDATE API |

### 2.5 Business Logic

| # | Design Requirement | Status | Evidence | Notes |
|---|-------------------|--------|----------|-------|
| 1 | Proposal creation validates title required | PASS | `proposals.new.tsx:20-21` | `if (!title)` → 400 error |
| 2 | 5 sections auto-created on proposal create | PASS | `proposals.new.tsx:42-49` | `Object.values(ProposalSectionType)` batch insert |
| 3 | Detail page 404 if proposal not found | PASS | `proposals.$id.tsx:30-31` | `throw new Response("Not Found", { status: 404 })` |
| 4 | `totalProgress` = completedActions / totalActions * 100 | PASS | `proposals.$id.tsx:55-56` | `Math.round((completedActions / actions.length) * 100)` |
| 5 | `daysRemaining` = max(0, startDate + 30d - now) | PASS | `proposals.$id.tsx:58-64` | `Math.max(0, Math.ceil(...))` |
| 6 | Comments use author name via LEFT JOIN | PASS | `proposals.$id.tsx:42-51` | `leftJoin(users, eq(...authorId, users.id))` |
| 7 | Cascade delete chain (proposals → 5 child tables) | PASS | `0021_proposals.sql:32,46,58,71,80` | All 5 FKs have `ON DELETE cascade` |
| 8 | Layout loader: tenantId filter | PASS | `proposals.tsx:38` | `eq(proposals.tenantId, ctx.tenantId)` |
| 9 | Authentication check on all routes | PASS | All route files | `getSessionContext` → redirect/401 |
| 10 | Detail page queries via Promise.all | PASS | `proposals.$id.tsx:38` | `const [sections, milestones, actions, commentsRaw] = await Promise.all([...])` |
| 11 | Section batch INSERT (not sequential) | PASS | `proposals.new.tsx:43-49` | Single `.values(sectionValues)` call |
| 12 | Detail page tenant isolation | PASS | `proposals.$id.tsx:34-36` | `if (proposal.tenantId !== ctx.tenantId)` → 404 |

## 3. Gaps Found

### 3.1 Design vs Implementation Deviations (Non-Failures)

| # | Item | Design Says | Implementation | Severity | Assessment |
|---|------|------------|---------------|----------|-----------|
| 1 | ProgressPanel checkbox | `readOnly` (design §5.4) | Interactive via `useFetcher` toggle | N/A | **IMPROVEMENT** — resolves Known Issue #16 |
| 2 | Security GAP-1 (cross-tenant detail) | No tenant check (design §6.3) | `tenantId !== ctx.tenantId` → 404 | N/A | **FIXED** in `proposals.$id.tsx:34-36` |
| 3 | Security GAP-2 (cross-tenant delete) | No tenant/owner check (design §6.3) | tenantId + ownerId verification | N/A | **FIXED** in `api.proposals.ts:82-89` |
| 4 | Security GAP-3 (cross-tenant comments) | No tenant check (design §6.3) | Proposal tenantId check before GET/POST | N/A | **FIXED** in `api.proposals.$id.comments.ts:18-22,48-52` |
| 5 | Security GAP-4 (unscoped action toggle) | No proposal/tenant check (design §6.3) | Proposal tenantId + actionId belongs to proposal | N/A | **FIXED** in `api.proposals.$id.actions.ts:20-32` |
| 6 | Performance P1 (sequential queries) | 5 sequential queries (design §7.1) | `Promise.all` for 4 child queries | N/A | **FIXED** in `proposals.$id.tsx:38` |
| 7 | Performance P2 (section batch INSERT) | 5 sequential INSERTs (design §7.1) | Single batch `.values(sectionValues)` | N/A | **FIXED** in `proposals.new.tsx:43-49` |
| 8 | New PUT API endpoint | Not in design | Full UPDATE with sections support | N/A | **BONUS** feature |
| 9 | Constants centralized | Duplicate definitions across 3 files (Known Issue #17) | `app/features/proposals/constants.ts` — single source | N/A | **FIXED** |
| 10 | Meta grid responsive | `grid-cols-3` (design §5.4) | `grid-cols-1 sm:grid-cols-3` | N/A | **IMPROVEMENT** — fixes Known Issue #18 |

### 3.2 Remaining Known Issues (Design-Acknowledged)

These items are acknowledged as known issues in the design document and remain unfixed:

| # | Issue | Design Ref | Severity | Status |
|---|-------|-----------|----------|--------|
| 1 | `proposal_members` no PK (duplicate members possible) | Known Issue #1 | HIGH | Open |
| 2 | Drizzle `relations()` not defined | Known Issue #2 | MEDIUM | Open |
| 3 | No `(proposal_id, type)` unique constraint on sections | Known Issue #3 | MEDIUM | Open |
| 4 | User FK `ON DELETE no action` (orphan records) | Known Issue #4 | MEDIUM | Open |
| 5 | `completed` integer `mode: "number"` not `mode: "boolean"` | Known Issue #5 | LOW | Open |
| 6 | Enum case inconsistency (UPPERCASE status vs lowercase section) | Known Issue #6 | LOW | Open |
| 7 | Child tables missing `updated_at` | Known Issue #7 | LOW | Open |
| 8 | `budget` text (no numeric aggregation) | Known Issue #8 | LOW | Open |
| 9 | Milestone CRUD not implemented (read-only) | Known Issue #11 | MEDIUM | Open |
| 10 | Action create/delete not implemented (toggle only) | Known Issue #12 | MEDIUM | Open |
| 11 | Member management CRUD not implemented (schema only) | Known Issue #13 | MEDIUM | Open |
| 12 | Comment edit/delete not implemented | Known Issue #14 | LOW | Open |
| 13 | Heading hierarchy skip (h1→h3 in ProgressPanel) | Known Issue #22 | LOW | Open |
| 14 | ProgressPanel inline render (not via AppShell contextPanel) | Known Issue #23 | LOW | Open |

### 3.3 Actual Gaps (Implementation Missing or Wrong)

| # | Gap | Severity | Notes |
|---|-----|----------|-------|
| 1 | `bg-green-500` hardcoded for milestone icon | Minor | Design §5.4 says Axis token. Implementation uses `var(--axis-text-success,#22C55E)` with fallback — **actually resolved with token + fallback**. Re-checking... this is PASS. |

**No critical or major gaps found.**

## 4. Recommendations

### 4.1 Immediate (Before PoC 2)

1. **Update Design Document**: The design doc was written based on an earlier state. Multiple Known Issues (GAP-1~4, P1, P2, readOnly checkbox, constants duplication, grid responsive) have been resolved. The design doc should be updated to reflect current implementation.

2. **Add PUT API to Design**: The new `PUT /api/proposals` endpoint for updating proposals and sections is not documented in the design. Add it to §4.1 API endpoint table.

### 4.2 PoC 2 Priorities

3. **Add composite PK to `proposal_members`**: Known Issue #1 — add `primaryKey(proposalId, userId)` to prevent duplicate memberships.

4. **Add unique constraint on sections**: Known Issue #3 — `(proposal_id, type)` should be unique to prevent duplicate section types per proposal.

5. **Implement Milestone/Action CRUD**: Known Issues #11, #12 — currently read-only/toggle-only.

6. **Implement Member management CRUD**: Known Issue #13 — schema exists but no API.

### 4.3 Nice-to-Have

7. **Define Drizzle `relations()`**: Known Issue #2 — enables `db.query.proposals.findMany({ with: { sections: true } })`.

8. **ProgressPanel via AppShell `contextPanel` prop**: Known Issue #23 — cleaner architecture.

9. **Heading hierarchy**: Known Issue #22 — fix `h3` to proper semantic hierarchy.

---

## 5. Conclusion

The proposals feature implementation achieves a **99% match rate** with the design document. All 42 schema items, 8 routes, 6 API endpoints, and 12 business logic items pass verification. The only "failure" is that the ProgressPanel checkbox is no longer readOnly as designed — but this is an **improvement** that resolves a known issue. Multiple critical security gaps documented in the design have been proactively fixed. The implementation exceeds the design specification with an additional PUT API for proposal updates.

**Overall Assessment**: PASS — Ready for PoC 2 phase.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-02-10 | Initial gap analysis — tmux Agent Teams Worker 1 | Claude |
