# CHANGELOG — Session History

> SPEC.md에서 분리된 세션 변경 이력. 새 세션은 파일 상단에 추가한다.
> 검색: `grep -n '세션 NNN' docs/CHANGELOG.md`

### 세션 236 (2026-02-21)
**서비스 레이어 Phase 4C — Discovery 라우트 5개 서비스 전환**:
- ✅ `approve.tsx` (full): action 80줄 인라인 DB → `service.approveDecision()`/`rejectDecision()` 2줄
- ✅ `request-extension.tsx` (full): loader+action → `service.getById()`, `getExperimentCount()`, `requestExtension()`
- ✅ `graph.tsx` (partial): loader+action `findFirst()` → `service.getById()`
- ✅ `methods.tsx` (partial): `db.select().from(discoveries)...limit(1)` + `[0]` 패턴 → `service.getById()`
- ✅ `gate.tsx` (fix): Worker 2 잔여 에러 3개 수정 (discovery[0] + 미참조 discoveries)
- ✅ Phase 4 Discovery 라우트 11/11 완료 (세션 232 3개 + 세션 236 8개)

**검증 결과**:
- ✅ typecheck 0 에러 / lint 0 에러 / 5 files changed, -145줄

### 세션 235 (2026-02-21)
**executor.ts 모듈화 (switch→Map) + tool-registry.ts 도메인별 분할**:
- ✅ `executor.ts` 885→549줄: 47-case switch를 `Record<string, ToolHandler>` Map 패턴으로 전환 → `tool-handlers.ts` (217줄) 분리
- ✅ `agent-utils.ts` (97줄) 분리: generateId, updateTokenUsage, sendBudgetWarning, addSummaryHeader
- ✅ `tool-registry.ts` 1,164→127줄: AGENT_TOOLS를 8개 도메인 스키마 파일로 분할 (`tool-schemas/` 디렉토리, 1,124줄)
  - discovery, decision, query, method, ontology, platform, strategic, idea
- ✅ `/team` Worker 2명 병렬 실행 (W1: executor 모듈화, W2: registry 분할)

**검증 결과**:
- ✅ typecheck 0 에러 (agent 모듈) / lint 0 에러 / 테스트 1,043/1,043 PASS / build 미확인

### 세션 234 (2026-02-21)
**리팩토링 갭 분석 + Dead 코드 정리 (Phase 4 완료)**:
- ✅ 리팩토링 계획 vs 현재 프로젝트 현황 갭 분석 수행
- ✅ Dead 컴포넌트 3개 삭제: FilterBar/SimilarSources/MemoPanel (-250 LOC)
- ✅ Dead 서비스 4개 삭제: idea/radar/matrix-graph/topic-graph (-1,014 LOC)
- ✅ orphan 테스트 4개 삭제 (-1,162 LOC)
- ✅ services/index.ts 정리: 10→6 exports
- ✅ SPEC.md 라우트 현행화: 153→139 (삭제된 Market/evidence/dashboard 서브라우트 반영)
- ✅ SPEC.md 테스트 수 갱신: 1,111→1,043 (78 files)
- ✅ refactoring.md 현황 수치 갱신: 61,581줄/350파일 (리팩토링 전 대비 -29%)
- ⚠️ signal.service.ts는 signal-router.ts에서 활성 사용 → 유지
- 📝 남은 구조적 부채: executor.ts(885줄), tool-registry.ts(1,164줄) 모듈화

- ✅ changeOwner 테스트 수정: HYPOTHESIS→HOLD (ACTIVE_STATUSES 포함으로 기존 테스트 불일치)
- ✅ 프로덕션 배포 완료 (CI/CD 2m01s)

**검증 결과**:
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 1,043/1,043 PASS / build 성공 / 배포 성공

### 세션 233 (2026-02-21)
**Gap Analysis 4건 수행 + 설계 문서 현행화 (F20/F21)**:
- ✅ 4개 설계 문서 Gap Analysis 수행: F20 (60%), F21 (35%), F22 (95%), Ontology (92%), 전체 77% (106/137)
- ✅ F20 설계 문서 현행화: §7 Implementation Reality 추가 — 3-Panel 아키텍처 재설계 문서화, ideas/ideaSources 테이블 추가, 신규 컴포넌트 15건 기록
- ✅ F21 설계 문서 현행화: §9 Implementation Reality 추가 — dashboard.metrics.tsx 미존재 확인, 차트 실사용처(metrics.tsx, discoveries.$id.tsx) 문서화, Status → Superseded
- ✅ Dead 컴포넌트 3개 식별: FilterBar.tsx, SimilarSources.tsx, MemoPanel.tsx (파일 존재하나 미사용)
- ✅ Task tool subagent 2명 병렬 Gap Analysis (tmux 충돌로 전환)

**검증 결과**:
- ✅ typecheck 0 에러 / lint 0 에러 (문서 변경만, 코드 변경 없음)

### 세션 232 (2026-02-21)
**서비스 레이어 강화 Phase 4A+4B — /team 병렬 작업으로 Discovery + Proposal 서비스 전환**:
- ✅ DiscoveryService 5개 메서드 추가: promote, submitForApproval, addExperiment, addEvidence, completeExperiment
- ✅ ProposalService 6→20개 메서드 확장: CRUD + comments/likes/actions/members/milestones/categories
- ✅ 라우트 17개 inline DB 쿼리 → `new XxxService(db)` 패턴 전환 (Discovery 7 + Proposal 10)
- ✅ submitForApproval(): 3개 결정 라우트(not-now/dead-end/next) 공통 PENDING 패턴을 1개 메서드로 통합
- ✅ 버그 수정: api.proposals.categories.ts 검색 시 tenantId 필터 누락 해결
- ✅ /team 병렬 실행: Worker 2명 (tmux in-window split), 파일 충돌 없이 완료

**검증 결과**:
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 1111/1111 PASS
- ✅ 프로덕션 배포 완료 (CI/CD 1m56s)

### 세션 231 (2026-02-21)
**/team 스킬 v7 in-window split 완성**:
- ✅ v4~v6 실패 원인 분석 (monitor pane → select-window → break-pane)
- ✅ v7 설계: Other pane을 `split-window -v -b`로 세로 분할, 리더 pane 미변경
- ✅ SKILL.md 전면 재작성 — in-window split, 위치 자동 감지, 3c-alt 분기
- ✅ patterns.md 업데이트 — v7 패턴 + v4~v6 실패 교훈 + 금지 명령 목록
- ✅ 테스트 2회 성공 (echo 테스트): 리더 pane 크기 유지, Other CC 프로세스 유지, 정리 후 자동 복원

**검증 결과**:
- ✅ 앱 코드 변경 없음 (스킬/메모리만 수정)

### 세션 230 (2026-02-21)
**리팩토링 Phase 5 스키마/도구 정리 — valueup/shadow 삭제 (-1,600 LOC)**:
- ✅ `valueup-tools.ts` (610줄) 전체 삭제 — executor에서만 참조
- ✅ `shadow-tools.ts` (528줄) 전체 삭제 — executor에서만 참조
- ✅ `executor.ts` 수정: shadow/valueup import 2개 + case 7개 제거 (-27줄)
- ✅ `tool-registry.ts` 수정: TOOL_MIN_AUTONOMY 7개 + 도구 정의 7개 제거 (-159줄)
- ✅ `schema.ts` 수정: shadow 2테이블 + valueup 4테이블 + 12타입 + features 필드 제거 (-276줄)
- ✅ `industryAdapters`/`industryRules` 보존 (dashboard/compliance/query/discovery 4곳 활성 사용)
- ℹ️ Phase 6 서비스 정리 보류: briefing-builder/signal-router/pipeline-bridge 모두 활성 Cron 참조

**검증 결과**:
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공 (2,007 kB)

### 세션 229 (2026-02-21)
**리팩토링 Phase 4 UI 정리 — dead 컴포넌트 5개 삭제 + dead 참조 수정 (-457 LOC)**:
- ✅ `CollectionStatusPanel.tsx` 삭제 (import 0, dashboard 서브라우트 삭제 잔해)
- ✅ `StageDurationTable.tsx` 삭제 (import 0)
- ✅ `DailyActivityChart.tsx` 삭제 (import 0)
- ✅ `IndustryDonut.tsx` 삭제 (import 0, StatisticsPanel에 자체 구현 있음)
- ✅ `DuplicateCard.tsx` 삭제 (evidence/duplicates 라우트 삭제 잔해) + evidence 폴더 정리
- ✅ `TenantSettingsForm.tsx`: shadowMode + valueupEngine 토글 제거 (radarEnabled만 유지)
- ✅ `SidebarPanel.tsx`: 버전 "v4.2" → "v6.18"

**검증 결과**: ✅ typecheck 0 에러 / lint 0 에러

### 세션 228 (2026-02-20)
**리팩토링 Phase 2+3 — Cron 통합 + 모듈 아카이브, 119파일 삭제, -50,836 LOC**:

**1. Phase 2: Cron 통합 (19→13)** (Worker 1):
- vectorize 3→1 통합 (`api.cron.vectorize.ts`, type=graph|memory|signal)
- lab 2→1 통합 (`api.cron.lab.ts`, mode=extract|analyze)
- profile-learn, shadow-analyze, briefing cron 삭제
- 테스트 갱신: cron-routes-bearer.test.ts (briefing 섹션 제거), cron-routes-query-param.test.ts (lab 통합 반영 + URL 헬퍼 수정)

**2. Phase 3: 모듈 아카이브** (Worker 2+3, 병렬):
- **Venture**: 52파일 삭제 (features/venture 전체 + routes + components + tests + VentureService)
- **Knowledge**: 5 라우트 삭제 (knowledge.tsx + api.knowledge.ts 등)
- **Briefing**: 3 라우트 삭제 (briefing.tsx + api.briefing.ts)
- **ValueUp**: 4파일 삭제 (components/valueup + routes)
- **Topics**: 유지 결정 (Lab/Signals에서 활성 참조)
- db/index.ts: ventureSchema import 제거 (7→6 스키마 머지)

**변경 통계**: 119 files changed, 264 insertions(+), 50,836 deletions(-)
**지표**: 라우트 189→153, 테스트 1334→1111 (82 files), Cron 19→13, 빌드 ✅, lint 0

---

### 세션 227 (2026-02-20)
**리팩토링 분석 + Phase 1 Dead Code 정리 — 23파일 삭제, -4,371 LOC**:

**1. 코드베이스 분석** (tmux 3-Worker 병렬):
- 전체 484 TS 파일, 86,699 LOC, 203 라우트 분석
- GNB 5탭(대시보드/아이디어/사업제안/시그널/실험실) — Venture/Market/Knowledge 등 미등록 확인
- Service layer 사용률 9.4% (19/203 routes), 55.7% Drizzle 직접 사용
- Agent 모듈 9,757줄, 14 도구 모두 활성
- ACL 1 route만 사용, Cron 트리거 주석 처리됨 (cron-job.org 외부 등록)

**2. 리팩토링 6-Phase 계획 수립** (`docs/refactoring-plan.md`):
- Phase 1: Dead Code 정리 | Phase 2: Cron 통합 (19→7~8)
- Phase 3: 모듈 방향 결정 | Phase 4: Service Layer 강화
- Phase 5: Agent Executor 모듈화 | Phase 6: 도메인 경계 정리

**3. Phase 1 실행** (tmux 2-Worker 병렬):
- ✅ Market 모듈 삭제: 3 routes + 2 components (GNB 미등록, 외부 참조 0)
- ✅ Dashboard 서브라우트 10개 삭제: alerts, assets, audit-log, exec, failure-replay, health, metrics, ops-metrics, ops, shadow
- ✅ 전용 컴포넌트 8개 삭제: AlertList, AuditLogList, HealthMetrics, MetricCard, IndustrySelector, ShadowRunCard, ShadowStatsBar
- ✅ evidence.duplicates 삭제
- 결과: 484 → 461 TS files, 202 → 189 routes, 86,699 → 82,328 LOC

**검증 결과**:
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 1334/1334 PASS

### 세션 226 (2026-02-20)
**3-Tier 정보 아키텍처 도입 — SPEC.md 65% 축소 + Auto Memory 연계**:
- ✅ SPEC.md 세션 히스토리(992줄) → `docs/CHANGELOG.md`로 분리 (1518줄 → 538줄)
- ✅ Auto Memory 재구성: `MEMORY.md` (작업 컨텍스트 + 최근 세션 + 결정) + `patterns.md` (tmux/gotchas)
- ✅ `/session-start` → `/s-start` 스킬 교체: MEMORY.md 자동 로딩 활용 + SPEC.md 보충 읽기
- ✅ `/session-end` → `/s-end` 스킬 교체: SPEC.md 지표 + MEMORY.md 컨텍스트 + CHANGELOG.md append
- ✅ CLAUDE.md 워크플로우 섹션 갱신: 3-Tier 상태 추적, 스킬 테이블 갱신

**검증 결과**:
- ✅ 코드 변경 없음 (스킬/문서만) — typecheck/lint/build 영향 없음

### 이전 변경 (세션 225)
**CLAUDE.md 품질 감사 및 개선**:
- ✅ CLAUDE.md 품질 평가: 87/100 (B) → 92/100 (A)
- ✅ 스키마 머지 패턴 최신화: 3개 → 7개 전체 반영 (outdated 수정)
- ✅ features 디렉토리 목록: `matrix` 추가
- ✅ 누락 명령어 추가: `test:watch`, `test:coverage`, `db:studio`
- ✅ Claude Code 설정 커밋: hooks (typecheck+lint 자동, .dev.vars 차단), agents 2개, db-migrate 스킬, MCP 설정

### 이전 변경 (세션 224)
**전체 프로젝트 갭 분석 + 버그/문서/기능 수정** (tmux 3-Worker 병렬):

**1. 갭 분석 실행** (tmux 4-Worker 병렬 분석):
- 라우트: 99.3% (147/148 SPEC 문서화, 55개 미문서화 발견)
- DB 스키마: 100% (76/76 구현, 16개 미문서화 발견)
- PRD 규칙: 78.6% (8 완전 구현, 6 부분 구현, 0 미구현)
- 품질: 100% (테스트 1334개, lint 0, typecheck 0, build OK)

**2. 버그 수정 — decide-not-now/decide-dead-end 중복 조건**
- ✅ `app/routes/discoveries_.$id.decide-not-now.tsx` (수정): `IDEA_CARD !== IDEA_CARD` 중복 → `ACTIVE_STATUSES.includes()` 로 교체
- ✅ `app/routes/discoveries_.$id.decide-dead-end.tsx` (수정): 동일 패턴 수정
- 효과: 모든 활성 상태(DISCOVERY~GATE2)에서 HOLD/DROP 결정 가능

