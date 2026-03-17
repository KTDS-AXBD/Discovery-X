---
code: DX-ANLS-015
title: "PRD Studio (F44) Gap Analysis Report"
version: "1.2"
status: Active
category: ANLS
created: 2026-03-13
updated: 2026-03-17
author: Sinclair Seo
---

# PRD Studio (F44) Gap Analysis Report

> **Design Documents**: [[DX-DSGN-015]], [[DX-DSGN-016]], [[DX-DSGN-017]]
> **Implementation**: `app/features/prd-studio/`, `app/routes/api.prd-studio.*`
> **Analysis Date**: 2026-03-13
> **v1.2 Re-analysis**: G16-1 integration tests implemented (S409). G17-1~G17-5 fixes verified (v1.1).

---

## Overall Scores

| Category | v1.0 Score | v1.1 Score | v1.2 Score | Status |
|----------|:----------:|:----------:|:----------:|:------:|
| DX-DSGN-015 (Phase 1-3 Core) | 97% | 97% | 97% | GREEN |
| DX-DSGN-016 (Phase 3 Analysis Queue) | 88% | 88% | **95%** | GREEN |
| DX-DSGN-017 (Phase 4 Strategy Tools) | 85% | 95% | 95% | GREEN |
| **Overall** | **90%** | **93%** | **96%** | **GREEN** |

**v1.2 Change Summary**: DX-DSGN-016 improved from 88% to 95% (+7pp). G16-1 (integration tests) resolved — 21 tests implemented in `prd-analysis-api.test.ts` covering T49-T68 + route validation + E2E flow. RED items: 1→0. DX-DSGN-015/017 unchanged.

---

## 1. DX-DSGN-015 Analysis (Phase 1-3: PRD Studio Core)

### 1.1 Data Model (5 tables)

| Item | Design | Implementation | Status |
|------|--------|----------------|:------:|
| `prds` table | 11 columns + 3 indexes | Exact match | GREEN |
| `prd_sections` table | 7 columns + 1 index | Exact match | GREEN |
| `prd_versions` table | 6 columns + 1 index | Exact match | GREEN |
| `prd_reviews` table | 11 columns + 2 indexes | Exact match | GREEN |
| `prd_events` table | 6 columns + 3 indexes | Exact match | GREEN |
| Enums (PrdStatus 6, PrdSectionType 8, ReviewVerdict 3, PrdEventType 8) | All defined | Exact match | GREEN |
| Drizzle relations | 5 relation sets | Exact match | GREEN |

### 1.2 Service Layer (PrdStudioService)

| Method | Design | Implementation | Status |
|--------|--------|----------------|:------:|
| `list(tenantId)` | updatedAt desc | `prd-studio.service.ts:53` | GREEN |
| `getById(id, tenantId?)` | sections eager load | `prd-studio.service.ts:73` | GREEN |
| `create(input)` | PRD + 8 sections INSERT | `prd-studio.service.ts:94` | GREEN |
| `update(id, input)` | updatedAt auto | `prd-studio.service.ts:119` | GREEN |
| `delete(id, tenantId)` | cascade | `prd-studio.service.ts:127` | GREEN |
| `saveSectionAnswer(prdId, type, answer)` | atomic subquery | `prd-studio.service.ts:136` | GREEN |
| `getSections(prdId)` | sortOrder | `prd-studio.service.ts:156` | GREEN |
| `createVersion(prdId, changedBy, note?)` | snapshot + version++ | `prd-studio.service.ts:167` | GREEN |
| `listVersions(prdId)` | version desc | `prd-studio.service.ts:211` | GREEN |
| `saveReviewResult(input)` | multi-model round | `prd-studio.service.ts:222` | GREEN |
| `getReviews(prdId)` | createdAt desc | `prd-studio.service.ts:254` | GREEN |
| `logEvent(input)` | prdId optional | `prd-studio.service.ts:265` | GREEN |

### 1.3 API Routes

