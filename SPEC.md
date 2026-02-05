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
| Venture Sprint Detail | 신호함/후보 목록/검토 단계/심층 분석/산출물 정리/분석 탭 |
| Venture Decision Center | Agent 추천안 + 블라인드 투표 + 재투표 |
| Venture Analytics | 퍼널/도메인 분포/Depth-Effort 스캐터/White-space |

### 용어 사전 (한국어화)

| 영어 원문 | 한국어 | 사용처 | 비고 |
|-----------|--------|--------|------|
| Inbox | 신호함 | Venture 탭 | 도메인 맥락(신호 수집)에 적합 |
| Long List | 후보 목록 | Venture 탭 | 일반적·직관적 |
| Gate | 검토 단계 | Venture 탭/상태 | 단순 '검토'보다 단계 의미 명확 |
| Deep Dive | 심층 분석 | Venture 탭/상태 | 표준 번역 |
| Packaging | 산출물 정리 | Venture 탭/상태 | 행위/단계성 강화 |
| Analytics | 분석 | Venture 탭 | 간결성 유지 |
| Signal | 신호 | 엔티티명 | 핵심 개념 |
| Shortlist | 선별 목록 | Gate 결정 | Long List 대비 의미 구분 |
| Final | 최종 선정 | Gate 결정 | 의사결정 결과로 명확 |
| GO / NO_GO / CONDITIONAL | 진행 / 중단 / 조건부 진행 | Gate 결정 | '조건부' 단독보다 판단 의미 명확 |
| Dashboard | 현황판 | 메뉴 | 한국어 UI에서 자연스러움 |
| Venture | 사업 탐색 | 메뉴 | 행위 중심 |
| Methods | 방법론 | 메뉴 | 표준 용어 |
| Pipeline | 파이프라인 | Dashboard 탭 | 관용적 사용 → 음차 유지 |
| Metrics | 지표 | Dashboard 탭 | 표준 |
| Health | 건강도 | Dashboard 탭 | 상태 판단 의미 적절 |
| Alerts | 알림 | Dashboard 탭 | 표준 |
| Audit Log | 활동 기록 | Dashboard 탭 | 보안/감사 뉘앙스 완화 |

### 페이지 구성 (Remix Routes)

```
/                     → 채팅 인터페이스 (메인)
/discoveries          → Discovery 목록 (필터: 상태별)
/discoveries/new      → Seed 입력 (INBOX 생성)
/discoveries/:id      → Discovery 상세 (Experiments, Evidence, Decision)
/discoveries/:id/edit → Discovery 편집
/radar                → Radar 설정 + 수집 이력
/evidence/duplicates  → 중복 근거 관리 (Ontology Graph)
/docs                 → 프로젝트 문서 (기획서/운영문서 뷰어 + GitHub Project)
/settings             → 설정 (역할별 분기: 프로필/알림/Gate/Agent)
/auth/google          → Google OAuth 인증
/admin/users          → 관리자 사용자 관리

# 대시보드 (7개 탭)
/dashboard            → 파이프라인 (칸반)
/dashboard/metrics    → 지표
/dashboard/health     → 건강도
/dashboard/alerts     → 알림
/dashboard/audit-log  → 활동 기록
/dashboard/review     → 주간 리뷰 (기존 /review에서 이동)
/dashboard/recall     → 리콜 큐 (기존 /recall에서 이동)

# 리다이렉트
/review → /dashboard/review (301)
/recall → /dashboard/recall (301)

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

### 네비게이션 구조 (v4.9 AppShell)

```
AppShell (전체 레이아웃)
├── TopNav (GNB, 상단 고정)
│   ├── 좌측: "Discovery-X" 풀 텍스트 로고
│   ├── 중앙: 4개 탭 직접 링크 (아이콘 + 텍스트)
│   │   ├── 대시보드 → /dashboard
│   │   ├── 시장 탐색 → /radar
│   │   ├── 사업 발굴 → /discoveries
│   │   └── 수집 관리 → /settings
│   ├── 우측: 알림 벨 (배지) + 사용자명
│   └── 모바일: 햄버거 → 사이드바 토글
├── SidebarPanel (좌측 240px, 상시 표시)
│   ├── "새 채팅" 버튼 (full-width, primary)
│   ├── 채팅 검색 (SearchInput)
│   ├── 보관함 (접이식, MVP: "준비 중" placeholder)
│   ├── 채팅 히스토리 (날짜별 그룹: 오늘/어제/이번 주/이전)
│   └── 하단: 사용자 프로필 (아바타/이름/팀명/버전) + 테마 토글 + 로그아웃
└── main (flex-1, 라우트 콘텐츠)