**3. SPEC.md 문서 갭 수정**
- ✅ §2 페이지 맵: 100개 → 202개 라우트 (Market 3, Matrix 12, Core +6, Ideas +7, API +20)
- ✅ §3 데이터 모델: 66개 → 92개 테이블 (Archive, Token, Matrix, Worker, FTS 등)
- ✅ §5 주요 지표: 176/87 → 202/92 동기화

**4. Inbox TTL 자동 만료 (PRD §6)**
- ✅ `app/routes/api.cron.daily.ts` (수정): DISCOVERY 상태 14일 초과 시 자동 DROP 전환
- inbox_timeout failure pattern 태깅 + INBOX_EXPIRED eventLog 기록

**5. Owner 변경 범위 확장 (PRD §6.1)**
- ✅ `app/routes/discoveries.$id.tsx` (수정): DISCOVERY/IDEA_CARD → 모든 활성 상태(DISCOVERY~GATE2)

**검증 결과**:
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 1334/1334 PASS / build 성공

### 이전 변경 (세션 223)
**백로그 4건 완료 (+71 테스트, Artillery 인프라, E2E 정비)** (tmux 4-Worker 병렬):

**1. agent-worker DO 유닛 테스트 (백로그 1.1) — 40개**
- ✅ `tests/unit/workers/agent-worker-auth.test.ts` (신규): 7개 — HMAC 토큰 검증 (유효/무효/헤더 누락/잘못된 hex)
- ✅ `tests/unit/workers/agent-worker-routing.test.ts` (신규): 6개 — health check, 인증 실패→401, 인증 성공→DO 라우팅
- ✅ `tests/unit/workers/agent-session-do.test.ts` (신규): 16개 — /status, /chat 검증, 동시성 429, buildSystemPrompt, alarm, persistState, checkMonthlyBudget, flushMemory 재시도
- ✅ `tests/unit/workers/agent-do-stub.test.ts` (신규): 11개 — isAgentDOAvailable FF 체크, delegateToDO HMAC+fetch

**2. collab-worker 유닛 테스트 (백로그 1.2) — 31개**
- ✅ `tests/unit/workers/collab-worker-index.test.ts` (신규): 7개 — health, trigger 인증/성공/실패, 404, scheduled+logCronResults
- ✅ `tests/unit/workers/collab-cron-handler.test.ts` (신규): 18개 — handleCron 디스패치, 5개 Job 함수, FF 비활성, 에러 격리
- ✅ `tests/unit/workers/collab-notification.test.ts` (신규): 6개 — sendNotification INSERT/null/에러, notifySignalRouted 멤버 필터

**3. Artillery 부하 테스트 인프라 (백로그 1.8)**
- ✅ `tests/load/config.yml` (신규): 글로벌 설정 (3단계: warmup→ramp→peak, p95<2s 임계값)
- ✅ `tests/load/health.yml` (신규): Health check 시나리오 (p95<500ms)
- ✅ `tests/load/api-crud.yml` (신규): API CRUD 시나리오 — discoveries, recall, search (p95<1s, cookie 인증)
- ✅ `tests/load/chat-stream.yml` (신규): Agent chat SSE 시나리오 (저동시성, p95<3s)
- ✅ `tests/load/spike.yml` (신규): 스파이크 테스트 (1→20→1 req/s, error rate<1%)
- ✅ `tests/load/README.md` (신규): 부하 테스트 실행 가이드
- ✅ `package.json` (수정): artillery devDependency + 4개 load-test 스크립트 추가

**4. E2E 테스트 환경 정비 (백로그 3.4)**
- ✅ `playwright.config.ts` (재작성): 3 프로젝트 (setup/public/authenticated), 타임아웃 30s, CI 비디오, 실패 스크린샷, storageState 인증
- ✅ `tests/e2e/global-setup.ts` (신규): Cookie 기반 인증 (E2E_SESSION_COOKIE 환경변수), storageState 지속
- ✅ `tests/e2e/smoke.spec.ts` (신규): 4개 스모크 테스트 (로그인 페이지, health API, pending 페이지, 404)
- ✅ `tests/e2e/helpers.ts` (확장): skipIfNoAuth, waitForApiResponse, waitForModal, waitForToast, safeNavigate 추가
- ✅ 기존 10개 spec 파일 수정: skipIfNoAuth + safeNavigate 적용

**검증 결과**:
- 테스트 총수: 1263 → 1334 (+71개, 90 test files)
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 1334/1334 PASS / build 성공

### 이전 변경 (세션 222)
**백로그 테스트 2개 추가 (+23개)** (tmux 2-Worker 병렬):

**1. projection-sync 배치 동기화 테스트 (백로그 1.5)**
- ✅ `tests/unit/graph/projection-sync.test.ts` (신규): 8개 — syncAllStale (Graph 0/1/N개, 최신/stale/신규 혼합, scopeType 다양, malformed JSON-LD 에러 처리, 대량 10개 배치, 멱등성 검증)

**2. ScoringService 실 DB 단위 테스트**
- ✅ `tests/unit/services/scoring.test.ts` (신규): 15개 — submitScore(INSERT/UPSERT/note null/반환값), getScoresByCell/getMyScores(cellId/period 필터, userId 기반), calculateConsensus(2인 평균/CLAMP 1-5/UPDATE draft/revised 변경), confirmConsensus(최소 투표자 미달 에러/정상 확정), getConfig/updateConfig(DEFAULT_WEIGHTS 폴백/설정 반영)

**커버리지 개선**:
- 서비스 단위 테스트: 12/13 (92%) → 13/13 (100%)
- 테스트 총수: 1240 → 1263 (+23개, 83 test files)
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 1263/1263 PASS

### 이전 변경 (세션 221)
**Graph Enrichment 승인/거절 UI 구현** (백로그 1.6):

**1. DB 마이그레이션 (0040)**
- ✅ `drizzle/0040_graph_approve_reject.sql` (신규): graph_events CHECK 제약에 'approve'/'reject' 추가 (테이블 재생성 방식)

**2. GraphStore 확장**
- ✅ `app/lib/graph/store.ts` (수정): approveSuggestion (노드 머지, @id 중복 방지), rejectSuggestion (이벤트만 기록), getPendingSuggestions (처리된 제안 필터링)
- ✅ `app/lib/graph/types.ts` (수정): GraphAction 타입 + GraphStoreInterface에 approveSuggestion/rejectSuggestion 추가
- ✅ `app/lib/types/enums.ts` (수정): GraphAction.APPROVE/REJECT enum 추가

**3. API 라우트 (2개 신규)**
- ✅ `app/routes/api.topics.$id.suggestions.ts` (신규): GET — 미처리 제안 목록
- ✅ `app/routes/api.topics.$id.suggestions.$suggestionId.ts` (신규): POST — 승인/거절 (action: approve|reject)

**4. UI**
- ✅ `app/components/topic/SuggestionList.tsx` (신규): agent 제안 카드 (노드 미리보기, 승인/거절 버튼, 거절 사유 입력)
- ✅ `app/routes/topics.$id.tsx` (수정): "제안" 탭 추가 (events 앞 배치)
- ✅ `app/components/topic/GraphEventLog.tsx` (수정): approve/reject 뱃지 스타일 추가

**5. 테스트**
- ✅ `tests/unit/services/graph-store-suggestions.test.ts` (신규): 9개 — approveSuggestion(노드 머지, 중복 방지, 미존재/이미처리 에러), rejectSuggestion(이벤트 기록, graph 미변경, 에러), getPendingSuggestions(필터링)
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 1240/1240 PASS / build 성공

**6. 배포 + 검증**
- ✅ CI/CD 배포 완료 (GitHub Actions, 2m13s)
- ✅ D1 프로덕션 마이그레이션 적용 (`0040_graph_approve_reject.sql`, 7 commands, 6.76ms)
- ✅ Playwright 프로덕션 검증: /login, Google OAuth, /dashboard, /lab (27N/19E), /settings, /topics 전체 정상
- ⚠️ "제안" 탭 직접 UI 검증 불가 (Topic 0건 — Topic 생성 시 자동 노출)

### 이전 변경 (세션 220)
**서비스 단위 테스트 4개 서비스 일괄 추가 (+94개)** (tmux 3-Worker 병렬):

**서비스 레이어 단위 테스트 (4파일, 94개)**
- ✅ `tests/unit/services/topic.test.ts` (신규): 22개 — list(teamId/status/limit 필터), getById(members 포함), create(owner 자동 추가), update, archive, addMember/removeMember/updateMemberRole, getMembers(JOIN)
- ✅ `tests/unit/services/topic-graph.test.ts` (신규): 20개 — Decision CRUD(add/get/update/remove), Glossary CRUD(add/get/update/remove), getGraphEvents(limit), getOrCreateTopicGraph 자동 생성
- ✅ `tests/unit/services/matrix.test.ts` (신규): 30개 — Industry CRUD(3), Function CRUD(3), Cell CRUD(4+필터5), Cell-Topic 연결(5), getHeatmapData(4, consensusScores LEFT JOIN/delta 계산)
- ✅ `tests/unit/services/matrix-graph.test.ts` (신규): 22개 — cellToJsonLdNode/industryToJsonLdNode/functionToJsonLdNode(순수 함수 10), buildTeamMatrixGraph(6), getMatrixGraph(2), syncCellToGraph(4)
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 1231/1231 PASS

**커버리지 개선**:
- 서비스 단위 테스트: 8/13 (62%) → 12/13 (92%)

**백로그 검증 결과** (세션 210 백로그 대비):
- ✅ 2.1 Monthly Failure Replay — 세션 211 완료
- ✅ 2.2 Inbox UI 분리 — 세션 217 완료
- ✅ 2.3 Inbox TTL 리마인드 — 세션 217 완료
- ✅ 2.4 비판적 검증 4종 — 세션 217 완료
- ✅ 2.5 재호출 이벤트 추적 — 세션 211 완료
- ✅ 2.6 운영 지표 대시보드 — 세션 211 완료
- ✅ 2.7 온보딩 치트시트 — 이미 존재 (docs/guides/USER_CHEAT_SHEET.md)
- ✅ 2.8 Owner 인수인계 기록 — 세션 217 완료
- ✅ 1.3 Pipeline Bridge 쓰기 — 이미 구현 (submitIdea/annotateSignal)
- ✅ 1.4 Memory compact LLM — 이미 구현 (summarizer 콜백)
- ✅ 1.7 Vectorize 시맨틱 검색 UI — 세션 213~214 완료
- ✅ 3.1 서비스 단위 테스트 — 13/13 완료 (세션 222에서 scoring 추가)
- ✅ 3.2 Cron 통합 테스트 — 세션 218 완료 (19/19)
- ✅ 1.1 agent-worker DO 유닛 테스트 — 세션 223 완료 (40개 테스트)
- ✅ 1.2 collab-worker 유닛 테스트 — 세션 223 완료 (31개 테스트)
- ✅ 1.5 Projection 배치 동기화 검증 — 세션 222 완료 (8개 테스트)
- ✅ 1.6 Graph enrichment 승인 UI — 세션 221 완료
- ✅ 1.8 부하 테스트 — 세션 223 완료 (Artillery 4개 시나리오)
- ✅ 3.4 E2E 테스트 환경 정비 — 세션 223 완료 (인증 설정 + 스모크 테스트)

### 이전 변경 (세션 219)
**Google OAuth 수정 + 로그아웃 버그 수정 + 프로덕션 E2E 검증**:

**1. Google OAuth 토큰 교환 수정 (핵심)**
- ✅ `app/routes/auth.google.callback.tsx` (수정): arctic 라이브러리 Basic Auth → 직접 POST body 방식으로 변경
  - 원인: arctic v3.7.0이 `Authorization: Basic` 헤더로 credentials 전송 → Google이 `invalid_client:Unauthorized` 거부
  - 수정: `fetch("https://oauth2.googleapis.com/token")` 직접 호출, `client_id`/`client_secret`을 POST body에 포함 (Google 권장 방식)
  - 에러 상세 로깅 추가: 토큰 교환 실패 시 status/body/redirectUri 콘솔 출력 + login 페이지에 detail 파라미터 표시

**2. 로그아웃 버튼 버그 수정**
- ✅ `app/components/layout/TopNav.tsx` (수정): 로그아웃 `<button>`에서 `onClick={close}` 제거
  - 원인: dropdown 닫기가 `<Form>` DOM을 먼저 제거 → "Form submission canceled because the form is not connected"
  - 수정: Form 제출이 자연스럽게 /login으로 이동하므로 dropdown 닫기 불필요

**3. 로그인 페이지 에러 상세 표시**
- ✅ `app/routes/login.tsx` (수정): `detail` 쿼리 파라미터 표시 (OAuth 디버깅용)

**4. 프로덕션 E2E 검증 (Playwright)**
- ✅ `ktds.axbd@gmail.com` 계정 로그인: Google OAuth → 대시보드 진입 성공
- ✅ 로그아웃: 드롭다운 → 로그아웃 클릭 → `/login` 리다이렉트 성공
- ✅ 화이트리스트 자동 테넌트 추가 동작 확인 (대시보드 데이터 정상 표시)

**CI/CD 배포 4회**:
- `f14537a` fix: OAuth 토큰 교환 실패 시 상세 에러 로깅 추가
- `55fec0e` fix: OAuth 토큰 교환 에러 상세 정보를 로그인 페이지에 표시
- `12bfe66` fix: Google OAuth 토큰 교환을 POST body 방식으로 변경
- `c6a8101` fix: 로그아웃 버튼 클릭 시 드롭다운 닫힘으로 Form 제출 취소되는 버그 수정

### 이전 변경 (세션 218)
**테스트 커버리지 일괄 강화 — 서비스 단위 6개 + Cron 통합 2개 (+153개)** (tmux 3-Worker 병렬):

**서비스 레이어 단위 테스트 (6파일, 102개)**
- ✅ `tests/unit/services/discovery.test.ts` (신규): 28개 — list(tenant scope/OVERDUE/상태 필터), getById, getDetail(병렬 조회), create(eventLog), transition(유효/무효), changeOwner(상태 제한), getAllowedTransitions, getActivityLogs
- ✅ `tests/unit/services/idea.test.ts` (신규): 13개 — list, getById, create, updateTitle, delete, getSources(JOIN), addSource, removeSource
- ✅ `tests/unit/services/venture.test.ts` (신규): 17개 — Sprint CRUD + 상태 변경 (repository 위임 검증)
- ✅ `tests/unit/services/proposal.test.ts` (신규): 19개 — CRUD, delete(권한 3케이스), update(상태 전환/CLOSED closeType/섹션/카테고리 upsert)
- ✅ `tests/unit/services/radar.test.ts` (신규): 13개 — 소스 CRUD(sourceType 유효성), 아이템 필터(sourceId/status/limit)
- ✅ `tests/unit/services/signal.test.ts` (신규): 12개 — 시그널 CRUD(returning 검증), 필터(teamId/topicId/status/limit), dismiss

