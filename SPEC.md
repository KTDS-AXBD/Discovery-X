# SPEC.md — Project Specification

## 1. Project Overview

### 미션
AX 신사업 발굴 과정에서 **관찰→내부 실험→근거→결정**을 강제로 닫게 하여, 조직이 "더 잘 틀리고 더 빨리 배우는" 루프를 만든다.

### 범위

**In-scope (PRD §7.1 P0 + v3 확장 + v4 Venture Discovery Sprint + v5 Layout Restructure + Proposals)**
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
- 4탭 GNB (대시보드/아이디어/사업제안/실험실) + ContextPanel + 보관함 사이드바 레이아웃 재구성 (v5.0+)
- 아이디어 페이지: Radar 아이템 재활용 + 메모 패널 (v5.0)
- 사업제안: DB 6테이블 + CRUD API + 마일스톤/액션/댓글 + 진행상황 패널 (v5.0)
- 실험실 (Lab Intelligence): 4탭 구조 (개요/분석/검토 큐/방법론) + LLM 자동 엔티티 추출 + 글로벌 엔티티 매칭 + 관계 분석 엔진 + 시뮬레이션 + 인터랙티브 그래프 (드래그/줌/팬) + Method Pack 라이브러리 통합 + 과학 Lab 미학 (v5.3 → v6.7)
- 대시보드 리디자인 (v6.0+):
  - 2컬럼 레이아웃: SourceSidebar (280px, 읽음/안읽음 시각 구분) + SummaryCard + PeerBriefing
  - SummaryCard: "핵심 요약" 배지 + 요약 텍스트 + "키워드" 배지 + "원본 링크" 배지 + 반응(like/dislike) + "소스 수집 관리"/"아이디어 생성" 액션 버튼
  - 아이템 선택 시 자동 viewed 처리 (radarItemUserStatus.status → "viewed")
  - 파이프라인 섹션 (v6.4): Discovery 11단계 현황 (PIPELINE_COLUMNS 기반, 카테고리별 그룹핑, 실 DB 데이터) — 별도 패널, 왼쪽 맞춤
  - 통계 섹션 (v6.4): 4개 핵심 지표 (소스 수집/발굴 건수/활성 파이프라인/사업 제안) — 실 DB 데이터
- 아이디어 워크스페이스: ideas 테이블 + 멀티소스 그룹핑 + 전용 헤더 레이아웃 + 12종 방법론 카드 + 사업 제안 모달 + 소스 상세/삭제 + 분석 시작 플로우 + NotebookLM 스타일 멀티소스 선택 + 선택 기반 분석/채팅 + 좌우 패널 리사이즈/토글 + 제목 인라인 편집 + AI 제목 추천 + 방법론 카드 마크다운 렌더링 + SSE 전용 분석 API (chat agent 루프 우회, 카테고리별 직접 Claude 호출) + 분석 진행률 UI + 소스 Drag & Drop 추가/제거 + 분석 sourceIds 추적 및 stale 감지 + 아이디어→사업제안 생성 플로우 (분석 데이터 매핑, 12 카테고리→10 섹션) (v6.2→v6.14)
- 토큰 사용량 모니터링 (관리자): token_usage_logs 테이블 + 일별 사용량 차트 (모드별 스택 바) + 최근 로그 테이블 + 관리자 API (v6.12)
- Architecture Upgrade (v3 PRD): Graph-First + Topic-Scoped + Durable Agent 기반
  - Graph Layer: JSON-LD 정본 + GraphQueryEngine + Projection (v3 P0-P1)
  - Durable Agent Runtime: AgentSession DO + SSE + Memory Lifecycle (v3 P1)
  - Topic 협업: Team→Topic 세분화 + Scope-based ACL (v3 P2)
  - 파이프라인 통합: Radar/Venture/Lab 양방향 연동 + Cron (v3 P3)
  - Vectorize 시맨틱 검색 + ProfileLearner + Graph 롤백 + SignalRouter Cron + 비용 대시보드 + 팀 지식 베이스 + v3 E2E 테스트 (v3 P4)

**Out-of-scope (PRD §2.2, §7.3)**
- 전사 공식 포털/플랫폼
- 완성형 UX (의도된 인지부하는 설계의 일부)
- 외부 고객/CRM 연동
- 고급 예측/추천 모델
- 제품 수준 KPI 대시보드
- 자동 의사결정 (LLM이 Next/Drop 판단)