모바일: 사이드바 overlay + backdrop 클릭으로 닫기
데스크톱: 사이드바 persistent (localStorage로 상태 유지)
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
- `app/components/layout/` — AppShell (전체 래퍼), TopNav (GNB), SidebarPanel (좌측 사이드바)
- `app/components/` — 재사용 UI 컴포넌트 (StatusDonut, WeeklyBar 등)
- `app/lib/context/sidebar-context.tsx` — SidebarProvider + useSidebar() (열림/닫힘 + localStorage)
- `app/db/` — DB 스키마 및 접근 레이어
- `~/` alias → `./app/`
- 모든 인증 라우트는 `<AppShell user={user}>` 래핑 (기존 PageLayout/MainNav 삭제됨)

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
**🚀 v4.10 Compliance, Industry, Patterns 기능 추가 (세션 120, 2026-02-06)**

- ✅ v3 R0~R3b 전체 구현 + 프로덕션 배포 (Agent 48도구 → 51도구, 11단계 파이프라인, 알림/웹훅)
- ✅ v4 Venture Sprint MVP: 18 라우트, 8 핸들러, Task Queue, Decision Center, Analytics
- ✅ UX 리팩토링 v4.1~v4.4 + 메뉴 구조 개편 + UI 일관성 수정
- ✅ v4.5: 버그 수정 + 성능 최적화 + 보안 강화
- ✅ v4.6: Figma 기반 전체 UI 개선 — 다크 테마 심화 + 플랫 네비/탭 + 카드 border 기반
- ✅ v4.7: 프로덕션 500 에러 수정 — 인증 라우트 방어적 try-catch + SESSION_SECRET 환경 변수 설정
- ✅ v4.8: P2 잔여 작업 5건 (F6~F10) — 응답 요약/비교 도구/간트차트/태그/추천
- ✅ v4.9: Figma 2차 전체 레이아웃 개편 — AppShell + TopNav + SidebarPanel (41파일, 4 Phase)
- ✅ v4.10: Compliance, Industry, Patterns 기능 추가 — 신규 컴포넌트 3개 + Agent 도구 3개 + 라우트 5개 + 마이그레이션 2개 (21파일)
- ✅ Embeddings 인프라 (Vectorize 2개 + Cron 15분 + 초기 동기화 완료)
- ✅ 채팅 UX 개선 (ContextPanel + Digest + 제안 칩 + 리치 시각화)
- ✅ 테스트 561개 통과 (unit 76 + integration 342 + venture 143)

### 최근 변경 (세션 120)
**Compliance, Industry, Patterns 기능 추가 + Agent 도구 확장 — 21파일 변경 (신규 11 + 수정 8 + 삭제 2)**:
- ✅ Compliance 기능: `ComplianceChecklist` UI + Asset/Compliance Agent 도구 3개 (getAssets/addAsset/analyzeCompliance)
- ✅ Industry 기능: `IndustrySelector` UI 컴포넌트
- ✅ Patterns 기능: `PatternCard` UI 컴포넌트
- ✅ 발견 상세 페이지 확장: 자산 탭 + 준수 탭 + 패턴 탭 (3개 라우트)
- ✅ Cron 라우트: `pattern-extract` + `log-archive` (2개)
- ✅ Agent 도구 확장: 51도구 (+3: getAssets, addAsset, analyzeCompliance)
- ✅ Schema + Seed 업데이트: Asset + Compliance 테이블 + 데이터
- ✅ SQL 마이그레이션: `0015_industry_adapters.sql` + `0016_decision_logs_assets.sql`
- ✅ typecheck + lint + build 모두 통과

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

### 이전 변경 (세션 117)
**프로덕션 500 에러 핫픽스 — 5개 파일 수정, 환경 변수 1개 추가**:
- ✅ 프로덕션 검증: `/`, `/dashboard`, `/auth/google` 모두 500→302 해소

### 이전 변경 (세션 116)
**Figma 기반 전체 UI 개선 — 21개 파일 수정, 6 Phase 완료**:
- ✅ Phase 1~6: 디자인 토큰 + 레이아웃 + UI 컴포넌트 + 채팅 + 대시보드 + 빌드 검증

### 이전 변경 (세션 115)
**코드 품질 + 보안 강화 — 4건의 논리적 커밋**:
- ✅ 버그 수정, 보안 강화, 성능 최적화, SSR hydration mismatch 수정

### 이전 변경 (세션 114)
**UI 일관성 수정 — 메뉴 개편 후 잔여 불일치 7건**:
- ✅ venture 라우트 4개 `max-w-7xl` → `max-w-[1400px]` 통일
- ✅ 탭 스타일 pill/segment 통일 + 로그인 Google 버튼 다크모드 대응

### 이전 변경 (세션 113)
**메뉴 구조 개편 + UI 디자인 시스템 개선**:
- ✅ 네비게이션 8개 항목 → 3개 메인 메뉴 + 아바타 드롭다운으로 단순화
- ✅ 대시보드 탭 5개 → 7개 확장 (주간 리뷰 + 리콜 큐 통합)
- ✅ 설정 페이지 역할별 분기 + UI 컴포넌트 디자인 시스템 개선