**Cron 통합 테스트 (2파일, 51개)**
- ✅ `tests/integration/cron-routes-query-param.test.ts` (신규): 30개 — 10 QP 인증 엔드포인트 (lab-extract, lab-analyze, pattern-extract, shadow-analyze, signal-route, embeddings, log-archive, memory-compact, profile-learn, projection-sync)
- ✅ `tests/integration/cron-routes-bearer.test.ts` (신규): 21개 — 6 Bearer 인증 엔드포인트 (daily, alerts, agent-review, weekly-summary, briefing, matrix-scoring)
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 1137/1137 PASS

**커버리지 개선**:
- 서비스 단위 테스트: 2/13 (15%) → 8/13 (62%)
- Cron 통합 테스트: 3/19 (16%) → 19/19 (100%)

### 이전 변경 (세션 217)
**운영 품질 강화 4건 + 로그인/승인 프로세스 개선** (tmux 2-Worker 병렬):

**1. Gate 비판적 검증 4종 (Critical Check) — 기획서 §7.3**
- ✅ `app/lib/validation/discovery-rules.ts` (수정): `validateCriticalChecks()` + `CriticalCheckResult` 인터페이스 추가 — Evidence Check, Time Stress Test, Cross-Context Test, Ontology Consistency 시스템 수준 강제
- ✅ `app/routes/discoveries_.$id.gate.tsx` (수정): Gate 초안 시 검증 호출 + scorecard.criticalChecks 저장
- ✅ `app/components/methods/GatePackageEditor.tsx` (수정): Critical Check 결과 UI 패널 (pass/fail 아이콘 + 상세 메시지)
- ✅ `tests/unit/validation/critical-checks.test.ts` (신규): 15개 테스트 (4종 × pass/fail + 경계 케이스)

**2. Inbox UI 분리 — 기획서 §6 Seed Inbox**
- ✅ `app/lib/constants/status.ts` (수정): STATUS_CONFIG에 `description` 필드 추가 (DISCOVERY="임시", IDEA_CARD="검증 진행")
- ✅ `app/components/ui/StatusBadge.tsx` (수정): DISCOVERY 상태 → 점선 border(`border-dashed`) + "(임시)" 접미사
- ✅ `app/routes/discoveries._index.tsx` (수정): "Inbox (임시)" 탭 레이블 + 7일 초과 경고 강화 + 승격 안내 텍스트

**3. Inbox TTL 자동 리마인드 — 기획서 §6**
- ✅ `app/lib/notifications/alert-engine.ts` (수정): INBOX_TTL 알림 규칙 추가 (DISCOVERY 상태 7일 초과 스캔, 중복 방지)

**4. Owner 인수인계 기록 강제 — 기획서 §6.1**
- ✅ `app/routes/discoveries.$id.tsx` (수정): changeOwner에 handoverNote textarea 필수화 (10자 이상) + eventLogs metadata 기록

**2. 로그인/로그아웃/승인 프로세스 개선**
- ✅ `app/components/layout/TopNav.tsx` (수정): UserDropdown 컴포넌트 추가 — 이니셜 아바타 + 이름 클릭 → 드롭다운 메뉴 (이메일, 설정, 사용자 관리(admin만), 로그아웃)
- ✅ `app/routes/pending.tsx` (수정): 로그아웃 버그 수정 (Link GET → Form POST) + 관리자 연락처 안내 + 승인 상태 확인 버튼
- ✅ `app/routes/login.tsx` (수정): 신규 방문자 가입 안내 문구 추가
- ✅ `app/routes/admin.users.tsx` (수정): 승인 시 tenant 멤버십 자동 추가 (중복 체크 포함)
- ✅ `app/routes/auth.google.callback.tsx` (수정): 화이트리스트 신규 가입 시 기본 tenant 자동 추가
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공

**참고**: 화이트리스트 외 Gmail 계정이 Google OAuth 자체에서 차단되는 경우 → GCP Console OAuth consent screen이 "Testing" 모드일 수 있음 → "In production" 전환 또는 테스트 사용자 추가 필요

### 이전 변경 (세션 216)
**통합 시맨틱 검색 페이지 배포 완료** — 세션 214에서 Cloudflare 내부 오류로 실패한 배포를 재실행하여 성공:
- ✅ GitHub Actions CI/CD 재실행: lint/typecheck/tests(969)/build/deploy 전 단계 PASS (1m55s)
- ✅ https://dx.minu.best/search 프로덕션 접근 가능 확인

### 이전 변경 (세션 215)
**Cron 19개 전수 모니터링 + 이슈 3건 수정 + 프로덕션 배포**:
- ✅ 프로덕션 Cron 엔드포인트 19/19 전수 검증 (Query Param 10 + Bearer 9)
- ✅ `app/routes/api.cron.agent-review.ts` (수정): Cloudflare 30초 타임아웃 대응
  - MAX_REVIEWS_PER_RUN=1 (전체 tenant 후보에서 기한 임박 순 1건만 처리)
  - Promise.race 25초 타임아웃으로 Cloudflare 제한 내 완료 보장
  - batchSize/totalEligible 응답 필드 추가 (관측성 향상)
- ✅ `app/routes/api.cron.weekly-summary.ts` (수정): Resend rate limit (2 req/s) 회피
  - 이메일 전송 간 600ms 딜레이 추가 (for-of → index 기반 루프)
- ✅ OpenAI API 키 갱신: Cloudflare Pages secret + .dev.vars 업데이트 → embeddings Cron 정상화
- ✅ CI/CD 배포 완료 (2m13s, 세션 213~215 일괄 배포)

### 이전 변경 (세션 214)
**P2 통합 시맨틱 검색 페이지** (tmux 2-Worker 병렬):
- ✅ `app/routes/api.search.ts` (신규): 통합 검색 API — 4개 엔티티(Discovery/Idea/Source/Proposal) 병렬 검색
  - 시맨틱 모드: Vectorize(Discovery/Source) → FTS5 → LIKE 3단 fallback
  - 텍스트 모드: FTS5(Discovery) + LIKE(나머지) 병렬 검색
  - type/mode/limit 파라미터 + tenant 스코핑 + 부분 실패 허용 (개별 try-catch)
  - type=all일 때 ceil(limit/4) 균등 분배
- ✅ `app/routes/search.tsx` (신규): /search 통합 검색 전용 페이지
  - 중앙 검색바 + 텍스트/시맨틱(AI) 모드 토글 + 300ms 디바운스 + AbortController
  - 5개 카테고리 탭 (전체/Discovery/아이디어/소스/사업제안) + 결과 수 표시
  - 반응형 결과 카드 (모바일 카드 + 데스크톱 행) + 유사도 점수/소스 배지
- ✅ `app/components/layout/TopNav.tsx` (수정): 우측에 검색 돋보기 아이콘 추가 (→ /search 링크)
- ✅ `tests/unit/api/search.test.ts` (신규): 통합 검색 API 10개 테스트 (인증/파라미터 검증/응답 구조/fallback)
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공 / 테스트 969/969 PASS

### 이전 변경 (세션 213)
**P2 Vectorize 시맨틱 검색 UI** (tmux 2-Worker 병렬):
- ✅ `app/routes/discoveries._index.tsx` (수정): Discovery 목록 검색 기능 추가
  - SearchInput + 텍스트/시맨틱(AI) 모드 토글
  - 텍스트 모드: 클라이언트 사이드 title+seedSummary 필터링
  - 시맨틱 모드: /api/similar-seeds 호출 → Vectorize(보라색)/FTS(회색) 소스 배지 + 유사도 % 표시
  - 300ms 디바운스 + AbortController로 안정적 fetch
- ✅ `app/routes/discoveries.new.tsx` (수정): SimilarSeedsPanel 고도화
  - title 입력에도 유사 검색 연동 (seedSummary 우선, 5자 미만 시 title로 폴백)
  - SimilarSeedsResponse 타입 + score 필드 추가
  - 소스 배지: "AI 시맨틱" (variant=purple) / "텍스트 매칭" (variant=subtle)
  - 유사도 점수 표시, HOLD triggerType 한국어 레이블 (TRIGGER_TYPE_LABELS 맵)
  - DROP 경고 텍스트 ("실패 사례 — 동일 패턴에 주의하세요")
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공 / 테스트 959/959 PASS

### 이전 변경 (세션 212)
**Cron 일괄 등록 + 프로덕션 E2E 검증** (Playwright + cron-job.org REST API):
- ✅ cron-job.org REST API로 19개 Cron 엔드포인트 일괄 등록 완료 (2 PATCH + 15 PUT, 17/17 OK)
  - Phase 1: `daily`(7211996), `agent-review`(7213910) 시크릿 수정 (이전 시크릿 → CRON_SECRET)
  - Phase 2: Query Param 엔드포인트 7건 신규 등록 (lab-extract~signal-route)
  - Phase 3: Bearer 엔드포인트 8건 신규 등록 (memory-vectorize~briefing)
- ✅ 프로덕션 E2E 검증 5/5 PASS (Health + Memory/Signal/Graph Vectorize + Daily)
- ✅ `docs/ops/cron-registration-guide.md` 업데이트: "미등록 12개" 섹션 제거 → 19개 단일 테이블 + Job ID 기록

### 이전 변경 (세션 211)
**P1 운영 기능 — Monthly Failure Replay + Recall 이벤트 추적 + 운영 지표 대시보드** (tmux 3-Worker 병렬):
- ✅ `app/routes/dashboard.failure-replay.tsx` (신규): Monthly Failure Replay 뷰 — Dead End 큐레이션 (최근 30일) + HOLD 재검토 (Revisit Date 도래) + Failure Pattern 분포 카드 + 요약 통계 3종
- ✅ `app/lib/services/recall-tracking.service.ts` (신규): RecallTrackingService — 5종 이벤트 기록 (HOLD_DECIDED/DROP_DECIDED/RECALL_TRIGGERED/RECALL_REVIEWED/FAILURE_PATTERN_REUSED) + tenant 스코핑 통계 조회 (월별 breakdown 포함)
- ✅ `app/routes/api.recall-events.ts` (신규): Recall Events API — GET 통계 (날짜 필터) + POST 이벤트 기록 (eventType 기반 분기, 입력 검증)
- ✅ `app/routes/dashboard.ops-metrics.tsx` (신규): v1.4 §10 운영 지표 대시보드 — P0 성공 기준 배너 + 4개 핵심 MetricCard (28일 종결율/실험 완료율/Recall 이벤트/평균 결정 소요일) + Failure Pattern Top 5 + 주간 종결 트렌드 + Owner 성과 테이블
- ✅ `tests/unit/services/recall-tracking.test.ts` (신규): 8개 테스트 (5종 이벤트 기록 + 통계 집계 3종)
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공 / 테스트 959/959 PASS

### 이전 변경 (세션 210)
**운영 품질 강화 — Health Check + 모니터링 + E2E + FF 활성화 + 백로그 분석** (tmux 3-Worker 병렬):
- ✅ `wrangler.toml` (수정): FF_COLLAB_WORKER=true 전환 (collabWorker 프로덕션 활성화)
- ✅ `app/routes/api.health.ts` (신규): Health Check API — DB/Vectorize/FF 상태 확인 (인증 불요, 외부 모니터링 연동용)
- ✅ `app/routes/admin.monitoring.tsx` (신규): 관리자 모니터링 대시보드 — Cron 로그 + FF 상태 + 시스템 지표 4종
- ✅ `tests/e2e/` 7개 (신규): helpers + navigation + dashboard + ideas-workspace + proposals + lab + health-check E2E 스펙
- ✅ `tests/integration/cron-vectorize-routes.test.ts` (신규): memory/signal/graph vectorize Cron 라우트 통합 테스트 14개
- ✅ `tests/unit/api/health.test.ts` (신규): Health API 6개 테스트
- ✅ `tests/unit/admin/monitoring.test.ts` (신규): 모니터링 대시보드 6개 테스트
- ✅ `docs/backlog-session-210.md` (신규): PRD v3 갭 8건 + v1.4 미충족 8건 + 품질 개선 항목 정리
- ✅ `docs/ops/cron-registration-guide.md` (신규): 19개 Cron 엔드포인트 등록 가이드 (인증 패턴/스케줄/환경변수)
- ✅ `scripts/verify-vectorize-production.sh` (신규): Vectorize 프로덕션 E2E 검증 스크립트
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공 / 테스트 951/951 PASS

### 이전 변경 (세션 209)
**P4 고도화 Round 2 — Vectorize 프로덕션 활성화 + 통합 테스트 85개 + 프로덕션 배포** (tmux 3-Worker 병렬):
- ✅ `wrangler.toml` (수정): Vectorize 3개 바인딩 활성화 (VECTORIZE_GRAPHS/MEMORY/SIGNALS) + `FF_VECTORIZE_SEARCH=true`
- ✅ `drizzle/0039_consensus_enrich.sql` (신규): consensus_scores 테이블 signal_count/confirmed_at 컬럼 추가 (세션 201 스키마 누락 수정)
- ✅ `tests/helpers/db.ts` (수정): 0037_framework_seed + 0039_consensus_enrich 마이그레이션 추가
- ✅ `tests/unit/graph/vectorize-adapter.test.ts` (신규): GraphVectorizeAdapter 23개 테스트
- ✅ `tests/integration/graph/store-integration.test.ts` (신규): GraphStore CRUD + rollback 17개 테스트
- ✅ `tests/integration/graph/projection-integration.test.ts` (신규): ProjectionManager sync 11개 테스트
- ✅ `tests/integration/topic-service.test.ts` (신규): TopicService CRUD + 멤버 관리 15개 테스트
- ✅ `tests/integration/matrix-service.test.ts` (신규): MatrixService + ScoringService 19개 테스트
- ✅ Vectorize 인덱스 3개 프로덕션 생성: dx-graph-embeddings, dx-memory-embeddings, dx-signal-embeddings (512d cosine)
- ✅ `app/routes/api.cron.memory-vectorize.ts` (신규): Agent Memory → Vectorize 동기화 Cron (CRON_SECRET 인증 + FF 체크)
- ✅ `app/routes/api.cron.signal-vectorize.ts` (신규): Shared Signal → Vectorize 동기화 Cron
- ✅ `tests/integration/vectorize-sync.test.ts` (신규): Vectorize Cron 동기화 30개 테스트 (인증/FF/인덱싱/에러처리/E2E)
- ✅ DB 마이그레이션 0039 프로덕션 적용 완료
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공 / 테스트 925/925 PASS
- ✅ 프로덕션 배포 완료 (GitHub Actions CI/CD)