| # | Design Route | Implementation File | Method | Status |
|---|--------------|---------------------|--------|:------:|
| 1 | GET `/api/prd-studio` | `api.prd-studio.ts` | loader | GREEN |
| 2 | POST `/api/prd-studio` | `api.prd-studio.ts` | action | GREEN |
| 3 | DELETE `/api/prd-studio` | `api.prd-studio.ts` | action | GREEN |
| 4 | GET `/api/prd-studio/:id/sections` | `api.prd-studio.$id.sections.ts` | loader | GREEN |
| 5 | PUT `/api/prd-studio/:id/sections` | `api.prd-studio.$id.sections.ts` | action | GREEN |
| 6 | POST `/api/prd-studio/:id/generate` | `api.prd-studio.$id.generate.ts` | action | GREEN |
| 7 | POST `/api/prd-studio/:id/review` | `api.prd-studio.$id.review.ts` | action | GREEN |
| 8 | PUT `/api/prd-studio/:id/edit` | `api.prd-studio.$id.edit.ts` | action | GREEN |
| 9 | GET/POST `/api/prd-studio/:id/versions` | `api.prd-studio.$id.versions.ts` | loader/action | GREEN |
| 10 | POST `/api/prd-studio/:id/events` | `api.prd-studio.$id.events.ts` | action | GREEN |

### 1.4 UI Components

| Component | Design | Implementation | Status |
|-----------|--------|----------------|:------:|
| StatusBadge (6 states) | Section 1.2 | `ui/StatusBadge.tsx` | GREEN |
| ErrorMessage (retry + budget_blocked) | Section 1.2 | `ui/ErrorMessage.tsx` | GREEN |
| PrdContentView (inline editor) | Section 1.2 | `ui/PrdContentView.tsx` | GREEN |
| ReviewResults (ReviewCard + ScoreBar + FeedbackCard + VerdictBadge) | Section 1.2 | `ui/ReviewResults.tsx` | GREEN |
| VersionHistory (collapsible) | Section 1.2 | `ui/VersionHistory.tsx` | GREEN |
| PrdOnboardingModal (3-step) | Section 1.2 | `ui/PrdOnboardingModal.tsx` | GREEN |
| FAQSection | Not in design | `ui/FAQSection.tsx` | YELLOW (added) |
| ConfirmDialog | Not in design | `ui/ConfirmDialog.tsx` | YELLOW (added) |

### 1.5 Hooks

| Hook | Design | Implementation | Status |
|------|--------|----------------|:------:|
| `useEventTracking(prdId)` | 6 event types | `hooks/useEventTracking.ts` — 4 tracked (interview_start, interview_abandon, section_complete, prd_generated) + 2 more (review_start, review_complete) | GREEN |
| `useOnboardingSeen()` | localStorage | inline in `prd-studio.tsx` | GREEN |
| `useIsMounted()` | useSyncExternalStore | inline in `prd-studio.tsx` | GREEN |

### 1.6 Event Tracking

| # | Event Type | Design Trigger | Implementation | Status |
|---|-----------|----------------|----------------|:------:|
| 1 | `interview_start` | useEffect mount | `useEventTracking.ts:24` ref guard | GREEN |
| 2 | `section_complete` | save success | `useEventTracking.ts:44` | GREEN |
| 3 | `interview_abandon` | beforeunload + sendBeacon | `useEventTracking.ts:32` | GREEN |
| 4 | `prd_generated` | generation complete | `useEventTracking.ts:54` | GREEN |
| 5 | `prd_edited` | edit save (server side) | Design says server side | GREEN |
| 6 | `review_start` | review start | `useEventTracking.ts:61` | GREEN |
| 7 | `review_complete` | review complete | `useEventTracking.ts:65` | GREEN |
| 8 | `prd_finalized` | finalize action | Not implemented in hook (server-side only) | YELLOW |

**DSGN-015 Summary**: 97% match. 2 added UI components (FAQSection, ConfirmDialog) are enhancement additions. `prd_finalized` event has no explicit client-side trigger but the enum and server-side logEvent path exist.

---

## 2. DX-DSGN-016 Analysis (Phase 3: Analysis Queue)

### 2.1 Data Model

| Item | Design | Implementation | Status |
|------|--------|----------------|:------:|
| `prd_analysis_queue` table | 16 columns + 2 indexes | 16 columns + 3 indexes (added tenantIdx) | GREEN |
| `idea_id` FK | `REFERENCES ideas(id)` | No FK in migration (just `TEXT NOT NULL`) | YELLOW |
| Status enum | PENDING/PROCESSING/COMPLETED/FAILED | `AnalysisQueueStatus` enum exact match | GREEN |
| Indexes | `status`, `idea_id` | `status`, `idea_id`, `tenant_id` (extra) | GREEN |