### 이전 변경 (세션 112)
**CLAUDE.md 감사/개선 + Claude Code 자동화 추천 + 서브에이전트 생성**

### 이전 변경 (세션 109~111)
**세션 111**: 코드 감사 + CLAUDE.md 동기화
**세션 110**: lilys.ai 참고 UI/UX Phase 1+2 전체 완료
**세션 109**: F4/F5 Embeddings 인프라 + 채팅 UX 대폭 개선 + 프로덕션 배포

<details>
<summary>이전 변경 이력 (세션 69~108) — 클릭하여 펼치기</summary>

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
- **DB 마이그레이션**: ✅ 14개 (0000~0014) 로컬 적용 완료 (0014 프로덕션 미적용)
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
| Agent 시스템 | 12 | v2→v3 재설계 + 48도구 + SSE 스트리밍 + 컨텍스트 최적화 + 채팅 UX |
| v3 파이프라인 | 8 | R0 11단계 + R1 Method Pack + R2 Ontology + R3 KPI/알림/웹훅 |
| v4 Venture Sprint | 10 | 도메인 모듈 + 워커 8핸들러 + Decision Center + Analytics + E2E |
| Embeddings | 3 | Vectorize 2개 + Cron 15분 + 시맨틱 검색/중복 감지 |
| 테스트 | 5 | 561개 (unit 76 + integration 342 + venture 143) |
| 운영/문서 | 8 | Google OAuth + 이메일 + Radar + 문서 5종 + QA |

<details>
<summary>완료 항목 전체 목록 (91건) — 클릭하여 펼치기</summary>

**인프라/스택**: 기술 스택 결정, DB 스키마 설계(30개 테이블), 마이그레이션 13개, 프로젝트 스캐폴딩, SDD 워크플로우, Validation 엔진(Zod), ESLint 9 flat config, CF Pages Git 연동

**Discovery 코어**: Discovery CRUD(15라우트), 상태 전환 로직(11단계), Owner/Reviewer 지정, Experiment 관리(최대 2개), Evidence 관리(타입/강도), Decision 폼(3가지), Weekly Review, Recall Queue, Metrics 대시보드, CSV/Brief/JSON Export, EXTENSION_REQUESTED, Overdue 경고

**UI/UX**: 모바일 반응형, 차트 컴포넌트(StatusDonut/WeeklyBar), 다크모드(122토큰), @axis-ds 패키지 연동, 차트 색상 토큰화, UI 일관성(border/ring/접근성), 폼 모바일 반응형, StatusBadge, 알림 배지, UI 토큰 정리+접근성(ARIA), Audit Log EVENT_TYPE_MAP(30종), UX 한국어화(WU-A~I), ContextPanel+Discovery Digest, 리치 도구 결과 시각화, 채팅 UX(제안 칩/마크다운)

**Agent 시스템**: v2 Agent 코어(executor/claude-client/system-prompt/context-builder), v2 도구 15개→v3 45개, v2 채팅 UI/API, v2 대시보드, v2 Agent 설정(자율도 0-3), v2 자율 리뷰 cron, SSE 스트리밍, 컨텍스트 윈도우 최적화(30+메시지 요약), Agent 재설계 15건, 채팅 품질 튜닝, Method Run 버그 수정, Experiment 반자동 추천

**v3 파이프라인**: R0 11단계 파이프라인(21파일), R0 근거 스키마 강화, R1 Method Pack(스키마+도구6개+UI), R2 Ontology Graph(스키마+도구5개+GraphViewer), R3a KPI/링크/승인(스키마+도구8개+Health), R3b 알림 엔진(4유형)+웹훅(Slack/Teams), Gatekeeper 역할, Gate 승인 UI

**v4 Venture Sprint**: venture-worker 구현(8핸들러), Task Queue Retry/Backoff/Idempotency, Task Executor 시스템, Deep Dive/Packaging Action, Decision Center(투표/집계), Analytics(Depth/Effort/ROI), Sprint Repository 테스트(36개), E2E 파이프라인 테스트, Markdown Export, Gate Timeout 자동 처리

**Embeddings**: OpenAI text-embedding-3-small + Vectorize, Embeddings Cron(15분), Vectorize 인프라(인덱스 2개 + 프로덕션 + 초기 동기화)

**테스트**: Vitest + Playwright 인프라, Agent 도구 8파일 전체 커버(194건), scoring-policy 100%/task-queue 98%+, 테스트 DB 마이그레이션 현행화, 총 561개 통과

**운영/문서**: Google OAuth + 역할 분리(4역할), 이메일 알림(Resend), Radar Worker(10소스), 운영 문서 5종(치트시트/런북/킥오프/QA/가이드), 운영 실험 시작(2026-01-31), Pending 사용자 승인, CLAUDE.md 현행화, Cron 설정(5개)

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