### 이전 변경 (세션 207)
**Framework Matrix P3 완료 — Executive/Operational Dashboard + Agent SOUL 매트릭스 맥락** (tmux 3-Worker 병렬):
- ✅ `app/routes/dashboard.exec.tsx` (신규): Executive Dashboard — Top 10 기회 랭킹, 파이프라인 S0~S4 분포, Time Horizon 비율, 주간 스코어 변동 (2×2 그리드)
- ✅ `app/routes/dashboard.ops.tsx` (신규): Operational Dashboard — Stage별 실행 현황, 리스크 Cell 모니터(score<2.5/watching), 팀원별 담당 Cell 분배 (3-패널)
- ✅ `app/lib/agent/soul-engine.ts` (수정): `teamId` 옵션 추가 + MATRIX.md Projection 로드 + 매트릭스 맥락 주입
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공
- 📊 **P3 완료 상태**: 시그널 보정(206) + BriefingBuilder(206) + Cron(206) + Exec Dashboard(207) + Ops Dashboard(207) + SOUL 맥락(207) = **5/5 완료**

### 이전 변경 (세션 206)
**Framework Matrix P3 시그널 보정 + BriefingBuilder + Cron** (tmux 3-Worker 병렬):
- ✅ `app/lib/services/scoring.service.ts` (수정): `recalculateAll(teamId, period)` 배치 재계산 + `getScoreChanges(teamId, since)` 변동 조회 + `getTopCells(teamId, limit)` 상위 Cell — 3개 메서드 추가
- ✅ `app/features/matrix/types.ts` (수정): `RecalculateResult`, `ScoreChange`, `TopCell` 인터페이스 추가
- ✅ `app/lib/integration/briefing-builder.ts` (수정): Matrix 섹션 확장 — 스코어 변동/신규 시그널/Stage 진행/Top 5 기회 (private 메서드 4개 + buildBriefing 확장)
- ✅ `app/routes/api.cron.matrix-scoring.ts` (신규): 매일 06:30 시그널 보정 일괄 재계산 Cron 엔드포인트 (tenant별 non-fatal)
- ✅ `tests/unit/services/scoring-batch.test.ts` (신규): 15개 테스트 (recalculateAll/getScoreChanges/getTopCells/Cron 인증)
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공 / 테스트 810/810 PASS

### 이전 변경 (세션 205)
**Framework Matrix P6.2 Graph @context iterate — H갭 6건 해결** (tmux 3-Worker 병렬):
- 📊 **갭 개선**: 설계 대비 일치율 **~62% → ~90%** (H갭 6건 전수 해결)
- ✅ `app/lib/graph/matrix-context.ts` (수정): `mx:TimeHorizon` 엔티티 + `horizon`/`label`/`rangeMonths` 프로퍼티 추가
- ✅ `app/lib/graph/validator.ts` (수정): ALLOWED_NODE_TYPES에 `mx:TimeHorizon`, 계층형 @id 패턴(`cell/{a}/{b}`) 지원
- ✅ `app/lib/graph/types.ts` (수정): `MatrixNodeType`에 `mx:TimeHorizon`, `ProjectionType`에 `MATRIX.md`, `GraphQueryEngineInterface`에 3메서드 추가
- ✅ `app/lib/graph/query.ts` (수정): `getMatrixCells(filters)` + `getSignalsByCell(2-hop)` + `getHeatmapData(horizonFilter)` 구현
- ✅ `app/lib/graph/projection.ts` (수정): `syncMatrixProjection` + `buildMatrixProjection` (Top10/Horizon/Pipeline/규모)
- ✅ `app/lib/services/matrix-graph.service.ts` (수정): TimeHorizon 노드 3개 생성(short/mid/long) + Cell relatedTo에 horizon 참조
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공 / 테스트 356/356 PASS

### 이전 변경 (세션 204)
**Framework Matrix P6.3 Matrix UI + P6.4 Stage-Gate 통합** (tmux 2-Worker 병렬 + 리더 직접 완료):
- ✅ `app/routes/lab.tsx` (수정): Lab 4탭 GNB에 "매트릭스" 탭 추가 (`/lab/matrix`)
- ✅ `app/routes/lab.matrix.tsx` (신규): Matrix 레이아웃 라우트 (인증 가드 + Outlet)
- ✅ `app/routes/lab.matrix._index.tsx` (신규): Heatmap 인덱스 페이지 (기간 선택 + 빈 상태 처리 + 셀 클릭 네비게이션)
- ✅ `app/routes/lab.matrix.$cellId.tsx` (신규): Cell 상세 페이지 (병렬 loader 4종 + action 3 intent: submitScore/calculateConsensus/updatePipelineStage)
- ✅ `app/components/matrix/HeatmapGrid.tsx` (신규): 산업×기능 교차 히트맵 그리드 (스코어 색상 + Stage Gate 라벨 + 델타 지표, 기능 카테고리 구분 행)
- ✅ `app/components/matrix/HeatmapLegend.tsx` (신규): 범례 3종 (스코어 레벨/Stage-Gate/변동)
- ✅ `app/components/matrix/CellDetailPanel.tsx` (신규): Cell 상세 패널 (종합 스코어 + C-Level/Execution 바 + 메타 정보 + 연결 토픽 + 태그)
- ✅ `app/components/matrix/ScoreInputForm.tsx` (신규): 10항목 스코어 입력 폼 (레인지 슬라이더 + 실시간 C-Level/Execution/Composite 평균 계산)
- ✅ `app/components/matrix/ScoreTrendChart.tsx` (신규): SVG 라인 차트 (종합/C-Level/Execution 3선, 외부 라이브러리 없음)
- ✅ `app/components/matrix/PipelineStageSelector.tsx` (신규): S0→S4 파이프라인 진행 바 (전진 전용 + 인라인 확인 다이얼로그)
- ✅ `app/components/matrix/index.ts` (신규): 배럴 export 6개 컴포넌트
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공

### 이전 변경 (세션 203)
**Framework Matrix P6.2 Graph @context 갭 분석** (tmux 2-Worker 병렬):
- 📊 **갭 분석 결과**: 설계(ArchMapping_v1.md §3) 대비 전체 일치율 **~62%** (51항목: ✅22, ⚠️14, ❌15)
  - W1 (Context+Types+Validator): 30항목, ~61%
  - W2 (Service+Query+Tests): 21항목, ~64%
- 🔍 **High 갭 6건 식별**:
  - TimeHorizon 엔티티 미구현 (Graph에서 시간축 표현 불가)
  - @id 계층형 패턴 미지원 (`cell/{a}/{b}` 형태 validator 거부)
  - `getSignalsByCell()` 미구현 (Cell↔Signal Graph 연결 조회 불가)
  - `getHeatmapData()` 미구현 (Heatmap UI 핵심 데이터 소스 없음)
  - `getMatrixCells()` 필터 미구현 (전체 Cell 필터 조회 없음)
  - MATRIX.md Projection 전체 미구현 (Agent bootstrap Matrix 맥락 주입 불가)
- ✅ **의도적 분기 확인**: `mx:` 네임스페이스 분리(긍정), 타입명 단축(합리), `xsd:float` 사용(표준)
- 📝 미구현 항목 대부분 ArchMapping 로드맵 P2~P3 Phase 해당 → 현 시점 의도된 미구현

### 이전 변경 (세션 202)
**/team 스킬 tmux split-pane 방식 전환**:
- ✅ `.claude/skills/team/SKILL.md` (수정): 별도 window(`new-window`) → 리더 pane에서 `split-window` 방식으로 전환
  - launcher: `split-window -h -t $LEADER_PANE -P -F '#{pane_id}'`로 같은 window에 worker 배치
  - 포커스 복원: `select-window` → `select-pane`
  - 정리: `kill-window` → `kill-pane` (worker만 개별 종료)
  - 모니터링: window:pane_index → pane ID 직접 참조
- ✅ 테스트 완료: pane 생성(4→6), leader 포커스 유지, cleanup 후 원상복구(6→4) 확인

### 이전 변경 (세션 201)
**Framework Matrix P6.0/P6.1 갭 분석 + 자동 수정** (tmux 2-Worker 병렬 × 2회):
- 📊 **갭 분석 결과**: P6.0 스키마 84.2% (117/139), P6.1 서비스 ~72% — 총 5건 Critical/High 항목 식별
- ✅ `app/features/matrix/db/schema.ts` (수정): consensusScores에 `signalCount` (시그널 보정 계산 수 추적) + `confirmedAt` (합의 확정 시점 기록) 컬럼 추가
- ✅ `app/lib/services/scoring.service.ts` (수정): calculateConsensus() — 산업 `strategic_weight` 곱셈(Step 3) + CLAMP(1.0, 5.0)(Step 5) 적용
- ✅ `app/lib/services/scoring.service.ts` (수정): confirmConsensus() — `min_voters_for_confirm` 최소 인원 체크 + `confirmedAt` 타임스탬프 기록
- ✅ `app/lib/services/scoring.service.ts` (수정): calculateConsensus() UPSERT — confirmed 상태 보호 (`confirmed` → `revised`로만 변경, `draft` 덮어쓰기 방지)
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공
- 📊 **예상 일치율**: P6.0 84.2%→~93%, P6.1 ~72%→~88%

### 이전 변경 (세션 200)
**Framework Matrix P6.2 Graph @context 연동** (tmux 2-Worker 병렬):
- ✅ `app/lib/graph/matrix-context.ts` (신규): `mx:` 네임스페이스 JSON-LD @context 정의 — Industry/Function/Cell/Score 어휘 + 타입 매핑 + 수치/날짜 XSD 타입
- ✅ `app/lib/services/matrix-graph.service.ts` (신규): MatrixGraphService — Cell/Industry/Function → JSON-LD 변환 (`cellToJsonLdNode`, `industryToJsonLdNode`, `functionToJsonLdNode`) + `buildTeamMatrixGraph` (팀 전체 그래프 빌드) + `syncCellToGraph` (단일 Cell upsert) + GraphStore 연동
- ✅ `app/lib/graph/types.ts` (수정): ScopeType에 `"team"` 추가, `MatrixNodeType` 타입 정의, `GraphQueryEngineInterface`에 Matrix 메서드 3개 추가
- ✅ `app/lib/graph/validator.ts` (수정): `mx:Industry/Function/Cell/Score` 노드 4종 허용 + ID 패턴 `mx:` prefix 지원 + TYPE_TO_ID_PREFIX Matrix 매핑 추가
- ✅ `app/lib/graph/query.ts` (수정): `findCellsByIndustry()`, `findCellsByFunction()`, `findLinkedTopics()` 3개 Matrix 전용 메서드 + `matchesIdRef()` 헬퍼 추가
- ✅ `app/lib/graph/projection.ts` (수정): `"team"` → `SOUL.md` 매핑 추가
- ✅ `app/routes/knowledge._index.tsx` + `knowledge.$graphId.tsx` (수정): team scope UI 설정 추가 (amber 컬러, 팀 아이콘)
- ✅ `tests/unit/graph/matrix-query.test.ts` (신규): 15개 테스트 — findCellsByIndustry(3) + findCellsByFunction(2) + findLinkedTopics(2) + findByType(3) + semanticSearch(2) + validateGraph(3)
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공 / 795 tests pass

### 이전 변경 (세션 199)
**Framework Matrix P6.1 서비스 레이어 + API 라우트 구현** (tmux 2-Worker 병렬):
- ✅ `app/lib/services/matrix.service.ts` (신규): MatrixService — Industry/Function/Cell CRUD + Cell-Topic N:M 연결 + Heatmap 데이터 (LEFT JOIN consensusScores, period 기반)
- ✅ `app/lib/services/scoring.service.ts` (신규): ScoringService — 개별 스코어 UPSERT (C-Level/Execution 자동 계산) + 합의 스코어 (가중 평균 + 시그널 보정 + 표준편차) + 설정 관리
- ✅ API 라우트 9개 신규: industries(GET/POST), functions(GET/POST), cells(GET/POST), $cellId(GET/PATCH), $cellId.topics(GET/POST), heatmap(GET), $cellId.scores(GET/POST), $cellId.consensus(POST calculate/confirm), config(GET/PATCH)
- ✅ `app/lib/acl/policies.ts` (수정): MATRIX_POLICIES 6개 정책 추가 (view/cell.edit/score.edit/master.edit/config.edit/cell.delete)
- ✅ `/team` 스킬 tmux split pane 가시성 문제 해결 (별도 세션→현재 세션 window 방식, leader window 자동 복귀)
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공

### 이전 변경 (세션 198)
**Framework Matrix P6.0 스키마 구조 셋업**:
- ✅ Framework Porting PRD 분석 (DiscoveryX_Framework_PRD_Final.docx 785단락 + 3개 참조 문서)
- ✅ Backend/Frontend/Docs 코드베이스 현황 분석 (3-Worker 병렬)
- ✅ Phase 6 작업 계획 수립 (P6.0~P6.4, 40+ work items, 9-11주)
- ✅ `app/features/matrix/db/schema.ts` — 7개 Drizzle 테이블 + 6개 enum 상수
- ✅ `app/features/matrix/types.ts` — 12개 인터페이스 + Stage-Gate 매핑 + 유틸리티
- ✅ `app/lib/types/enums.ts` — MATRIX_MD 추가
- ✅ `drizzle/0036_framework_matrix.sql` — DDL 마이그레이션 (7 테이블 + 인덱스)
- ✅ `drizzle/0037_framework_seed.sql` — 시드 데이터 (8산업, 9기능, 9설정)
- ✅ `app/db/index.ts` + `tests/helpers/db.ts` — matrixSchema 통합
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 780개 통과 / build 성공

### 이전 변경 (세션 197)
**docs/ 폴더 SDD 카테고리 정리**:
- ✅ `docs/specs/` — PRD/사양 문서 6개 이동 + Framework 포팅 문서 3개 신규 추가
- ✅ `docs/guides/` — 사용자/운영 가이드 5개 이동
- ✅ `docs/assets/` — Office 파일 4개 이동 (Framework PRD docx 포함)
- ✅ `docs/archive/wireframes-v5/` — v5 wireframe PNG 3개 아카이브
- ✅ `docs/04-report/` — 03-analysis에서 report 파일 2개 올바른 위치로 이동
- ✅ `03-analysis/proposals.report.md` 삭제 (archive에 최종본 존재)
- ✅ CLAUDE.md 경로 참조 업데이트 (docs/ → docs/specs/)
- ✅ `app/lib/docs/registry.ts` — `?raw` import 경로를 `docs/specs/`, `docs/guides/`로 수정 (빌드 실패 원인)
- ✅ 프로덕션 배포 완료 (CI/CD 통과, 1m48s)

