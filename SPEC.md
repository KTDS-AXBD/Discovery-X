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
- 3탭 GNB + ContextPanel + 보관함 사이드바 레이아웃 재구성 (v5.0)
- 아이디어 페이지: Radar 아이템 재활용 + 메모 패널 (v5.0)
- 사업제안: DB 6테이블 + CRUD API + 마일스톤/액션/댓글 + 진행상황 패널 (v5.0)
- 온톨로지 인텔리전스: LLM 자동 엔티티 추출 + 글로벌 엔티티 매칭 + 관계 분석 엔진 (v5.3)

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

### 페이지 맵 (100개 라우트)

**Core (46개)**
- `/` — 채팅 (메인) (1)
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
- `/admin*` — 관리자 (2): users/seed
- `/onboarding` — 온보딩 (1)
- `/pending` — 승인 대기 (1)
- `/evidence/duplicates` — 근거 중복 관리 (1)
- `/valueup*` — Value-up 시나리오 (2): valueup/valueup.$id
- `/radar` — Radar 소스 관리 (1)

**Ideas (2개)**
- `/ideas` — 아이디어 3-Panel 레이아웃 (좌: SourceInputPanel + 중: Outlet + 우: IdeaChatWrapper)
- `/ideas/:id` — 아이디어 상세 (제목바 + 8개 가젯 탭: 시장 예시/규제/시장 조사/고객 조사/사업성 검증/자금원/경쟁사/특허)

**Proposals (7개: 4 pages + 3 API)**
- `/proposals` — 사업제안 레이아웃 (전용 사이드바 + Surface + 진행상황 패널)
- `/proposals/_index` — 첫 제안 자동 선택 (redirect) / 빈 상태 폴백
- `/proposals/:id` — 사업제안 상세 (메타 카드 + 5개 섹션 + 팀 토론 + 진행상황 패널)
- `/proposals/new` — 새 사업제안 작성 폼
- `/api/proposals` — 제안 CRUD API (GET 목록 + DELETE)
- `/api/proposals/:id/comments` — 댓글 API (GET + POST)
- `/api/proposals/:id/actions` — 액션 아이템 토글 API (POST)

**Ontology Intelligence (4 pages + 5 API)**
- `/ontology` — 온톨로지 레이아웃 (4탭: 요약/글로벌 그래프/분석/검토 큐)
- `/ontology/_index` — 온톨로지 요약 대시보드 (통계 카드 + 최근 추출)
- `/ontology/graph` — 글로벌 엔티티 그래프 (GraphViewer 재활용)
- `/ontology/analysis` — 관계 분석 결과 (패턴/모순/클러스터/중심성)
- `/ontology/review` — 자동 추출 검토 큐 (승인/반려/편집)
- `/api/ontology/review` — 검토 API (POST approve/reject/edit)
- `/api/ontology/analyze` — 분석 API (POST by type)
- `/api/cron/ontology-extract` — LLM 엔티티 자동 추출 Cron
- `/api/cron/ontology-analyze` — 관계 분석 자동 실행 Cron

**Venture (13개)**
- `/venture/*` — 스프린트 관리: _index/overview/analytics + sprints(new/_index/$sprintId 6개 서브라우트)

**API (30개, proposals/ontology API 제외)**
- `/api/chat` — SSE 스트리밍 채팅 (1)
- `/api/conversations*` — 대화 CRUD + 메시지 (2)
- `/api/cron*` — Cron 8개: daily/agent-review/alerts/embeddings/weekly-summary/log-archive/pattern-extract/shadow-analyze
- `/api/venture*` — Venture API 7개: decisions.propose/tasks(claim/report/trigger)/worker/export/analytics.recompute
- `/api/export*` — Export 4개: discoveries/discoveries-json/brief.$id/metrics
- `/api/radar*` — Radar API 5개: runs/sources/trigger/summarize/items.$id.status
- `/api/similar*` — 유사 검색 2개: similar-seeds/similar-sources
- `/api/tenant.switch` — 테넌트 전환 (1)

