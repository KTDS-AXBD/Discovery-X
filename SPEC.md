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
- Monthly Failure Replay 뷰 (Dead End 큐레이션 + HOLD 재검토 + Failure Pattern 분포)
- Recall 이벤트 추적 서비스 + API (5종 이벤트: HOLD/DROP/RECALL_TRIGGERED/REVIEWED/PATTERN_REUSED)
- 운영 지표 대시보드 (PRD §10 성공 기준 추적: 28일 종결율, 실험 완료율, Recall 이벤트)
- 최소 지표 집계/Export
- Method Pack 12종 라이브러리 + 추천 + 실행 + Gate 패키지 자동 초안 (R1)
- `/venture/*` sub-app 라우팅
- 5일 부트캠프 템플릿 기반 스프린트 운영
- AI Agent 오토파일럿 + HITL Gate 의사결정
- Decision Center (블라인드 투표/집계/재투표)
- Analytics (Depth Score, Effort, Next-ROI 추천)
- venture-worker (D1 폴링 큐 기반)
- Epic 구조 티켓 분해 (A~F: 라우팅/스키마/서비스/API/워커/Analytics)
- BD 워크스페이스: 키워드 구독 → 소스 수집/요약 → Agent 채팅 → 아이디어 생성/편집 → 팀 공유
- `_index.tsx`, `/radar` 통합 3-Pane 레이아웃
- 1개 신규 + 6개 기존 테이블 확장
- 3탭 GNB (아이디어/사업제안/실험실) + 대시보드는 홈(로고) 매핑 + ContextPanel + 보관함 사이드바 레이아웃 재구성
- 아이디어 페이지: Radar 아이템 재활용 + 메모 패널
- 사업제안: DB 6테이블 + CRUD API + 마일스톤/액션/댓글 + 진행상황 패널
- 실험실 (Lab): 3탭 구조 (요구사항/작업 현황/방법론) + 기존 탭(개요/분석/검토 큐/매트릭스) hidden 보관 + 요구사항 표준체계 정렬 (8칸반: 접수→AI검토→담당자검토→반영 | 계획→진행중→완료 | 보류, DX-REQ-{NNN} 자동 부여, 유형×도메인 2축 분류, P0~P3 우선순위, SPEC F항목 연동, 마일스톤 배정) + LLM 자동 엔티티 추출 + 글로벌 엔티티 매칭 + 관계 분석 엔진 + 시뮬레이션 + 인터랙티브 그래프 (드래그/줌/팬) + Method Pack 라이브러리 통합 + 과학 Lab 미학
- 대시보드 리디자인:
  - 2컬럼 레이아웃: SourceSidebar (280px, 읽음/안읽음 시각 구분) + SummaryCard + PeerBriefing
  - SummaryCard: "핵심 요약" 배지 + 요약 텍스트 + "키워드" 배지 + "원본 링크" 배지 + 반응(like/dislike) + "소스 수집 관리"/"아이디어 생성" 액션 버튼
  - 아이템 선택 시 자동 viewed 처리 (radarItemUserStatus.status → "viewed")
  - 파이프라인 섹션: Discovery 11단계 현황 (PIPELINE_COLUMNS 기반, 카테고리별 그룹핑, 실 DB 데이터) — 별도 패널, 왼쪽 맞춤
  - 통계 섹션: 4개 핵심 지표 (소스 수집/발굴 건수/활성 파이프라인/사업 제안) — 실 DB 데이터