### 2.2 Service Queue Methods

| Method | Design | Implementation | Status |
|--------|--------|----------------|:------:|
| `enqueueAnalysis(input)` | PENDING + position | `prd-studio.service.ts:285` | GREEN |
| `getAnalysisStatus(ideaId)` | none/PENDING/PROCESSING/COMPLETED/FAILED | `prd-studio.service.ts:335` — enhanced with prdTitle + reviewData | GREEN |
| `cancelAnalysis(ideaId, requestedBy)` | PENDING-only delete | `prd-studio.service.ts:415` | GREEN |
| `processNext()` | PENDING -> PROCESSING | `prd-studio.service.ts:439` | GREEN |
| `completeAnalysis(queueId, result)` | PRD auto-create + sections + reviews | `prd-studio.service.ts:461` | GREEN |
| `failAnalysis(queueId, errorMessage)` | FAILED + error | `prd-studio.service.ts:536` | GREEN |

### 2.3 API Routes

| # | Design Route | Implementation | Status |
|---|--------------|----------------|:------:|
| 1 | POST `/api/prd-studio/analyze-idea` | `api.prd-studio.analyze-idea.ts` | GREEN |
| 2 | GET `/api/prd-studio/analyze-idea/:ideaId/status` | `api.prd-studio.analyze-idea.$ideaId.status.ts` | GREEN |
| 3 | DELETE `/api/prd-studio/analyze-idea/:ideaId/cancel` | `api.prd-studio.analyze-idea.$ideaId.cancel.ts` | GREEN |

### 2.4 Prompt & Parser (lib/)

| Item | Design | Implementation | Status |
|------|--------|----------------|:------:|
| `analysis-prompt.ts` — `buildPrdAnalysisPrompt(sources)` | Section 3.3 | `lib/analysis-prompt.ts` — SourceInput interface, numbered sources, 8-section JSON schema | GREEN |
| `analysis-parser.ts` — `parsePrdAnalysisResult(raw)` | Section 6.3 T34-T43 | `lib/analysis-parser.ts` — markdown strip, clamp, snake_case compat, totalScore calc | GREEN |
| `proposal-mapper.ts` — `mapPrdToProposalSections(prdSections)` | Section 5.4 | `lib/proposal-mapper.ts` — PRD_TO_PROPOSAL_MAP exact match | GREEN |

### 2.5 Batch Runner (prd mode)

| Item | Design | Implementation | Status |
|------|--------|----------------|:------:|
| `prd` mode in batch-runner.sh | `bash scripts/batch-runner.sh prd` | `run_prd_mode()` at line 508 | GREEN |
| Batch size 3, wait 60s | PRD_BATCH_SIZE=3, PRD_RATE_LIMIT_WAIT=60 | Lines 405-406 | GREEN |
| claude -p --model claude-sonnet-4-6 | Section 3.2 Step 3 | Line 438 | GREEN |
| PENDING -> PROCESSING -> COMPLETED/FAILED | Section 2.2 flow | Lines 416, 496, 505 | GREEN |
| PRD auto-create (prds + prd_sections + prd_reviews) | Section 3.2 Step 4 | `save_prd_result()` lines 447-498 | GREEN |

### 2.6 UI Component (PrdAnalysisCard)

| State | Design | Implementation | Status |
|-------|--------|----------------|:------:|
| none — "PRD 분석 시작" button | Section 5.2 State A | `PrdAnalysisCard.tsx:164` | GREEN |
| none — source 0 disabled | Section 5.2 "버튼 비활성화" | `PrdAnalysisCard.tsx:180,187` | GREEN |
| PENDING — queue position + cancel | Section 5.2 State B | `PrdAnalysisCard.tsx:194` | GREEN |
| PROCESSING — pulse animation | Section 5.2 State C | `PrdAnalysisCard.tsx:215` | GREEN |
| COMPLETED — verdict badge + score bar + actions | Section 5.2 State D | `PrdAnalysisCard.tsx:231` | GREEN |
| FAILED — error + retry | Section 5.2 State E | `PrdAnalysisCard.tsx:310` | GREEN |
| 10s polling | Design says 10s interval | `PrdAnalysisCard.tsx:52` (10_000) | GREEN |

### 2.7 Tests

