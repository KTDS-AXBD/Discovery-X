# SPEC.md — Project Specification

## 1. Project Overview

### 미션
AX 신사업 발굴 과정에서 **관찰→내부 실험→근거→결정**을 강제로 닫게 하여, 조직이 "더 잘 틀리고 더 빨리 배우는" 루프를 만든다.

### 범위

**In-scope (PRD §7.1 P0 + v3 확장 + v4 Venture Discovery Sprint)**
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
```

### UI 요소

| 화면 | 역할 |
|------|------|
| Discovery List | 전체 Discovery 목록, 상태 필터, 검색 |
| Discovery Detail | Seed 정보 + Experiments + Evidence + Decision |
| Create/Edit Discovery | Seed 입력 폼, 상태 전환 폼 |
| Experiment Form | 가설/행동/기한/기대근거 입력 |
| Evidence Form | 타입/강도/내용/링크 입력 |
| Decision Form | 상태별 필수 필드 (NOT_NOW: trigger/revisit, DEAD_END: pattern/reason) |
| Weekly Review | OPEN 목록, 경과일/기한/Owner, 한 화면 정리용 |
| Recall Queue | Revisit Date 도래 NOT_NOW 목록 |
| Radar | 자동 수집 소스 관리 + 실행 이력 + 수집 아이템 |
| Docs | 프로젝트 기획서/운영문서 마크다운 뷰어 + GitHub Project 보드 |
| Venture Sprint List | 스프린트 목록/생성/상태 |
| Venture Sprint Detail | Inbox/Longlist/Gate/Deepdive/Packaging/Analytics 탭 |
| Venture Decision Center | Agent 추천안 + 블라인드 투표 + 재투표 |
| Venture Analytics | 퍼널/도메인 분포/Depth-Effort 스캐터/White-space |

### 페이지 구성 (Remix Routes)

```
/                     → 대시보드 (Discovery 요약 + 빠른 액션)
/discoveries          → Discovery 목록 (필터: 상태별)
/discoveries/new      → Seed 입력 (INBOX 생성)
/discoveries/:id      → Discovery 상세 (Experiments, Evidence, Decision)
/discoveries/:id/edit → Discovery 편집
/review               → Weekly Review 뷰
/recall               → Recall Queue 뷰
/radar                → Radar 설정 + 수집 이력
/docs                 → 프로젝트 문서 (기획서/운영문서 뷰어 + GitHub Project)
/evidence/duplicates  → 중복 근거 관리 (Ontology Graph)
/dashboard/health     → 시스템 건강도 지표
/dashboard/audit-log  → Audit Log (이벤트 로그 조회)
/auth/google          → Google OAuth 인증

# Venture Discovery Sprint (v4)
/venture              → Venture 메인 (Overview 리다이렉트)
/venture/overview     → 전체 요약 (퍼널 + 최근 스프린트)
/venture/sprints      → 스프린트 목록
/venture/sprints/new  → 스프린트 생성 (템플릿 선택)
/venture/sprints/:id  → 스프린트 상세 레이아웃 (탭)
  /inbox              → Signal/Evidence 수집함
  /longlist           → 클러스터/카드 뷰
  /gate               → Decision Center (HITL)
  /deepdive           → Assumption/Pre-mortem/Lean Canvas
  /packaging          → 피치/문서 정리 + Export
  /analytics          → 해당 스프린트 통계
/venture/analytics    → 전체 누적 통계
```

---

## 3. Architecture Patterns

### 기술 스택
- **Runtime**: Cloudflare Pages (Edge)
- **Framework**: Remix v2 (Vite plugin)
- **DB**: Cloudflare D1 (SQLite)
- **ORM**: Drizzle ORM
- **UI**: React 19 + Tailwind CSS 4 + @axis-ds/tokens + @axis-ds/theme + @axis-ds/ui-react
- **Language**: TypeScript (strict mode)
- **Package Manager**: pnpm
- **AI (Chat)**: Claude API (tool_use, SSE 스트리밍)
- **AI (Radar)**: OpenAI gpt-4o-mini (수집 스코어링)

### 라우팅
Remix file-based routing. `app/routes/` 디렉토리 기반 자동 라우팅.
- Loader: 서버 사이드 데이터 로딩 (`loader` export)
- Action: 폼 제출 처리 (`action` export)
- Cloudflare context를 통해 D1 바인딩 접근

### 상태 관리
- **서버 상태**: Remix loader/action (URL 기반, 서버 사이드)
- **클라이언트 상태**: React state (최소한으로 유지)
- **폼**: Remix `<Form>` + Zod validation

### 컴포넌트 패턴
- `app/routes/` — 라우트 컴포넌트 (loader + action + UI)
- `app/components/` — 재사용 UI 컴포넌트 (MainNav, StatusDonut, WeeklyBar 등)
- `app/db/` — DB 스키마 및 접근 레이어
- `~/` alias → `./app/`

### 데이터 흐름
```
Browser → Remix Route (loader/action)
  → getDb(context.cloudflare.env.DB)
    → Drizzle ORM
      → Cloudflare D1 (SQLite)

Cron (매일 9:00 KST) → radar-worker (별도 CF Worker)
  → RSS/Web/YouTube 수집 → 중복제거(SHA256+FTS5) → AI 점수 → Seed 생성
    → Cloudflare D1 (동일 DB, Service Binding)

사용자 메시지 → /api/chat (POST) → executor.ts → Claude API (tool_use)
  → 도구 실행 (discovery-tools/query-tools)
    → 결과 저장 (messages 테이블)
      → SSE 스트리밍 응답 → 채팅 UI
```

### 도메인 모듈 분리 (v4 Venture)

```
app/features/venture/
├── db/
│   └── schema.ts         # vd_* 18개 테이블 (Drizzle)
├── types.ts              # VdSprint, VdOpportunity 등 공유 타입
├── constants/
│   ├── sprint-status.ts  # 8단계 상태 (DRAFT→COMPLETED)
│   ├── decision-types.ts # 4가지 결정 타입
│   ├── evaluation-criteria.ts # 평가 기준 프리셋
│   └── task-types.ts     # 8가지 Task 타입 (VdTaskType enum)
├── schemas/
│   ├── sprint.schema.ts  # Zod I/O 스키마 (v0.3 §4.1)
│   ├── opportunity.schema.ts
│   ├── decision.schema.ts
│   └── task.schema.ts    # EnqueueTaskInput/Output
├── domain/
│   ├── sprint-state-machine.ts  # 상태 전환 로직
│   └── analytics-calculator.ts  # Depth/Effort/ROI 계산 (v0.3 §6)
├── worker/
│   └── task-types.ts     # VdTaskType enum (8개 타입)
├── repositories/
│   ├── sprint.repository.ts
│   ├── opportunity.repository.ts
│   ├── decision.repository.ts
│   ├── signal.repository.ts
│   ├── analytics.repository.ts
│   └── task-queue.repository.ts
└── ui/
    ├── OpportunityCard.tsx
    ├── DecisionCard.tsx
    ├── ScoreSheet.tsx
    ├── FunnelChart.tsx
    └── ...