- 아이디어 워크스페이스: ideas 테이블 + 멀티소스 그룹핑 + 전용 헤더 레이아웃 + 12종 방법론 카드 + 사업 제안 모달 + 소스 상세/삭제 + 분석 시작 플로우 + NotebookLM 스타일 멀티소스 선택 + 선택 기반 분석/채팅 + 좌우 패널 리사이즈/토글 + 제목 인라인 편집 + AI 제목 추천 + 방법론 카드 마크다운 렌더링 + SSE 전용 분석 API (chat agent 루프 우회, 카테고리별 직접 Claude 호출) + 분석 진행률 UI + 소스 Drag & Drop 추가/제거 + 분석 sourceIds 추적 및 stale 감지 + 아이디어→사업제안 생성 플로우 (분석 데이터 매핑, 12 카테고리→10 섹션)
- 토큰 사용량 모니터링 (관리자): token_usage_logs 테이블 + 일별 사용량 차트 (모드별 스택 바) + 최근 로그 테이블 + 관리자 API
- AI 동료 파이프라인 + 인간 워크플로우 개선: Radar→Ideas→Discovery 자동 파이프라인 (system-agent, HYPOTHESIS까지) + Ideas→Discovery 수동 전환 + AI Discovery 인수(claim) 플로우 + ai_pipeline_runs 테이블
- PRD v3.1 소규모 업데이트:
  - 앱 내 온보딩 튜토리얼: 최초 접속 감지 → 3단계 spotlight 모달 (파이프라인/아이디어→제안/협업) + Skip/재실행 지원
  - 요구사항 수집/관리: feature_requests 테이블 + 4단계 상태(OPEN→IN_REVIEW→ACCEPTED/REJECTED) + 카드 뷰 + 필터
  - AI Agent 응답 품질 고도화: Evidence 자동 인용 + '모름' 명시 강화 + Memory 결정 중심 요약 + SOUL 커스터마이징 UI
- Architecture Upgrade (PRD v3): Graph-First + Topic-Scoped + Durable Agent 기반
  - Graph Layer: JSON-LD 정본 + GraphQueryEngine + Projection (Phase 0-1)
  - Durable Agent Runtime: AgentSession DO + SSE + Memory Lifecycle (Phase 1)
  - Topic 협업: Team→Topic 세분화 + Scope-based ACL (Phase 2)
  - 파이프라인 통합: Radar/Venture/Lab 양방향 연동 + Cron (Phase 3)
  - Vectorize 시맨틱 검색 + 검색 UI + ProfileLearner + Graph 롤백 + SignalRouter Cron + 비용 대시보드 + 팀 지식 베이스 + E2E 테스트 (Phase 4)

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

현재: **P1 운영 기능 완료** (Failure Replay + Recall 추적 + 운영 지표 대시보드 + 테스트 1,697개) — Architecture P0~P4 전체 완료, 운영 미팅/지표 기능 구현
- Phase 5A (보안·무결성): **완료** — Agent Graph 수정 제한, @id 네이밍 강화, SOUL 역할 템플릿, JSON Schema, ACL policies 분리, 403 메시지 개선
- Phase 5B (agent-worker DO): **완료** — AgentSessionDO 클래스, Worker 라우팅, HMAC 인증, SSE 스트리밍, alarm flush, 429 동시성, api.chat.ts DO 위임
- Phase 5C (collab-worker + 스키마): **완료** — collab-worker Cron/fetch 핸들러, notification_queue, tenants 확장(profile_ld/rules_md), cron_logs
- Phase 5D (품질 고도화): **완료** — Vectorize memory+signals namespace, 토큰 예산 초과 UI, Topics 검색/필터, Feature Flag 정리(5개 true 전환)
- 요구사항 Agent 개선: **완료** — 등록 시 AI 자동 검토, OUT_OF_SCOPE 자동 보류, 보류→접수 DnD, 드래그 시각 피드백

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

Flow F-2: Monthly Failure Replay (30분)
  → Dead End 3건 큐레이션 + Revisit 도래 HOLD 재검토
  → Failure Pattern 정제 (태그/요약/근거 링크)
  → Not Now 재결정 (Next/Dead End/Not Now 갱신)

Flow G: 방법론 실행 (R1)
  → Method Pack 추천 → 실행 시작 → structured output 저장
  → Gate 패키지 자동 초안 생성

Flow H: Venture Discovery Sprint
  → 스프린트 생성 (산업/범위 선택) → status=DRAFT
  → Day 1: Scope 확정 (HITL) → Signal/Problem 수집 → Long List v1
  → Day 2: 카드 정제 → Gate1 준비 (블라인드 점수)
  → Gate 1 (HITL): Quick Score 집계/승인 → Shortlist 6~8
  → Day 3: Deep Dive 자동 생성 (Assumption/Pre-mortem/Lean Canvas 초안)
  → Gate 2 (HITL): 재평가/토론/재투표 → Final 2~3 확정
  → Day 5: Packaging (피치/요약문서) + 리허설 (Q&A 레드팀)
  → status=COMPLETED → ARCHIVED