### v3 Architecture Upgrade 로드맵

| Phase | 기간 | 핵심 산출물 |
|-------|------|------------|
| P0 구조 정비 | 1주 | 서비스 분리, DB 스키마, @context, ACL stub, Feature Flag |
| P1 Graph+Agent | 2~3주 | Graph CRUD/Query/Projection, Agent DO, SSE, SOUL, 대화/프로파일 UI |
| P2 ACL+Topic+Memory | 2주 | ScopeResolver, Topics UI, Memory Lifecycle, 브리핑 |
| P3 협업+통합 | 2~3주 | collab-worker, Pipeline Bridge, Cron, TokenBudget |
| P4 고도화 | 2주 | ProfileLearner, Graph 롤백 UI, Vectorize, E2E 테스트 |

현재: **Phase 4 완료** (Round 1: ProfileLearner + Graph Rollback UI + Vectorize Graph 연동, Round 2: SignalRouter Cron + Cost Dashboard + Knowledge Base + v3 E2E 테스트)

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

### 디자인 시스템

**타이포그래피**
- Primary: Pretendard Variable (CDN, dynamic subset)
- Fallback: -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif
- CSS: `--axis-font-family-sans` 오버라이드

**색상 가독성 (WCAG AA 기준)**
- 브랜드 배경(`--axis-surface-brand`) 위 텍스트: `--axis-text-on-brand: #FFFFFF` (대비 4.5:1 이상)
- 브랜드 테두리: `--axis-border-brand` (Light/Dark 동일 패턴)
- GNB 활성 탭: `bg-[--axis-surface-brand] text-[--axis-text-brand]` (기존 유지, AA 통과)

**라우팅 정책**
- `/` → `/dashboard` 리다이렉트 (인증 시), 미인증 시 `/login` 리다이렉트

### 페이지 맵 (100개 라우트)

**Core (46개)**
- `/` — `/dashboard` 리다이렉트 (1)
- `/dashboard/*` — 대시보드 레이아웃 + 서브탭 (9): _index/metrics/health/alerts/audit-log/review/recall/assets/shadow
- `/discoveries*` — 목록/생성/상세 (3): _index/new/$id
- `/discoveries/:id/*` — 편집/승격/실험/근거/결정/Gate/Graph/Methods/승인/연장/규제/패턴 (13)
- `/settings*` — Agent 설정 + 조직 설정 (2)
- `/review` — 주간 리뷰 (1)
- `/recall` — 재호출 큐 (1)
- `/methods` — Method Pack 라이브러리 (1)
- `/metrics` — 지표 대시보드 (1)
- `/docs` — 도움말 (1)
- `/login`, `/logout`, `/auth/google*` — 인증 (4): login/logout/auth.google/auth.google.callback
- `/admin*` — 관리자 (3): users/seed/costs
- `/onboarding` — 온보딩 (1)
- `/pending` — 승인 대기 (1)
- `/evidence/duplicates` — 근거 중복 관리 (1)
- `/valueup*` — Value-up 시나리오 (2): valueup/valueup.$id
- `/radar` — Radar 소스 관리 (1)

**Ideas (5 pages + 3 API)**
- `/ideas` — 아이디어 워크스페이스 레이아웃 (전용 헤더 + 드로어 + 좌: SourceInputPanel + 중: Outlet + 우: IdeaChatWrapper)
- `/ideas/_index` — 빈 상태 (소스 추가 제안 칩) / 소스 있으면 Primary 4개 방법론 카드 + 전체 분석 링크 / 소스 클릭 시 상세 카드
- `/ideas/:id` — 아이디어 상세 (12종 방법론 카드: 시장 조사/고객 조사/비판적 사고/BMC/SWOT/규제/사업성/차별화/산업별 사례/가치 사슬/린 캔버스/PESTEL + 좌우 패널 리사이즈/토글)
- `/api/ideas` — 아이디어 CRUD API (GET 목록 + POST 생성 + DELETE 삭제)
- `/api/ideas/:id/sources` — 아이디어-소스 연결 API (GET 목록 + POST 추가 + DELETE 삭제)