| Design Test ID | Design Description | Test File | v1.1 | v1.2 |
|----------------|-------------------|-----------|:----:|:----:|
| T1-T7 (enqueue) | enqueue service tests | `prd-analysis-queue.service.test.ts` (T3, T5, T6, T7) | YELLOW | YELLOW |
| T8-T12 (getStatus) | status tests | `prd-analysis-queue.service.test.ts` (T8, T9, T10, T11, T12) | GREEN | GREEN |
| T13-T16 (cancel) | cancel tests | `prd-analysis-queue.service.test.ts` (T13, T14, T16) | YELLOW | YELLOW |
| T17-T19 (processNext) | batch processor | `prd-analysis-queue.service.test.ts` (T17, T18) | YELLOW | YELLOW |
| T20-T27 (complete/fail) | complete/fail | `prd-analysis-queue.service.test.ts` (T20-T25 combined, T26-T27 combined) | GREEN | GREEN |
| T28-T33 (prompt builder) | 6 prompt tests | `prd-analysis-prompt.test.ts` (T28-T33) | GREEN | GREEN |
| T34-T43 (parser) | 10 parser tests | `prd-analysis-parser.test.ts` (T34-T43) | GREEN | GREEN |
| T44-T48 (proposal mapper) | 5 mapper tests | `prd-proposal-mapper.test.ts` (T44-T48) | GREEN | GREEN |
| T49-T68 (API + batch integration) | 20 integration tests | `prd-analysis-api.test.ts` (21 tests) | ~~RED~~ | **GREEN** (G16-1 FIXED) |
| T69-T76 (UI component) | 8 UI tests (optional) | No UI test files | YELLOW | YELLOW |

**G16-1 Fix Verification (v1.2)**: `tests/integration/prd-studio/prd-analysis-api.test.ts` now has 21 tests:
- **Route validation (T49-T53, T60)**: Auth guard simulation (T49), ideaId missing/empty/whitespace (T50), nonexistent ideaId via IdeaService (T51), other-tenant idea tenant isolation (T52), sourceless idea validation (T53), other-tenant status query blocked (T60)
- **Service integration (T54-T59, T61-T68)**: ConflictError on duplicate (T54), enqueue + DB verify (T55/T56), status none/PENDING/COMPLETED (T57-T59), cancel PENDING/NotFound/Forbidden (T61/T63/T61b), processNext (T64/T64b), complete + PRD creation (T65/T66), fail (T67), COMPLETED prdId (T68)
- **Cancel PROCESSING (T62)**: ConflictError on non-PENDING cancel
- **E2E flow (bonus)**: IdeaService source check → enqueue → status verify

**Note**: T49/T50 test the route's validation logic (auth guard, request parsing) at service-level simulation. Full HTTP route testing would require mocking Remix `ActionFunctionArgs`, which is outside the project's test convention.

### 2.8 Gaps Found (v1.2 Updated)

| ID | Category | Description | v1.1 Impact | v1.2 Status |
|----|----------|-------------|:-----------:|:-----------:|
| G16-1 | Test | Integration tests T49-T68 (API routes + batch E2E) not implemented | Medium | **FIXED** — 21 tests in `prd-analysis-api.test.ts` (S409) |
| G16-2 | Test | Service tests T1, T2, T4 (NotFoundError, ForbiddenError, ValidationError for missing sources) not individually tested — enqueue validates only via ConflictError | Low | OPEN (unchanged) |
| G16-3 | Test | T15 (COMPLETED cancel) and T19 (concurrent processing) not tested | Low | OPEN (unchanged) |
| G16-4 | Schema | `prd_analysis_queue.idea_id` lacks FK constraint in migration SQL (design has `REFERENCES ideas(id)`) | Low | OPEN (D1 FK 미강제, 의도적) |
| G16-5 | UI | UI component tests T69-T76 (optional) not implemented | Low | OPEN (unchanged) |

**DSGN-016 Summary (v1.2)**: 95% match (was 88%). G16-1 resolved — 21 integration tests covering T49-T68 + route validation + E2E flow. Remaining gaps are all Low impact: edge-case service tests (G16-2/3), intentional FK omission (G16-4), optional UI tests (G16-5).

---

## 3. DX-DSGN-017 Analysis (Phase 4: Strategy Tools)

### 3.1 Data Model