```

**경계 원칙**:
- 경계 1: 라우팅 — `/venture/*` 프리픽스로 sub-app 분리
- 경계 2: 데이터 — `vd_*` 테이블 prefix로 논리 분리
- 경계 3: 워커 — venture-worker가 `vd_task_queue` 소비 (격리)

### 워커 아키텍처 (v4 venture-worker)

**Task 타입 (VdTaskType enum)**:
```typescript
enum VdTaskType {
  CLUSTER_ENTITIES              // 신호/문제/기회 클러스터링
  GENERATE_PROBLEMS_FROM_SIGNALS
  GENERATE_OPPORTUNITIES_FROM_PROBLEMS
  PREPARE_GATE1_DECISION        // Gate1 의사결정 초안
  PREPARE_GATE2_DECISION        // Gate2 의사결정 초안
  GENERATE_DEEPDIVE_PACK        // 가정/프리모텀/Lean Canvas
  GENERATE_PACKAGING            // 피치/요약문서/Q&A팩
  ANALYTICS_SNAPSHOT            // 분석 스냅샷 생성
}
```

**Retry/Backoff 정책**:
- 기본 max_attempts: 6
- Backoff: exponential (base=30s, factor=2, max=30m) + jitter (0.8~1.2)
- 에러 분류:
  - Retryable: LLM 5xx/429, timeout, 네트워크, D1 락
  - Repair-then-Retry: JSON 스키마 실패 (max 3회)
  - Non-retryable: 엔티티 누락, 권한 오류, 상태 머신 위반

**Idempotency**:
- dedupe_key로 중복 enqueue 방지
- 예: `snapshot:<sprintId>:latest`, `deepdive:<oppId>:v1`

### Analytics 계산 규칙 (v4)

**Depth Score (0~100)** — Opportunity 기준:
- Evidence Depth (0~40): min(40, evidenceCount × 10)
- Assumption Coverage (0~25): min(25, assumptionCount × 5)
- Risk Readiness (0~15): min(15, premortemCount × 3)
- Execution Clarity (0~20): +10(buyer) +5(budget_hint) +5(solution_one_liner)

**Effort Score** — 이벤트 가중치 합산:
- vd_work_events action 가중치 적용
- Agent effort 별도 집계

**추천 분류**:
- INVEST: Potential high + Confidence medium+ + Unknowns solvable + Effort low/medium
- EXPLORE: Potential mid + Effort low
- HOLD: Potential high + Unknowns structural (blocker=true)
- DROP: Potential low + Effort high

### DB 스키마 (구현 완료)

| 테이블 | 역할 | PRD 매핑 |
|--------|------|----------|
| `users` | 사용자 (Owner/Reviewer) | §4 |
| `discoveries` | 메인 레코드 (Seed~Decision) | §5.1 |
| `experiments` | 실험 (Discovery당 최대 2개) | §5.2 |
| `evidence` | 근거 기록 (타입/강도) | §5.3 |
| `event_logs` | 감사/지표 수집 | §5.4 |
| `radar_sources` | Radar 수집 소스 설정 | 자동 수집 |
| `radar_items` | Radar 수집 아이템 (중복검사/감사) | 자동 수집 |
| `radar_runs` | Radar 실행 로그 | 자동 수집 |
| `conversations` | AI Agent 대화 세션 | v2 Agent |
| `messages` | 대화 메시지 (user/assistant/tool_use/tool_result) | v2 Agent |
| `agent_config` | Agent 설정 (자율도/토큰 예산/시스템 프롬프트) | v2 Agent |
| `stages` | 11단계 파이프라인 정의 | v3 Stage |
| `signal_metadata` | Discovery 신호 메타데이터 | v3 Stage |
| `method_packs` | 방법론 팩 12종 라이브러리 | v3 R1 |
| `method_runs` | 방법론 실행 기록 | v3 R1 |
| `gate_packages` | Gate 의사결정 패키지 | v3 R1 |
| `assumptions` | 가정 관리 | v3 R1 |
| `ontology_types` | 온톨로지 타입 10종 정의 | v3 R2 |
| `context_nodes` | 맥락 그래프 노드 | v3 R2 |
| `context_edges` | 맥락 그래프 엣지 | v3 R2 |
| `context_snapshots` | 그래프 스냅샷 | v3 R2 |
| `evidence_duplicate_candidates` | 근거 중복 후보 | v3 R2 |
| `discovery_kpis` | Discovery별 KPI 등록 | v3 R3 |
| `kpi_measurements` | KPI 측정값 기록 | v3 R3 |
| `discovery_links` | Discovery 간 관계 | v3 R3 |
| `alert_rules` | 알림 규칙 정의 | v3 R3 |
| `alerts` | 발생된 알림 | v3 R3 |
| `webhook_configs` | 외부 웹훅 설정 | v3 R3 |
| `gate_approvals` | Gate 승인 요청/결정 | v3 R3 |
| **v4 Venture Discovery Sprint (18개 테이블)** | | |
| `vd_sprints` | 스프린트 메인 | v4 |
| `vd_sprint_members` | 스프린트 멤버 (OWNER/CONTRIBUTOR/REVIEWER) | v4 DevSpec |
| `vd_signals` | 신호 수집 | v4 |
| `vd_problems` | 문제 정의 | v4 |
| `vd_themes` | 토픽/클러스터 | v4 |
| `vd_theme_memberships` | 테마-엔티티 소속 (다대다) | v4 DevSpec |
| `vd_opportunities` | 기회 카드 | v4 |
| `vd_evidences` | 근거 | v4 |
| `vd_assumptions` | 가정 | v4 |
| `vd_premortems` | Pre-mortem | v4 |
| `vd_artifacts` | Lean Canvas/Pitch 등 | v4 |
| `vd_rubric_templates` | 평가 기준 템플릿 | v4 DevSpec |
| `vd_decisions` | Gate 의사결정 | v4 |
| `vd_votes` | 투표 | v4 |
| `vd_scores` | 점수 | v4 |
| `vd_work_events` | 이벤트 로그 | v4 |
| `vd_analytics_snapshots` | 분석 스냅샷 | v4 |
| `vd_task_queue` | 작업 큐 | v4 |

### 상태 전환 규칙 (11단계 파이프라인)
```
DISCOVERY → IDEA_CARD → HYPOTHESIS → EXPERIMENT → EVIDENCE_REVIEW → GATE1 → SPRINT → GATE2 → HANDOFF
                                                                                ↗ HOLD (재검토 가능)
                                                                                ↗ DROP (종료)
```

허용된 전환 맵:
- DISCOVERY → IDEA_CARD, HOLD, DROP
- IDEA_CARD → HYPOTHESIS, HOLD, DROP
- HYPOTHESIS → EXPERIMENT, HOLD, DROP
- EXPERIMENT → EVIDENCE_REVIEW, HYPOTHESIS, HOLD, DROP
- EVIDENCE_REVIEW → GATE1, HYPOTHESIS, HOLD, DROP
- GATE1 → SPRINT, HOLD, DROP
- SPRINT → GATE2, HOLD, DROP
- GATE2 → HANDOFF, SPRINT, HOLD, DROP
- HOLD → DISCOVERY, IDEA_CARD, HYPOTHESIS, EXPERIMENT, DROP

Validation:
- Owner 없으면 IDEA_CARD 이상 전환 불가
- IDEA_CARD 전환 시 due_date = created_at + 28일
- Extension 승인 시 due_date += 14일, 실험 최대 3개 허용
- HOLD: trigger_type + revisit_date 필수
- DROP: failure_pattern 필수
- Evidence: reliability_label + source_url/linkOrAttachment 필수, Gate 통과 시 published_date 권장

### Venture Sprint 상태 전환 (8단계)
```
DRAFT → RUNNING → GATE1_PENDING → DEEPDIVE → GATE2_PENDING → PACKAGING → COMPLETED → ARCHIVED
```

허용된 전환 맵:
- DRAFT → RUNNING (스프린트 시작)
- RUNNING → GATE1_PENDING (Day 2 완료)
- GATE1_PENDING → DEEPDIVE (Gate1 승인)
- DEEPDIVE → GATE2_PENDING (Day 4 완료)
- GATE2_PENDING → PACKAGING (Gate2 승인)
- PACKAGING → COMPLETED (패키징 완료)
- COMPLETED → ARCHIVED (아카이브)
- 모든 단계 → ARCHIVED (강제 종료)

Validation:
- RUNNING 전환 시 최소 1개 scope 선택 필수
- GATE1_PENDING 전환 시 최소 N개 opportunity 필요
- GATE1 승인 시 shortlist 6~8개 선정
- GATE2 승인 시 final 2~3개 선정

---

## 4. Technical Constraints

### 빌드 산출물
- `build/client/` — Cloudflare Pages 정적 + Worker 번들
- `pnpm run build` → Remix Vite 빌드
- `pnpm run deploy` → 빌드 + `wrangler pages deploy`

### 제약사항
- **D1 SQLite**: ACID 트랜잭션은 단일 쿼리 레벨, Drizzle batch로 대응
- **Edge Runtime**: Node.js API 제한 (Cloudflare Workers 호환만 가능)
- **D1 크기 제한**: 10GB (Prototype 범위에서 무관)
- **Remix v2 → v3 migration**: `future` 플래그 3개 활성화 (fetcherPersist, relativeSplatPath, throwAbortReason)
- **인증**: Prototype 범위에서 간단한 인증 (Cloudflare Access 또는 하드코딩 사용자)

### 개발 명령어

| 명령어 | 용도 |
|--------|------|
| `pnpm dev` | 로컬 개발 서버 |
| `pnpm build` | 프로덕션 빌드 |
| `pnpm start` | 로컬 Wrangler Pages dev |
| `pnpm deploy` | Cloudflare Pages 배포 |
| `pnpm db:generate` | Drizzle 마이그레이션 생성 |
| `pnpm db:migrate` | 로컬 D1 마이그레이션 적용 |
| `pnpm db:migrate:prod` | 프로덕션 D1 마이그레이션 적용 |
| `pnpm lint` | ESLint (app/ 대상) |
| `pnpm typecheck` | TypeScript 타입 체크 |

---

## 5. Current Status

> **이 섹션은 매 세션마다 업데이트한다.**

### 현재 단계
**🚀 v4 Venture Discovery Sprint MVP 구현 완료 (2026-02-03)**

v3 R0~R3b 완료 후, v4 Venture Discovery Sprint MVP 구현 완료.
- ✅ vd_* 16개 테이블 스키마 완성 (DB 레벨)
- ✅ 도메인 모듈 전체 구현 완료 (types/constants/schemas/domain/repositories/ui)
- ✅ `/venture/*` 라우트 17개 구현 완료 (페이지 13개 + API 4개)
- ✅ UI 컴포넌트 8개 구현 완료
- 📋 venture-worker (D1 폴링 큐 기반) 구현 대기

### PRD P0 구현 상태

| # | 요구사항 | 상태 | 비고 |
|---|---------|------|------|
| 1 | Discovery CRUD + 상태 전환 | ✅ | 20개 라우트 (edit, extension, complete-experiment 포함) |
| 2 | Owner 지정 | ✅ | 승격 시 필수 |
| 3 | Reviewer 지정 UI | ✅ | 승격 시 선택, 상세에서 변경 가능 |
| 4 | Owner 변경/승계 | ✅ | INBOX/OPEN에서 변경 가능 |
| 5 | Discovery 편집 | ✅ | INBOX/OPEN에서 제목/요약/링크/출처 수정 |
| 6 | Experiment 최대 2개 | ✅ | 3번째 시도 시 에러 (EXTENSION_REQUESTED 시 최대 3개) |
| 7 | Evidence 타입/강도 | ✅ | |
| 8 | NOT_NOW 필수 필드 | ✅ | triggerType + condition + revisitDate |
| 9 | DEAD_END 필수 필드 | ✅ | failurePattern + evidenceReason |
| 10 | Weekly Review 뷰 | ✅ | `/review` |
| 11 | Recall Queue 뷰 | ✅ | `/recall` |
| 12 | 지표 집계/Export | ✅ | `/metrics` + CSV Export |
| 13 | INBOX 7일 TTL 경고 | ✅ | UI 레벨 시각적 경고 (빨간 배지) |
| 14 | EXTENSION_REQUESTED 워크플로우 | ✅ | 연장 요청 UI + due_date +14일 + 3번째 실험 허용 |

### 최근 변경 (세션 82)
**v4 Venture Discovery Sprint MVP 구현 완료**:
- ✅ `app/features/venture/types.ts`: 공유 타입 정의 완료
- ✅ `app/features/venture/constants/`: sprint-status, decision-types, evaluation-criteria, task-types
- ✅ `app/features/venture/schemas/`: sprint, opportunity, decision Zod 스키마
- ✅ `app/features/venture/domain/`: sprint-state-machine, scoring-policy
- ✅ `app/features/venture/repositories/`: sprint, opportunity, decision, signal, analytics, task-queue (6개)
- ✅ `app/routes/venture.*.tsx`: 페이지 라우트 13개 (overview, sprints, gate, analytics 등)
- ✅ `app/routes/api.venture.*.ts`: API 라우트 4개 (tasks.claim, tasks.report, decisions.propose, analytics.recompute)
- ✅ `app/features/venture/ui/`: 재사용 컴포넌트 8개 (OpportunityCard, DecisionCard, ScoreSheet 등)
- 빌드/타입체크 통과 확인

### 이전 변경 (세션 81)
**v4 PRD v0.3 DevSpec 반영**:
- ✅ `SPEC.md` §1: In-scope에 Epic 구조 티켓 분해 언급
- ✅ `SPEC.md` §3: vd_* 테이블 16개 → 18개 (sprint_members, theme_memberships, rubric_templates 추가)
- ✅ `SPEC.md` §3: 워커 아키텍처 (VdTaskType 8개, Retry/Backoff/Idempotency 정책)
- ✅ `SPEC.md` §3: Analytics 계산 규칙 (Depth Score 0~100, Effort Score, 추천 분류)
- ✅ `SPEC.md` §5: v0.3 DevSpec 반영 완료 기록

### 이전 변경 (세션 80)
**v4 Venture Discovery Sprint 구현 시작**:
- ✅ `SPEC.md`: v4 섹션 추가 (§1 In-scope, §2 Flow H + UI, §3 도메인 모듈/vd_* 테이블/상태 전환)
- ✅ `app/features/venture/db/schema.ts`: vd_* 16개 테이블 스키마 구현 완료

### 이전 변경 (세션 79)
**테스트 커버리지 확장 Phase 5 — Agent 도구 전체 커버**:
- ✅ `indicator-tools.test.ts` (신규 19건): registerKpi(4), recordKpiMeasurement(5), getKpiStatus(4), getPipelineHealth(6)
- ✅ `connector-tools.test.ts` (신규 15건): linkDiscoveries(9), getLinkedDiscoveries(6)
- ✅ `governance-tools.test.ts` (신규 16건): requestGateApproval(6), submitGateApproval(10)
- ✅ `alert-tools.test.ts` (신규 32건): getAlerts(8), acknowledgeAlert(4), manageWebhook(20)
- ✅ `vite.config.ts`: @axis-ds/ui-react SSR 번들링 + React dedupe 설정
- 전체 338개 테스트 통과 (기존 256 + 신규 82)
- **Agent 도구 8개 파일 전체 테스트 커버 완료**

### 이전 변경 (세션 78)
**searchSimilar LIKE 패턴 에러 수정**:
- ✅ `query-tools.ts`: searchSimilar 입력 검증 + 특수문자 이스케이프
- ✅ `query-tools.test.ts`: searchSimilar 테스트 4개 추가
- 전체 256개 테스트 통과 (기존 252 + 신규 4)

### 이전 변경 (세션 77)
**Experiment 반자동 추천 시스템 구현**:
- ✅ `query-tools.ts`: `getExperimentContext` 함수 추가 (~140줄)
- ✅ `tool-registry.ts`: TOOL_MIN_AUTONOMY (Level 1) + AGENT_TOOLS 등록
- ✅ `system-prompt.ts`: "실험 설계 가이드" 섹션 추가 (~40줄)
- ✅ `add-experiment.tsx`: 채팅 기반 추천 안내 문구 추가
- ✅ `query-tools.test.ts`: 신규 15개 테스트 (getExperimentContext 10 + 기타 5)
- ✅ `format-date.ts`: formatDateLocalTime 함수 추가
- ✅ UI 컴포넌트 18개 파일 hydration 불일치 수정 (React Hydration Mismatch #418)
- ✅ `MethodPackDetailDialog.tsx` + `Dialog.tsx`: Method Pack 상세 다이얼로그 추가
- 전체 252개 테스트 통과

### 이전 변경 (세션 76)
**Method Run 중단 버그 수정 — MAX_TOOL_ROUNDS + RUNNING 재개**:
- ✅ `executor.ts`: MAX_TOOL_ROUNDS 5→12 (sync + stream 루프 모두)
- ✅ `system-prompt.ts`: "Method Run 실행 전략" 섹션 추가 (templatePrompt→입력 대기→분석→complete 패턴)
- ✅ `method-tools.ts`: 이미 RUNNING인 run 재개 시 templatePrompt + methodPack + discovery 반환 (기존: error만 반환)
- ✅ `method-tools.test.ts`: 테스트 기대값 수정 (error→resumed + runId + templatePrompt)
- 전체 237개 테스트 통과

### 이전 변경 (세션 75)
**문서 및 폴더 정비**:
- ✅ SPEC.md §5: 세션 2~68 이전 변경 620행 → 접이식 `<details>` 요약 11행으로 축약
- ✅ SPEC.md §6: "남은 작업"/"미래 작업"/"운영 후 판단" 섹션 삭제 (전항목 `[x]` 완료 상태, 46행 제거)
- ✅ 로컬 아티팩트 삭제: `nul` 2개, `.claude/skills/.claude/` 중첩 settings, `.claude/skills/.playwright-mcp/` 스크린샷 캐시 12개
- ✅ 프로덕션 배포 완료 (42222cdd)

### 이전 변경 (세션 74)
**테스트 커버리지 확장 Phase 4 — Agent ontology-tools 통합 테스트**:
- ✅ `tests/integration/agent/ontology-tools.test.ts` (신규 21건): extractEntities(5), linkEntities(5), queryGraph(4), getDuplicateQueue(3), reviewDuplicate(4)
- ✅ 전체 237개 테스트 통과 (기존 216 + 신규 21), `pnpm typecheck` 정상

### 이전 변경 (세션 73)
**문서 현행화 + 배포**:
- ✅ `CLAUDE.md`: v3 현행화 — 11단계 파이프라인, 52개 라우트 구조, @axis-ds 스택, Agent 도구 목록
- ✅ `SPEC.md` §5 활성 결정사항: 배포 상태(세션 69), 테스트 인프라(216개) 반영
- ✅ `SPEC.md` §6 완료 요약: 세션 69-72 작업 4건 추가
- ✅ 프로덕션 배포 완료 (1741efa4)

### 이전 변경 (세션 72)
**테스트 커버리지 확장 Phase 3 — Agent method-tools 통합 테스트**:
- ✅ `tests/integration/agent/method-tools.test.ts` (신규 20건): listMethodPacks(3), recommendMethods(4), startMethodRun(4), completeMethodRun(4), draftGatePackage(3), getGatePackage(2)
- 검증 항목: stage/tier 필터링, Tier-0 우선 추천, 완료 팩 제외, 중복 실행 거부, assumptions 자동 생성 side effect, readinessScore 계산 (GO/CONDITIONAL/NO_GO), gate package upsert
- ✅ 전체 216개 테스트 통과 (기존 196 + 신규 20), `pnpm typecheck` 정상

### 이전 변경 (세션 71)
**테스트 커버리지 확장 Phase 1+2 — DB 현행화 + Agent discovery-tools 통합 테스트**:
- ✅ `tests/helpers/db.ts`: 마이그레이션 0007~0010 (stage_system, method_packs, google_auth, ontology_graph, r3_indicators_connectors) 추가
- ✅ `tests/helpers/fixtures.ts`: v3 엔티티 헬퍼 11개 추가 (makeMethodRun, makeGatePackage, makeAssumption, makeContextNode, makeContextEdge, makeDiscoveryKpi, makeKpiMeasurement, makeAlert, makeWebhookConfig, makeGateApproval, makeDiscoveryLink), makeDiscovery 기본 status `DISCOVERY`로 변경
- ✅ `tests/integration/db-migration.test.ts` (신규 15건): stages 11개, method_packs 12개, ontology_types 10개 시드 확인, v3 컬럼/테이블 CRUD 확인
- ✅ `tests/integration/agent/discovery-tools.test.ts` (신규 52건): createDiscovery(3), updateDiscovery(4), promoteDiscovery(5), transitionStage(6), addExperiment(3), completeExperiment(3), addEvidence(5), decideGate(4), decideHold(4), decideDrop(5), requestExtension(3), getStageInfo(3), validateEvidence(4)
- ✅ 전체 196개 테스트 통과 (기존 129 + 신규 67), `pnpm typecheck` 정상

### 이전 변경 (세션 70)
**UI 폴리시 — 토큰 하드코딩 제거 + 접근성 강화 + 버튼 일관성 + 애니메이션 정리**:
- ✅ `dx-custom-tokens.css`: destructive 버튼 4토큰, warning 배지 2토큰, 이벤트 border 12토큰(`--dx-event-*`), severity border 3토큰(`--dx-severity-*`) 추가 (light + dark 모두)
- ✅ `dx-custom-tokens.css`: `@keyframes fadeSlideIn` 정의 추가 (AuditLogList/AlertList 인라인 참조 해소)
- ✅ `Button.tsx`: destructive variant 하드코딩 → `--axis-button-destructive-*` 토큰
- ✅ `Badge.tsx`: warning variant 하드코딩 → `--axis-badge-warning-*` 토큰
- ✅ `AuditLogList.tsx`: 16개 border 색상 → `--dx-event-*` 토큰, EVENT_TYPE_MAP 30종 확장 (Web form + Agent + Radar)
- ✅ `AlertList.tsx`: severity border → `--dx-severity-*` 토큰, 확인 버튼 → `<Button variant="secondary">`
- ✅ `ConversationList.tsx`: 삭제 확인 버튼 → destructive 토큰, aria-label 3개 추가
- ✅ `ToolExecution.tsx`: 토글에 `role="button"`, `aria-expanded`, `tabIndex`, `onKeyDown` 추가
- ✅ `ChatPanel.tsx`: 로딩 스피너 `role="status"` + `aria-label`, Agent 처리 중 `aria-live="polite"`, 재시도 버튼 → `<Button>`
- ✅ `dashboard.tsx`: 탭에 `role="tablist"` / `role="tab"` / `aria-selected`, focus-visible ring 추가
- ✅ `pnpm typecheck` + `pnpm lint` + `pnpm build` 통과

### 이전 변경 (세션 69)
**Agent 채팅 품질 튜닝**:
- ✅ `system-prompt.ts`: "응답 원칙", "도구 사용 전략", "대화 패턴" 3개 섹션 추가/교체
- ✅ `tool-registry.ts`: 핵심 도구 10개 description 보강 (사용 시점, 선행 조건, 주의사항)
- ✅ `context-builder.ts`: summarizeSkippedMessages에 사용자 메시지 핵심 추출 추가
- ✅ `executor.ts`: 도구 에러 컨텍스트 추가, MAX_ROUNDS 메시지에 도구 목록 포함, 스트리밍 에러 분류(API/내부)
- ✅ `pnpm typecheck` + `pnpm lint` + `pnpm build` 통과

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
- **인증 방식**: Google OAuth (arctic) + Session 기반 (D1 `sessions` 테이블), admin/user 역할 분리
- **기술 스택**: Remix v2 + D1 확정
- **프로젝트 구조**: 기획 문서는 `docs/`, SDD 핵심(CLAUDE.md, SPEC.md)은 루트
- **브랜치 전략**: master 단일 브랜치 (Prototype 기간)
- **배포**: Cloudflare Pages Git 연동 (master push → 자동 빌드/배포)
- **EXTENSION_REQUESTED**: ✅ 구현 완료 (OPEN + 실험 2개 → 연장 요청 → +14일, 3번째 실험 가능)
- **운영 실험**: 🚀 2026-01-31 시작 (30-60일, 최대 5명, Discovery 5-10건 목표)
- **DB 마이그레이션**: ✅ 7개 마이그레이션 (0000~0006) 로컬 + 프로덕션 적용 완료
- **빌드 상태**: `pnpm build` + `pnpm typecheck` + `pnpm lint` 모두 통과
- **v2 Agent 시스템**: ✅ 프로덕션 배포 완료 (코드 + DB 마이그레이션 0005 + ANTHROPIC_API_KEY 설정)
- **Radar Worker**: ✅ 프로덕션 배포 완료 (https://radar-worker.sinclair-account.workers.dev), Cron 매일 9:00 KST, 10소스 활성 (RSS 6 + Web 3 + YouTube 1)
- **다크모드**: ✅ 세션 43 — 122개 AXIS 토큰 + DX 커스텀 토큰 dark override, useTheme 훅, FOUC 방지, MainNav 토글
- **@axis-ds 패키지**: ✅ 세션 45 — tokens@1.1.1 + theme@1.1.1 + ui-react@1.1.1 연동 완료 (로컬 토큰/테마/컴포넌트 → 패키지 대체)
- **v2 Agent 재설계**: ✅ 세션 46~49 — 15건 전체 구현 완료 (아키텍처 4건 + 도구 5건 + UX 6건), DB 마이그레이션 0006 로컬 적용 완료
- **v3 R0 11단계 파이프라인**: ✅ 코드 구현 완료 (마이그레이션 로컬/프로덕션 미적용)
- **v3 R1 Method Pack**: ✅ 구현 완료 (DB + 도구 + UI)
- **v3 R2 Ontology Graph**: ✅ 구현 완료 (맥락 그래프 + 근거 중복 감지)
- **v3 R3a Indicators/Connectors/Governance**: ✅ 구현 완료 (KPI + 링크 + Gate 승인 + Health 대시보드)
- **Google OAuth + 역할 분리**: ✅ 세션 60 — arctic + /auth/google 라우트 + admin/user role + requireAdmin 가드
- **v3 R3b 알림/웹훅**: ✅ 세션 61 — alert engine (4유형) + webhook (Slack/Teams/Custom) + Agent 도구 3개 + /dashboard/alerts UI
- **DB 마이그레이션**: ✅ 11개 (0000~0010) 로컬 + 프로덕션 적용 완료
- **배포 상태**: ✅ 세션 69 프로덕션 배포 완료 — Agent 채팅 품질 튜닝 (배포 ID: 1d70a79b)
- **Cron 설정**: ✅ 3건 정상 — daily (GET, 09:00), agent-review (POST, 10:00), alerts (GET, 09:30), CRON_SECRET 재설정 완료
- **Agent E2E 테스트**: ✅ 세션 39 풀 플로우 검증 완료 — 6개 도구 정상 (get_metrics, create_discovery, promote_discovery, add_evidence, complete_experiment, decide_next)
- **Agent 채팅 개선**: ✅ 세션 40 — 입력 보존, 제목 로직, 프로그레시브 스트리밍, content 중복 수정
- **채팅 마크다운**: ✅ 세션 41-42 — react-markdown + remark-gfm + @tailwindcss/typography 기반 Agent 응답 마크다운 렌더링
- **토큰 예산 경고**: ✅ 세션 42 — 80% 초과 시 SSE budget_warning 이벤트 + ChatPanel amber 배너
- **이메일 설정**: ✅ Resend 연동 완료 (`noreply@ideaonaction.ai`), cron-job.org 매일 9:00 KST 자동 발송
- **운영 문서**: 치트시트, 런북, 킥오프 템플릿, QA 체크리스트, 사용자 가이드 완성

---

## 6. Implementation Log

### 완료 요약

| 항목 | 상태 | 비고 |
|------|------|------|
| 기술 스택 결정 | ✅ | Remix v2 + CF Pages + D1 + Drizzle + Tailwind |
| DB 스키마 설계 | ✅ | 6개 테이블, PRD §5 반영 |
| 마이그레이션 생성 및 적용 | ✅ | 2개 migration 파일 |
| 프로젝트 스캐폴딩 | ✅ | Vite, tsconfig, wrangler, .gitignore |
| SDD 워크플로우 | ✅ | CLAUDE.md + SPEC.md + 세션 스킬 |
| Validation 엔진 | ✅ | 모든 PRD 비즈니스 규칙 + Zod schemas |
| 상수 정의 | ✅ | Failure patterns, Trigger types, Evidence types |
| 인증 시스템 | ✅ | Google OAuth (arctic) + Session 기반 (D1 저장, 30일 만료) + admin/user 역할 |
| **Discovery CRUD** | ✅ | 15개 라우트 (목록, 생성, 상세, 승격, 실험, 근거, 결정) |
| **상태 전환 로직** | ✅ | INBOX → OPEN → NEXT/NOT_NOW/DEAD_END |
| **Owner 지정** | ✅ | 승격 시 Owner 필수, 변경 가능 |
| **Experiment 관리** | ✅ | 최대 2개 제한 강제, OPEN 상태에서만 추가 |
| **Evidence 관리** | ✅ | 타입/강도 선택, Experiment 연결 |
| **Decision 폼** | ✅ | 3가지 (NEXT, NOT_NOW, DEAD_END) 필수 필드 강제 |
| 빌드 테스트 | ✅ | `pnpm build` 성공 (142KB server bundle) |
| **프로젝트 폴더 정리** | ✅ | 기획 문서 `docs/` 이동, README 교체, .gitignore 보완 |
| **GitHub 연동** | ✅ | AX-BD-Team/Discovery-X (private) |
| **버전 관리 원칙** | ✅ | master 단일 브랜치, Conventional Commits, Phase별 태깅 |
| **CF Pages Git 연동** | ✅ | master push → 자동 빌드/배포 |
| **Weekly Review 뷰** | ✅ | `/review` — OPEN 목록, Age 색상, Due Date 추적 |
| **Recall Queue 뷰** | ✅ | `/recall` — Revisit Date 도래 NOT_NOW 목록 |
| **Metrics 대시보드** | ✅ | `/metrics` — P0/P1 성공 기준, 핵심 지표 |
| **CSV Export API** | ✅ | Discovery + 실험 상세 + 근거 목록 (세션 14 확장) |
| **스킬 파일 보강** | ✅ | deploy 전면 재작성, session-end/start 수정 |
| **Reviewer 지정 UI** | ✅ | 승격 시 선택, 상세에서 변경 |
| **Owner 변경/승계** | ✅ | INBOX/OPEN에서 재지정 가능 |
| **Discovery 편집** | ✅ | `/discoveries/:id/edit` 라우트 |
| **INBOX TTL 경고** | ✅ | 7일 초과 INBOX 항목 시각적 경고 |
| **ESLint 설정** | ✅ | ESLint 9 flat config + typescript-eslint + react-hooks |
| **/lint 스킬** | ✅ | 변경 파일 대상 lint + typecheck 점검/수정 |
| **CLAUDE.md 개선** | ✅ | 명령어/디렉토리 구조/경로 별칭 추가, 비기술 섹션 축소 |
| **EXTENSION_REQUESTED** | ✅ | 연장 요청 UI + due_date +14일 + 실험 최대 3개 + 결정 허용 |
| **Overdue 경고 시스템** | ✅ | 대시보드/목록/상세에서 기한 초과 시각적 경고, OVERDUE 필터 |
| **실험 완료 기록** | ✅ | `/discoveries/:id/complete-experiment` — 결과 요약 기록 |
| **알림 배지** | ✅ | MainNav에 Review/Recall 건수 배지 (root loader) |
| **모바일 반응형** | ✅ | MainNav 햄버거, Review/Recall 카드 레이아웃, 상세 버튼 반응형 |
| **차트 컴포넌트** | ✅ | StatusDonut (상태 분포) + WeeklyBar (주간 생성 추이), SVG 기반 |
| **프로덕션 배포** | ✅ | Cloudflare Pages 배포 완료 |
| **QA 체크리스트** | ✅ | `docs/qa-checklist.md` — 80+ 테스트 항목, 4개 통합 시나리오 |
| **사용자 가이드** | ✅ | `docs/user-guide.md` — 시스템 개요, 워크플로우, FAQ |
| **ESLint 경고 제거** | ✅ | unused imports, `any` → `unknown`, dead code 제거 — 경고 0개 |
| **폼 모바일 반응형** | ✅ | 10개 폼 페이지 `max-w-2xl px-4`, 버튼 스택, 메타 행 스택 |
| **이메일 알림 시스템** | ✅ | Resend 연동, daily cron, overdue/review 알림 |
| **Brief 내보내기** | ✅ | `/api/export/brief/:id` — 1-pager Brief 다운로드 |
| **JSON Export** | ✅ | `/api/export/discoveries-json` — 전체 Discovery JSON |
| **운영 준비 문서** | ✅ | 킥오프 템플릿, 운영 런북, 치트시트 |
| **테스트 인프라** | ✅ | Vitest + Playwright, 전체 338개 통과 (unit 76 + DB 스모크 15 + Agent 도구 통합 194 + 기존 integration 53) |
| **Reviewer 승인 워크플로우** | ✅ | DB 스키마 + validation + approve 라우트 + 이메일 알림 |
| **유사 Seed 검색** | ✅ | `/api/similar-seeds` + 생성 폼 실시간 유사 Discovery 표시 |
| **고급 지표** | ✅ | Failure Pattern 재사용률, Owner 부하, Evidence 품질 |
| **StatusBadge 컴포넌트** | ✅ | 재사용 가능한 상태 배지 UI 컴포넌트 |
| **전체 QA 수동 테스트** | ✅ | QA 체크리스트 Flow A~P (80+ 항목), 모바일/필터/Export 포함 |
| **운영 실험 시작** | ✅ | 프로덕션 사용자 5명 등록, 클린 스타트, 2026-01-31 시작 |
| **UI 일관성 개선** | ✅ | P0~P2: border/ring 수정, STATUS_CONFIG 추출, 접근성, 버튼 그룹핑, StatusBadge 통합 |
| **이메일 도메인 변경** | ✅ | `ideaonaction.ai` 도메인으로 발신 주소 변경 |
| **Resend secrets + cron 연동** | ✅ | RESEND_API_KEY + CRON_SECRET 설정, cron-job.org 매일 9:00 KST |

