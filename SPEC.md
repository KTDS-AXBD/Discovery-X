# SPEC.md — Project Specification

## 1. Project Overview

### 미션
AX 신사업 발굴 과정에서 **관찰→내부 실험→근거→결정**을 강제로 닫게 하여, 조직이 "더 잘 틀리고 더 빨리 배우는" 루프를 만든다.

### 범위

**In-scope (PRD §7.1 P0 + v3 확장 + v4 Venture Discovery Sprint + v5 BD Workspace)**
- Discovery CRUD + 11단계 파이프라인 (DISCOVERY → IDEA_CARD → HYPOTHESIS → EXPERIMENT → EVIDENCE_REVIEW → GATE1 → SPRINT → GATE2 → HANDOFF + HOLD/DROP)
- Owner/Reviewer 지정 및 승계
- Experiment 최대 2개 관리 (Extension 승인 시 3개)
- Evidence 타입/강도/신뢰도(reliability_label) + 출처(source_url) + 발행일(published_date) 기록
- HOLD: Trigger Type + Revisit Date 강제
- DROP: Failure Pattern 태깅 강제
- Weekly Review 뷰 (활성 Discovery 경과일 순)
- Recall Queue 뷰 (Revisit 도래 HOLD 목록)
- 최소 지표 집계/Export
- Method Pack 12종 라이브러리 + 추천 + 실행 + Gate 패키지 자동 초안 (R1)
- `/venture/*` sub-app 라우팅 (v4)
- 5일 부트캠프 템플릿 기반 스프린트 운영 (v4)
- AI Agent 오토파일럿 + HITL Gate 의사결정 (v4)
- Decision Center (블라인드 투표/집계/재투표) (v4)
- Analytics (Depth Score, Effort, Next-ROI 추천) (v4)
- venture-worker (D1 폴링 큐 기반) (v4)
- Epic 구조 티켓 분해 (A~F: 라우팅/스키마/서비스/API/워커/Analytics) (v4 DevSpec)
- BD 워크스페이스 (v4.2): 키워드 구독 → 소스 수집/요약 → Agent 채팅 → 아이디어 생성/편집 → 팀 공유
- `_index.tsx`, `/radar` 통합 3-Pane 레이아웃 (v4.2)
- 1개 신규 + 6개 기존 테이블 확장 (v4.2)

**Out-of-scope (PRD §2.2, §7.3)**
- 전사 공식 포털/플랫폼
- 완성형 UX (의도된 인지부하는 설계의 일부)
- 외부 고객/CRM 연동
- 고급 예측/추천 모델
- 제품 수준 KPI 대시보드
- 자동 의사결정 (LLM이 Next/Drop 판단)

### 성공 기준
- **P0**: "닫힌 Discovery"(Next/Not Now/Dead End)가 최소 1건 이상 발생
- 28일 내 Decision 종료율 ≥ 90%
- Experiment 완료율 ≥ 80%
- 재호출 이벤트 월 1회 이상 발생

### 대상 사용자
- 최대 5명 (전원 Owner 수행 가능)
- 역할: Owner(필수), Reviewer/Gatekeeper(권장), Curator/Ops(권장), Viewer(옵션)

---

## 2. Product Design

### 핵심 워크플로우