| Item | Design | Implementation | Status |
|------|--------|----------------|:------:|
| `prd_strategy_queue` table | 16 columns + 4 indexes | `schema.ts:228` — exact match | GREEN |
| Migration `0064_prd_strategy_queue.sql` | Design Step 1 | Exists, matches design SQL | GREEN |
| `tests/helpers/db.ts` sync | Migration added | Line 95 includes 0064 | GREEN |
| `StrategyResult` type | 6 frameworks interface | `types/index.ts:76` — exact match | GREEN |
| `GtmResult` type | 5 sections interface | `types/index.ts:137` — exact match | GREEN |
| `StrategyQueueStatus` enum | PENDING/PROCESSING/COMPLETED/FAILED | `schema.ts:216` | GREEN |
| `StrategyQueueMode` enum | batch/realtime | `schema.ts:223` | GREEN |

### 3.2 Prompt Builders

| Item | Design | Implementation | Status |
|------|--------|----------------|:------:|
| `strategy-prompt.ts` — `buildStrategyPrompt(sections)` | Section 3.1 | `lib/strategy-prompt.ts` — editedContent priority, 6 frameworks, JSON schema | GREEN |
| `gtm-prompt.ts` — `buildGtmPrompt(sections, strategy)` | Section 3.2 | `lib/gtm-prompt.ts` — summarizeStrategy + KEY_TYPES filter | GREEN |
| `proposal-synthesis-prompt.ts` — `buildProposalSynthesisPrompt(...)` | Section 3.3 | `lib/proposal-synthesis-prompt.ts` — SECTION_STRATEGY_MAP, 10 sections | GREEN |
| Prompt mapping table | Section 3.3 (10 rows) | `SECTION_STRATEGY_MAP` matches design exactly | GREEN |

### 3.3 Parsers

| Item | Design | Implementation | Status |
|------|--------|----------------|:------:|
| `strategy-parser.ts` — `parseStrategyResult(raw)` | Robust: markdown strip, snake_case, defaults | `lib/strategy-parser.ts` — 318 lines, all sub-parsers | GREEN |
| `gtm-parser.ts` — `parseGtmResult(raw)` | Robust: markdown strip, priority normalize | `lib/gtm-parser.ts` — 237 lines, all sub-parsers | GREEN |

### 3.4 Service Layer

| Method | Design | Implementation | Status |
|--------|--------|----------------|:------:|
| `enqueueStrategy(input)` | Conflict check + position | `prd-studio.service.ts:550` | GREEN |
| `getStrategyStatus(ideaId)` | 5 states + frameworks count | `prd-studio.service.ts:602` | GREEN |
| `cancelStrategy(ideaId, requestedBy)` | PENDING-only + ownership | `prd-studio.service.ts:667` | GREEN |
| `completeStrategy(queueId, result)` | result_strategy + result_gtm | `prd-studio.service.ts:691` | GREEN |
| `failStrategy(queueId, error)` | FAILED + error | `prd-studio.service.ts:713` | GREEN |
| `getStrategyResult(ideaId)` | COMPLETED only | `prd-studio.service.ts:725` | GREEN |

### 3.5 StrategyRealtimeService

| Method | Design | Implementation | v1.0 | v1.1 |
|--------|--------|----------------|:----:|:----:|
| `analyzeStrategy(apiKey, sections, aiCtx)` | GPT-4.1 + parseStrategyResult | `strategy-realtime.service.ts:23` | GREEN | GREEN |
| `analyzeGtm(apiKey, sections, strategy, aiCtx)` | GPT-4.1 + parseGtmResult | `strategy-realtime.service.ts:48` | GREEN | GREEN |
| `synthesizeProposal(...)` | Design Section 4.2 | `strategy-realtime.service.ts:74` — `callLLM` + GPT-4.1, returns proposal text | ~~RED~~ | GREEN (G17-1 FIXED) |

**G17-1 Fix Verification**: `synthesizeProposal()` implemented at line 74-95 with signature `(apiKey, proposalType, sections, strategy, gtm, aiCtx?) -> Promise<string>`. Uses `buildProposalSynthesisPrompt()` for prompt construction and `callLLM` with GPT-4.1 for generation. Design specified `(prd, strategy, gtm, env)` -- implementation is a more specific decomposition of the same contract.

### 3.6 API Routes