**Proposals (7개: 4 pages + 3 API)**
- `/proposals` — 사업제안 레이아웃 (전용 사이드바 + Surface + 진행상황 패널)
- `/proposals/_index` — 파이프라인 칸반 뷰 (5컬럼 아이템 나열) + 분야별 대형 카드 + 지연 제안 알림
- `/proposals/:id` — 사업제안 상세 (메타 카드 + 5개 섹션 + 팀 토론 + 진행상황 패널)
- `/proposals/new` — 새 사업제안 작성 폼
- `/api/proposals` — 제안 CRUD API (GET 목록 + DELETE)
- `/api/proposals/:id/comments` — 댓글 API (GET + POST)
- `/api/proposals/:id/actions` — 액션 아이템 토글 API (POST)

**Lab (실험실) (4 pages + 5 API)**
- `/lab` — 실험실 레이아웃 (4탭: 개요/분석/검토 큐/방법론, 전폭 dot-grid 배경, 모노스페이스 teal accent)
- `/lab/_index` — 개요 (InstrumentPanel 5개 스탯 + GraphViewer (인터랙티브 드래그, 줌/팬) + ExtractionLog)
- `/lab/analysis` — 분석 + 시뮬레이션 통합 (5모드: 패턴/모순/클러스터/중심성/시뮬레이션)
- `/lab/review` — 자동 추출 검토 큐 (승인/반려/편집, LabButton 컴포넌트)
- `/lab/methods` — Method Pack 라이브러리 (12종, Tier 필터, Lab 스타일 적용, 기존 MethodPackCard/DetailDialog 재사용)
- `/api/lab/review` — 검토 API (POST approve/reject/edit)
- `/api/lab/analyze` — 분석 API (POST by type)
- `/api/lab/simulate` — 시뮬레이션 API (POST propagate/scenario/timeline)
- `/api/cron/lab-extract` — LLM 엔티티 자동 추출 Cron
- `/api/cron/lab-analyze` — 관계 분석 자동 실행 Cron

**Venture (13개)**
- `/venture/*` — 스프린트 관리: _index/overview/analytics + sprints(new/_index/$sprintId 6개 서브라우트)

**Agent (3개: 2 pages + 1 API)**
- `/agent` — 에이전트 대화 레이아웃 (세션 목록 280px + Outlet)
- `/agent/_index` — 빈 상태 가이드
- `/agent/:sessionId` — 세션별 대화 뷰 (ChatPanel + Projection 상태)
- `/api/agent/sessions` — 세션 CRUD API (GET 목록 + POST 생성)

**Profile (1 page + 1 API)**
- `/profile` — Graph 기반 프로필 편집 (기본정보/전문분야/관심분야 + USER.md Projection 미리보기)
- `/api/profile/graph` — 프로필 Graph API (GET/PUT/PATCH)

**Topics (3 pages + 9 API)**
- `/topics` — Topic 목록 레이아웃 (280px 사이드바 + Outlet)
- `/topics/_index` — 빈 상태 가이드 + Topic 생성
- `/topics/:id` — Topic 상세 (4탭: 개요/결정/용어/이력 + 인라인 편집 + 멤버 관리 + 아카이브)
- `/api/topics` — Topic CRUD API (GET 목록 + POST 생성)
- `/api/topics/:id` — Topic 상세 API (GET + PATCH + DELETE 아카이브)
- `/api/topics/:id/members` — 멤버 API (GET + POST + DELETE)
- `/api/topics/:id/members/:userId` — 멤버 역할 변경 API (PATCH)
- `/api/topics/:id/decisions` — Decision API (GET 목록 + POST 생성)
- `/api/topics/:id/decisions/:decisionId` — Decision 상세 API (PATCH + DELETE)
- `/api/topics/:id/glossary` — Glossary API (GET 목록 + POST 생성)
- `/api/topics/:id/glossary/:termId` — Glossary 상세 API (PATCH + DELETE)
- `/api/topics/:id/events` — Graph 이벤트 이력 API (GET)

**Briefing (2 pages + 1 API)**
- `/briefing` — 브리핑 레이아웃 (인증 가드)
- `/briefing/_index` — 일간 브리핑 뷰 (마크다운 렌더링 + 새로고침)
- `/api/briefing` — 브리핑 API (GET 조회 + POST 갱신)

**Signals (2 pages)**
- `/signals` — 시그널 레이아웃 (Topic 필터 사이드바 + 상태 필터)
- `/signals/_index` — 시그널 카드 목록 (score/status 배지, Topic 태그, 필터링)