**라우트 합계**: Core 46 + Ideas 2 + Proposals 7 + Ontology 9 + Venture 13 + API 30 + 미분류 2 (dashboard.tsx layout) = **109**

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
├─ TopNav (3탭: 대시보드/아이디어/사업제안 + 테마토글/설정/유저)
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
| Methods & Gates | 4 | method_packs, method_runs, gate_packages, assumptions |
| Venture Sprint | 16 | vd_sprints, vd_sprint_scopes, vd_signals, vd_problems, vd_themes, vd_opportunities, vd_evidences, vd_assumptions, vd_premortems, vd_artifacts, vd_decisions, vd_votes, vd_scores, vd_work_events, vd_analytics_snapshots, vd_task_queue |
| Radar | 4 | radar_sources, radar_runs, radar_items, radar_item_user_status |
| Chat & Agent | 3 | conversations, messages, agent_config |
| Indicators & Alerts | 6 | discovery_kpis, kpi_measurements, discovery_links, webhook_configs, alert_rules, alerts |
| Gate/Governance | 1 | gate_approvals |
| Industry Adapters | 2 | industry_adapters, industry_rules |
| Decision Logs | 3 | decision_logs, extracted_patterns, reusable_rules |
| Shadow Mode | 2 | shadow_runs, shadow_configs |
| Value-up Engine | 4 | valueup_assessments, valueup_scores, valueup_scenarios, valueup_checklists |
| Proposals | 6 | proposals, proposal_sections, proposal_milestones, proposal_actions, proposal_comments, proposal_members |
| **합계** | **66** | |

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
- **프로토타입**: v5.4 Dashboard Wireframe Alignment + UI Polish
- **배포**: 프로덕션 (https://dx.minu.best, Cloudflare Pages) — CI/CD via GitHub Actions ✅ 배포 완료
- **DB**: 26개 마이그레이션 (0000~0025), 로컬+프로덕션 적용 완료 ✅

### 주요 지표
- **라우트**: 121개 (core 46 + ideas 2 + proposals 8 + ontology 9 + venture 13 + market 3 + API 30 + folders 4 + 기타 6)
- **테이블**: 68개 (core 44 + venture 16 + proposals 6 + archive 2) — 기존 테이블 3개에 컬럼 추가 (evidence, contextNodes, contextEdges)
- **Agent 도구**: 52개 (+4 ontology analysis)
- **테스트**: 597개 (unit 76 + integration 342 + venture 143 + BD PoC 36)
- **테스트 통과율**: 100%
- **Lint 에러**: 0개
- **Build**: ✅ 성공

### 최근 변경 (세션 144)
**대시보드 와이어프레임 정합 + Ideas/Proposals UI 디테일 수정**:
- ✅ 대시보드: "특집 현황" 제거 → "요약/정리" 기사 뷰 (선택된 소스의 제목/본문/키워드/원본링크)
- ✅ 대시보드: 소스 목록 summary 제거 → 제목만 1줄 + 클릭 선택 (첫 항목 자동 선택)
- ✅ 대시보드: 레이아웃 50/50 → 35/65 (`grid-cols-[1fr_2fr]`)
- ✅ 대시보드: "데이터 분류"+"통계" 제거 → "피어브리핑" 4탭(아이디어/사업제안/컨설팅/검증) + 2열 그리드
- ✅ 신규 컴포넌트: PeerBriefingSection.tsx (탭 UI + 2-column 아이템 리스트)
- ✅ Ideas: 소스 카드 → 타입 아이콘(PDF/YouTube/링크) + 1줄 제목 + 빨간 점(새 항목)
- ✅ Ideas: 입력 안내문 2줄로 변경 (URL/PDF/YouTube/텍스트 지원 안내)
- ✅ Ideas: 채팅 하단 바 → "Claude Sonnet 4.5" pill + 첨부/설정 아이콘 (UI only)
- ✅ Proposals: 액션 아이템 담당자 항상 표시 ("미지정" 포함)
- ✅ 온톨로지 테스트 5개 추가 (unit 3 + integration 2)
- ✅ 2 Worker 병렬 작업 (StatusOverview + PeerBriefing 동시 구현)
- ✅ typecheck 0 errors, lint 0 errors, 597 tests 통과, 프로덕션 배포 완료

### 이전 변경 (세션 143)
**온톨로지 인텔리전스 Phase 1 + Phase 2 구현**:
- ✅ Phase 1 — 자동 엔티티 추출 파이프라인:
  - DB 스키마 확장: evidence에 `ontologyExtractedAt`, contextNodes에 `globalEntityId`/`confidence`/`autoGenerated`/`reviewed`, contextEdges에 동일 3컬럼
  - LLM 추출 엔진 (`app/lib/ontology/extractor.ts`): Claude Haiku로 Evidence 텍스트에서 엔티티/관계 자동 추출 (confidence ≥0.8 자동생성, 0.5~0.8 검토큐)
  - 글로벌 엔티티 매칭 (`app/lib/ontology/matcher.ts`): normalizeLabel() 기반 Cross-Discovery 엔티티 연결
  - Cron 엔드포인트 (`api.cron.ontology-extract`): 테넌트별 배치 처리
  - 검토 UI (`ontology.review.tsx`): 자동 추출 노드/엣지 승인/반려/편집
  - Agent 통합: extractEntities에 globalEntityId 자동 매칭 추가
  - 마이그레이션 0025 생성 + 프로덕션 적용 완료
- ✅ Phase 2 — 관계 분석 엔진 (tmux /team 3 Worker 병렬):
  - 분석 알고리즘 4종 (`app/lib/ontology/analyzer.ts`): 패턴 탐지(2/3-hop), 모순 감지(supports+contradicts), 클러스터 분석(Union-Find), 중심성 분석(degree)
  - API + Cron: `api.ontology.analyze` + `api.cron.ontology-analyze`
  - Agent 도구 4개: analyzePatterns, analyzeContradictions, analyzeClusters, analyzeCentrality
  - UI 4개 라우트: ontology layout(4탭) + 요약 대시보드 + 글로벌 그래프 + 분석 결과
  - InsightPanel 컴포넌트: 분석 결과 카드 시각화
- ✅ PDCA 문서: plan + design 완료, Phase 3 (미래 예측 시뮬레이션) 미착수
- ✅ typecheck 0 errors, lint 0 errors, 프로덕션 배포 + DB 마이그레이션 완료

### 이전 변경 (세션 142)
**아이디어 3-Panel 재설계 + 사업제안 사이드바 개선**:
- ✅ 아이디어 페이지 3-Panel 레이아웃 재설계: 소스 패널(좌) + 가젯 탭(중) + AI 채팅(우)
- ✅ 신규 컴포넌트 3개: SourceInputPanel, IdeaGadgetTabs (8탭), IdeaChatWrapper
- ✅ ideas.tsx 레이아웃 재작성: AppShell(hideSidebar) + 3-Panel 상태관리
- ✅ ideas.$id.tsx 중앙 패널: 제목바 + 8개 가젯 탭 뷰로 변경
- ✅ 사업제안 사이드바: 카드별 진행률 progress bar 추가 (액션 아이템 완료율)
- ✅ proposals._index.tsx: 첫 제안 자동 선택 (loader redirect)
- ✅ 프로덕션 배포 + 브라우저 검증 완료
- ✅ typecheck 0 errors, lint 0 errors, build 성공

### 이전 변경 (세션 141)
**PDCA Iterate — proposals MEDIUM 갭 해결 + 편집 라우트 추가**:
- ✅ Drizzle `relations()` 6개 정의 추가 (proposalsRelations~proposalMembersRelations)
- ✅ `proposal_sections` (proposal_id, type) 유니크 인덱스 + 마이그레이션 0024
- ✅ 편집 라우트 `proposals.$id_.edit.tsx` 신규 생성 (DRAFT 상태 소유자만 편집 가능)
- ✅ ProposalDetail 태블릿/모바일 진행상황 요약 카드 추가 (`lg:hidden`)
- ✅ tenantUsers 쿼리 테넌트 격리 — `tenantMembers` JOIN으로 필터링
- ✅ PDCA 분석 v3.0 업데이트: 59.3% → 72.4% (CRITICAL/HIGH/MEDIUM 전부 해결)
- ✅ typecheck 0 errors, lint 0 errors

### 이전 변경 (세션 140)
**와이어프레임-구현 정합성 개선 — 대시보드/아이디어/사업제안 3개 페이지 UI 정렬**:
- ✅ 대시보드: 탭 네비게이션 제거, 우측 사이드바 제거 → 단일 페이지 레이아웃
- ✅ 대시보드: StatusOverview 3-column Card → 2-column 텍스트 ("최근 수집 소스" + "특집 현황")
- ✅ 대시보드: "데이터 분류" 테이블 신규 추가 (카테고리별 건수/비율)
- ✅ 대시보드: 통계 3-column → 2-column (DailyActivityChart 제거), StageDuration 건수/퍼센트 표시로 변경
- ✅ 아이디어: FilterBar 제거, 사이드바 제목만 표시 (심플 리스트)
- ✅ 아이디어: 블랙 헤더바 + 메타 정보행 제거, text-2xl 타이틀 + "새 아이디어 생성" 버튼
- ✅ 아이디어: Card 기반 → 문서 스타일 섹션 (section/h2/ol), AI 푸터 "GPT 4o-mini Floating"
- ✅ 사업제안: 예산 Won 포맷 (W500,000,000), 메타 카드 SVG 아이콘 (팀/달력/예산)
- ✅ 사업제안: 댓글 상대시간 표시 ("N시간 전"), textarea 멀티행 입력
- ✅ 사업제안: 커스텀 체크박스 (브랜드 컬러 + SVG 체크마크)
- ✅ 사업제안 API: milestones/members CRUD 엔드포인트 추가 (세션 139 미커밋분)
- ✅ 3개 워커 병렬 작업 (Dashboard/Ideas/Proposals 파일 충돌 없이 동시 실행)
- ✅ pnpm build 성공 (398 modules, 3.42s)

### 이전 변경 (세션 139)
**사업제안 상세 UI 개선 + PDCA 문서 아카이브**:
- ✅ ProposalDetail: 팀 멤버 이름 표시 (proposalMembers JOIN users)
- ✅ ProgressPanel: 액션 아이템 담당자 이름 표시 (proposalActions JOIN users)
- ✅ ProgressPanel: 마일스톤 기간 표시 (startDate~endDate)
- ✅ ProgressPanel: 레이아웃 재구성 (마일스톤 → 액션 아이템 → 통계 순서)
- ✅ ProposalListSidebar: 수정일 표시 (updatedAt)
- ✅ proposals.$id.tsx loader: 멤버/담당자 데이터 JOIN 쿼리 추가
- ✅ ax-bd-poc PDCA 문서 아카이브 (6개 문서 → docs/archive/2026-02/ax-bd-poc/)
- ✅ 와이어프레임 이미지 3개 추가 (대시보드/아이디어/사업제안)

### 이전 변경 (세션 138)
**대시보드 와이어프레임 기반 재설계 + 시장탐색 페이지 추가**:
- ✅ 대시보드 인덱스 페이지 전면 재설계: Pipeline 칸반 → 요약형 대시보드
- ✅ 현황 섹션: 3-column 카드 (최근 수집 / 전체 발굴 / 전략 건의) + 수집 소스 수
- ✅ 통계 섹션: 일별 활동 차트 + 단계별 평균 체류 시간 테이블 + 산업 분포 도넛 차트
- ✅ 신규 컴포넌트 4개: StatusOverview, StageDurationTable, DailyActivityChart, IndustryDonut
- ✅ 대시보드 탭 라벨 변경: "파이프라인" → "현황"
- ✅ Loader: 7개 데이터 소스 통합 (radar items, discoveries, proposals, radar sources, daily activity, stage duration, industry distribution)
- ✅ 시장탐색 `/market` 라우트 신규 생성 (와이어프레임 기반)
- ✅ 레이아웃: MarketSidebar (검색/필터 + 아이템 리스트) + MarketAnalysisTabs (5탭: 시장 현황/고객·수요/시장가 데이터/경쟁 분석/규제)
- ✅ 신규 라우트 3개: market.tsx (레이아웃) + market.$id.tsx (상세) + market._index.tsx (빈 상태)
- ✅ 신규 컴포넌트 2개: MarketSidebar, MarketAnalysisTabs
- ✅ TopNav에 "시장 탐색" 탭 추가 (대시보드 ↔ 아이디어 사이)
- ✅ tmux Agent Teams 2×2명 병렬 작업 (대시보드 + 시장탐색)
- ✅ ESLint 0 errors, TypeScript 0 errors, Build 성공, CI/CD 배포 2회 완료

### 이전 변경 (세션 137)
**PDCA Analyze + Report 완료 — 3개 피처 PDCA 사이클 완결 + 프로덕션 배포**:
- ✅ tmux Agent Teams Gap Analysis: proposals 99%, f20-ideas 93%, f22-archive 94%
- ✅ PDCA Completion Report 3건 생성 (proposals, f20, f22)
- ✅ f22 Critical gap (test helper 미등록) → FALSE POSITIVE 확인 (이미 등록됨)
- ✅ 전체 4개 피처 PDCA 완료: ax-bd-poc(92%) + proposals(99%) + f20(93%) + f22(94%) — 평균 94.5%
- ✅ CI/CD 배포 완료 (1m 30s) — Cloudflare 일시 오류 1회 후 재실행 성공

### 이전 변경 (세션 134~136)
**F20/F21/F22 병렬 구현 + 프로덕션 배포 + PDCA 문서화 완료**:
- ✅ Proposals 보안: PUT API 추가 + DELETE/Actions/Comments 전 라우트 tenant/owner 인가 검증
- ✅ Proposals 최적화: Promise.all 병렬 쿼리 + 배치 insert + 상수 추출 (constants.ts)
- ✅ Proposals 컴포넌트: ProgressPanel/TeamDiscussion 개선
- ✅ F20 아이디어 고도화: 메모 저장 API + FilterBar (점수/상태/검색) + SimilarSources + DB 스키마 memo 컬럼
- ✅ F21 대시보드 차트: StatusDonut (11→5그룹) + WeeklyBar (8주) + ExperimentGantt 데이터 통합
- ✅ F22 보관함 폴더: archive feature 모듈 + 폴더 CRUD API 4개 + 드래그드롭 + SidebarPanel 연동 + 마이그레이션
- ✅ F20/F21/F22 Design 문서 추가
- ✅ ESLint 0 errors, TypeScript 0 errors
- ✅ CI/CD 배포 완료 (Lint → Typecheck → Test → Build → Deploy, 1m 22s)
- ✅ DB 마이그레이션 프로덕션 적용 확인 (0022 + 0023)
- ✅ MemoPanel React 19 lint 수정 (setState-in-effect → render-time adjustment + derived state)
- ✅ PDCA 분석 문서: proposals/F20/F22 analysis + report

### 이전 변경 (세션 132)
**proposals PDCA Plan + Design 문서 작성 완료**:
- ✅ `/pdca plan proposals` — Plan 문서 작성 (280줄): 10 FRs, 6 테이블, 15 Known Issues, 파일 인벤토리
- ✅ `/pdca design proposals` — Design 문서 작성 (677줄): 데이터 모델, API, UI, 보안/성능 분석, 23개 갭
- ✅ Design 핵심 발견: 4개 Critical 보안 갭 (테넌트 격리 불완전), Promise.all 미사용 성능 이슈

### 이전 변경 (세션 131)
**layout-proposals PDCA 완료 (Gap Analysis + Completion Report)**:
- ✅ tmux Agent Teams 3명 병렬 Gap Analysis 실행 (Layout Shell / Pages & Routes / API & DB)
- ✅ Match Rate 93% (57/61) — PDCA completion 기준 충족
- ✅ Gap Analysis 문서: `docs/03-analysis/layout-proposals.analysis.md`
- ✅ Completion Report: `docs/04-report/layout-proposals.report.md`
- ✅ 4건 FAIL 식별: 대시보드 Surface 미완성(2, F21), SidebarPanel mode 미사용(1), API POST 위치(1)
- ✅ proposals DB 마이그레이션 0021 로컬 적용 + drizzle journal 동기화 (0012~0021)
- ✅ 검증: ESLint 0 errors, TypeScript 0 errors, 597/597 테스트 통과

### 이전 변경 (세션 130)
**CI/CD 파이프라인 정상화 완료**:
- ✅ GitHub Secrets 설정: `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` 추가
- ✅ GitHub Actions 전체 파이프라인 통과: Install → Lint → Typecheck → Test → Build → Deploy (1m 25s)
- ✅ 로컬 직접 배포 확인: `.dev.vars` 토큰 기반 `wrangler pages deploy` 성공
- ✅ 프로덕션 정상: https://dx.minu.best (HTTP 302 → 로그인 리다이렉트)
- ✅ 검증: ESLint 0 errors, TypeScript 0 errors, 597/597 테스트 통과

### 이전 변경 (세션 129)
**CI/CD 파이프라인 설정 완료**:
- ✅ `/deploy` 스킬 CI/CD-first 전환: `git push` → GitHub Actions 자동 배포 (수동 `pnpm deploy` 제거)
- ✅ GitHub Actions 강화: Lint → Typecheck → Test → Build → Deploy 게이팅
- ✅ 배포 결과 알림: Job Summary + Discord 웹훅 (선택, `DISCORD_WEBHOOK_URL` secret)
- ✅ `environment: production` 설정 (GitHub Deployments 이력 추적)
- ✅ 검증: ESLint 0 errors, TypeScript 0 errors, 597/597 테스트 통과

### 이전 변경 (세션 128)
**Figma 기반 레이아웃 대폭 재구성 + 사업제안 신규 기능**:
- ✅ GNB 3탭 전환: 4탭(현황판/시장탐색/아이디어/수집관리) → 3탭(대시보드/아이디어/사업제안) + 테마토글/설정/유저
- ✅ AppShell 확장: contextPanel/sidebarContent/sidebarMode prop 추가 (하위 호환 유지)
- ✅ ContextPanel 신규: 우측 280px 패널 셸 (lg+ only, CSS 변수 기반)
- ✅ ArchiveFolderList 신규: 보관함 폴더 1depth (중요/리서치/완료 + 폴더 추가)
- ✅ Dashboard 리뉴얼: CollectionStatusPanel 우측 패널 (도넛 차트 placeholder + 소스별 통계)
- ✅ 아이디어 페이지 (2 라우트): ideas.tsx (목록 + 레이아웃) + ideas.$id.tsx (상세, Radar 아이템 재활용)
- ✅ MemoPanel: 아이디어 메모 우측 패널
- ✅ 사업제안 DB 스키마: 6 테이블 (proposals/sections/milestones/actions/comments/members)
- ✅ 사업제안 라우트 (4 페이지): proposals.tsx/proposals._index/proposals.$id/proposals.new
- ✅ 사업제안 API (3 라우트): api.proposals + api.proposals.$id.comments + api.proposals.$id.actions
- ✅ 사업제안 컴포넌트 (6개): ProgressPanel/ProposalListSidebar/ProposalDetail/ProposalForm/TeamDiscussion/ProposalListSidebar
- ✅ SidebarPanel 보관함 모드 + proposals 사이드바 모드 지원
- ✅ typecheck + lint + build 모두 통과 (19 신규 + 6 수정 파일)

### 이전 변경 (세션 127)
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
- **배포**: Cloudflare Pages (master push → GitHub Actions CI/CD 자동 배포) — Secrets 설정 완료 ✅
- **운영 실험**: 🚀 2026-01-31 시작 (30-60일, 최대 5명, Discovery 5-10건 목표)
- **DB 마이그레이션**: ✅ 26개 (0000~0025) 로컬+프로덕션 적용 완료
- **Cron 설정**: daily (09:00) + agent-review (10:00) + alerts (09:30) + embeddings (15분) + ontology-extract + ontology-analyze (cron-job.org)
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
| v5.3 Ontology Intelligence | 1 | F24 LLM 자동 엔티티 추출 + 글로벌 매칭 + 관계 분석 4종 + UI 4탭 + Agent 도구 4개 |
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

**v5.3 Ontology Intelligence**: LLM 자동 엔티티 추출 (Claude Haiku, confidence 기반 필터링), 글로벌 엔티티 매칭 (normalizeLabel() Cross-Discovery), 관계 분석 4종 (패턴 탐지/모순 감지/클러스터/중심성), Cron 2개 (extract+analyze), Agent 도구 4개 추가, UI 4탭 (요약/그래프/분석/검토), 검토 큐 (승인/반려/편집), InsightPanel 카드, 마이그레이션 0025

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