Flow I: BD 워크스페이스
  → 키워드/태그 구독 등록 → 소스 자동 수집 (RSS/URL)
  → 소스 클릭 → 즉시 요약 (한줄 + 핵심 포인트 3~5개)
  → "대화 시작" → 소스 컨텍스트 Agent 채팅
  → 연관 소스 추천 (Vectorize, 최소 3개)
  → 아이디어 후보 자동 생성 (최대 3개)
  → 1개 선택 → 아이디어 템플릿 자동 채움 (가설/근거/타겟/가치 제안)
  → 수동 편집 → 팀 공유

Flow J: AI 동료 파이프라인
  → Cron (09:30 KST, Radar 수집 직후) → 미처리 radar_items 로드 (최대 3개)
  → Claude Haiku: 주제별 클러스터링 → 클러스터당 아이디어 생성 (createdByAgent=1, Sonnet)
  → Claude: 아이디어 평가 (confidence ≥ 70) → Discovery 자동 생성
  → DISCOVERY → IDEA_CARD (promote, 가설+실험) → HYPOTHESIS (transition)
  → Owner: system-agent, sourceIdeaId 연결
  → 인간 인수: AI Discovery 상세에서 "인수하기" → Owner 변경

Flow K: Ideas → Discovery 수동 전환
  → 아이디어 상세에서 "Discovery로 전환" 클릭
  → 가설/최소행동/기한/기대근거 입력 모달
  → Discovery 생성 + IDEA_CARD 승격 (sourceIdeaId 연결)
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

### 페이지 맵 (163개 라우트)

**Core (37개)**
- `/` — `/dashboard` 리다이렉트 (1)
- `/dashboard/*` — 대시보드 레이아웃 + 서브탭 (4): _index/review/recall + layout
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
- `/radar` — Radar 소스 관리 (1)
- `/admin/monitoring` — 시스템 모니터링 대시보드 (1)
- `/api/health` — 시스템 헬스체크 API (1)

**Ideas (5 pages + 3 API)**
- `/ideas` — 아이디어 워크스페이스 레이아웃 (전용 헤더 + 드로어 + 좌: SourceInputPanel + 중: Outlet + 우: IdeaChatWrapper)
- `/ideas/_index` — 빈 상태 (소스 추가 제안 칩) / 소스 있으면 Primary 4개 방법론 카드 + 전체 분석 링크 / 소스 클릭 시 상세 카드
- `/ideas/:id` — 아이디어 상세 (12종 방법론 카드: 시장 조사/고객 조사/비판적 사고/BMC/SWOT/규제/사업성/차별화/산업별 사례/가치 사슬/린 캔버스/PESTEL + 좌우 패널 리사이즈/토글)
- `/api/ideas` — 아이디어 CRUD API (GET 목록 + POST 생성 + DELETE 삭제)
- `/api/ideas/:id/sources` — 아이디어-소스 연결 API (GET 목록 + POST 추가 + DELETE 삭제)
- `/api/ideas/:id/analysis` — 분석 결과 조회
- `/api/ideas/:id/analyze` — SSE 분석 실행
- `/api/ideas/:id/create-proposal` — 아이디어→사업제안 변환
- `/api/ideas/:id/suggest-title` — AI 제목 추천
- `/api/ideas/memo` — 메모 API
- `/api/ideas/seed` — Seed 연동 API
- `/api/ideas/sources` — 소스 벌크 API

**Proposals (7개: 4 pages + 4 API)**
- `/proposals` — 사업제안 레이아웃 (전용 사이드바 + Surface + 진행상황 패널)
- `/proposals/_index` — 파이프라인 칸반 뷰 (5컬럼 아이템 나열) + 분야별 대형 카드 + 지연 제안 알림
- `/proposals/:id` — 사업제안 상세 (메타 카드 + 5개 섹션 + 팀 토론 + 진행상황 패널)
- `/proposals/new` — 새 사업제안 작성 폼
- `/api/proposals` — 제안 CRUD API (GET 목록 + DELETE)
- `/api/proposals/:id/comments` — 댓글 API (GET + POST)
- `/api/proposals/:id/actions` — 액션 아이템 토글 API (POST)
- `/api/proposals/:id/slides` — 슬라이드 덱 API (GET 목록 + POST 생성 + DELETE)