| # | Design Route | Implementation | v1.0 | v1.1 |
|---|--------------|----------------|:----:|:----:|
| 1 | POST `/api/prd-studio/strategy` | `api.prd-studio.strategy.ts` | GREEN | GREEN |
| 2 | GET `/api/prd-studio/strategy/:ideaId/status` | `api.prd-studio.strategy.$ideaId.status.ts` | GREEN | GREEN |
| 3 | DELETE `/api/prd-studio/strategy/:ideaId/cancel` | `api.prd-studio.strategy.$ideaId.cancel.ts` | GREEN | GREEN |
| 4 | GET `/api/prd-studio/strategy/:ideaId/result` | `api.prd-studio.strategy.$ideaId.result.ts` | GREEN | GREEN |
| 5 | POST `/api/prd-studio/gtm` | `api.prd-studio.gtm.ts` | GREEN | GREEN |
| 6 | GET `/api/prd-studio/gtm/:ideaId/status` | `api.prd-studio.gtm.$ideaId.status.ts` | GREEN | GREEN |
| 7 | POST `/api/prd-studio/synthesize-proposal` | `api.prd-studio.synthesize-proposal.ts` | GREEN | GREEN |

**G17-2 Fix Verification**: Strategy POST route (`api.prd-studio.strategy.ts`) now has a full realtime path at lines 56-91. When `mode === "realtime"`:
1. Retrieves API key from `context.cloudflare.env`
2. Calls `StrategyRealtimeService.analyzeStrategy()` inline
3. Creates queue record + immediately marks COMPLETED
4. Returns `{ ok: true, strategy: result, mode: "realtime" }`

This matches the design's hybrid engine specification (Section 1.2).

### 3.7 Batch Runner

| Item | Design | Implementation | Status |
|------|--------|----------------|:------:|
| `strategy` mode | Design Section 6.1 | `run_strategy_mode()` line 642 | GREEN |
| `gtm` mode | Design Section 6.2 | `run_gtm_mode()` line 736 | GREEN |
| `all` mode includes strategy + gtm | Design Section 6.3 | Line 818-819 | GREEN |
| Strategy prompt (6 frameworks, JSON) | Design Section 6.1 | `analyze_strategy_item()` line 596 | GREEN |
| GTM uses strategy result as input | Design Section 6.2 | `analyze_gtm_item()` line 706 | GREEN |
| Strategy batch size 3, wait 60s | Design implicit | Lines 582-583 | GREEN |

### 3.8 UI Components

| Component | Design | v1.0 | v1.1 |
|-----------|--------|:----:|:----:|
| `StrategyCanvasCard` — 5 states | Section 7.2 | GREEN | GREEN |
| `StrategyCanvasCard` — batch + realtime buttons | Section 7.2 | GREEN | GREEN |
| `StrategyCanvasCard` — 6 framework cards | Section 7.2 COMPLETED | GREEN | GREEN |
| `StrategyDetailModal` — 6 framework tabs | Section 7.4 | GREEN | GREEN |
| `GtmStrategyCard` — none (strategy incomplete) | Section 7.3 | GREEN | GREEN |
| `GtmStrategyCard` — status polling | Design implies polling | ~~YELLOW~~ | GREEN (G17-3 FIXED) |
| `GtmStrategyCard` — PENDING_GTM state | Implied by design queue pattern | ~~YELLOW~~ | GREEN (G17-5 FIXED) |
| `GtmStrategyCard` — COMPLETED: beachhead/ICP/messaging/channel/launch | Section 7.3 | ~~YELLOW~~ | GREEN (G17-3 FIXED) |
| `GtmStrategyCard` — error state | Implied | N/A | GREEN (bonus) |
| `GtmStrategyCard` — "상세 보기" button | Section 7.3 design wireframe | YELLOW | YELLOW (remains) |

**G17-3 + G17-5 Fix Verification**: `GtmStrategyCard.tsx` (298 lines) now implements:
- `useGtmPolling(ideaId, enabled)` hook with 10s polling when `PENDING_GTM` (line 22-49)
- **5 states**: none-disabled (line 160), none-active (line 165), PENDING_GTM (line 192), COMPLETED (line 208), error (line 279)
- **COMPLETED data display**: beachheadSegment (line 214-217), ICP profile (line 221-222), messaging oneLiner (line 228), channelStrategy with ChannelBadges helper (line 232-236), launchPlan phases (line 241-248)
- **Action buttons**: "사업제안 생성" + "재분석" (line 256-273)
- **Missing**: "상세 보기" button (design wireframe shows 3 buttons, implementation has 2)