| **Radar 자동 토픽 수집** | ✅ | DB 스키마 + UI + radar-worker 배포 + 소스 5개 시딩 완료 |
| **Tailwind v4 + Design Tokens** | ✅ | axis-tokens.css, 재사용 UI 컴포넌트 11개, postcss/tailwind.config 제거 |
| **기한 초과 자동 DEAD_END** | ✅ | daily cron 자동 전환 + TIME_CONSTRAINT 패턴 + 이메일 알림 + UI 배너 |
| **v2 Agent 코어** | ✅ | executor + claude-client (SSE) + system-prompt + context-builder + tool-registry |
| **v2 Agent 도구 15개** | ✅ | Discovery CRUD + 상태 전환 + 조회/검색/Radar |
| **v2 채팅 UI** | ✅ | ChatPanel + MessageBubble + ToolExecution + DiscoveryCard + ConversationList |
| **v2 채팅 API** | ✅ | SSE 스트리밍 + 대화 CRUD + 메시지 조회 |
| **v2 대시보드** | ✅ | Pipeline 칸반 + Metrics (Agent 토큰 추적) |
| **v2 Agent 설정** | ✅ | 자율도 레벨 (0-3) + 토큰 예산 + 커스텀 프롬프트 |
| **v2 자율 리뷰 cron** | ✅ | OPEN Discovery 50% 경과 시 Agent 자동 평가 |
| **v2 DB 스키마** | ✅ | conversations + messages + agent_config 테이블, createdByAgent 컬럼 |
| **v2 토큰 예산 경고** | ✅ | 80% 초과 시 SSE budget_warning 이벤트 + ChatPanel amber 배너 |
| **다크모드** | ✅ | 122개 AXIS + DX 커스텀 토큰 dark override, useTheme 훅, FOUC 방지, MainNav 토글 |
| **차트 색상 토큰화** | ✅ | StatusDonut 9건 + WeeklyBar 3건 hex → CSS 변수, 차트 시맨틱 토큰 7개 |
| **@axis-ds 패키지 연동** | ✅ | tokens + theme + ui-react 패키지 도입, 로컬 토큰/테마/컴포넌트 대체, adapter 패턴 |
| **Agent 도구 확장** | ✅ | update_discovery + get_weekly_review + get_recall_queue 3개 도구 추가 |
| **모델 선택 기능** | ✅ | agent_config.modelId + Settings UI + executor 연동 |
| **Claude API 재시도 로직** | ✅ | fetchWithRetry (429/5xx + exponential backoff) + 25초 타임아웃 |
| **ToolExecution UI 개선** | ✅ | 리치 결과 렌더링, expand/collapse, JSON 토글, 실행 중 표시 |
| **Daily Cron 버그 수정** | ✅ | 시스템 사용자 이메일 제외 + BASE_URL 수정 |
| **테스트 DB 마이그레이션 현행화** | ✅ | tests/helpers/db.ts에 0003~0010 마이그레이션 추가 → 196개 전체 통과 |
| **Radar Worker 제한사항 개선** | ✅ | HTMLRewriter 교체, YouTube @handle 해석, FTS5 유니코드 이스케이프, fetchWithRetry 유틸 |
| **v2 Agent 재설계 15건** | ✅ | 3개 스트림 (아키텍처 4건 + 도구 5건 + UX 6건) 전체 구현 완료 |
| **실시간 SSE 스트리밍** | ✅ | callClaudeStream + text_delta/tool_start/tool_call/done 이벤트 |
| **자율도 레벨 도구 강제** | ✅ | TOOL_MIN_AUTONOMY (Level 1: 조회, Level 2: 생성/승격, Level 3: 전체) |
| **컨텍스트 윈도우 최적화** | ✅ | 30+ 메시지 시 first 5 + last 25 + 중간 요약 삽입 (LLM 호출 없이) |
| **채팅 UX 개선** | ✅ | 대화 검색, 삭제 확인, 코드 구문 강조+복사, 도구 결과 접기/펼치기, ErrorBoundary |
| **getMetrics SQL 집계** | ✅ | 메모리 로드 → SQL GROUP BY/COUNT/AVG 전환, 날짜 필터 Drizzle 조건 |
| **모델별 컨텍스트 윈도우** | ✅ | MODEL_CONTEXT_CONFIG (Opus 4: 60개, default: 40개), executor 연동 |
| **에러 suggestion 일관성** | ✅ | discovery-tools 7곳 에러 응답에 suggestion 힌트 추가 |
| **Chat UI polish** | ✅ | AlertBanner 에러, 3-dot bounce 인디케이터, Badge 상태 표시 |
| **대시보드 UX 개선** | ✅ | MetricCard 액센트 바+트렌드, StatusDonut 호버, fade-in-up stagger, 탭 아이콘 |
| **v3 R0: 11단계 파이프라인** | ✅ | 6-상태 → 11단계 전환 (스키마, 상수, 검증, 도구, 대시보드, 21개 파일 일괄 교체) |
| **v3 R0: 근거 스키마 강화** | ✅ | reliability_label + source_url + published_date + validator_id + validated_at |
| **v3 R0: stages/signal_metadata 테이블** | ✅ | 11단계 정의 + 신호 메타데이터 |
| **v3 R0: Agent 도구 17개** | ✅ | 2신규 (get_stage_info, validate_evidence) + transition_stage + 15수정 |
| **v3 R0: 대시보드 11단계 칸반** | ✅ | 카테고리별 그룹 파이프라인 |
| **v3 R1: Method Pack 스키마** | ✅ | method_packs, method_runs, gate_packages, assumptions 4개 테이블 |
| **v3 R1: Agent 도구 6개** | ✅ | list/recommend/start/complete_method + draft/get_gate_package |
| **v3 R1: Method Pack UI** | ✅ | /methods 라이브러리 + Discovery별 실행 + Gate 패키지 |
| **v3 R2: Ontology Graph 스키마** | ✅ | ontology_types + context_nodes + context_edges + snapshots + duplicates |
| **v3 R2: Agent 도구 5개** | ✅ | extract/link_entities + query_graph + get_duplicate_queue + review_duplicate |
| **v3 R2: GraphViewer + DuplicateCard** | ✅ | 맥락 그래프 시각화 + 근거 중복 관리 UI |
| **v3 R3a: KPI 스키마** | ✅ | discovery_kpis + kpi_measurements 테이블 |
| **v3 R3a: 링크/알림/승인 스키마** | ✅ | discovery_links + alert_rules + alerts + webhook_configs + gate_approvals 테이블 |
| **v3 R3a: Agent 도구 8개** | ✅ | register/record/get_kpi + pipeline_health + link/get_linked + request/submit_gate_approval |
| **v3 R3a: Health 대시보드** | ✅ | /dashboard/health — 체류시간, 전환율, 근거 품질 |
| **Google OAuth + 역할 분리** | ✅ | arctic + /auth/google + admin/user role + requireAdmin 가드 + /admin/users |
| **v3 R3b: 알림 엔진** | ✅ | 4유형 스캔 (KPI/SLA/기한/Gate) + 당일 중복 방지 |
| **v3 R3b: 웹훅 커넥터** | ✅ | Slack Block Kit + Teams MessageCard + Custom JSON |
| **v3 R3b: Agent 도구 3개** | ✅ | get_alerts + acknowledge_alert + manage_webhook |
| **v3 R3b: Dashboard Alerts** | ✅ | /dashboard/alerts — 알림 목록 + 확인 처리 |
| **로그인 + 관리자 UI 정비** | ✅ | /login 브랜드 스타일, /admin/seed PageLayout, /admin/users 아바타+가입일 |
| **v3 R3b 프로덕션 배포** | ✅ | Cloudflare Pages 배포 (d964c40b) — 세션 62 |
| **Gatekeeper 역할** | ✅ | UserRole.GATEKEEPER + requireGatekeeper() + admin.users 3역할 Select + Discovery 상세 Gatekeeper 변경 |
| **KpiCard 컴포넌트** | ✅ | 현재값/목표값/상태 색상 + 미니 스파크라인 바차트 |
| **Discovery 상세 KPI 섹션** | ✅ | discoveryKpis + kpiMeasurements 조회 + KpiCard 그리드 렌더링 |
| **Discovery 상세 링크 섹션** | ✅ | discoveryLinks from/to 조회 + 제목/상태배지/관계유형 태그 |
| **Gate 승인 UI** | ✅ | 승인 요청 폼 + 승인/조건부/거부 결정 + 코멘트 + 자동 집계 |
| **시스템 알림 배지** | ✅ | root loader unacknowledgedAlerts + MainNav Dashboard 배지 반영 |
| **Pending 사용자 승인** | ✅ | UserRole.PENDING + 화이트리스트 자동 승인 + /pending 대기 + admin 거부 |
| **Agent 채팅 품질 튜닝** | ✅ | 시스템 프롬프트 3개 섹션 + 도구 description 보강 + 컨텍스트 요약 개선 + 에러 처리 세분화 |
| **Audit Log EVENT_TYPE_MAP 30종** | ✅ | Web form UPPER_CASE + Agent snake_case + Cron + Radar 전체 매핑 |
| **UI 토큰 정리 + 접근성** | ✅ | destructive/warning/event/severity 토큰 21개, ARIA 속성 10+개, fadeSlideIn 정의 |
| **테스트 커버리지 확장** | ✅ | DB 스모크 15 + Agent 도구 8개 파일 194건 (discovery 52 + query 19 + method 20 + ontology 21 + indicator 19 + connector 15 + governance 16 + alert 32) |
| **Method Run 중단 버그 수정** | ✅ | MAX_TOOL_ROUNDS 5→12, RUNNING run 재개 시 templatePrompt 반환, 시스템 프롬프트에 실행 전략 추가 |
| **Experiment 반자동 추천** | ✅ | get_experiment_context 도구 + 실험 설계 가이드 + 테스트 15개 (query-tools.test.ts) |
| **searchSimilar LIKE 에러 수정** | ✅ | 입력 검증 + 특수문자 이스케이프 + 길이 제한 + 테스트 4개 |
| **Agent 도구 전체 테스트 커버** | ✅ | indicator/connector/governance/alert 4개 파일 82건 추가 → 전체 338개 |