### 이전 변경 (세션 196)
**미사용 import 정리 + /team 스킬 개선**:
- ✅ `/team` 스킬 tmux pane 타겟팅 버그 수정 (`.0` → window-level send-keys)
- ✅ `/team` 스킬 환경 자동 감지 추가 (WSL_DIRECT / GIT_BASH 분기)
- ✅ `/team` 스킬 하드코딩 경로 → `$PWD` 기반 동적 경로로 전환
- ✅ tsc `--noUnusedLocals --noUnusedParameters` 17건 → 0건 해결 (tmux 2-Worker 병렬)
- ✅ 테스트 파일 10개에서 미사용 import/변수 제거
- ✅ typecheck 0 에러 / lint 0 에러

### 이전 변경 (세션 195)
**PRD v3 전면 재감사 + 조치 — tmux 3-Worker 병렬 (3 Round)**:

**Round 1: 감사 실행 (101항목 분석)**
- W1: Graph Layer + DB Schema (14항목) — 85.7% (10✅ 4⚠️)
- W2: Agent Runtime + Memory + Cost + Integration (66항목) — 84.8% (56✅ 8⚠️ 2❌)
- W3: ACL + Topic + Services + Routes + UI (21항목) — 83.3% (15✅ 5⚠️ 1❌)
- 📊 **전체**: 84.5% (81✅ 17⚠️ 3❌)

**Round 2: Critical 항목 조치 (5건)**
- ✅ `topics.$id.tsx`: requireScopeAccess() ACL 미들웨어 적용 (loader read + action write)
- ✅ `token-usage-schema.ts`: cost_usd(real) + purpose(text) 컬럼 추가
- ✅ `dx-context.ts`: JSON-LD namespace URI 통일 (dx.minu.best → discovery-x.app/ns)
- ✅ `0033_token_usage_enrich.sql`: cost_usd + purpose ALTER TABLE 마이그레이션
- ✅ `0034_shared_signals_partial_index.sql`: shared_signals topic_id 부분 인덱스

**Round 3: 나머지 ⚠️ 항목 조치 (6건)**
- ✅ `agent-session.ts`: buildSystemPrompt() SoulEngine 레이어링 (SOUL.md + USER Projection 캐시)
- ✅ `agent-session.ts`: checkMonthlyBudget() D1 raw SQL 월간 예산 체크 추가
- ✅ `agent-session.ts`: flushMemory() conversation_summary 저장 추가
- ✅ `cron-handler.ts`: runWeeklySummary() 구현 (Topic별 주간 활동 집계→shared_signals 기록)
- ✅ `token-usage-schema.ts` + `0035_token_usage_userid.sql`: user_id 컬럼 + 복합 인덱스
- ✅ `types.ts`: SessionState.conversationSummary 필드 추가
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 780개 통과 / build 성공
- 📊 **결과**: 전체 일치율 84.5% → ~95% (의도적 차이 4건 제외)

### 이전 변경 (세션 194)
**전체 코드 품질 점검 + 에러 처리 일괄 추가 — tmux 3-Worker 병렬 (Round 2)**:
- ✅ **W1**: proposals 7개 + ideas.memo try-catch 추가 (loader/action 전체)
- ✅ **W2**: topics 나머지 5개 + radar 4개 + admin/agent/briefing/profile 5개 try-catch 추가
- ✅ **W3**: `dashboard.review.tsx` sql.raw→inArray 보안 수정 + dashboard._index/market 인증 패턴 통일
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 780개 통과
- 📊 **결과**: API 라우트 try-catch 미적용 44→0개, sql.raw 1→0건, 인증 혼용 2→0건

### 이전 변경 (세션 193)
**미사용 코드 정리 — dead code 제거 + API 라우트 리팩토링**:
- ✅ **파일 삭제**: `similar-items.ts`, `collab-worker.stub.ts`, `utils.ts` (미사용 모듈 제거)
- ✅ **미사용 export 제거**: `getDiscoverySummary()`, `SignalStatus`, `getActiveSessionCount()`, `toGraphRecord()` export 등
- ✅ **API 라우트 정리**: export/folders/topics/tenant 라우트 인라인 헬퍼 정리 + 중복 코드 제거
- ✅ **기타**: Dialog.tsx Radix import 정리, 미사용 devDependencies 제거
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 780개 통과

### 이전 변경 (세션 192)
**프로덕션 배포 + DB 마이그레이션 적용**:
- ✅ **CI/CD 배포**: `git push origin master` → GitHub Actions (Lint/Type check/Test/Build/Deploy) 완료
- ✅ **배포 에러 해결**: Vectorize 미생성 인덱스(dx-graph/memory/signal-embeddings) 바인딩 → 주석 처리 후 재배포 성공
- ✅ **DB 마이그레이션**: 프로덕션 D1에 0030~0032 적용 (v2 Graph Layer + ACL audit + collab worker)
- ✅ 세션 189~191에서 구현한 갭 분석 조치 10건 + Phase 5 확장 + 코드 품질 개선 모두 프로덕션 반영
- 📌 **Vectorize 인덱스**: 3개 미생성 (graph/memory/signals) — 생성 시 wrangler.toml 주석 해제 + FF_VECTORIZE_SEARCH=true 전환 필요

### 이전 변경 (세션 191)
**전체 코드 품질 점검 + 일괄 수정 — tmux 4-Worker 병렬 작업**:
- ✅ 품질 점검: typecheck 0에러 / lint 0에러 / 테스트 780개 통과 / build 성공
- ✅ **W1 데드코드 정리**: 미사용 export 27개 삭제 + `collab-worker.stub.ts` 삭제 + `cn()` 유틸 통합 (`utils.ts` → `utils/cn.ts`) + 미사용 의존성 제거 (`date-fns`, `tiny-invariant`)
- ✅ **W2 에러 처리 A**: API 라우트 try-catch 추가 (folders 4개 + proposals 6개 + conversations 1개 + ideas.memo 1개)
- ✅ **W3 에러 처리 B**: API 라우트 try-catch 추가 (topics 9개 + radar 4개)
- ✅ **W4 에러 처리 C + 보안 수정**: API 라우트 try-catch 추가 (export/tenant/admin/agent/briefing/profile) + `dashboard.review.tsx` sql.raw→inArray 보안 수정 + 혼용 인증 패턴 정리 (dashboard._index.tsx, market.tsx)
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공 / 테스트 통과

### 이전 변경 (세션 190)
**Phase 5 갭 해소 완료 — PRD v3 일치율 ~70% → 95%+ 달성 (4-Phase 실행)**:
- ✅ **Phase 5A (보안·무결성)**:
  - `app/lib/graph/store.ts`: Agent actorType 가드 (dx:Preference만 수정 허용, 삭제 불가)
  - `app/lib/graph/validator.ts`: @id 패턴 `dx:{type}/{id}` 강제 (warning→error)
  - `app/lib/acl/policies.ts` (신규): PERMISSION_MATRIX 분리 + AGENT_ALLOWED_ACTIONS
  - `app/lib/acl/middleware.ts`: 403 응답에 Topic owner 이름 포함
  - `schemas/templates/SOUL-analyst.md`, `SOUL-manager.md` (신규): 역할별 SOUL 템플릿
  - `schemas/validation/` (신규): user/topic/graph JSON Schema 3종
- ✅ **Phase 5B (agent-worker DO)**:
  - `agent-worker/` 디렉토리 (신규 4파일): AgentSessionDO + Worker 라우팅 + HMAC 인증 + SSE 스트리밍
  - `app/lib/agent/agent-do.stub.ts`: delegateToDO() 실제 구현 (HMAC 서명 + HTTP 위임)
  - `app/routes/api.chat.ts`: FF_AGENT_DO=true → DO 위임 분기
  - `app/components/chat/ChatPanel.tsx`: 429 동시성 에러 처리
- ✅ **Phase 5C (collab-worker + 스키마)**:
  - `collab-worker/` 디렉토리 (신규 5파일): Cron handler + notification + Worker entry
  - `drizzle/0032_collab_worker_tables.sql` (신규): notification_queue + tenants 확장(profile_ld/rules_md) + cron_logs
  - `app/db/schema.ts`: tenants에 profileLd, rulesMd 컬럼 추가
- ✅ **Phase 5D (품질 고도화)**:
  - `app/lib/graph/vectorize-adapter.ts`: Memory + Signal Vectorize 인덱싱 메서드 추가
  - `wrangler.toml`: VECTORIZE_GRAPHS/MEMORY/SIGNALS 바인딩 + Feature Flag 5개 true 전환
  - `app/components/chat/ChatPanel.tsx`: 토큰 예산 100% 초과 시 입력 비활성화 + destructive 배너
  - `app/routes/topics.tsx`: 사이드바 검색 입력 + 상태 필터 (active/completed/archived)
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 780개 통과

### 이전 변경 (세션 189)
**PRD v3 Phase 1~3 갭 분석 조치 10건 구현 — tmux 4-Worker 병렬 작업**:
- ✅ **즉시 조치 3건**:
  - `drizzle/0031_acl_audit_memory_indexes.sql` (신규): acl_audit_logs 테이블 + agent_memory_v2 compact/expires 인덱스
  - `app/db/schema-v2.ts` (수정): aclAuditLogs Drizzle 스키마 + agentMemoryV2 인덱스 추가
  - `app/lib/acl/middleware.ts` (수정): ACL deny 시 DB 감사 로그 기록 (try/catch non-blocking)
  - `tests/helpers/db.ts` (수정): 0031 마이그레이션 등록
  - API 라우트 6개 (수정): GraphStore 호출 시 audit context `{ actorId: user.id, actorType: "user" }` 전파 (topics.glossary, topics.decisions, profile.graph, profile)
- ✅ **중기 조치 4건**:
  - `app/lib/rate-limit/sse-limiter.ts` (신규): SSE 동시성 제한기 (사용자당 3세션, TTL 5분, In-memory Map)
  - `app/routes/api.chat.ts` (수정): 429 제한 + TransformStream 래핑 + 세션 해제
  - `app/lib/agent/session-manager.ts` (수정): flush(retentionDays=90) 메서드 추가 — 종료 세션 정리
  - `app/lib/graph/store.ts` (수정): suggest() + getPendingSuggestions() 메서드 추가, create()에서 빈 @context 시 DX_CONTEXT 자동 주입
  - `app/lib/graph/types.ts` (수정): GraphStoreInterface에 suggest 시그니처 추가
  - `app/lib/graph/dx-context.ts` (신규): JSON-LD @context 기본 정의 (15개 프로퍼티, dx/xsd/rdfs 네임스페이스)
  - `app/lib/agent/memory-lifecycle.ts` (수정): compact() step 3 — optional summarizer 콜백으로 고중요도 archived daily_log → LLM 요약 → long_term 승격
- ✅ **후기 조치 3건** (스텁/인터페이스):
  - `app/lib/agent/agent-do.stub.ts` (신규): AgentSession DO 스텁 — FF_AGENT_DO 게이트, 이관 대비 인터페이스
  - `app/lib/integration/collab-worker.stub.ts` (신규): collab-worker 독립 Worker 스텁 — FF_COLLAB_WORKER 게이트, CollabWorkerAPI 인터페이스 + fetch 헬퍼
- ✅ tmux /team 4-Worker 병렬 작업 (W1: Schema/DB, W2: API Routes, W3: Graph+Memory, W4: Runtime)
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공 / 테스트 779개 통과
- 📊 **갭 분석 일치율 변화**: Phase 1 82%→~90%, Phase 2 88%→~95%, Phase 3 85%→~93% (전체 ~85%→~93%)

### 이전 변경 (세션 188)
**PRD v3 Phase 1~3 갭 분석 — tmux 3-Worker 병렬 분석 수행**:
- ✅ Phase 1 (Graph Layer + Agent Runtime) — **일치율 82%** (15✅ 5⚠️ 2❌)
- ✅ Phase 2 (ACL + Topic + Memory) — **일치율 88%** (17✅ 5⚠️ 1❌)
- ✅ Phase 3 (Pipeline + Collaboration) — **일치율 85%** (13✅ 5⚠️ 1❌)
- 📊 **전체 요약**: 65개 항목 중 45✅ 15⚠️ 4❌
- 📋 **식별된 조치 항목**: 즉시 3건 + 중기 4건 + 후기 3건 → 세션 189에서 전량 구현

### 이전 변경 (세션 187)
**PRD v3 Phase 4 Round 2 — SignalRouter Cron + 비용 대시보드 + 팀 지식 베이스 + v3 E2E 테스트 (Phase 4 완료)**:
- ✅ `app/routes/api.cron.signal-route.ts` (신규): SignalRouter Cron — pending 시그널 자동 라우팅 (CRON_SECRET 인증 + pipelineBridge FF 보호)
- ✅ `app/routes/admin.costs.tsx` (신규): 비용 대시보드 UI — 일별 토큰 사용량 스택 바 차트 (CSS, 외부 의존 0) + 사용자별 예산 현황 테이블 + 요약 카드 3개 + 7일/30일 토글
- ✅ `app/routes/api.knowledge.ts` (신규): 팀 지식 베이스 API — Graph 통합 목록 (scope/search 필터 + 노드 수 + 통계)
- ✅ `app/routes/api.knowledge.$graphId.ts` (신규): 지식 베이스 상세 API — JSON-LD 파싱 → 노드/엣지 + Projection
- ✅ `app/routes/knowledge.tsx` + `knowledge._index.tsx` + `knowledge.$graphId.tsx` (신규 3개): 팀 지식 베이스 UI — scope별 카드 그리드 (user=blue/topic=green/org=purple) + 그래프 상세 (노드 타입별 그룹 + 관계 + Projection 미리보기)
- ✅ `tests/unit/agent/profile-learner.test.ts` (신규): ProfileLearner 단위 테스트 9개 — TF 키워드 추출/불용어/전문 마커/learnAll/중복 방지
- ✅ `tests/integration/pipeline-bridge.test.ts` (신규): PipelineBridge 통합 테스트 12개 — 시그널/기회/전문성/브리핑/엔티티
- ✅ `tests/integration/briefing-builder.test.ts` (신규): BriefingBuilder 통합 테스트 8개 — 마크다운 생성/Projection 갱신
- ✅ tmux /team 3-Worker 병렬 작업 (W1: Cron+Tests, W2: Cost Dashboard, W3: Knowledge Base)
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공 / 테스트 779개 통과