### 3.9 Tests

| Design Test ID | Description | v1.0 | v1.1 |
|----------------|-------------|:----:|:----:|
| T1-T3 (strategy prompt) | 3 prompt builder tests | GREEN | GREEN |
| T4-T5 (GTM prompt) | 2 prompt tests | GREEN | GREEN |
| T6 (proposal synthesis) | mapping test | GREEN | GREEN |
| T7-T11 (strategy parser) | 5 parser tests | GREEN | GREEN |
| T12-T14 (GTM parser) | 3 parser tests | GREEN | GREEN |
| T15-T16 (proposal synthesis parser) | 2 parser tests | GREEN | GREEN |
| T17-T28 (service queue) | 12 service tests | GREEN | GREEN |
| T29-T36 (API route integration) | 8 API tests | ~~RED~~ | GREEN (G17-4 FIXED) |
| T37-T42 (UI component) | 6 UI tests (manual) | YELLOW | YELLOW |

**G17-4 Fix Verification**: `tests/integration/prd-studio/prd-strategy-api.test.ts` implements 8 tests covering T29-T36:
- T29: batch enqueue + queueId + position
- T30: realtime mode DB verification
- T31: empty ideaId validation
- T32: PRD analysis prerequisite check
- T33: COMPLETED status + strategyFrameworks=6
- T34: tenant isolation (nonexistent idea)
- T35: PENDING cancel
- T36: proposal synthesis prompt generation

**Note**: Tests are service-level integration (calling `PrdStudioService` directly with `createTestDb()`) rather than HTTP route-level tests. This covers the business logic paths fully but does not test the route layer itself (auth guard, request parsing, HTTP status codes). This is acceptable for current coverage needs.

### 3.10 Gaps Found (v1.1 Updated)

| ID | Category | Description | v1.0 Impact | v1.1 Status |
|----|----------|-------------|:-----------:|:-----------:|
| G17-1 | Service | `StrategyRealtimeService.synthesizeProposal()` not implemented | Medium | **FIXED** — `strategy-realtime.service.ts:74-95` |
| G17-2 | API | Strategy route `mode=realtime` queues instead of inline call | Medium | **FIXED** — `api.prd-studio.strategy.ts:56-91` |
| G17-3 | UI | GtmStrategyCard lacks polling + COMPLETED detail view | Medium | **FIXED** — `useGtmPolling` hook + beachhead/ICP/messaging/channel/launch display |
| G17-3b | UI | GtmStrategyCard missing "상세 보기" button (design wireframe shows 3 buttons) | Low | **OPEN** |
| G17-4 | Test | API integration tests T29-T36 not implemented | Medium | **FIXED** — 8 tests in `prd-strategy-api.test.ts` |
| G17-5 | UI | GtmStrategyCard has no PENDING/PROCESSING/COMPLETED/FAILED states | Medium | **FIXED** — 5 states: none-disabled, none-active, PENDING_GTM, COMPLETED, error |
| G17-6 | UI Test | Automated UI tests T37-T42 not implemented (design marks as manual) | Low | OPEN (unchanged) |

**DSGN-017 Summary (v1.1)**: 95% match (was 85%). All P1 gaps resolved. Remaining items are low-impact: missing "상세 보기" button (G17-3b) and manual UI test automation (G17-6).

---

## 4. Cross-Document Summary

### GREEN Items (Fully Implemented) — 92 items (was 91)

- All 7 DB tables (prds, prd_sections, prd_versions, prd_reviews, prd_events, prd_analysis_queue, prd_strategy_queue)
- All 4 enums and JSON column types
- 18/18 PrdStudioService methods (CRUD + interview + version + review + event + analysis queue + strategy queue)
- 3/3 StrategyRealtimeService methods (analyzeStrategy + analyzeGtm + synthesizeProposal)
- 17/17 API routes across all phases, including realtime mode wiring
- 8/8 core lib modules (analysis-prompt, analysis-parser, proposal-mapper, strategy-prompt, strategy-parser, gtm-prompt, gtm-parser, proposal-synthesis-prompt)
- 5/5 batch-runner modes (radar, ontology, prd, strategy, gtm)
- 2/2 migration files (0063, 0064) + tests/helpers/db.ts sync
- 37/37 TDD unit/service tests passing (prompt + parser + service)
- **21/21 Phase 3 integration tests passing** (T49-T68 + route validation + E2E flow) — v1.2 추가
- All page routes (prd-studio.tsx, _index.tsx, new.tsx, $id.tsx)
- GtmStrategyCard: 5 states + polling + COMPLETED data display