**Lab (실험실) (4 pages + 5 API)**
- `/lab` — 실험실 레이아웃 (3탭: 요구사항/작업 현황/방법론, 전폭 dot-grid 배경, 모노스페이스 teal accent)
- `/lab/_index` — 요구사항 (8칸반: 접수→AI검토→담당자검토→반영 | 계획→진행중→완료 | 보류, DnD + PlanDialog 표준분류)
- `/lab/work-status` — 작업 현황 (개발 라이프사이클 카드 + 작업계획 카드, REQ코드/분류/SPEC연동 표시)
- `/lab/analysis` — 분석 + 시뮬레이션 통합 (5모드: 패턴/모순/클러스터/중심성/시뮬레이션) *(hidden)*
- `/lab/review` — 자동 추출 검토 큐 (승인/반려/편집, LabButton 컴포넌트) *(hidden)*
- `/lab/methods` — Method Pack 라이브러리 (12종, Tier 필터, Lab 스타일 적용, 기존 MethodPackCard/DetailDialog 재사용)
- `/api/lab/review` — 검토 API (POST approve/reject/edit)
- `/api/lab/analyze` — 분석 API (POST by type)
- `/api/lab/simulate` — 시뮬레이션 API (POST propagate/scenario/timeline)
- `/api/cron/lab` — LLM 엔티티 추출 + 관계 분석 통합 Cron (mode=extract|analyze)

**Venture** *(아카이브됨, 세션 228 — 52파일 삭제)*

**Agent (3개: 2 pages + 1 API)**
- `/agent` — 에이전트 대화 레이아웃 (세션 목록 280px + Outlet)
- `/agent/_index` — 빈 상태 가이드
- `/agent/:sessionId` — 세션별 대화 뷰 (ChatPanel + Projection 상태)
- `/api/agent/sessions` — 세션 CRUD API (GET 목록 + POST 생성)

**Profile (1 page + 1 API)**
- `/profile` — Graph 기반 프로필 편집 (기본정보/전문분야/관심분야 + USER.md Projection 미리보기 + 나의 Agent 설정)
- `/api/profile/graph` — 프로필 Graph API (GET/PUT/PATCH)

**Requests (1 page + 4 API)**
- `/requests` — 요구사항 목록 (카드 뷰, 상태/우선순위 필터, 생성 폼)
- `/api/requests` — 요구사항 API (GET 목록 + POST 생성)
- `/api/requests/:id` — 요구사항 상세 API (GET + PATCH 상태변경 + DELETE)
- `/api/requests/:id/review` — AI 자동 검토 API (POST)
- `/api/requests/:id/plan` — 작업 계획 API (GET + POST)

**Onboarding API (1 API)**- `/api/onboarding` — 온보딩 완료/재시작 API (PATCH)

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

**Briefing** *(아카이브됨, 세션 228)*

**Market** *(삭제됨, 세션 227 — Dead Code 정리)*

**Matrix (12개: 3 pages + 9 API)**
- `/lab/matrix` — Matrix 레이아웃
- `/lab/matrix/_index` — Heatmap 인덱스
- `/lab/matrix/:cellId` — Cell 상세
- `/api/matrix/industries` — 산업 목록 API
- `/api/matrix/functions` — 기능 목록 API
- `/api/matrix/cells` — 전체 Cell API
- `/api/matrix/:cellId` — Cell CRUD API
- `/api/matrix/:cellId/scores` — 스코어 API
- `/api/matrix/:cellId/consensus` — 합의 API
- `/api/matrix/:cellId/topics` — Cell-Topic 연결 API
- `/api/matrix/heatmap` — 히트맵 API
- `/api/matrix/config` — 설정 API

**Signals (2 pages)**
- `/signals` — 시그널 레이아웃 (Topic 필터 사이드바 + 상태 필터)
- `/signals/_index` — 시그널 카드 목록 (score/status 배지, Topic 태그, 필터링)

**Knowledge** *(아카이브됨, 세션 228)*