```
Flow A: 신호 포착 (5분)
  → 제목/요약/링크 입력 → status=DISCOVERY

Flow B: 아이디어 구조화 (IDEA_CARD)
  → Owner 지정(필수) → Experiment 1개 등록 → status=IDEA_CARD → due_date 자동(+28일)

Flow C: 검증 루프 (HYPOTHESIS → EXPERIMENT → EVIDENCE_REVIEW)
  → 가설 수립 → 실험 수행 → 근거 수집/검토
  → Evidence: 타입/강도/신뢰도(reliability_label) + 출처(source_url) + 발행일

Flow D: 의사결정 (Gate / HOLD / DROP)
  → GATE1/GATE2: A/B급 증거 2개 이상 권장 + Gate 패키지 자동 초안
  → HOLD: Trigger Type + Condition + Revisit Date 필수
  → DROP: Failure Pattern 1~3 + 증거 기반 이유 필수

Flow E: Recall (재호출)
  → Revisit Date 도래 → Review 큐 자동 등재
  → 유사 Seed 검색 시 Hold/Drop 이력 제안

Flow F: Weekly Decision Review (30분)
  → 활성 항목을 Age 순 정렬 → Owner 1줄 요약 + 상태 제안

Flow G: 방법론 실행 (R1)
  → Method Pack 추천 → 실행 시작 → structured output 저장
  → Gate 패키지 자동 초안 생성

Flow H: Venture Discovery Sprint (v4)
  → 스프린트 생성 (산업/범위 선택) → status=DRAFT
  → Day 1: Scope 확정 (HITL) → Signal/Problem 수집 → Long List v1
  → Day 2: 카드 정제 → Gate1 준비 (블라인드 점수)
  → Gate 1 (HITL): Quick Score 집계/승인 → Shortlist 6~8
  → Day 3: Deep Dive 자동 생성 (Assumption/Pre-mortem/Lean Canvas 초안)
  → Gate 2 (HITL): 재평가/토론/재투표 → Final 2~3 확정
  → Day 5: Packaging (피치/요약문서) + 리허설 (Q&A 레드팀)
  → status=COMPLETED → ARCHIVED

Flow I: BD 워크스페이스 (v4.2)
  → 키워드/태그 구독 등록 → 소스 자동 수집 (RSS/URL)
  → 소스 클릭 → 즉시 요약 (한줄 + 핵심 포인트 3~5개)
  → "대화 시작" → 소스 컨텍스트 Agent 채팅
  → 연관 소스 추천 (Vectorize, 최소 3개)
  → 아이디어 후보 자동 생성 (최대 3개)
  → 1개 선택 → 아이디어 템플릿 자동 채움 (가설/근거/타겟/가치 제안)
  → 수동 편집 → 팀 공유
```

### 페이지 맵 (75개 라우트)

**Core (32개)**
- `/` — 채팅 (메인)
- `/dashboard/*` — 파이프라인/메트릭/헬스/알림/감사 (5개)
- `/discoveries*` — 목록/생성/상세 (5개)
- `/discoveries/:id/*` — 상세/편집/승격/실험/근거/결정/Gate/Graph/Methods (9개)
- `/settings` — Agent 설정 (1개)
- `/review` — 주간 리뷰 (1개)
- `/recall` — 재호출 큐 (1개)
- `/methods` — Method Pack 라이브러리 (1개)
- `/docs` — 도움말 (1개)
- `/login`, `/auth/google*` — 인증 (2개)
- `/admin*` — 관리자 (4개)

**Radar (5개)**
- `/radar` — 소스 관리 (1개)

**Metrics/Export (8개)**
- `/metrics`, `/export*` (3개)

**Venture (13개)**
- `/venture/*` — 스프린트 관리 (13개)

**API (16개)**
- `/api/chat`, `/api/conversations*`, `/api/radar*`, `/api/cron*`, `/api/venture*`, `/api/export*`, `/api/similar*`, etc.

---

## 3. Architecture Patterns

### 인증 & 권한

| 단계 | 함수 | 조건 | 리다이렉트 |
|------|------|------|-----------|
| 1 | `getUserFromSession()` | Request/Cookie | null 가능 (공개 페이지) |
| 2 | `requireUser()` | 위 + 인증 필수 | /login |
| 3 | `requireGatekeeper()` | 위 + gatekeeper 역할 | JSON 403 |
| 4 | `requireAdmin()` | 위 + admin 역할 | JSON 403 |

### 라우팅 & 상태 관리

- **URL 기반**: Remix Loader/Action으로 서버에서 데이터 주도
- **폼 상태**: Form + Fetcher (Remix)
- **전역 상태**: SidebarContext (대화 히스토리만)

### 컴포넌트 계층

```
root.tsx
├─ TopNav (4탭: 현황판/시장탐색/아이디어/수집관리)
├─ AppShell (SidebarPanel + PageLayout)
│  ├─ SidebarPanel (대화 히스토리)
│  └─ PageLayout
│     └─ routes/{name}.tsx (각 페이지)
└─ Outlet (하위 라우트)
```

### 데이터 모델 (46개 테이블)

| 카테고리 | 테이블 수 | 예 |
|---------|---------|-----|
| Users & Auth | 2 | users, sessions |
| Discovery Core | 6 | discoveries, experiments, evidence, event_logs, ontology_nodes, ontology_edges |
| Methods | 3 | method_packs, method_steps, method_runs |
| Venture Sprint | 16 | vd_sprints, vd_opportunities, vd_decisions, vd_signals, etc. |
| Radar | 3 | radar_sources, radar_items, radar_item_user_status |
| Chat | 3 | conversations, messages, event_logs |
| Indicators | 4 | kpis, indicator_snapshots, links, webhooks |
| Compliance | 2 | compliance_checks, compliance_audit_logs |
| **합계** | **46** | |