### 이전 변경 (세션 186)
**PRD v3 Phase 3 Round 2 — SignalRouter + TokenBudget 강화 + Cron/Admin 라우트**:
- ✅ `app/lib/integration/signal-router.ts` (신규): SignalRouter — pending 시그널을 topic member expertise score 기반 자동 라우팅, routePendingSignals() + getRoutingStats(), PipelineBridge.getExpertiseScore() 활용, 라우팅 후 status='reviewed' + BriefingBuilder 자동 갱신 + graphEvents 감사 로그
- ✅ `app/lib/cost/token-budget.ts` (대폭 수정): TokenBudgetManager 강화 — conversations JOIN 기반 월간 사용량 (tenantId→conversations 전환), 상수 export (USER_MEMORY_BUDGET 100K / MONTHLY_LLM_BUDGET 2M), enforceMemoryBudget() + isLLMCallAllowed() + isOverBudget() + UTC 기반 월 리셋
- ✅ `app/routes/api.collab.worker.ts` (신규): Cron — CRON_SECRET 인증 + collabWorker FF 게이트 + SignalRouter.routePendingSignals(), Admin GET — getRoutingStats()
- ✅ `app/routes/api.admin.token-budget.ts` (신규): Admin GET — 전체 사용자 토큰 예산 현황 (초과 사용자 상단 정렬), Admin POST — 특정 사용자 메모리 예산 강제 정리
- ✅ `app/routes/api.cron.memory-compact.ts` (수정): TokenBudgetManager.enforceMemoryBudget() 연동 — compact 후 토큰 예산 초과 시 importance 낮은 순 정리
- ✅ `tests/integration/signal-router.test.ts` (신규): 6개 테스트 — 라우팅/스킵/배치/통계
- ✅ `tests/integration/token-budget.test.ts` (신규): 9개 테스트 — 메모리 합계/아카이브 제외/월간 JOIN/사용자 격리/예산 체크/상수
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공 / 테스트 750개 통과

### 이전 변경 (세션 185)
**PRD v3 Phase 4 Round 1 — ProfileLearner + Graph Rollback UI + Vectorize Graph 연동**:
- ✅ `app/lib/agent/profile-learner.ts` (신규): ProfileLearner — TF 기반 키워드 추출 (Korean/English stopwords, 전문·경험 마커), agentMemoryV2 30일 분석 → Graph JSON-LD 자동 업데이트 (dx:Expertise/dx:Preference 노드 + Projection 동기화)
- ✅ `app/routes/api.cron.profile-learn.ts` (신규): 주간 ProfileLearner Cron — 전 사용자 프로필 자동 학습 (CRON_SECRET 인증 + profileLearner FF 보호)
- ✅ `app/lib/agent/index.ts` (수정): ProfileLearner export 추가
- ✅ `app/lib/feature-flags.ts` (수정): `profileLearner` Feature Flag 추가 (8→9개)
- ✅ `app/lib/graph/store.ts` (수정): `rollback(graphId, targetVersion, audit?)` 메서드 추가 — graph_events diff_json에서 대상 버전 상태 복원, 롤백도 새 버전 생성 (이력 보존)
- ✅ `app/routes/profile.history.tsx` (신규): Graph 버전 이력 + 라인별 diff 뷰 + 원클릭 롤백 — EventItem (버전/액션 배지 + diff 토글) + DiffPanel (green/red 하이라이팅) + 롤백 확인 Dialog
- ✅ `app/routes/api.graph.$id.rollback.ts` (신규): POST — Graph 롤백 API (소유권 검증 + Projection 자동 재생성)
- ✅ `app/routes/api.graph.$id.history.ts` (신규): GET — Graph 이벤트 이력 조회 API (limit 파라미터)
- ✅ `app/routes/profile.tsx` (수정): 헤더에 "변경 이력 보기 →" 링크 추가 (`/profile/history`)
- ✅ `app/lib/graph/vectorize-adapter.ts` (신규): GraphVectorizeAdapter — OpenAI text-embedding-3-small (512차원) + Cloudflare Vectorize upsert/search, isAvailable() 환경 체크
- ✅ `app/lib/graph/query.ts` (수정): GraphQueryEngine에 Vectorize 우선 시맨틱 검색 추가 (실패 시 keyword fallback), keywordSearch() 분리
- ✅ `app/routes/api.cron.graph-vectorize.ts` (신규): Graph Vectorize 배치 인덱싱 Cron — 전체 Graph 벡터 동기화
- ✅ tmux /team 3-Worker 병렬 작업 (W1: ProfileLearner, W2: Graph Rollback UI, W3: Vectorize)
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공

### 이전 변경 (세션 184)
**PRD v3 Phase 3 Round 1 — 파이프라인 통합 코어 (PipelineBridge + Signal + Cron + /signals UI)**:
- ✅ PipelineBridge + SignalService + Projection Sync + Cron 3개 + /signals UI
- ✅ Feature Flag 6→8개 (pipelineBridge + collabWorker)
- ✅ tmux /team 3-Worker 병렬 작업
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공

### 이전 변경 (세션 183)
**PRD v3 Phase 2 Round 2 — Topic Graph Decision/Glossary + Briefing 뷰 (Phase 2 완료)**:
- ✅ TopicGraphService + BriefingBuilder + GraphStore AuditContext 확장
- ✅ Decision/Glossary/Events/Briefing API 6개 라우트
- ✅ Topic 4탭 UI (개요/결정/용어/이력) + 브리핑 뷰
- ✅ tmux /team 3-Worker 병렬 작업
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공

### 이전 변경 (세션 182)
**PRD v3 Phase 2 Round 1 — ACL 완성 + Topic 서비스/API/UI + Memory flush 연동**:
- ✅ `app/lib/acl/resolver.ts` (수정): ScopeResolver — topic_members/tenant_members 실제 DB 조회 (D1Database → DB 타입 전환, stub → 완성)
- ✅ `app/lib/acl/middleware.ts` (수정): requireScopeAccess() — FF 활성 시 getUserFromSession → extractScope → resolve → 403 흐름 완성
- ✅ `app/lib/agent/executor.ts` (수정): 대화 종료 시 MemoryLifecycle.addDailyLog() 호출 (FF `memoryLifecycle` 보호, 비치명적 try-catch)
- ✅ `app/lib/services/topic.service.ts` (신규): TopicService — list/getById/create/update/archive + addMember/removeMember/updateMemberRole/getMembers
- ✅ `app/routes/api.topics.ts` (신규): Topic API — GET 목록 + POST 생성 (생성자 자동 owner)
- ✅ `app/routes/api.topics.$id.ts` (신규): Topic 상세 API — GET + PATCH + DELETE (아카이브)
- ✅ `app/routes/api.topics.$id.members.ts` (신규): 멤버 API — GET + POST + DELETE
- ✅ `app/routes/api.topics.$id.members.$userId.ts` (신규): 멤버 역할 변경 API — PATCH
- ✅ `app/routes/topics.tsx` (신규): AppShell 내 2컬럼 레이아웃 (280px 사이드바 + Outlet)
- ✅ `app/routes/topics._index.tsx` (신규): 빈 상태 가이드 + Topic 생성 모달
- ✅ `app/routes/topics.$id.tsx` (신규): Topic 상세 (인라인 편집 + 멤버 관리 + 사용자 검색 + 아카이브)
- ✅ `app/components/topic/TopicCard.tsx` (신규): 선택 인디케이터 + 상태 배지 + 멤버 수
- ✅ `app/components/topic/MemberList.tsx` (신규): 역할 배지 (owner/editor/viewer) + 제거 버튼
- ✅ `app/components/topic/TopicStatusBadge.tsx` (신규): active/completed/archived 상태 배지
- ✅ tmux /team 3-Worker 병렬 작업 (W1: ACL+Memory, W2: Topic Service+API, W3: Topic UI)
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공

### 이전 변경 (세션 181)
**PRD v3 Phase 1 Round 3 — SessionManager + /agent·/profile UI (Phase 1 완료)**:
- ✅ SessionManager + SoulEngine→executor 통합
- ✅ /agent 대화 UI (세션 목록 + 대화 뷰 + Projection 상태)
- ✅ /profile 프로필 편집 UI (Graph 기반 + USER.md Projection 미리보기)
- ✅ 테스트 20개 추가 (총 735개) / typecheck 0 에러 / build 성공

### 이전 변경 (세션 180)
**PRD v3 Phase 1 Round 1+2 — Graph Layer 코어 + Agent 모듈 + 테스트**:
- ✅ Graph Layer 4모듈: Store (CRUD + SHA-256 + audit), Query (BFS + semantic), Projection (USER.md/TOPIC.md), Validator
- ✅ Agent 모듈 3개: SoulEngine, MemoryLifecycle, TokenBudgetManager
- ✅ 테스트 54개 (graph/ 4파일) / typecheck 0 에러 / build 성공

### 이전 변경 (세션 179)
**PRD v3 Phase 0 완료 — Feature Flag + ACL stub + 서비스 레이어 + 마이그레이션**:
- ✅ Feature Flag 6개 + ACL stub + 서비스 레이어 6파일 + v2 마이그레이션 0030
- ✅ `drizzle/0030_v2_graph_layer.sql` (신규): v2 8테이블 마이그레이션 (IF NOT EXISTS + CHECK 제약조건)
- ✅ `tests/helpers/db.ts`: v2Schema import + 0030 마이그레이션 참조 추가
- ✅ 마이그레이션 정리: 잘못된 0027 auto-generated 삭제, journal/snapshot 정리
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 661개 통과 / build 성공 / D1 로컬 마이그레이션 적용 완료

### 이전 변경 (세션 178)
**PRD v3 Phase 0 — 구조 정비 시작**:
- ✅ `docs/Discovery-X_PRD_v3_Final.md`: PRD v3 최종본 프로젝트 등록
- ✅ `app/db/schema-v2.ts` (신규): Graph Layer 스키마 8테이블
- ✅ `app/lib/graph/types.ts`, `app/lib/acl/types.ts`, `app/lib/types/enums.ts` (신규): 타입/인터페이스 정의
- ✅ `schemas/contexts/discovery-x.jsonld` (신규): JSON-LD @context 정의

### 이전 변경 (세션 177)
**CLAUDE.md 품질 개선**:
- ✅ `CLAUDE.md`: `@axis-ds` 디자인 시스템 명시, SSR external/noExternal 실제 vite.config.ts와 일치, Vite 빌드 gotcha 추가, app/ 디렉토리 구조 개요 추가
- ✅ `~/.claude/CLAUDE.md` (글로벌): 한국어 응답 명시, Conventional Commits 승격, 환경 섹션(Node.js 20+/pnpm/WSL2), import 정렬 규칙 추가
- ✅ Working tree 복원: 561개 unstaged deletion → `git checkout --` 으로 전체 복원
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 661개 통과 / build 성공 / CI/CD 배포 완료 (1m 50s)

### 이전 변경 (세션 176)
**Google 로그인 수정 + TopNav hydration mismatch 해결**:
- ✅ `.dev.vars`: Google OAuth Client ID 오타 수정 (`vnqg` → `vngq`, `155` → `455`)
- ✅ `auth.google.callback.tsx`: `sinclairseo@gmail.com` 화이트리스트 추가
- ✅ `auth.google.tsx`: 디버그 console.log 제거 (세션 175 잔여)
- ✅ `TopNav.tsx`: 테마 토글 아이콘 hydration mismatch 해결 — `mounted` 상태로 클라이언트 마운트 후에만 테마 아이콘 렌더링
- ✅ 로컬 D1: `sinclairseo@gmail.com` role `pending` → `admin` 업데이트
- ✅ typecheck 0 에러 / build 성공

### 이전 변경 (세션 175)
**아이디어→사업 제안서 생성 플로우 구현**:
- ✅ `ProposalCreationModal.tsx`: 완전 재구현 — 모달 열릴 때 분석 데이터 fetch, 왼쪽 패널에 완료된 분석 카테고리 체크박스 리스트 (자동 선택), 오른쪽 7탭 제안서 섹션 미리보기 (ReactMarkdown), 로딩/에러/빈 상태 처리
- ✅ `api.ideas.$id.analysis.ts` (신규): GET — 아이디어 분석 데이터 조회 API
- ✅ `api.ideas.$id.create-proposal.ts` (신규): POST — 선택된 분석 카테고리로 사업 제안서 자동 생성, proposals + proposal_sections INSERT
- ✅ `proposal-mapper.ts` (신규): 12개 분석 카테고리 → 10개 제안서 섹션 매핑 로직 (overview←bmc/industry_example, hypothesis←critical_thinking/swot, target_market←market_research 등)
- ✅ `ideas.tsx`: 모달에 `ideaId` + `onProposalCreated` 콜백 전달, 생성 완료 시 `/proposals/:id` 자동 이동
- ✅ `SourceInputPanel.tsx`: 수집 소스 패널 페이지네이션 → 수직 리사이즈 전환 (120~400px, localStorage 저장)
- ✅ `vite.config.ts`: `getPlatformProxy()` → `cloudflareDevProxyVitePlugin()` 전환
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공 / CI/CD 배포 완료

### 이전 변경 (세션 174)
**소스 Drag & Drop + 분석 sourceIds 추적 + stale 섹션 감지**:
- ✅ `SourceInputPanel.tsx`: 수집 소스 → 상단 드래그로 추가, 선택 소스 → 하단 드래그로 제거 (Native HTML5 DnD), 드래그 중 시각적 피드백 (점선 테두리 + 힌트 텍스트), 기존 클릭/X버튼 동작 유지
- ✅ `MethodologyCards.tsx`: `sourceIds`/`analyzedAt`/`staleSections` props 추가 — 소스 변경 시 stale 표시 지원
- ✅ `idea-tools.ts`: `updateIdeaAnalysis`에 `sourceIds` + `analyzedAt` 저장
- ✅ `analyzer.ts`: 직접 분석 시 `sourceIds`/`analyzedAt` 함께 저장
- ✅ `api.ideas.$id.analyze.ts`: `sourceIds` 파라미터 전달 지원
- ✅ `ideas.$id.tsx`: `staleSections` 계산 로직 — 현재 선택 소스 vs 분석 시 소스 비교, `selectedSourceIds` OutletContext 추가
- ✅ `ideas.tsx`: 분석 요청 시 `sourceIds` 함께 전송
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 661개 통과 / build 성공 / CI/CD 배포 완료