**API (37개, proposals/lab API 제외)**
- `/api/chat` — SSE 스트리밍 채팅 (1)
- `/api/conversations*` — 대화 CRUD + 메시지 (2)
- `/api/cron*` — Cron 10개 라우트: daily/agent-review/embeddings/weekly-summary/signal-route/matrix-scoring/vectorize/lab/ai-pipeline/maintenance (alerts/log-archive/pattern-extract/memory-compact/projection-sync은 daily/maintenance에 통합)
- ~~`/api/venture*`~~ — *(아카이브됨, 세션 228)*
- `/api/export*` — Export 4개: discoveries/discoveries-json/brief.$id/metrics
- `/api/radar*` — Radar API 6개: runs/sources/trigger/summarize/items.$id.status/items.$id.reaction
- `/api/similar*` — 유사 검색 2개: similar-seeds/similar-sources
- `/api/search` — 통합 검색 API (4개 엔티티 병렬, Vectorize/FTS5/LIKE fallback)
- `/search` — 통합 검색 페이지 (텍스트/시맨틱 모드, 카테고리 탭)
- `/api/tenant.switch` — 테넌트 전환 (1)
- `/api/admin/token-budget` — 토큰 예산 관리
- `/api/admin/token-usage` — 토큰 사용량 조회
- `/api/collab/worker` — 협업 Worker
- `/api/cron/matrix-scoring` — Matrix 스코어링
- `/api/cron/vectorize` — 통합 벡터화 (type=graph|memory|signal)
- `/api/cron/lab` — Lab 통합 (mode=extract|analyze)
- `/api/folders` — 폴더 목록/생성 API
- `/api/folders/:id` — 폴더 상세/수정/삭제 API
- `/api/folders/:id/items` — 폴더 아이템 관리 API
- `/api/folders/reorder` — 폴더 정렬 API
- `/api/graph/:id/history` — Graph 이력
- `/api/graph/:id/rollback` — Graph 롤백
- `/api/proposals/:id/likes` — 좋아요 API
- `/api/proposals/:id/members` — 멤버 API
- `/api/proposals/:id/milestones` — 마일스톤 API
- `/api/proposals/categories` — 카테고리 API
- `/api/recall-events` — 재호출 이벤트 API