**Knowledge (3 pages + 2 API)**
- `/knowledge` — 팀 지식 베이스 레이아웃
- `/knowledge/_index` — Graph 카드 그리드 (scope별 필터 + 검색 + 통계)
- `/knowledge/:graphId` — Graph 상세 (노드 타입별 그룹 + 관계 목록 + Projection 미리보기)
- `/api/knowledge` — 지식 베이스 API (GET 목록, scope/search 필터)
- `/api/knowledge/:graphId` — 지식 베이스 상세 API (GET 노드/엣지)

**API (37개, proposals/lab API 제외)**
- `/api/chat` — SSE 스트리밍 채팅 (1)
- `/api/conversations*` — 대화 CRUD + 메시지 (2)
- `/api/cron*` — Cron 12개: daily/agent-review/alerts/embeddings/weekly-summary/log-archive/pattern-extract/shadow-analyze/briefing/memory-compact/projection-sync/signal-route
- `/api/venture*` — Venture API 7개: decisions.propose/tasks(claim/report/trigger)/worker/export/analytics.recompute
- `/api/export*` — Export 4개: discoveries/discoveries-json/brief.$id/metrics
- `/api/radar*` — Radar API 6개: runs/sources/trigger/summarize/items.$id.status/items.$id.reaction
- `/api/similar*` — 유사 검색 2개: similar-seeds/similar-sources
- `/api/tenant.switch` — 테넌트 전환 (1)