### Agent 시스템 (48개 도구)

| 카테고리 | 도구 수 | 예 |
|---------|--------|-----|
| Discovery CRUD | 11 | create_discovery, transition_stage, promote_discovery, etc. |
| Query | 12 | search_discoveries, get_discovery, get_radar_items, etc. |
| Method | 6 | recommend_method, execute_method, etc. |
| Ontology | 5 | create_node, add_edge, find_related, etc. |
| Indicator | 4 | get_kpi, record_signal, etc. |
| Connector | 2 | link_discoveries, unlink_discoveries |
| Governance | 2 | request_gate_approval, record_decision |
| Alert | 3 | create_alert, send_webhook, etc. |
| BD PoC | 3 | generate_idea_candidates, select_idea_candidate, auto_fill_template |
| **합계** | **48** | |

---

## 4. Technical Constraints

### 빌드 산출물

```
build/
├─ client/  (정적 웹 에셋 — HTML 없음이 정상)
│  └─ assets/
├─ server/  (Remix SSR 번들)
└─ index.js
```

### 제약사항

| 제약 | 이유 | 대응 |
|------|------|------|
| D1 SQLite | Cloudflare 바인딩 | 트랜잭션/조인/복잡한 쿼리 최소화 |
| 타임아웃 30초 | Cloudflare Pages 함수 | Cron/Worker로 장기 작업 분리 |
| Vectorize 비용 | 1536차원 벡터 저장 | 배치 동기화 (15분 Cron) |
| SSR 번들 | resend/mailparser 미포함 | vite.config.ts ssr.external 설정 |

### 성능 타겟

- 채팅 첫 토큰: 1초 이내 (SSE 스트리밍)
- 검색: 500ms 이내 (FTS5 또는 Vectorize)
- 페이지 로드: 2초 이내 (HTML + CSS 번들)

---

## 5. Current Status