**라우트 합계**: **163** (Venture/Knowledge/Briefing 아카이브 반영)

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
├─ TopNav (3탭: 아이디어/사업제안/실험실 + 테마토글/설정/유저 + 사용법 가이드)
├─ AppShell (SidebarPanel + Surface + ContextPanel)
│  ├─ SidebarPanel (보관함 폴더 + 대화 히스토리) — mode: "chat" | "proposals"
│  │  └─ ArchiveFolderList (1depth 폴더: 중요/리서치/완료)
│  ├─ Surface (main)
│  │  └─ routes/{name}.tsx (각 페이지)
│  └─ ContextPanel (우측 280px, lg+ only) — contextPanel prop
│     └─ 페이지별 콘텐츠 (CollectionStatusPanel / MemoPanel / ProgressPanel)
└─ Outlet (하위 라우트)
```

### 데이터 모델 (111개 테이블 — Drizzle 84 + 마이그레이션 전용 27)

| 카테고리 | 테이블 수 | 테이블 |
|---------|---------|--------|
| Users & Auth | 4 | users, sessions, tenants, tenant_members |
| Discovery Core | 5 | discoveries (+sourceIdeaId, +aiProcessedAt on radar_items), experiments, evidence, event_logs, stages |
| Ontology/Graph | 5 | ontology_types, context_nodes, context_edges, context_snapshots, evidence_duplicate_candidates |
| v3 Graph Layer | 9 | graphs, graph_events, projections, topics, topic_members, shared_signals, agent_memory_v2, agent_sessions_v2, acl_audit_logs |
| Methods & Gates | 4 | method_packs, method_runs, gate_packages, assumptions |
| Venture Sprint (아카이브) | 16 | vd_sprints, vd_sprint_scopes, vd_signals, vd_problems, vd_themes, vd_opportunities, vd_evidences, vd_assumptions, vd_premortems, vd_artifacts, vd_decisions, vd_votes, vd_scores, vd_work_events, vd_analytics_snapshots, vd_task_queue |
| Ideas | 2 | ideas (+createdByAgent), idea_sources |
| AI Pipeline | 1 | ai_pipeline_runs |
| Radar | 4 | radar_sources, radar_runs, radar_items, radar_item_user_status |
| Chat & Agent | 3 | conversations, messages, agent_config |
| Indicators & Alerts | 6 | discovery_kpis, kpi_measurements, discovery_links, webhook_configs, alert_rules, alerts |
| Gate/Governance | 1 | gate_approvals |
| Industry Adapters | 2 | industry_adapters, industry_rules |
| Decision Logs | 3 | decision_logs, extracted_patterns, reusable_rules |
| Shadow Mode | 2 | shadow_runs, shadow_configs |
| Value-up Engine | 4 | valueup_assessments, valueup_scores, valueup_scenarios, valueup_checklists |
| Proposals | 8 | proposals, proposal_sections, proposal_milestones, proposal_actions, proposal_comments, proposal_members, proposal_likes, proposal_categories |
| Archive | 2 | archive_folders, archive_folder_items |
| Token Usage | 1 | token_usage_logs |
| Cost Management | 12 | usage_events, cost_estimates, model_catalog, price_catalog, budget_policies, budget_usage_cache, routing_policies, policy_provider_priorities, policy_purpose_rules, policy_degrade_rules, routing_decisions, daily_usage_aggregates |
| Matrix | 7 | industries, functions, matrix_cells, individual_scores, consensus_scores, cell_topic_map, scoring_config |
| Worker/Infra | 2 | notification_queue, cron_logs |
| FTS | 1 | discoveries_fts |
| Requests | 5 | feature_requests, request_reviews, request_events, work_plans, work_plan_runs |
| **합계** | **109** | |

> Drizzle 스키마 미정의 25개: Venture Sprint 16 (아카이브) + Shadow Mode 2 + Value-up Engine 4 + Worker/Infra 2 + FTS 1 — 마이그레이션 SQL에만 존재

### Agent 시스템 (77개 도구)

| 카테고리 | 도구 수 | 예 |
|---------|--------|-----|
| Discovery CRUD | 11 | create/update/promote_discovery, transition_stage, add/complete_experiment, add_evidence, decide_*, request_extension |
| Query | 14 | list/get_discovery*, search_similar, get_metrics/radar/review/recall, list_users, validate_evidence, compare_discoveries, get_gate_package, generate_digest |
| Tag | 2 | tag_discovery, remove_discovery_tag |
| Method | 5 | list_method_packs, recommend_methods, draft_gate_package, start/complete_method_run |
| Ontology | 10 | query_graph, extract/link_entities, get/review_duplicate, analyze_patterns/contradictions/clusters/centrality, simulate_scenario |
| Indicator | 4 | get_kpi_status, get_pipeline_health, register_kpi, record_kpi_measurement |
| Connector | 2 | get_linked/link_discoveries |
| Governance | 2 | request/submit_gate_approval |
| Alert | 3 | get_alerts, acknowledge_alert, manage_webhook |
| Strategic | 7 | get_industry_context, extract_decision_pattern, apply_reusable_rule, audit_trail, regulatory_compliance, etc. |
| Tenant | 2 | get_tenant_info, manage_tenant_members |
| BD PoC/Ideas | 4 | generate/select_idea_candidates, auto_fill_template, update_idea_analysis |
| Matrix | 3 | query_matrix_heatmap, get_cell_signals, get_top_cells |
| Requirements | 3 | classify/review/plan_feature_request |
| **합계** | **72** | |

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
- **시스템 (SemVer SSOT)**: 0.6.0 (package.json)
- **배포**: 프로덕션 (https://dx.minu.best, Cloudflare Pages) — CI/CD via GitHub Actions
- **DB**: 58개 마이그레이션 SQL (0000~0056), 로컬 적용 완료

### 주요 지표
- **라우트**: 167개
- **테이블**: 111개
- **Agent 도구**: 77개
- **코드**: ~81,000줄 (~488파일)
- **테스트**: 2,243개 (149 test files, 로컬 통과)
- **테스트 통과율**: 100%
- **Lint 에러**: 0개
- **Build**: ✅ 성공
- **부하 테스트**: Artillery v2.0.30 — 4개 시나리오 (health, api-crud, chat-stream, spike)
- **Feature Flag**: 5개 — **5/5 true** (미사용 7개 제거)
- **@theme inline**: 104 토큰 등록, var() 1,752→122 (93.0% 감소, 163 파일)
- **@axis-ds 컴포넌트**: 15/28 활용
- **radar-worker**: scorer 4단계 fallback (Anthropic→OpenAI→Gemini→Workers AI) + failedProviders 스킵
- **배포**: 세션 297 — 요구사항 Agent 서비스 테스트 88개 추가
- **Cron 등록**: cron-job.org 14개 등록 완료 (ai-pipeline 09:30 KST 포함)
- **Vectorize 인덱스**: dx-graph-embeddings, dx-memory-embeddings, dx-signal-embeddings (512d cosine, 프로덕션 생성 완료)

### 세션 변경 이력

> 전체 세션 히스토리: [docs/CHANGELOG.md](docs/CHANGELOG.md)

### 활성 결정사항
- **인증 방식**: Google OAuth (arctic) + Session 기반 (D1), admin/gatekeeper/user/pending 4역할
- **기술 스택**: Remix v2 + D1 + Drizzle + Tailwind CSS 4 + @axis-ds
- **브랜치 전략**: master 단일 브랜치 (Prototype 기간)
- **배포**: Cloudflare Pages (master push → GitHub Actions CI/CD 자동 배포) — Secrets 설정 완료 ✅
- **운영 실험**: 🚀 2026-01-31 시작 (30-60일, 최대 5명, Discovery 5-10건 목표)
- **DB 마이그레이션**: ✅ 58개 SQL (0000~0056) 로컬+프로덕션 적용 완료
- **Cron 설정**: 10개 라우트 (daily/agent-review/embeddings/weekly-summary/signal-route/matrix-scoring/maintenance/vectorize/lab/ai-pipeline) + cron-job.org 14개 등록 완료
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
| F27 | AI 동료 파이프라인 + 인간 워크플로우 (Radar→Ideas→Discovery 자동 + Ideas→Discovery 수동 전환 + AI 인수) | v6.25 | ✅ | 5 |
| F28 | AI Agent 응답 품질 고도화 (Evidence 인용 + '모름' 명시 + Memory 요약 개선 + SOUL 커스터마이징 UI) | v3.1 | ✅ | 5 |
| F29 | 요구사항 수집/관리 (feature_requests 등 5 테이블 + API 4개 + 카드 뷰 UI + AI 자동 검토) | v3.1 | ✅ | 9 |
| F30 | 앱 내 온보딩 튜토리얼 (3단계 spotlight 모달 + 최초 접속 감지 + Skip/재실행) | v3.1 | ✅ | 6 |
| F31 | 대시보드 통계 기간 필터 추가 (DX-REQ-001, P3) | v0.6.0 | ✅ | - |
| F32 | 공통 서비스 레이어 패키지 분리 (DX-REQ-002, P3) | v0.7.0 | 🔧 | - |
| F33 | Agent 실행 모듈 독립 패키지화 (DX-REQ-003, P3) | v0.7.0 | 📋 | - |
| F34 | 공통 UI 컴포넌트 라이브러리 분리 (DX-REQ-004, P3) | v0.7.0 | 📋 | - |
| **F35** | **사업제안 PPT 슬라이드 자동 생성 Agent (DX-REQ-005, P1)** | **v0.6.0** | ✅ | 14 |
| **F36** | **자동 MVP 구축 Agent — 형상화→코드 스캐폴딩 (DX-REQ-006, P1)** | **v0.6.0** | ✅ | 8 |
| F37 | 작업 현황 가시성 개선 — 카드 그리드→컴팩트 리스트 뷰 (DX-REQ-007, P2) | v0.5.0 | ✅ | 1 |
| F38 | MWC 2026 파이프라인 시나리오 — Radar→Ideas→Proposals 풀 파이프라인 데모 (DX-REQ-008, P1) | v0.5.0 | ✅ | - |
| **F39** | **PPT 슬라이드 생성 MCP 서버 — 외부 재사용 (DX-REQ-009, P1)** | **v0.6.0** | ✅ | 11 |
| F40 | LLM API Credit 소진 대응 — 구독 토큰 기반 분석 + 사용량 모니터링 (DX-REQ-011, P1) | v0.7.0 | 🔧 | - |
| F41 | 아이템 수집 시스템 고도화 — 채널 CRUD + 품질 판단 + 수동 수집 + 채널 분류 (DX-REQ-012, P1) | v0.7.0 | 🔧 | - |
| F42 | 요구사항 인터뷰 스킬 설치 — 인터뷰→PRD→외부 AI 다중 검토→착수 판단 워크플로우 (DX-REQ-013, P2) | v0.7.0 | ✅ | 6 |
| F43 | 인터뷰 스킬 검토 고도화 — 모델 선택 + API 자동 호출 + 프롬프트 개선 + 결과 파싱 (DX-REQ-014, P1) | v0.7.0 | 📋 | - |