### 이전 변경 (세션 173)
**토큰 사용량 모니터링 UI + Ideas 전용 분석 API SSE + 진행률 UI**:
- ✅ `api.ideas.$id.analyze.ts` (신규): POST SSE 엔드포인트 — 카테고리별 직접 Claude 호출, chat agent 루프 우회, SSE progress 이벤트 스트리밍
- ✅ `AnalysisProgress.tsx` (신규): 6개 카테고리 진행률 칩 (대기/진행/완료/실패) + 프로그레스 바
- ✅ `IdeaChatWrapper.tsx`: `analysisRunning`/`categoryStates` props 추가, AnalysisProgress 컴포넌트 통합
- ✅ `ideas.tsx`: `handleStartAnalysis` 재작성 — chat agent 메시지 → SSE 직접 API 호출, `analysisRunning`/`categoryStates` 상태 관리
- ✅ `TokenUsageChart.tsx` (신규): CSS-only 스택 바 차트 — 모드별 색상 (기본/Ideas/전용 분석), 7일/30일 토글, 예산 점선
- ✅ `TokenUsageTable.tsx` (신규): 최근 50건 사용 로그 테이블 — 모드 필터, 시간/모드/모델/토큰 컬럼
- ✅ `settings.tsx`: 관리자 토큰 사용량 섹션 추가 — `useTokenUsage` 훅 + 차트/테이블 카드 통합
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공

### 이전 변경 (세션 172)
**아이디어 페이지 — 제목 인라인 편집 + AI 제목 추천 + 방법론 카드 마크다운 렌더링**:
- ✅ `MethodologyCards.tsx`: `renderContent()` 제거 → ReactMarkdown + remarkGfm + rehypeHighlight (prose-sm 컴팩트)
- ✅ `api.ideas.ts`: PATCH 핸들러 추가 — 제목 업데이트 (200자 제한)
- ✅ `api.ideas.$id.suggest-title.ts` (신규): POST 엔드포인트 — 소스 기반 AI 제목 추천 (callClaude, max_tokens: 100)
- ✅ `ideas.$id.tsx`: EditableTitle + SuggestTitleButton 컴포넌트 — click-to-edit, Enter/blur 저장, Escape 취소, optimistic UI
- ✅ `ideas.tsx`: Outlet context에 `onTitleUpdated` 콜백 추가 — revalidator.revalidate()로 드로어/헤더 갱신

### 이전 변경 (세션 171)
**채팅 패널 오버플로우 수정 + 배포**:
- ✅ `IdeaChatWrapper.tsx`: 루트 div에 `h-full min-w-0 overflow-hidden` 추가 — 부모 높이 채움 + 콘텐츠 넘침 방지
- ✅ `ideas.tsx`: 좌/우 패널 래퍼에 `overflow-hidden` 추가 — 패널 너비 초과 콘텐츠 차단
- ✅ `ChatPanel.tsx`: `mode="ideas"` 시 좁은 패널 최적화 — `px-6`→`px-3`, `max-w-3xl` 제거, 입력/제안/경고 영역 동일 처리
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 661개 통과 / build 성공 / CI/CD 배포 완료 (1m 37s)

### 이전 변경 (세션 170)
**방법론 카드 마이그레이션 완료 + 토큰 사용량 로깅 + 배포**:
- ✅ `IdeaChatWrapper.tsx`: `RESEARCH_CATEGORIES` → `PRIMARY_METHODOLOGIES` import 교체 (상수 중복 제거)
- ✅ `IdeaGadgetTabs.tsx` 삭제: `MethodologyCards.tsx`로 완전 대체
- ✅ `ideas._index.tsx`: "분석 시작" 단일 버튼 → Primary 4개 방법론 카드 그리드 + 전체 분석 링크, OutletCtx에 `onRunMethodology`/`loadingCategory` 추가
- ✅ `PanelResizeHandle.tsx`: `onResizeRef` 도입 — 드래그 중 stale closure 방지
- ✅ `use-panel-layout.ts`: `resizeLeft`/`resizeRight` 안정 콜백 추가
- ✅ `token-usage-schema.ts` (신규): `token_usage_logs` 테이블 — 대화별 input/output 토큰, 모델, 모드, 도구 라운드 기록
- ✅ `executor.ts`: `updateTokenUsage`에 메타데이터 전달 → `token_usage_logs` insert
- ✅ 마이그레이션 `0029_token_usage_logs.sql` 프로덕션 적용 완료
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 661개 통과 / build 성공 / CI/CD 배포 완료 (1m 41s)

### 이전 변경 (세션 169)
**아이디어 페이지 — 패널 리사이즈/토글 통합 + 12종 방법론 카드 + 배포**:
- ✅ `ideas.tsx`: `usePanelLayout()` 훅 통합, 좌/우 패널에 동적 width 적용, `PanelResizeHandle` 배치, 패널 숨김 시 가장자리 토글 버튼, hover 시 collapse 버튼 노출, `handleRunMethodology` 핸들러 + `loadingCategory` 상태
- ✅ `ideas.$id.tsx`: `IdeaGadgetTabs` → `MethodologyCards` 교체, 12종 방법론 키 지원, `useOutletContext`로 `onRunMethodology`/`loadingCategory` 전달
- ✅ `MethodologyCards.tsx` (신규): 12종 방법론 카드 그리드 — 분석 결과 있으면 내용 표시, 없으면 "분석 실행" 버튼, 로딩 상태 애니메이션
- ✅ `methodology.ts` (신규): 12종 방법론 정의 (`ALL_METHODOLOGIES`) + 방법론별 프롬프트 템플릿 (`METHODOLOGY_PROMPTS`)
- ✅ `system-prompt.ts`: 6→12 방법론 지원, 방법론 지정 분석 지원
- ✅ `tool-registry.ts`: `update_idea_analysis` category enum 12종으로 확장
- ✅ `idea-tools.ts`: `VALID_CATEGORIES` 12종으로 확장
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 661개 통과 / build 성공 / CI/CD 배포 완료 (1m 39s)

### 이전 변경 (세션 168)
**아이디어 페이지 — NotebookLM 스타일 멀티소스 선택 + lint 수정 + 배포**:
- ✅ `ideas.tsx`: `selectedSourceId` → `selectedSourceIds[]` 배열 기반 멀티셀렉트, `handleToggleSource`/`handleToggleAll` 핸들러, 소스 추가 시 자동 전체 선택, 선택된 소스만 분석 프롬프트에 포함, 패널 리사이즈/접기 기능 통합
- ✅ `SourceInputPanel.tsx`: 각 소스에 체크박스(원형 체크/언체크 아이콘), 헤더에 "모든 소스 선택" 전체 토글 + "N개 선택" 카운터, 체크 해제 시 제목 흐리게 표시
- ✅ `ideas._index.tsx`: Outlet context 타입 업데이트 (`detailSourceId` + `selectedSourceIds`), 분석 버튼에 "N개 소스 분석 시작" 표시, 0개 선택 시 비활성화
- ✅ `IdeaChatWrapper.tsx`: 헤더에 "N/M개 소스" 뱃지 표시
- ✅ `use-panel-layout.ts`: lint 에러 수정 — `requestAnimationFrame`으로 비동기 setState
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 661개 통과 / build 성공 / CI/CD 배포 완료 (1m 44s)

### 이전 변경 (세션 167)
**아이디어 분석 429 Rate Limit 경량 모드 + 패널 레이아웃**:
- ✅ Ideas 전용 경량 모드 추가: `mode="ideas"` 파라미터로 도구 1개 + 35줄 프롬프트만 전송 (기존 73개 도구 + 244줄 → ~85% 토큰 절약)
- ✅ `buildIdeaSystemPrompt()` 신규 추가 — `update_idea_analysis` 전용 경량 시스템 프롬프트
- ✅ `IDEA_TOOLS` export 추가 — `update_idea_analysis` 도구만 필터링
- ✅ `claude-client.ts` retry 개선: `retry-after` 헤더 파싱 + 429 base delay 1초→10초
- ✅ Ideas 모드 tool round 간 2초 대기 (rate limit 완화)
- ✅ Ideas 페이지 리사이즈 가능 패널 레이아웃 추가 (`PanelResizeHandle`, `use-panel-layout`)
- ✅ typecheck 0 에러 / build 성공

### 이전 변경 (세션 166)
**실험실 — 방법론 탭 통합**:
- ✅ `lab.tsx`: TABS 배열에 "방법론" 탭 추가 (3탭→4탭: 개요/분석/검토 큐/방법론)
- ✅ `lab.methods.tsx` (신규): Method Pack 라이브러리를 실험실 탭으로 통합 — DB 로더, Tier 필터 (ALL/Tier-0/Tier-1/Tier-2), Lab 스타일 (모노스페이스/teal accent), 기존 MethodPackCard/MethodPackDetailDialog 컴포넌트 재사용
- ✅ typecheck 0 에러 / lint 0 에러 / 테스트 661개 통과 / build 성공 / CI/CD 배포 완료

### 이전 변경 (세션 165)
**아이디어 페이지 — 소스 상세/삭제 + 분석 시작 플로우 구현**:
- ✅ `api.ideas.$id.sources.ts`: DELETE 핸들러 추가 — idea_sources 조인 레코드 삭제 (radarItem 자체는 유지)
- ✅ `SourceInputPanel.tsx`: `<Link>` → `<button>` 전환, 클릭 시 선택/해제 토글, hover 시 X 삭제 버튼 표시
- ✅ `ideas.tsx`: selectedSourceId 상태 관리, handleDeleteSource/handleSelectSource/handleStartAnalysis 콜백, Outlet context로 자식 전달, autoMessage → ChatPanel 자동 분석 트리거
- ✅ `ideas._index.tsx`: useOutletContext로 소스 상세 카드 표시 (제목/요약/메모/URL), "분석 시작" 버튼 onClick 연결
- ✅ `idea-tools.ts` (신규): updateIdeaAnalysis 함수 — ideas.analysisData JSON 부분 업데이트 (6개 카테고리)
- ✅ `executor.ts` + `tool-registry.ts` + `system-prompt.ts`: update_idea_analysis 에이전트 도구 등록 (autonomy level 2)
- ✅ `ChatPanel.tsx` + `IdeaChatWrapper.tsx`: autoMessage prop 추가 — 자동 분석 메시지 전송 지원
- ✅ `PipelineKanban.tsx` + `StatisticsPanel.tsx`: 대시보드 리팩토링 (기존 3컴포넌트 → 2컴포넌트 통합)
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공

### 이전 변경 (세션 164)
**아이디어 페이지 — GNB 공통 메뉴 + 소스 메타데이터 수정 + 샘플 데이터 추가**:
- ✅ `IdeaPageHeader.tsx`: GNB 4탭 (대시보드/아이디어/사업제안/실험실) 추가 — 현재 경로 하이라이트, 모바일은 제목만 표시
- ✅ `display-title.ts`: `getUrlLabel()` 헬퍼 추가 — 의미 없는 제목(댓글 N개, 짧은 메타데이터) 대신 URL 호스트네임 폴백
- ✅ `SourceInputPanel.tsx` + `SummaryCard.tsx`: `displayTitle()` 호출 시 URL 전달하여 메타데이터 대신 URL 표시
- ✅ `api.ideas.seed.ts`: 비즈니스 관련 10개 샘플 소스 시드 API (AI 에이전트/웨어러블 로봇/XR 전시/감사 AI/RegTech)
- ✅ 프로덕션 시드 실행 완료: 10개 소스 생성 (titleKo + summaryKo 포함)
- ✅ typecheck 0 에러 / lint 0 에러 / CI/CD 배포 완료 (1m 44s)

### 이전 변경 (세션 163)
**실험실 그래프 인터랙티브 — 노드 드래그/줌/팬 기능 추가 + 프로덕션 배포**:
- ✅ `GraphViewer.tsx`: 노드 드래그/줌/팬 + 시각 피드백
- ✅ CI/CD 배포 완료 (1m 39s)

### 이전 변경 (세션 162)
**아이디어 소스 패널 — 디자인 목업 대비 누락 기능 보완**:
- ✅ `SourceInputPanel.tsx`: "수집된 소스에서 선택하기" 하단 섹션 추가
- ✅ `SourceInputPanel.tsx`: 빈 상태 개선
- ✅ typecheck 0 에러 / lint 0 에러

### 이전 변경 (세션 161)
**사업 제안 페이지 — 파이프라인 칸반 + 카테고리 카드 리디자인 + 샘플 데이터 46건**:
- ✅ `PipelineView.tsx`: 숫자 카운트 → 5컬럼 칸반 (각 컬럼에 아이콘+라벨+건수+아이템 제목 나열, 최대 10개+"외 N건")
- ✅ `proposals._index.tsx`: loader 확장 — stages에 `items: { id, title }[]` 추가
- ✅ `constants.ts`: COMPLETED "완료" → "완료(제품화/GTM)", CLOSED "종료" → "종료(Hold/Drop)"
- ✅ `CategoryCardRow.tsx`: w-64 → w-72, 카테고리 헤더에 화살표 네비게이션
- ✅ `ProposalCard.tsx`: 제목 2줄, 설명 3줄, 상태 배지 제거, 시간 배지(rounded-full) 스타일
- ✅ 프로덕션 D1: 46건 샘플 데이터 삽입 (PROPOSAL 8, FORMALIZATION 2, COMPLETED 1, CLOSED 35)
- ✅ typecheck 0 에러 / lint 0 에러

### 이전 변경 (세션 160)
**대시보드 읽음/안읽음 구분 + SummaryCard 디자인 정확 구현**:
- ✅ `SourceSidebar.tsx`: `viewedItemIds: Set<string>` prop 추가 — 안읽음(font-medium text-primary) / 읽음(font-normal text-tertiary) 시각 구분
- ✅ `SummaryCard.tsx`: SectionBadge 컴포넌트 + 마크다운 요약 파싱 (단락/소제목/불릿) + 반응 버튼(좋아요/싫어요 + optimistic UI) + "소스 수집 관리"/"아이디어 생성" 액션 버튼
- ✅ `dashboard._index.tsx`: loader에 viewedItemIds 쿼리 추가, handleSelect에서 자동 viewed 마킹 (useFetcher PATCH)
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공

### 이전 변경 (세션 159)
**아이디어 페이지 리디자인 — 워크스페이스 모델 + 전용 헤더 + 6탭 가젯 + 프로덕션 배포**:
- ✅ DB 스키마: `ideas` 테이블 (워크스페이스) + `idea_sources` 조인 테이블 + 마이그레이션 0027
- ✅ 전용 헤더 (`IdeaPageHeader.tsx`): 햄버거 드로어 + 아이디어 제목 + "사업 제안하기" 버튼 + 테마 토글 — TopNav/AppShell 미사용
- ✅ 아이디어 목록 드로어 (`IdeaListDrawer.tsx`): 최근 아이디어 리스트 + "새 아이디어" 생성 + 슬라이드 애니메이션
- ✅ API 라우트 2개: `api.ideas.ts` (CRUD) + `api.ideas.$id.sources.ts` (소스 연결)
- ✅ 탭 구조 변경 (8→6개): 산업별 사업 예시/규제/시장 조사/고객 조사/사업성 검증/차별화 + 출처 배지 + 피드백 버튼
- ✅ 신규 8파일 + 수정 7파일 = 15파일 변경 (+1,213 / -212 lines)
- ✅ CI/CD 배포 완료 + 프로덕션 DB 마이그레이션 적용 완료