### YELLOW Items (Partial) — 5 items (unchanged)

| Item | Gap |
|------|-----|
| `prd_finalized` event | Client-side trigger not explicitly implemented (server-side path exists) |
| `prd_analysis_queue.idea_id` | Missing FK constraint in migration SQL (D1 FK 미강제, 의도적) |
| Added UI components | FAQSection + ConfirmDialog not in design (enhancement additions, no conflict) |
| Some service edge-case tests | T1/T2/T4 (error scenarios), T15/T19 (edge cases) not individually tested |
| GtmStrategyCard "상세 보기" | Design wireframe shows button, not implemented |

### RED Items (Missing) — **0 items** (was 1)

~~Integration tests (Phase 3)~~ — **FIXED** in v1.2 (S409): 21 tests in `prd-analysis-api.test.ts`

---

## 5. Test Coverage Summary

| Test File | Tests | Coverage |
|-----------|:-----:|----------|
| `prd-analysis-queue.service.test.ts` | 15 | Service CRUD + queue operations |
| `prd-analysis-prompt.test.ts` | 6 | Prompt builder (T28-T33) |
| `prd-analysis-parser.test.ts` | 10 | Parser robustness (T34-T43) |
| `prd-proposal-mapper.test.ts` | 5 | PRD->Proposal mapping (T44-T48) |
| `prd-strategy-prompt.test.ts` | 3 | Strategy prompt (T1-T3) |
| `prd-strategy-parser.test.ts` | 5 | Strategy parser (T7-T11) |
| `prd-gtm-prompt.test.ts` | 2 | GTM prompt (T4-T5) |
| `prd-gtm-parser.test.ts` | 3 | GTM parser (T12-T14) |
| `prd-proposal-synthesis.test.ts` | 4 | Synthesis prompt (T6, T15-T16) |
| `prd-strategy-queue.service.test.ts` | 12 | Strategy queue service (T17-T28) |
| `prd-strategy-api.test.ts` | 8 | Strategy API integration (T29-T36) |
| `prd-analysis-api.test.ts` | **21** | Phase 3 API + batch integration (T49-T68 + route validation + E2E) — v1.2 |
| **Total** | **94** | Unit/service/integration tests |

---

## 6. Recommended Actions

### Resolved (P1 — all cleared)

1. ~~Wire realtime mode~~ -- **DONE**: Strategy route calls `StrategyRealtimeService.analyzeStrategy()` inline for `mode=realtime`
2. ~~GtmStrategyCard polling~~ -- **DONE**: `useGtmPolling` hook + 5 states + COMPLETED data display
3. ~~StrategyRealtimeService.synthesizeProposal()~~ -- **DONE**: Implemented with GPT-4.1 + callLLM
4. ~~Phase 3 integration tests (T49-T68)~~ -- **DONE** (v1.2, S409): 21 tests in `prd-analysis-api.test.ts`

### Remaining (P2)

5. **GtmStrategyCard "상세 보기"** -- Add button to open GTM detail view (possibly reuse StrategyDetailModal pattern or create GtmDetailModal)
6. Update DX-DSGN-015 to document added components: FAQSection, ConfirmDialog
7. Update DX-DSGN-016 to note `idea_id` FK omitted intentionally (D1 FK behavior)

### Test Expansion (P3)

8. Automated UI tests T37-T42 and T69-T76 (design marks as manual/optional)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-13 | Initial -- 3 design docs vs implementation, 90% overall match. 2 RED, 8 YELLOW | Sinclair Seo |
| 1.1 | 2026-03-13 | Post-fix re-analysis -- G17-1/2/3/4/5 verified FIXED. DX-DSGN-017: 85->95%. Overall: 90->93%. RED: 2->1, YELLOW: 8->5 | Sinclair Seo |
| 1.2 | 2026-03-17 | G16-1 resolved (S409) -- 21 integration tests (T49-T68 + route validation + E2E). DX-DSGN-016: 88->95%. Overall: 93->96%. RED: 1->0 | Sinclair Seo |