### 버전
- **프로토타입**: v4.2 Venture Discovery Sprint + BD Workspace PoC
- **배포**: 프로덕션 (https://dx.minu.best, Cloudflare Pages)
- **DB**: 20개 마이그레이션 로컬+프로덕션 적용 완료 (0000~0020)

### 주요 지표
- **라우트**: 75개
- **테이블**: 46개 (core 43 + venture 16, 일부 중복) + BD PoC 1개
- **Agent 도구**: 48개
- **테스트**: 597개 (unit 76 + integration 342 + venture 143 + BD PoC 36)
- **테스트 통과율**: 100%
- **Lint 에러**: 0개
- **Build**: ✅ 성공

### 최근 변경 (세션 127)
**AX BD팀 PoC — 프로덕션 배포 완료**:
- ✅ 전체 커밋: 50 files changed (feat: AX BD PoC Core Table Extension)
- ✅ 타입 체크: keyPoints JSON 배열 타입 수정 후 통과
- ✅ 빌드: client + SSR 성공
- ✅ DB 마이그레이션: `0020_bd_poc_refactoring.sql` 프로덕션 D1 적용 (16 commands)
- ✅ Vectorize 인덱스: `dx-radar-embeddings` 신규 생성 (1536차원 cosine)
- ✅ 프로덕션 배포: https://dx.minu.best 배포 완료

### 이전 변경 (세션 126)
**AX BD팀 PoC — PDCA 완료 (Plan → Design → Do → Check → Act → Report)**:
- ✅ 테스트 전체 PASS: 597개 (기존 561 + 신규 36)
- ✅ Gap 분석: 92% vs Plan, 35% vs Design (의도적 아키텍처 차이)
- ✅ 완료 보고서: `docs/04-report/ax-bd-poc.report.md`
- ✅ Design 문서 현행화: v0.2 (Feature Module) → v1.0 (Core Table Extension)
- ✅ FR 준수율: 91% (11/12, FR-12 out of scope)

### 이전 변경 (세션 125)
**AX BD팀 PoC — PDCA Act-1 코드 갭 해결 + 테스트 계획 수립**:
- ✅ executor.ts — sourceContext end-to-end 와이어링 (conversation → radarItem → buildSystemPrompt)
- ✅ _index.tsx — 3-Pane 레이아웃 통합 (SourcePanel + ChatPanel + SummaryPanel)
- ✅ discoveries.$id.tsx — IDEA_CARD 템플릿 뷰 섹션 추가
- ✅ discoveries_.$id.edit.tsx — targetSegment/valueProposition 폼 필드 추가
- ✅ wrangler.toml — VECTORIZE_RADAR 바인딩 추가
- ✅ api.cron.embeddings.ts — CronEnv VECTORIZE_RADAR 타입 추가
- ✅ ax-bd-poc.design.md — tags → radarTags 네이밍 수정
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

### 활성 결정사항
- **인증 방식**: Google OAuth (arctic) + Session 기반 (D1), admin/gatekeeper/user/pending 4역할
- **기술 스택**: Remix v2 + D1 + Drizzle + Tailwind CSS 4 + @axis-ds
- **브랜치 전략**: master 단일 브랜치 (Prototype 기간)
- **배포**: Cloudflare Pages (master push → `pnpm deploy`)
- **운영 실험**: 🚀 2026-01-31 시작 (30-60일, 최대 5명, Discovery 5-10건 목표)
- **DB 마이그레이션**: ✅ 20개 (0000~0020) 로컬+프로덕션 적용 완료
- **Cron 설정**: daily (09:00) + agent-review (10:00) + alerts (09:30) + embeddings (15분, cron-job.org)
- **Radar Worker**: 프로덕션 운영 중 (Cron 매일 9:00 KST, 10소스)
- **이메일**: Resend (`noreply@ideaonaction.ai`), cron-job.org 자동 발송

---

## 6. Implementation Log

### 완료 요약

| 카테고리 | 항목 수 | 주요 내용 |
|---------|--------|----------|
| 인프라/스택 | 8 | Remix v2 + D1 + ESLint 9 + SDD 워크플로우 + CF Pages 배포 |
| Discovery 코어 | 12 | CRUD 15라우트 + 11단계 상태 전환 + 실험/근거/결정 + Extension |
| UI/UX | 16 | 반응형 + 차트 + 다크모드 + @axis-ds 토큰 + 접근성 + 한국어화 + AppShell 레이아웃 |
| Agent 시스템 | 12 | v2→v3 재설계 + 48도구 + SSE 스트리밍 + 컨텍스트 최적화 + 채팅 UX + tenant 도구 3개 + BD PoC 도구 3개 |
| v3 파이프라인 | 8 | R0 11단계 + R1 Method Pack + R2 Ontology + R3 KPI/알림/웹훅 |
| v4 Venture Sprint | 10 | 도메인 모듈 + 워커 8핸들러 + Decision Center + Analytics + E2E |
| v4.2 BD Workspace PoC | 6 | PDCA Plan/Design/Do/Check/Act 완료 (96 테스트 + 97% 코드 일치율) |
| Embeddings | 3 | Vectorize 3개 (Discovery/Evidence/Radar) + Cron 15분 + 시맨틱 검색/중복 감지 |
| 테스트 | 5 | 597개 (unit 76 + integration 342 + venture 143 + BD PoC 36) |
| 운영/문서 | 8 | Google OAuth + 이메일 + Radar + 문서 5종 + QA |

<details>
<summary>완료 항목 전체 목록 (95건) — 클릭하여 펼치기</summary>

**인프라/스택**: 기술 스택 결정, DB 스키마 설계(46개 테이블), 마이그레이션 20개, 프로젝트 스캐폴딩, SDD 워크플로우, Validation 엔진(Zod), ESLint 9 flat config, CF Pages Git 연동

**Discovery 코어**: Discovery CRUD(15라우트), 상태 전환 로직(11단계), Owner/Reviewer 지정, Experiment 관리(최대 2개), Evidence 관리(타입/강도), Decision 폼(3가지), Weekly Review, Recall Queue, Metrics 대시보드, CSV/Brief/JSON Export, EXTENSION_REQUESTED, Overdue 경고

**UI/UX**: 모바일 반응형, 차트 컴포넌트(StatusDonut/WeeklyBar), 다크모드(122토큰), @axis-ds 패키지 연동, 차트 색상 토큰화, UI 일관성(border/ring/접근성), 폼 모바일 반응형, StatusBadge, 알림 배지, UI 토큰 정리+접근성(ARIA), Audit Log EVENT_TYPE_MAP(30종), UX 한국어화(WU-A~I), ContextPanel+Discovery Digest, 리치 도구 결과 시각화, 채팅 UX(제안 칩/마크다운)

**Agent 시스템**: v2 Agent 코어(executor/claude-client/system-prompt/context-builder), v2 도구 15개→v3 45개→v4.2 48개, v2 채팅 UI/API, v2 대시보드, v2 Agent 설정(자율도 0-3), v2 자율 리뷰 cron, SSE 스트리밍, 컨텍스트 윈도우 최적화(30+메시지 요약), Agent 재설계 15건, 채팅 품질 튜닝, Method Run 버그 수정, Experiment 반자동 추천, Multi-Tenant 도구 3개 추가, BD PoC 도구 3개 추가

**v3 파이프라인**: R0 11단계 파이프라인(21파일), R0 근거 스키마 강화, R1 Method Pack(스키마+도구6개+UI), R2 Ontology Graph(스키마+도구5개+GraphViewer), R3a KPI/링크/승인(스키마+도구8개+Health), R3b 알림 엔진(4유형)+웹훅(Slack/Teams), Gatekeeper 역할, Gate 승인 UI

**v4 Venture Sprint**: venture-worker 구현(8핸들러), Task Queue Retry/Backoff/Idempotency, Task Executor 시스템, Deep Dive/Packaging Action, Decision Center(투표/집계), Analytics(Depth/Effort/ROI), Sprint Repository 테스트(36개), E2E 파이프라인 테스트, Markdown Export, Gate Timeout 자동 처리

**v4.2 BD Workspace PoC**: PDCA Plan/Design/Do/Check/Act 완료 (신규 10파일 + 수정 14파일 + 마이그레이션 1개 + 테스트 36개), sourceContext end-to-end 와이어링, 3-Pane 레이아웃, Agent 도구 3개 추가

**Embeddings**: OpenAI text-embedding-3-small + Vectorize, Vectorize 인프라(인덱스 3개: Discovery/Evidence/Radar + 프로덕션 + 초기 동기화), Embeddings Cron(15분), 시맨틱 검색/중복 감지

**테스트**: Vitest + Playwright 인프라, Agent 도구 8파일 전체 커버(194건), scoring-policy 100%/task-queue 98%+, BD PoC 테스트 36건, 테스트 DB 마이그레이션 현행화, 총 597개 통과

**운영/문서**: Google OAuth + 역할 분리(4역할), 이메일 알림(Resend), Radar Worker(10소스), 운영 문서 5종(치트시트/런북/킥오프/QA/가이드), 운영 실험 시작(2026-01-31), Pending 사용자 승인, CLAUDE.md 현행화, Cron 설정(5개), PDCA 아카이브 (dx-strategic-evolution 3 features), /team 스킬 생성

</details>

### 미래 작업

| # | 항목 | Phase | 상태 | 파일 수 |
|---|------|-------|------|---------|
| F6 | 응답 요약 헤더 (500자+ 응답 상단 1-2줄 요약) | v4.8 | ✅ | 2 |
| F7 | Experiment 타임라인 간트차트 | v4.8 | ✅ | 2 |
| F8 | Discovery 비교 테이블 도구 | v4.8 | ✅ | 3 |
| F9 | Discovery 태그 시스템 (DB + Agent 자동 태깅) | v4.8 | ✅ | 6 |
| F10 | 관련 Discovery 추천 (상세 조회 시 자동) | v4.8 | ✅ | 2 |
| F11 | Figma 2차 전체 레이아웃 개편 (AppShell + TopNav + SidebarPanel) | v4.9 | ✅ | 41 |
| F12 | Compliance, Industry, Patterns 기능 확장 (UI + Agent 도구 + Routes) | v4.10 | ✅ | 21 |
| F13 | Multi-Tenant P3 Architecture (schema/auth/routes/cron/agent) | v4.11 | ✅ | 88 |
| F14 | /team 스킬 — Agent Teams 병렬 작업 자동화 | v4.12 | ✅ | 1 |
| F15 | AX BD팀 PoC 리팩토링 — 코드 구현 (5 Phase) | v4.2 | ✅ | 24 |
| F16 | AX BD팀 PoC 테스트 — 36건 (Unit 8 + Integration 28) | v4.2 | ✅ | 6 |
| **F17** | **AX BD팀 PoC PDCA 완료 — 보고서 + 배포 준비** | **v4.2** | **✅** | **1** |
| F18 | AX BD팀 Workspace - Phase 1: 스키마 + 레이아웃 | v5.0 | Pending | ~15 |
| F19 | AX BD팀 Workspace - Phase 2: 소스 수집 + 요약 | v5.0 | Pending | ~8 |
| F20 | AX BD팀 Workspace - Phase 3: 아이디어 생성 + 템플릿 | v5.0 | Pending | ~8 |
| F21 | AX BD팀 Workspace - Phase 4: 팀 공유 | v5.0 | Pending | ~5 |
| F22 | AX BD팀 Workspace - Phase 5: LLM 설정 + 오류 처리 | v5.0 | Pending | ~3 |