**라우트 합계**: Core 47 + Ideas 8 + Proposals 7 + Lab 7 + Venture 13 + Agent 4 + Profile 3 + Topics 12 + Briefing 3 + Signals 2 + Knowledge 5 + API 37 + 미분류 2 = **150**

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
├─ TopNav (4탭: 대시보드/아이디어/사업제안/실험실 + 테마토글/설정/유저)
├─ AppShell (SidebarPanel + Surface + ContextPanel)
│  ├─ SidebarPanel (보관함 폴더 + 대화 히스토리) — mode: "chat" | "proposals"
│  │  └─ ArchiveFolderList (1depth 폴더: 중요/리서치/완료)
│  ├─ Surface (main)
│  │  └─ routes/{name}.tsx (각 페이지)
│  └─ ContextPanel (우측 280px, lg+ only) — contextPanel prop
│     └─ 페이지별 콘텐츠 (CollectionStatusPanel / MemoPanel / ProgressPanel)
└─ Outlet (하위 라우트)
```

### 데이터 모델 (66개 테이블)

| 카테고리 | 테이블 수 | 테이블 |
|---------|---------|--------|
| Users & Auth | 4 | users, sessions, tenants, tenant_members |
| Discovery Core | 6 | discoveries, experiments, evidence, event_logs, stages, signal_metadata |
| Ontology/Graph | 5 | ontology_types, context_nodes, context_edges, context_snapshots, evidence_duplicate_candidates |
| v3 Graph Layer | 8 | graphs, graph_events, projections, topics, topic_members, shared_signals, agent_memory_v2, agent_sessions_v2 |
| Methods & Gates | 4 | method_packs, method_runs, gate_packages, assumptions |
| Venture Sprint | 16 | vd_sprints, vd_sprint_scopes, vd_signals, vd_problems, vd_themes, vd_opportunities, vd_evidences, vd_assumptions, vd_premortems, vd_artifacts, vd_decisions, vd_votes, vd_scores, vd_work_events, vd_analytics_snapshots, vd_task_queue |
| Ideas | 2 | ideas, idea_sources |
| Radar | 4 | radar_sources, radar_runs, radar_items, radar_item_user_status |
| Chat & Agent | 3 | conversations, messages, agent_config |
| Indicators & Alerts | 6 | discovery_kpis, kpi_measurements, discovery_links, webhook_configs, alert_rules, alerts |
| Gate/Governance | 1 | gate_approvals |
| Industry Adapters | 2 | industry_adapters, industry_rules |
| Decision Logs | 3 | decision_logs, extracted_patterns, reusable_rules |
| Shadow Mode | 2 | shadow_runs, shadow_configs |
| Value-up Engine | 4 | valueup_assessments, valueup_scores, valueup_scenarios, valueup_checklists |
| Proposals | 6 | proposals, proposal_sections, proposal_milestones, proposal_actions, proposal_comments, proposal_members |
| **합계** | **68** | |

### Agent 시스템 (52개 도구)

| 카테고리 | 도구 수 | 예 |
|---------|--------|-----|
| Discovery CRUD | 11 | create_discovery, transition_stage, promote_discovery, etc. |
| Query | 12 | search_discoveries, get_discovery, get_radar_items, etc. |
| Method | 6 | recommend_method, execute_method, etc. |
| Ontology | 9 | create_node, add_edge, find_related, analyze_patterns, analyze_contradictions, analyze_clusters, analyze_centrality, etc. |
| Indicator | 4 | get_kpi, record_signal, etc. |
| Connector | 2 | link_discoveries, unlink_discoveries |
| Governance | 2 | request_gate_approval, record_decision |
| Alert | 3 | create_alert, send_webhook, etc. |
| BD PoC | 3 | generate_idea_candidates, select_idea_candidate, auto_fill_template |
| **합계** | **52** | |

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
- **프로토타입**: v6.14 + v3 Phase 4 완료 (SignalRouter Cron + Cost Dashboard + Knowledge Base + v3 E2E 테스트)
- **배포**: 프로덕션 (https://dx.minu.best, Cloudflare Pages) — CI/CD via GitHub Actions
- **DB**: 31개 마이그레이션 (0000~0030), 로컬 적용 완료 + 프로덕션 0029까지 적용 + 프로덕션 샘플 데이터 56건 삽입 (proposals 46 + ideas 소스 10)

### 주요 지표
- **라우트**: 150개 (core 47 + ideas 8 + proposals 7 + lab 7 + venture 13 + agent 4 + profile 3 + topics 12 + briefing 3 + signals 2 + knowledge 5 + API 37 + 미분류 2)
- **테이블**: 79개 (core 44 + ideas 2 + venture 16 + proposals 6 + archive 2 + token_usage_logs 1 + v2 8) — 기존 테이블 3개에 컬럼 추가 (evidence, contextNodes, contextEdges)
- **Agent 도구**: 54개 (+5 ontology: analysis 4 + simulation 1, +1 idea: update_idea_analysis)
- **테스트**: 779개 (54 test files, 로컬 통과)
- **테스트 통과율**: 100%
- **Lint 에러**: 0개
- **Build**: ✅ 성공
- **Feature Flag**: 9개 (graphLayer, agentDO, topicCollab, aclScope, memoryLifecycle, vectorizeSearch, pipelineBridge, collabWorker, profileLearner)
- **배포**: 세션 187 미배포 (Phase 4 Round 2 코드 완료, 배포 필요)

### 최근 변경 (세션 187)
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

### 활성 결정사항
- **인증 방식**: Google OAuth (arctic) + Session 기반 (D1), admin/gatekeeper/user/pending 4역할
- **기술 스택**: Remix v2 + D1 + Drizzle + Tailwind CSS 4 + @axis-ds
- **브랜치 전략**: master 단일 브랜치 (Prototype 기간)
- **배포**: Cloudflare Pages (master push → GitHub Actions CI/CD 자동 배포) — Secrets 설정 완료 ✅
- **운영 실험**: 🚀 2026-01-31 시작 (30-60일, 최대 5명, Discovery 5-10건 목표)
- **DB 마이그레이션**: ✅ 28개 (0000~0027) 로컬+프로덕션 적용 완료
- **Cron 설정**: daily (09:00) + agent-review (10:00) + alerts (09:30) + embeddings (15분) + ontology-extract + ontology-analyze + signal-route (cron-job.org)
- **Radar Worker**: 프로덕션 운영 중 (Cron 매일 9:00 KST, 10소스)
- **이메일**: Resend (`noreply@ideaonaction.ai`), cron-job.org 자동 발송

---

## 6. Implementation Log

### 완료 요약

| 카테고리 | 항목 수 | 주요 내용 |
|---------|--------|----------|
| 인프라/스택 | 8 | Remix v2 + D1 + ESLint 9 + SDD 워크플로우 + CF Pages 배포 |
| Discovery 코어 | 12 | CRUD 15라우트 + 11단계 상태 전환 + 실험/근거/결정 + Extension |
| UI/UX | 18 | 반응형 + 차트 + 다크모드 + @axis-ds 토큰 + 접근성 + 한국어화 + AppShell 3-Panel + 3탭 GNB + ContextPanel |
| Agent 시스템 | 12 | v2→v3 재설계 + 48도구 + SSE 스트리밍 + 컨텍스트 최적화 + 채팅 UX + tenant 도구 3개 + BD PoC 도구 3개 |
| v3 파이프라인 | 8 | R0 11단계 + R1 Method Pack + R2 Ontology + R3 KPI/알림/웹훅 |
| v4 Venture Sprint | 10 | 도메인 모듈 + 워커 8핸들러 + Decision Center + Analytics + E2E |
| v4.2 BD Workspace PoC | 6 | PDCA Plan/Design/Do/Check/Act 완료 (96 테스트 + 97% 코드 일치율) |
| v5.0 Layout + Proposals | 2 | 3탭 GNB + ContextPanel + 아이디어 페이지 + 사업제안 Full CRUD (6 테이블 + 7 라우트 + 6 컴포넌트) |
| v5.1 Ideas/Charts/Archive | 3 | F20 아이디어 고도화 (메모+필터+유사검색) + F21 대시보드 차트 통합 + F22 보관함 폴더 CRUD |
| v5.2 Ideas 3-Panel + Proposals | 1 | F23 아이디어 3-Panel 재설계 (소스+가젯탭+채팅) + 사업제안 사이드바 개선 |
| v5.3 Ontology Intelligence | 2 | F24 LLM 엔티티 추출 + 매칭 + 분석 4종, F25 시뮬레이션 (BFS 전파 + LLM 시나리오 + 스냅샷 비교) |
| v6.2 Ideas Workspace | 1 | F26 아이디어 워크스페이스 리디자인 (ideas 테이블 + 전용 헤더 + 6탭 가젯 + 사업 제안 모달) |
| Embeddings | 3 | Vectorize 3개 (Discovery/Evidence/Radar) + Cron 15분 + 시맨틱 검색/중복 감지 |
| 테스트 | 5 | 661개 (44 test files, unit 76 + integration 342 + venture 143 + BD PoC 36 + ontology 64) |
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

**v5.3 Ontology Intelligence**: LLM 자동 엔티티 추출 (Claude Haiku, confidence 기반 필터링), 글로벌 엔티티 매칭 (normalizeLabel() Cross-Discovery), 관계 분석 4종 (패턴 탐지/모순 감지/클러스터/중심성), Cron 2개 (extract+analyze), Agent 도구 5개 추가, UI 5탭 (요약/그래프/분석/검토/시뮬레이션), 검토 큐 (승인/반려/편집), InsightPanel 카드, 마이그레이션 0025, Phase 3 시뮬레이션 (BFS 영향 전파 + LLM 시나리오 + 스냅샷 비교 + SimulationView)

**v5.0 Layout Restructure + Proposals**: Figma 기반 3차 레이아웃 재구성 (3탭 GNB + ContextPanel 우측 패널 + 보관함 사이드바), 아이디어 페이지 (Radar 아이템 재활용 + 메모 패널), 사업제안 Full Feature (6 DB 테이블 + CRUD API 3개 + 4 페이지 라우트 + 6 컴포넌트), 신규 19파일 + 수정 6파일

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
| F18 | Figma 3차 레이아웃 재구성 + 사업제안 기능 (3탭 GNB + ContextPanel + 6 DB 테이블 + CRUD) | v5.0 | ✅ | 25 |
| F19 | Proposals DB 마이그레이션 생성 + 적용 (0021_proposals.sql) | v5.0 | ✅ | 3 |
| F20 | 아이디어 페이지 고도화 (메모 저장 + FilterBar + SimilarSources) | v5.1 | ✅ | 8 |
| F21 | 대시보드 차트 실제 구현 (StatusDonut/WeeklyBar/ExperimentGantt) | v5.1 | ✅ | 1 |
| F22 | 보관함 폴더 CRUD 구현 (DB + API 4개 + 드래그드롭 + SidebarPanel) | v5.1 | ✅ | 9 |
| F23 | 아이디어 3-Panel 재설계 (소스+가젯탭+채팅) + 사업제안 사이드바 개선 | v5.2 | ✅ | 8 |
| F24 | 온톨로지 인텔리전스 Phase 1+2 (LLM 엔티티 추출 + 글로벌 매칭 + 관계 분석 엔진 + UI) | v5.3 | ✅ | 16 |
| F25 | 온톨로지 인텔리전스 Phase 3 (BFS 영향 전파 + LLM 시나리오 + 스냅샷 비교 + 시뮬레이션 UI) | v5.3 | ✅ | 9 |
| F26 | 아이디어 워크스페이스 리디자인 (ideas 테이블 + 전용 헤더 + 6탭 가젯 + 사업 제안 모달) | v6.2 | ✅ | 15 |