### 이전 변경 (세션 158)
**실험실 페이지 리디자인 — 5탭→3탭 통합, Lab 미학 적용**:
- ✅ lab.tsx 전폭 + lab._index.tsx 통합 + lab.analysis.tsx 5모드 + dx-custom-tokens.css Lab 토큰

### 이전 변경 (세션 156)
**아이디어 페이지 소스 입력 기능 개선 및 프로덕션 테스트 완료**:
- ✅ `api.ideas.sources.ts` (신규): 수동 소스 추가 전용 API — 소스 타입 자동 감지, SHA-256 중복 감지
- ✅ `SourceInputPanel.tsx`: 멀티라인 입력 + Drag & Drop + 인라인 피드백
- ✅ 프로덕션 테스트 완료: 4개 시나리오 모두 통과
- ✅ `ideas.tsx` loader: 메타데이터 전용 항목 필터링 추가 (대시보드와 동일 패턴)
- ✅ `SourceInputPanel.tsx`: `displayTitle` 적용 (사이드바 제목 표시)
- ✅ `ideas.$id.tsx`: 제목에 `displayTitle` 적용 + `IdeaGadgetTabs`에 sections prop 전달 (keyPoints/summaryKo/summary → "시장 예시" 탭)
- ✅ `StatusOverview.tsx`: 로컬 중복 함수 제거 → 공통 유틸리티 import
- ✅ typecheck 0 에러 / lint 0 에러 / build 성공

### 이전 변경 (세션 153)
**팀 스킬 WSL 호환성 수정**:
- ✅ `/team` 스킬 tmux pane 분리 안 되는 근본 원인 분석 및 수정
- 원인 1: Claude Code Bash가 Windows Git Bash에서 실행되어 `tmux: command not found`
- 원인 2: Git Bash `/tmp/`과 WSL `/tmp/`이 다른 위치 — 경로 불일치
- 원인 3: `wsl bash /mnt/d/...` 호출 시 Git Bash 경로 맹글링
- ✅ WSL 환경 규칙 추가: `wsl -e` 접두사, `.team-tmp/` 공유 디렉토리, `wsl -e bash -c` 형식
- ✅ Step 2~4를 단일 launcher 스크립트로 통합 (원자성 확보)
- ✅ CRITICAL 경고 추가: 백그라운드 프로세스 fallback 명시적 금지
- ✅ 2-Worker 읽기 전용 테스트로 pane 분리 정상 동작 확인

### 이전 변경 (세션 152)
**온톨로지 인텔리전스 Phase 3 — 시뮬레이션 엔진**:
- ✅ BFS 영향 전파 엔진 (`app/lib/ontology/simulator.ts`): edge strength + decay factor 기반 그래프 전파
- ✅ LLM 시나리오 생성 (Claude Haiku): 전파 결과 → 비즈니스 시나리오 분석
- ✅ 스냅샷 타임라인 비교: contextSnapshots 기반 단계별 diff
- ✅ API 엔드포인트 (`api.ontology.simulate`): propagate/scenario/timeline 3타입
- ✅ Agent 도구 (`simulate_scenario`): autonomy level 2, 동적 import (순환 의존성 방지)
- ✅ 시뮬레이션 UI (`ontology.simulation.tsx` + `SimulationView.tsx`): 영향도 바 차트 + 시나리오 카드
- ✅ 온톨로지 탭 5개로 확장 (요약/그래프/분석/검토/시뮬레이션)
- ✅ 시스템 프롬프트에 시뮬레이션 가이드 추가
- ✅ 시뮬레이터 테스트 16개 (propagateInfluence 11 + compareSnapshots 5) — 49개 온톨로지 테스트 전체 통과
- ✅ tmux /team 3 Worker 병렬 (Core Engine / API+Agent / UI+Tab)

### 이전 변경 (세션 151)
**대시보드 디자인 개선 — Utilitarian Clarity**:
- ✅ KPI 요약 카드 4개 추가 (수집 아이템/발굴 아이디어/사업 제안/수집 소스) — 각 악센트 색상 아이콘
- ✅ StatusOverview: `dx-panel` 카드 래퍼 + 선택 시 좌측 파란 보더 인디케이터 + 키워드 pill/badge + 건수 표시
- ✅ PeerBriefingSection: `dx-panel` 카드 래퍼 + dot 인디케이터 + hover 배경 + border-b 행 구분선
- ✅ StatisticsSection: `dx-panel` 카드 래퍼 + 바 차트 블루(`--axis-chart-bar`) + 산업 컬러 도트 + 도넛 블루 그라데이션
- ✅ typecheck 0 에러 / lint 0 에러 (변경 파일) / build 성공

### 이전 변경 아카이브 (세션 125~150)
<details>
<summary>세션 125~150 변경 내역 (클릭하여 펼치기)</summary>

- **세션 150**: 루트 리다이렉트 (`/` → `/dashboard`) + Pretendard Variable 폰트 + CSS Cascade Layer 수정
- **세션 149**: 온톨로지 테스트 48개 통과 + 대시보드 통계 + 프로덕션 배포
- **세션 147~148**: CI 통합 테스트 수정 + 재배포
- **세션 145~146**: CLAUDE.md 리팩토링 (60% 감소) + SDD-primary 워크플로우 + CI 테스트 수정
- **세션 143~144**: 온톨로지 인텔리전스 Phase 1+2 (자동 추출/매칭/분석) + 대시보드 UI 정합
- **세션 141~142**: 아이디어 3-Panel 재설계 + PDCA Iterate proposals 갭 해결
- **세션 138~140**: 대시보드 와이어프레임 재설계 + 시장탐색 + UI 정합 (3-Worker 병렬)
- **세션 134~137**: F20/F21/F22 병렬 구현 + PDCA Analyze + Report (평균 94.5%)
- **세션 128~132**: Figma 기반 레이아웃 재구성 + 사업제안 6테이블 + CI/CD + PDCA 문서
- **세션 125~127**: AX BD팀 PoC PDCA 완료 (92% Plan, 597 tests) + 프로덕션 배포

</details>
- ✅ **테스트 플랜 작성**: `docs/01-plan/features/ax-bd-poc-tests.plan.md` (38건, 8 파일)

### 이전 변경 (세션 124)
**AX BD팀 요구사항 분석 + Feature 설계 + PoC 5 Phase 구현**:
- ✅ `docs/AX BD팀 요구사항_v0.2.md` 검토 (7 EPIC, 16 티켓)
- ✅ 기존 시스템 89개 라우트/43+16 테이블 vs 요구사항 Gap 분석
- ✅ PDCA Plan/Design 문서 작성 (ax-bd-poc.plan.md, ax-bd-poc.design.md)
- ✅ Phase 1~5 구현: DB 스키마 (5 컬럼 + 1 테이블) + Radar API 3개 + 채팅 확장 + Agent 도구 3개 + UI 컴포넌트 3개
- ✅ Gap 분석 수행 (74%) + Act-1 (5건 코드 갭 해결 → ~97%)

### 이전 변경 (세션 123)
**/team 스킬 생성 + lint 에러 없음 확인**:
- ✅ `/team` 스킬 생성 (`.claude/skills/team/SKILL.md`) — Agent Teams 병렬 작업 자동화
  - tmux split pane 모드, 2~5명 팀원 자동 구성, Opus 기본
  - 작업 분석 → 팀 생성 → 태스크 분할 → 병렬 스폰 → 검증 → 정리 전체 자동화
- ✅ ESLint 0 errors, TypeScript 0 errors 확인 (의존성 재설치 후)

### 이전 변경 (세션 122)
**dx-strategic-evolution 전체 아카이브 + 미커밋 코드 정리**:
- ✅ 코드 포맷 정리: 56개 app 파일 일괄 포맷팅 + Multi-Tenant tenantId 스코핑 보완
- ✅ PDCA 아카이브: dx-strategic-evolution P1+P2+P3 전체 (12 문서 → docs/archive/2026-02/)
  - P1 (F1,F3,F5): 96.3% — Industry Adapter + AI 로그 자산화 + 규제 감사 Agent
  - P2 (F2,F4): 93.4% — Shadow Mode + Value-up 시나리오
  - P3 (F6): 94% (3 iterations) — Multi-Tenant Architecture
- ✅ .pdca-status.json: 3 features → archived summaries, primaryFeature cleared
- ✅ Archive Index 업데이트 (docs/archive/2026-02/_INDEX.md)

### 이전 변경 (세션 121)
**Multi-Tenant P3 Architecture — 88파일 변경, PDCA 3회 iteration (66% → 84% → 94%)**:
- ✅ Phase 3-A~D: Schema + Auth + Routes + Agent + UI + Cron 전체 tenant 스코핑
- ✅ PDCA 완료: plan → design → do → check (94%) → report

### 이전 변경 (세션 120)
**Compliance, Industry, Patterns 기능 추가 — 21파일 변경**:
- ✅ Compliance/Industry/Patterns 기능 + Agent 도구 51개 + 마이그레이션 2개

### 이전 변경 (세션 119)
**Figma 2차 전체 레이아웃 개편 — 41파일 변경 (신규 4 + 수정 32 + 삭제 5)**:
- ✅ Phase 1: 기반 컴포넌트 4개 생성 (SidebarContext, TopNav, SidebarPanel, AppShell)
- ✅ Phase 2: root.tsx에 conversations 쿼리 추가 (전역 사이드바 데이터)
- ✅ Phase 3: 29개 라우트 마이그레이션 (PageLayout/MainNav → AppShell)
- ✅ Phase 4: 5개 deprecated 파일 삭제 (PageLayout, NavDropdown, ConversationList, MainNav, UserMenu)
- ✅ GNB: 3개 드롭다운 메뉴 → 4개 직접 탭 링크 (대시보드/시장 탐색/사업 발굴/수집 관리)
- ✅ 사이드바: 채팅 히스토리 + 검색 + 보관함(MVP placeholder) + 프로필 상시 표시
- ✅ CSS 토큰: sidebar-width 280→240px, collapsed-width 추가
- ✅ typecheck + lint + build 모두 통과

### 이전 변경 (세션 118)
**P2 잔여 작업 5건 구현 — 9개 수정 + 3개 신규 + 1 마이그레이션 (PDCA 97%)**:
- ✅ F6: `addSummaryHeader()` — 500자+ 응답에 첫 문장 요약 블록인용 자동 삽입
- ✅ F7: `ExperimentGantt` SVG 컴포넌트 — 실험 타임라인 간트차트 (SSR-safe `now` prop)
- ✅ F8: `compareDiscoveries()` Agent 도구 — 2~5개 Discovery 마크다운 비교 테이블
- ✅ F9: Discovery 태그 시스템 — `tags` 컬럼 + `tag_discovery`/`remove_discovery_tag` 도구 + 마이그레이션
- ✅ F10: `RelatedDiscoveries` 컴포넌트 — Vectorize 코사인 유사도 ≥0.7 기반 추천
- ✅ Agent 도구 45 → 48개 (+compare_discoveries, +tag_discovery, +remove_discovery_tag)
- ✅ PDCA 사이클 완료: Plan → Design → Do → Check (97%) → Report

<details>
<summary>이전 변경 이력 (세션 69~117) — 클릭하여 펼치기</summary>

- 세션 105~108: UX 한국어화 v4.1 완료 (WU-F/G/H/I) + v4.2 Dashboard/Venture 잔여 한국어화
- 세션 100~104: Gate Timeout + Weekly Review + Embeddings 3-Phase 구현 + UX 한국어화 WU-A~E + E2E 파이프라인 테스트 + Task 의존성 검증 + Sprint Repository 테스트 36개 + Markdown Export
- 세션 95~99: Decision Center UX (MyVoteCard/VoteDistributionChart) + Gate 2→Packaging E2E + 온보딩 가이드 (EmptyState/OnboardingGuide) + Sprint State Machine 테스트 40개 + Lean Canvas UI
- 세션 90~94: Task Executor 8개 구현 + venture-worker 배포 + 전체 핸들러 테스트 + Deep Dive/Packaging Action + scoring-policy 100%/task-queue 98%+ 커버리지
- 세션 85~89: venture-worker 구현/배포 + Task Queue Retry/Backoff/Idempotency + Analytics 자동 계산 + Venture Navigation
- 세션 80~84: v4 Venture Sprint MVP 구현 (16개 테이블 + 13 페이지 + 4 API) + 프로덕션 배포 + PRD v0.3 DevSpec 반영
- 세션 75~79: Agent 도구 전체 테스트 커버 (338개) + searchSimilar 버그 수정 + Experiment 반자동 추천 + Method Run 재개 + SPEC.md 세션 2~68 축약
- 세션 69~74: Agent 채팅 품질 튜닝 + UI 토큰 정리/접근성 + 테스트 Phase 1~4 (discovery/method/ontology/indicator/connector/governance/alert) + 문서 현행화

</details>

<details>
<summary>이전 변경 이력 (세션 2~68) — 클릭하여 펼치기</summary>

- 세션 60~68: Google OAuth + 역할 분리, v3 R3b 알림/웹훅, Gatekeeper 역할, KPI/링크/Gate 승인 UI, Audit Log, Cron 점검, 웹 폼 이벤트 로깅, 프로덕션 배포 5건
- 세션 50~59: v3 R0 11단계 파이프라인 + R1 Method Pack + R2 Ontology Graph + R3a Indicators/Connectors/Governance, 프로덕션 마이그레이션 3건
- 세션 40~49: v2 Agent 재설계 15건, 다크모드, @axis-ds 패키지 연동, 채팅 마크다운/UX 개선
- 세션 30~39: Design Token 마이그레이션, Radar 소스 확장, 기한 초과 자동 DEAD_END, Agent E2E 테스트
- 세션 20~29: v2 Agent 코어 + 도구 15개 + 채팅 UI/API, Resend 이메일 알림, Radar Worker 배포
- 세션 10~19: Reviewer 승인, 유사 Seed 검색, 고급 지표, Brief/JSON Export, 운영 문서, QA 체크리스트
- 세션 2~9: Discovery CRUD 15개 라우트, Weekly Review/Recall Queue/Metrics, ESLint 설정, 프로덕션 배포

</details>

