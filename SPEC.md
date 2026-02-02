# SPEC.md — Project Specification

## 1. Project Overview

### 미션
AX 신사업 발굴 과정에서 **관찰→내부 실험→근거→결정**을 강제로 닫게 하여, 조직이 "더 잘 틀리고 더 빨리 배우는" 루프를 만든다.

### 범위

**In-scope (PRD §7.1 P0 + v3 확장)**
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
**🚀 v3 Ontology Ready AI Platform 구현 중 (2026-02-01~)**

v3 R0 (11단계 파이프라인) + R1 (Method Pack) + R2 (Ontology Graph) + R3a (KPI/링크/거버넌스) + R3b (알림/웹훅) 구현 완료.
Docs 페이지 + Google OAuth + admin/user/gatekeeper 역할 분리 완료.
프로덕션 배포 + DB 마이그레이션 3건 (0009_google_auth, 0009_ontology_graph, 0010_r3_indicators_connectors) 적용 완료.
가입 승인 제도 + 화이트리스트(AX BD팀 6명) 구현 완료. 최종 프로덕션 배포 (세션 64, d36b28e9).
Audit Log 기능 구현: 누락 이벤트 기록 보완, Dashboard Audit Log 탭, Discovery 상세 활동 타임라인.
Cron 3건 점검 완료 (daily/agent-review/alerts), CRON_SECRET 재설정. 세션 67 배포 (671086a0).
Audit Log 프로덕션 배포 완료 (d9d40471). CREATE_DISCOVERY/UPDATE_DISCOVERY 이벤트 로깅 추가.
웹 폼 이벤트 로깅 누락 5건 보완: ADD_EXPERIMENT, ADD_EVIDENCE, START_METHOD_RUN 추가. 프로덕션 배포 완료 (08b2b89b).
Agent 채팅 품질 튜닝: 시스템 프롬프트 3개 섹션 추가, 도구 스키마 description 보강, 컨텍스트 요약 개선, 에러 처리 세분화.
Audit Log EVENT_TYPE_MAP 완성: 16종 → 30종 (Web form UPPER_CASE + Agent snake_case + Cron + Radar 전체 매핑). 프로덕션 배포 완료 (1883f958).
UI 폴리시: 색상 하드코딩 제거(destructive/warning/event/severity 토큰 21개), 접근성 강화(ARIA 속성 10+개), 버튼 일관성(인라인→Button 컴포넌트), fadeSlideIn 애니메이션 정의 추가.

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

### 최근 변경 (세션 70)
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

### 이전 변경 (세션 68)
**웹 폼 이벤트 로깅 누락 5건 보완**:
- ✅ `discoveries.new.tsx`: CREATE_DISCOVERY 이벤트 로깅 (metadata: title, sourceType)
- ✅ `discoveries_.$id.edit.tsx`: UPDATE_DISCOVERY 이벤트 로깅 (metadata: title, sourceType)
- ✅ `discoveries_.$id.add-experiment.tsx`: ADD_EXPERIMENT 이벤트 로깅 (metadata: experimentId, hypothesis)
- ✅ `discoveries_.$id.add-evidence.tsx`: ADD_EVIDENCE 이벤트 로깅 (metadata: evidenceId, type, strength)
- ✅ `discoveries_.$id.methods.tsx`: START_METHOD_RUN 이벤트 로깅 (metadata: methodPackId)
- ✅ `pnpm typecheck` + `pnpm lint` + `pnpm build` 통과
- ✅ 프로덕션 배포 완료 (e8abb313)

### 이전 변경 (세션 66–67)
**Audit Log 기능 구현 + 프로덕션 배포**:
- ✅ 누락 이벤트 기록 보완: CHANGE_GATEKEEPER, CHANGE_REVIEWER, REQUEST_GATE_APPROVAL, SUBMIT_GATE_DECISION
- ✅ `/dashboard/audit-log` 라우트: 최근 100건 조회, eventType/actorType 필터, admin/gatekeeper 권한 체크
- ✅ AuditLogList 컴포넌트: eventType별 좌측 border 색상 + 한국어 라벨 매핑 (30종)
- ✅ Dashboard 탭 내비게이션에 Audit Log 탭 추가 (아이콘 포함)
- ✅ Discovery 상세 활동 타임라인: 해당 Discovery의 최근 50건 이벤트를 타임라인 UI로 표시
- ✅ CREATE_DISCOVERY / UPDATE_DISCOVERY 이벤트 로깅 추가
- ✅ 프로덕션 배포 완료 (d9d40471)
- ✅ `pnpm typecheck` + `pnpm build` 통과

### 이전 변경 (세션 65)
**가입 승인 제도 + 화이트리스트 프로덕션 배포**:
- ✅ `UserRole.PENDING` 추가: 신규 사용자는 pending → admin 승인 후 사용 가능
- ✅ 화이트리스트 6명 (AX BD팀): 최초 로그인 시 자동 `role: "user"` 부여 (pending 건너뜀)
- ✅ `/pending` 승인 대기 페이지: pending 사용자 전용 안내 + 로그아웃 버튼
- ✅ `requireUser()` 가드: pending 사용자를 `/pending`으로 자동 리다이렉트
- ✅ `/admin/users`: pending 사용자 승인 대기 섹션 (승인/거부 버튼) + 활성 사용자 분리
- ✅ Badge `warning` variant + Button `destructive` variant 추가
- ✅ login.tsx: `pending_approval` 에러 메시지 추가
- ✅ 프로덕션 배포 완료 (1b14c74c)
- ✅ `pnpm typecheck` + `pnpm build` 통과

### 이전 변경 (세션 64)
**v3 R3b UI 폴리시 — KPI 카드, Discovery 링크, Gate 승인 UI, 알림 배지**:
- ✅ KpiCard 컴포넌트, Discovery 상세 KPI/링크 섹션, Gate 승인 UI, MainNav 알림 배지

### 이전 변경 (세션 63)
**§6 체크박스 정리 + Gatekeeper 역할 추가**:
- ✅ SPEC.md §6: R3b 완료 항목 체크 + "v3 후속 (미정)" 섹션 신설 + 완료 요약 테이블 2행 추가
- ✅ Gatekeeper 역할: UserRole에 GATEKEEPER 추가, requireGatekeeper() 헬퍼
- ✅ `/admin/users`: 역할 토글 → 3역할 Select 드롭다운 (Admin/Gatekeeper/User)
- ✅ Discovery 상세: Gatekeeper 표시 + 변경 폼 추가

### 이전 변경 (세션 62)
**로그인 + 관리자 화면 UI 정비 + R3b 프로덕션 배포**:
- ✅ `/login`: 컴파스 아이콘 추가, v0.1.0 버전 뱃지, Google 버튼 브랜드 가이드라인 스타일 (흰 배경 + 구글 컬러 아이콘), "AX Lab · 2026" footer
- ✅ `/admin/seed`: 독립 Card 레이아웃 → PageLayout 래퍼 적용 (MainNav 포함)
- ✅ `/admin/users`: 아바타 h-8→h-10, 가입일 표시, 본인 "(나)" 라벨, Google 연동 뱃지
- ✅ R3b 프로덕션 배포 완료: `pnpm typecheck` + `pnpm build` 통과, Cloudflare Pages 배포 (d964c40b)

### 이전 변경 (세션 61)
**v3 R3b — 알림 엔진 + 웹훅 커넥터 + Agent 도구 + Dashboard Alerts**:
- ✅ 알림 엔진 (`alert-engine.ts`): 4가지 유형 스캔 (KPI 임계치, 단계 SLA 14일, 기한 초과, Gate 승인 SLA) + 당일 중복 방지
- ✅ 웹훅 커넥터 (`webhook.ts`): Slack Block Kit / Teams MessageCard / Custom JSON 페이로드 발송 (5초 타임아웃)
- ✅ 알림 Cron 라우트 (`api.cron.alerts.ts`): CRON_SECRET 인증 + 기본 4개 규칙 자동 시드
- ✅ Agent 도구 3개 신규: `get_alerts` (Level 1), `acknowledge_alert` (Level 2), `manage_webhook` (Level 2)
- ✅ tool-registry.ts: 3개 도구 정의 + autonomy 등록
- ✅ executor.ts: 3개 switch case + import 추가
- ✅ `/dashboard/alerts` 라우트 + AlertList 컴포넌트 (severity 색상, 확인 처리 action)
- ✅ dashboard.tsx: Alerts 탭 링크 + 아이콘 추가
- ✅ `pnpm typecheck` + `pnpm lint` + `pnpm build` 통과

### 이전 변경 (세션 60)
**Google OAuth + admin/user 역할 분리**:
- ✅ Google OAuth: arctic 라이브러리 + /auth/google, /auth/google/callback 라우트
- ✅ 로그인 페이지: 드롭다운 → "Google로 로그인" 버튼 교체
- ✅ DB 마이그레이션 0009: users 테이블에 google_id, avatar_url, role 컬럼 추가
- ✅ `UserRole` 상수 (admin/user), `requireAdmin()` 세션 헬퍼
- ✅ /settings, /admin/seed에 admin 가드 적용
- ✅ /admin/users: 사용자 목록 + 역할 변경 페이지 (admin 전용)
- ✅ MainNav: Settings/Admin 링크 admin 조건부 표시
- ✅ load-context.ts: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET Env 타입 확장
- ✅ `pnpm typecheck` + `pnpm lint` + `pnpm build` 통과

### 이전 변경 (세션 59)
**v3 R3a — KPI 선행지표, Discovery 링크, Gate 승인, Health 대시보드**:
- ✅ DB 스키마 7개 테이블 신규 (discovery_kpis, kpi_measurements, discovery_links, alert_rules, alerts, webhook_configs, gate_approvals)
- ✅ discoveries 테이블에 `gatekeeper_id` 컬럼 추가
- ✅ 마이그레이션 `0010_r3_indicators_connectors.sql`
- ✅ Agent 도구 8개 신규:
  - Indicator: `register_kpi`, `record_kpi_measurement`, `get_kpi_status`, `get_pipeline_health`
  - Connector: `link_discoveries`, `get_linked_discoveries`
  - Governance: `request_gate_approval`, `submit_gate_approval`
- ✅ tool-registry.ts: 8개 도구 정의 + TOOL_MIN_AUTONOMY 등록
- ✅ executor.ts: 8개 switch case + import 추가
- ✅ `/dashboard/health` 라우트 + HealthMetrics 컴포넌트 (단계별 체류시간, 전환율, 근거 품질)
- ✅ `pnpm typecheck` + `pnpm build` 통과

### 이전 변경 (세션 58)
**Docs 페이지 + v3 R2/R3 + Google OAuth**:
- ✅ `/docs` 라우트: 기획서 탭 (7개 마크다운 문서 뷰어) + GitHub Project 탭 (iframe + 폴백 링크)
- ✅ 문서 레지스트리: Vite `?raw` 빌드타임 임포트, 카테고리 3종 (기획/운영/가이드)
- ✅ MarkdownViewer + DocsSidebar 컴포넌트 (반응형: Desktop 사이드바 / Mobile select)
- ✅ v3 R2: Ontology Graph — context_nodes, context_edges, evidence_duplicates, ontology_types 테이블
- ✅ v3 R2: Agent 도구 (ontology-tools.ts) + GraphViewer + DuplicateCard UI
- ✅ v3 R3: Indicators, Connectors, Governance Agent 도구 3종
- ✅ v3 R3: HealthMetrics 대시보드 + dashboard.health 라우트
- ✅ Google OAuth: google.server.ts + /auth/google 라우트 + login 페이지 업데이트
- ✅ MainNav: Docs + Graph 링크 추가
- ✅ DB 마이그레이션: 0009_ontology_graph, 0009_google_auth, 0010_r3_indicators_connectors
- ✅ `pnpm typecheck` + `pnpm build` 통과 + Docs 프로덕션 배포 완료

### 이전 변경 (세션 56–57)
**v3 R0 + R1 빌드 검증 + 프로덕션 배포**:
- ✅ 프로덕션 DB 마이그레이션: 0007 (stage_system) + 0008 (method_packs) 적용
- ✅ 기존 데이터 매핑 확인: INBOX→발견(21건), NEXT→Gate1(1건) 정상 전환
- ✅ system-prompt.ts 템플릿 리터럴 내 backtick 5개 수정 (TS 컴파일 에러 해결)
- ✅ 미사용 MethodRecommender import 제거 (lint warning 해소)
- ✅ `pnpm typecheck` + `pnpm lint` + `pnpm build` 통과
- ✅ 프로덕션 배포: Cloudflare Pages (3158b361)
- ✅ R0 E2E 검증: 11단계 칸반 대시보드, Agent 채팅, 지표 정상 동작
- ✅ R1 검증: /methods 라이브러리 12종 Method Pack 정상 표시 (Tier-0/1/2 필터)

### 이전 변경 (세션 55)
**v3 R0 현행화 + R1 Method Pack 구현**:
- ✅ SPEC.md 현행화 — §1~§6 11단계 파이프라인 반영
- ✅ v3 R1: DB 스키마 4개 테이블 추가 (method_packs, method_runs, gate_packages, assumptions)
- ✅ v3 R1: 마이그레이션 0008_method_packs.sql + 12종 시드
- ✅ v3 R1: Agent 도구 6개 신규 (list_method_packs, recommend_methods, start_method_run, complete_method_run, draft_gate_package, get_gate_package)
- ✅ v3 R1: UI 라우트 3개 (/methods, /discoveries.$id.methods, /discoveries.$id.gate)
- ✅ v3 R1: 컴포넌트 4개 (MethodPackCard, MethodRunTimeline, GatePackageEditor, MethodRecommender)

### 이전 변경 (세션 54)
**v3 R0: 6-상태 → 11단계 파이프라인 완전 교체**:
- ✅ DB 스키마: DiscoveryStatus 11값, stages/signal_metadata 테이블, evidence +5컬럼
- ✅ 마이그레이션: `drizzle/0007_stage_system.sql` (상태 매핑 + 시드 + 컬럼 추가)
- ✅ 상수: `status.ts` 완전 재작성 (STAGE_CATEGORIES, PIPELINE_COLUMNS, ALLOWED_TRANSITIONS)
- ✅ 검증 규칙: `discovery-rules.ts` 재작성 (11단계 전환 + 근거 validator)
- ✅ Agent 도구 17개: 15개 수정 + 2개 신규 (get_stage_info, validate_evidence) + transition_stage
- ✅ system-prompt.ts: 11단계 파이프라인 가이드
- ✅ 대시보드: 카테고리별 그룹 파이프라인 칸반
- ✅ 21개 파일 상태값 일괄 교체 (Node.js 스크립트, 121건)
- ✅ `pnpm typecheck` + `pnpm lint` + `pnpm build` 통과

### 이전 변경 (세션 53)
**HR Dashboard 템플릿 4건 적용 — 대시보드 UX 개선**:
- ✅ MetricCard 컴포넌트 신규 (`app/components/dashboard/MetricCard.tsx`) — 상단 3px 액센트 바 (색상별 KPI 구분) + 주간 트렌드 delta 표시 (▲/▼)
- ✅ `dashboard.metrics.tsx` loader에 7일/14일 기준 트렌드 데이터 추가 — 이번주 vs 지난주 비교 (Discovery, Agent 생성, 실험 완료, 강한 근거)
- ✅ StatusDonut 호버 인터랙션 — 세그먼트 hover 시 strokeWidth 20→24 확대 + 가운데 텍스트 조건부 표시 (해당 상태명+수치), 범례 opacity 연동
- ✅ fade-in-up stagger 애니메이션 — `dx-custom-tokens.css`에 `dx-fade-in-up` keyframe 추가, Pipeline 칸반 컬럼 60ms 간격 + MetricCard 80ms 간격 순차 등장
- ✅ 탭 SVG 아이콘 추가 — Pipeline (3열 칸반), Metrics (막대 차트) 인라인 SVG 16×16
- ✅ `pnpm typecheck` + `pnpm build` 통과

### 이전 변경 (세션 52)
**멀티턴 중복 표시 + 대화 제목 Unicode 깨짐 수정**:
- ✅ ChatPanel 멀티턴 응답 중복 버블 수정 — `tool_call` 시 `streamingStarted = false` 리셋 제거, `\n\n` 구분자 append로 단일 버블 유지
- ✅ api.chat 대화 제목 Unicode-safe 잘라내기 — `message.slice(0, 50)` → `Array.from()` 코드포인트 단위 절단 (이모지 서로게이트 페어 보호)
- ✅ _index + api.conversations `sanitizeTitle()` 추가 — DB 기존 깨진 제목(U+FFFD) 정리 + fallback "새 대화"
- ✅ `pnpm typecheck` + `pnpm build` 통과

### 이전 변경 (세션 51)
**AXIS Design System 정합성 수정 + 프로덕션 배포 완료**:
- ✅ ChatPanel 에러/경고 배너 → AlertBanner 컴포넌트 통합 (`bg-red-50`/`bg-amber-50` 하드코딩 → AXIS 토큰 자동 적용)
- ✅ MessageBubble 스트리밍 커서 → 3-dot bounce 애니메이션 (AXIS ThinkingIndicator 스타일)
- ✅ ToolExecution 상태 표시 → Badge 컴포넌트 통일 (running/success/error)
- ✅ `pnpm typecheck` + `pnpm build` + `pnpm lint` 통과
- ✅ 프로덕션 배포 완료 (https://dx.minu.best, 배포 ID: bebd6489)

### 이전 변경 (세션 50)
**Agent 코드 3건 개선 + Chat UI polish + 프로덕션 배포 완료**:
- ✅ `getMetrics` SQL 집계 전환 — 메모리 로드+JS 필터 → SQL `GROUP BY`/`COUNT(*)`/`AVG(julianday)` 집계로 전환 (query-tools.ts)
- ✅ 모델별 컨텍스트 윈도우 동적 조정 — `MODEL_CONTEXT_CONFIG` 도입, Opus 4: 60개 메시지, default: 40개 (context-builder.ts + executor.ts)
- ✅ discovery-tools 에러 suggestion 7곳 추가 — updateDiscovery, promoteDiscovery(ValidationError), addExperiment, decideNext, decideNotNow, decideDeadEnd, requestExtension
- ✅ Chat UI polish — AlertBanner 에러 표시, 3-dot bounce 스트리밍 인디케이터, Badge 상태 표시 (ChatPanel, MessageBubble, ToolExecution)
- ✅ `pnpm typecheck` + `pnpm build` 통과
- ✅ 프로덕션 배포 완료 (https://dx.minu.best, 배포 ID: 49464357)
- ✅ GitHub Project #4 동기화 확인 — 16개 항목 전체 Done 일치

### 이전 변경 (세션 49)
**v2 Agent 재설계 15건 전체 구현 완료 (검증 세션)**:
- ✅ 이전 세션(46~48)에서 구현된 v2 Agent 재설계 15건의 코드 무결성 최종 검증
- ✅ linter 자동 되돌림 우려 파일 3개 확인 — 모두 정상 유지 확인
- ✅ 프로덕션 배포 완료 (https://dx.minu.best) — chat UX 개선 포함

**v2 Agent 재설계 15건 구현 요약**:
| 스트림 | 항목 | 설명 |
|--------|------|------|
| **아키텍처** | P0-A1 | 실시간 토큰 스트리밍 (callClaudeStream + SSE) |
| | P0-A2 | Claude API 재시도 + 모델 설정 (fetchWithRetry + modelId) |
| | P1-A3 | 자율도 레벨 도구 수준 강제 (TOOL_MIN_AUTONOMY) |
| | P2-A4 | 컨텍스트 윈도우 최적화 (first 5 + last 25 + 요약) |
| **도구** | P0-T1 | update_discovery 도구 추가 |
| | P0-T2 | get_weekly_review + get_recall_queue 도구 추가 |
| | P1-T3 | 목록 조회 페이지네이션 (offset + hasMore) |
| | P1-T4 | 지표 기간 필터링 (fromDate + toDate) |
| | P1-T5 | 에러 메시지에 suggestion 추가 |
| **UX** | P0-U1 | 스트리밍 UI (text_delta 실시간 표시) |
| | P0-U2 | 도구 실행 결과 확장/축소 |
| | P0-U3 | 로딩 상태 + ErrorBoundary |
| | P1-U4 | 코드 구문 강조 + 복사 버튼 (rehype-highlight) |
| | P1-U5 | 대화 삭제 확인 (인라인 확인 UI) |
| | P1-U6 | 대화 검색 (클라이언트 필터링) |

### 이전 변경 (세션 48)
**radar-worker 4건 제한사항 개선 + 배포 완료**:
- ✅ Web Collector: regex 파서 → Cloudflare `HTMLRewriter` 전면 교체 (`a[href]` element handler + text 수집)
- ✅ YouTube @handle 자동 해석: `youtube.com/@handle` URL → 페이지 fetch → `meta[itemprop=channelId]` / `externalId` 패턴으로 channel_id 추출 → RSS feed URL 자동 변환
- ✅ FTS5 이스케이프 강화: `['"*(){}[\]^~\\]` → `[^\p{L}\p{N}\s]` 유니코드 안전 패턴 (한국어/일본어/중국어 제목 안전)
- ✅ `fetchWithRetry` 유틸 신규 (`radar-worker/src/lib/fetch-retry.ts`): 429/5xx 재시도 + 지수 백오프 (1s→2s, maxRetries=2)
- ✅ 4개 파일에 `fetchWithRetry` 적용: `rss.ts`, `web.ts`, `youtube.ts`, `scorer.ts`
- ✅ radar-worker 프로덕션 배포 완료 (v66872c05) + Pages 프리뷰 배포 완료
- ✅ `pnpm typecheck` + `pnpm build` 통과

### 이전 변경 (세션 47)
**테스트 DB 마이그레이션 현행화 + Agent 도구 개선 + 배포 완료**:
- ✅ 테스트 헬퍼(`tests/helpers/db.ts`) 마이그레이션 현행화 — 0003~0006 누락분 추가 → 129개 테스트 전체 통과 (기존 48개 실패)
- ✅ ToolExecution.tsx TypeScript 에러 수정 — `unknown` → `ReactNode` 할당 에러 2건 (`Boolean()` 래핑 + 삼항 연산자)
- ✅ Agent 도구 개선: `list_discoveries`/`get_radar_items` offset 페이지네이션 + hasMore, `get_metrics` 기간 필터(fromDate/toDate), `promote_discovery` 에러 suggestion
- ✅ 프로덕션 배포 완료 (https://dx.minu.best) + DB 마이그레이션 0006 프로덕션 적용 확인 완료
- ✅ `pnpm typecheck` + `pnpm build` + `pnpm test` (129개) 통과

### 이전 변경 (세션 46)
**Agent 도구 확장 + Daily Cron 버그 수정**:
- ✅ Agent 도구 3개 추가: `update_discovery` (수정), `get_weekly_review` (주간 리뷰), `get_recall_queue` (재검토 큐)
- ✅ 모델 선택 기능: Settings에서 Claude Sonnet 4 / Haiku 3.5 / Opus 4 선택 가능 (`agent_config.modelId` 컬럼 추가)
- ✅ Claude API 안정성: 재시도 로직 (429/500/502/503/529 + exponential backoff, 최대 3회) + 25초 타임아웃
- ✅ ToolExecution UI 개선: 리치 결과 렌더링 (테이블/카드/메트릭), expand/collapse, JSON 토글, 실행 중 표시
- ✅ `_index.tsx` ErrorBoundary 추가 (채팅 에러 시 다시 시도 버튼)
- ✅ **버그 수정**: daily cron 시스템 사용자(`@system`) 이메일 수신 제외 → Resend API 에러 해결
- ✅ **버그 수정**: 이메일 템플릿 BASE_URL `discovery-x.pages.dev` → `dx.minu.best` (구 도메인 링크 수정)
- ✅ DB 마이그레이션: `0006_add_model_id.sql` + 테스트 헬퍼 마이그레이션 추가 (0003~0006)
- ✅ `pnpm typecheck` + `pnpm build` 통과

### 이전 변경 (세션 45)
**@axis-ds 패키지 연동 완료**:
- ✅ `@axis-ds/tokens@1.1.1` 도입 — 로컬 `axis-tokens.css` (122개 CSS 변수) 삭제, 패키지 CSS로 대체
- ✅ `@axis-ds/theme@1.1.1` 도입 — 로컬 `use-theme.ts` 삭제, `ThemeProvider` + `useTheme` 패키지로 교체
- ✅ `@axis-ds/ui-react@1.1.1` 도입 — Button, Badge, Card, Input 컴포넌트를 패키지 기반 adapter/re-export로 교체
- ✅ `dx-custom-tokens.css` — primitive color alias 20개 추가 (`--axis-blue-100` → `var(--axis-color-blue-100)` 등) + dark override `.dark` 셀렉터 통일
- ✅ `root.tsx` — `ThemeProvider` 래핑 (`storageKey="dx-theme"`) + FOUC 스크립트에 `.dark` 클래스 추가
- ✅ Button/Badge adapter 패턴 — DX 커스텀 variant (success, purple) 유지, 나머지는 패키지 위임
- ✅ Textarea, Table, AlertBanner, Select, FormField, StatusBadge — 유지 (패키지 API 차이 또는 DX 전용)
- ✅ 패키지 subpath exports 버그 발견 → 메인 export에서 import으로 우회
- ✅ React 19 children 호환성 처리 — `Omit<..., "variant"> & PropsWithChildren` 패턴
- ✅ `pnpm typecheck` + `pnpm lint` + `pnpm build` 통과

### 이전 변경 (세션 44)
**agent-review cron 등록 + daily cron URL 수정**:
- ✅ cron-job.org에 `DX Agent Review` 등록 — POST `dx.minu.best/api/cron/agent-review` 매일 10:00 KST
- ✅ `Discovery-X Daily Notifications` URL 수정 — `discovery-x.pages.dev` → `dx.minu.best` (400 에러 해결)
- ✅ SPEC.md §6 미완료 항목 체크 완료
- ✅ 프로덕션 배포 완료 (https://dx.minu.best)

### 이전 변경 (세션 43)
**다크모드 + 차트 토큰화 구현 완료**:
- ✅ 다크모드 토큰 — `axis-tokens.css`에 122개 AXIS 토큰 전체 dark override 추가 (`@media prefers-color-scheme` + `[data-theme="dark"]`)
- ✅ DX 커스텀 토큰 분리 — `dx-custom-tokens.css` 신규 (purple, success, chart 토큰 + dark override)
- ✅ 차트 시맨틱 토큰 7개 — `--axis-chart-inbox/open/next/not-now/dead-end/bar/empty`
- ✅ StatusDonut hex 9건 + WeeklyBar hex 3건 → CSS 변수 교체
- ✅ `useTheme` 훅 — light/dark/system 3모드, localStorage 지속, `prefers-color-scheme` 실시간 감지
- ✅ FOUC 방지 인라인 스크립트 (`root.tsx` `<html>` 태그에 `data-theme` 속성)
- ✅ MainNav 다크모드 토글 버튼 (해/달 아이콘)
- ✅ `@axis-ds/*` 패키지 탐색 — GitHub Packages에 미존재 확인 (Phase 1-3 스킵)
- ✅ `pnpm typecheck` + `pnpm lint` + `pnpm build` 통과
- ✅ 프로덕션 배포 + dx.minu.best 다크모드 전수 검증 완료 (채팅, 대시보드 Pipeline/Metrics — 라이트↔다크 전환 정상)

### 이전 변경 (세션 42)
**UI 개선 6건 구현 완료**:
- ✅ P0: Markdown 렌더링 — `react-markdown` + `remark-gfm` + `@tailwindcss/typography` 적용 (assistant 메시지만, prose 스타일링 + Axis 디자인 토큰 연동)
- ✅ P1: favicon.svg 추가 (DX 텍스트 기반 SVG) + root.tsx links에 등록
- ✅ P1: 깨진 대화 삭제 — 프로덕션 D1에서 UTF-8 인코딩 깨진 대화 1건 제거 (세션 39 Playwright MCP 원인)
- ✅ P2: 로그인 페이지에서 시스템 사용자(@system) 필터링
- ✅ P2: 토큰 예산 초과 경고 — 80% 초과 시 SSE `budget_warning` 이벤트 전송 + ChatPanel amber 배너 표시
- ✅ P2: 대시보드 칸반 칼럼 스크롤 추가 (max-height 600px + overflow-y-auto)
- ✅ `pnpm typecheck` + `pnpm build` 통과
- ✅ 프로덕션 배포 + dx.minu.best 6건 전수 검증 완료 (마크다운 렌더링, favicon, 깨진 대화, 로그인 필터, 칸반 스크롤, 토큰 경고)

### 이전 변경 (세션 41)
**채팅 마크다운 렌더링 + UI 개선**:
- ✅ `remark-gfm` 추가 — Agent 응답의 GFM 테이블/취소선/자동링크 렌더링 지원
- ✅ `react-markdown` + `@tailwindcss/typography` 기반 마크다운 렌더링
- ✅ favicon.svg 링크 추가 (root.tsx)
- ✅ 대시보드 칸반 칼럼 스크롤 추가 (max-height 600px + overflow-y-auto)
- ✅ 로그인 페이지에서 시스템 사용자(@system) 필터링
- ✅ `pnpm typecheck` + `pnpm build` 통과

### 이전 변경 (세션 40)
**Agent 채팅 4개 이슈 수정**:
- ✅ 시스템 프롬프트에 "사용자 입력 보존 원칙" 추가 — Agent가 사용자 제공 값(제목, 가설 등)을 임의 변형하지 않도록 강제
- ✅ 대화 제목 업데이트 조건 보강 — `"새 대화"` placeholder도 첫 메시지로 덮어쓰도록 방어 처리
- ✅ SSE 프로그레시브 스트리밍 — `onEvent` 콜백으로 도구 실행 결과를 즉시 SSE 전송 (기존: 전체 완료 후 일괄)
- ✅ tool_use content 중복 저장 방지 — 같은 라운드의 복수 tool_use 블록 중 첫 번째만 assistantText 저장
- ✅ `pnpm typecheck` + `pnpm build` 통과

### 이전 변경 (세션 39)
**v2 Agent 풀 플로우 E2E 테스트 완료**:
- ✅ Agent 채팅으로 Discovery 풀 라이프사이클 검증 (INBOX → OPEN → NEXT)
- ✅ 근거 추가 (`add_evidence`) — 정량적(DATA) A급 근거 정상 추가
- ✅ 실험 완료 (`complete_experiment`) — 결과 요약과 함께 실험 COMPLETED 전환
- ✅ NEXT 결정 (`decide_next`) — 상태 전환 + "A/B급 근거 2개 미만" 비즈니스 규칙 경고 정상 전달
- ✅ 대시보드 반영 확인 — Pipeline 칸반 Next 칸에 1건 표시 (전진/AI 태그, 기한 표시)
- ✅ 도구 실행 알림 UI 정상 (tool 이름 + 완료 상태 표시)
- ✅ 이전 세션(38) 테스트 포함 전체 Agent 도구 검증: `get_metrics`, `create_discovery`, `promote_discovery`, `add_evidence`, `complete_experiment`, `decide_next` — 6개 도구 정상

### 이전 변경 (세션 38)
**v2 AI Agent 시스템 전면 구현**:
- ✅ Agent 코어 7개 파일: executor, claude-client (SSE), system-prompt, context-builder, tool-registry, discovery-tools, query-tools
- ✅ Agent 도구 15개: Discovery CRUD + 상태 전환 + 조회/검색/Radar 접근
- ✅ 채팅 UI 5개 컴포넌트: ChatPanel, MessageBubble, ToolExecution, DiscoveryCard, ConversationList
- ✅ 채팅 API: SSE 스트리밍 엔드포인트 (`api.chat.ts`) + 대화 CRUD (`api.conversations.ts`) + 메시지 조회
- ✅ 대시보드: Pipeline 칸반 6열 (`dashboard._index.tsx`) + Metrics with Agent 토큰 추적 (`dashboard.metrics.tsx`)
- ✅ Settings: 자율도 레벨 (0-3), 일일 토큰 예산, 커스텀 시스템 프롬프트 (`settings.tsx`)
- ✅ 자율 리뷰 cron: OPEN Discovery 50% 시간 경과 시 Agent 자동 평가 (`api.cron.agent-review.ts`)
- ✅ DB 스키마: 3개 테이블 추가 (conversations, messages, agent_config) + `createdByAgent` 컬럼
- ✅ 마이그레이션: `0005_add_agent_chat_tables.sql`
- ✅ 홈페이지(`_index.tsx`) 채팅 인터페이스로 교체 (사이드바 대화 목록 + 채팅 패널)
- ✅ MainNav 업데이트: Dashboard + Radar + Settings 링크
- ✅ CLAUDE.md 업데이트: v2 Agent 아키텍처/도구/환경변수 반영
- ✅ `pnpm typecheck` + `pnpm lint` (0 errors, 0 warnings) + `pnpm build` 통과
- ✅ 프로덕션 배포 완료: DB 마이그레이션 0005 적용 + ANTHROPIC_API_KEY 설정 + wrangler deploy

### 이전 변경 (세션 36)
**프로젝트 폴더 및 문서 정리**:
- ✅ CLAUDE.md 라우트 네이밍 수정 — `discoveries.$id.*` → `discoveries_.$id.*` (Remix v2 flat route 실제 컨벤션 반영)
- ✅ CLAUDE.md typecheck 명령어 설명 수정 — `tsc --noEmit` → `tsc` (실제 package.json과 일치)
- ✅ `.claude/skills/nul` 이미 삭제 확인 (재생성 없음)

### 이전 변경 (세션 34)
**GeekNews web 스크래핑 전환 + User-Agent 개선**:
- ✅ `radar-worker/src/collectors/web.ts` + `rss.ts` — User-Agent를 `Mozilla/5.0 (compatible; Radar-Worker/1.0; +https://dx.minu.best)` 표준 봇 식별 형식으로 변경
- ✅ GeekNews RSS 403 차단 대안 — 메인 페이지(`news.hada.io`) web 스크래핑으로 전환
- ✅ 프로덕션 DB에 GeekNews web 소스 추가 완료 (세션 36)

### 이전 변경 (세션 33)
**프로덕션 배포 완료**:
- ✅ 세션 32 변경사항 (자동 DEAD_END 전환) 프로덕션 배포 완료
- ✅ `wrangler pages deploy` 명령 수정 — `--project-name=discovery-x` 플래그 필요 확인
- ✅ `pnpm typecheck` + `pnpm build` 통과

### 이전 변경 (세션 32)
**기한 초과 자동 DEAD_END 전환**:
- ✅ `failure-patterns.ts` — `time_constraint` 실패 패턴 추가 ("시간 제약: 기한 내 결정하지 못해 자동 종료됨")
- ✅ `api.cron.daily.ts` — 기한 초과 Discovery 자동 DEAD_END 전환 로직 추가
  - `approvalStatus === "PENDING"` 항목 제외 (Reviewer 승인 대기 중)
  - `system-radar` actor로 `AUTO_CLOSED_OVERDUE` 이벤트 기록
  - 자동 종료 알림 이메일 발송
- ✅ `templates.ts` — `buildAutoClosedEmail()` 자동 종료 알림 이메일 템플릿 추가
- ✅ `discoveries.$id.tsx` — 자동 종료된 항목에 "자동 종료됨 (기한 초과)" 경고 배너 표시
- ✅ `pnpm typecheck` + `pnpm lint` + `pnpm build` 통과

### 이전 변경 (세션 31)
**프로젝트 폴더 및 문서 정리**:
- ✅ `nul` (0바이트 Windows 아티팩트), `app-src/` (빈 디렉토리), `.playwright-mcp/` (스크린샷 캐시) 삭제
- ✅ `.gitignore`에 `.playwright-mcp/` 패턴 추가
- ✅ CLAUDE.md 기술 스택 `Tailwind CSS 3` → `Tailwind CSS 4 + Axis Design Tokens` 현행화
- ✅ README.md 기술 스택 `Tailwind CSS 3` → `Tailwind CSS 4` 현행화
- ✅ 차트 컴포넌트 하드코딩 색상 → 디자인 토큰 전환 (`StatusDonut.tsx`, `WeeklyBar.tsx` — `text-gray-*` → `text-[var(--axis-text-tertiary)]`)
- ✅ `pnpm typecheck` + `pnpm build` 통과

### 이전 변경 (세션 30)
**디자인 토큰 마이그레이션 완료 — surface-brand 오용 수정**:
- ✅ `bg-[var(--axis-surface-brand)]` (solid blue #3B82F6) 오용 일괄 수정 — `bg-blue-50` (연한 파랑) 의도였던 곳에 잘못 매핑됨
- ✅ `complete-experiment.tsx`, `add-evidence.tsx`, `add-experiment.tsx`, `promote.tsx` — Discovery 정보 박스 `AlertBanner variant="info"` 교체
- ✅ `decide-not-now.tsx` — "NOT NOW 결정 후" 정보 박스 `AlertBanner variant="info"` 교체
- ✅ `recall.tsx` — 행 하이라이트 `bg-[var(--axis-badge-info-bg)]` (연한 파랑)로 수정
- ✅ 전체 라우트 하드코딩 색상 제거 검증 완료 (bg-blue/green/red/yellow/orange/purple 패턴 0건)
- ✅ `pnpm typecheck` + `pnpm build` 통과
- ✅ 프로덕션 배포 완료 + dx.minu.best 접속 검증 (대시보드/목록/상세/승격 페이지 정상)

### 이전 변경 (세션 29)
**디자인 토큰 컴포넌트 마이그레이션 확대 — 13개 라우트 전환**:
- ✅ `discoveries.$id.tsx` — PageLayout, Card, Button, Badge, AlertBanner, Select, cn() 적용
- ✅ `review.tsx`, `recall.tsx` — 디자인 토큰 컴포넌트 전환
- ✅ `_index.tsx` (대시보드) — PageLayout, Card, Button, AlertBanner, Badge 적용
- ✅ `admin.seed.tsx` — Card, Button, AlertBanner 적용
- ✅ `discoveries_.$id.edit.tsx`, `discoveries_.$id.promote.tsx` — FormField, Card, Button 등 적용
- ✅ `discoveries_.$id.add-evidence.tsx`, `discoveries_.$id.add-experiment.tsx`, `discoveries_.$id.complete-experiment.tsx` — 디자인 토큰 전환
- ✅ `metrics.tsx` — PageLayout, PageHeader, Card, Button 적용
- ✅ `radar.tsx` — 디자인 토큰 컴포넌트 전환
- ✅ raw HTML (`<div>`, `<button>`, `<select>`, `<span>`) → 디자인 토큰 컴포넌트 교체
- ✅ Tailwind gray/blue/red/green 하드코딩 → `var(--axis-*)` CSS 변수 전환
- ✅ `pnpm typecheck` + `pnpm build` 통과

### 이전 변경 (세션 28)
**Tailwind v4 마이그레이션 + Axis Design Token 시스템 도입**:
- ✅ Tailwind CSS v3 → v4 마이그레이션 (`@tailwindcss/vite` 플러그인 전환)
- ✅ `axis-tokens.css` — `--axis-*` CSS 커스텀 프로퍼티 디자인 토큰 시스템
- ✅ 재사용 UI 컴포넌트 11개 신규: Badge, Button, Card, FormField, Input, Select, Textarea, AlertBanner, Table, PageHeader, PageLayout
- ✅ `cn()` 유틸리티 (tailwind-merge + clsx)
- ✅ StatusBadge → Badge 기반 리팩토링, STATUS_CONFIG 디자인 토큰 적용
- ✅ MainNav 디자인 토큰 적용
- ✅ login.tsx, discoveries.new.tsx 새 컴포넌트 시스템으로 전환
- ✅ `postcss.config.js`, `tailwind.config.js` 제거 (Tailwind v4)
- ✅ 신규 의존성: `@radix-ui/react-slot`, `class-variance-authority`, `tailwind-merge`
- ✅ `pnpm typecheck` + `pnpm build` 통과

### 이전 변경 (세션 27)
**Radar Phase 3 — 프로덕션 배포 + 소스 시딩 + 수동 트리거 테스트 완료**:
- ✅ radar-worker 프로덕션 배포 (https://radar-worker.sinclair-account.workers.dev)
- ✅ Secrets 설정 완료 (OPENAI_API_KEY, CRON_SECRET)
- ✅ DB 마이그레이션 0004 프로덕션 적용
- ✅ RSS 소스 5개 시딩 (TechCrunch AI, HN Best, MIT Tech Review, HN Show, arXiv cs.AI)
- ✅ 수동 트리거 테스트 성공: 5소스 → 70아이템 수집 → 5 INBOX Seeds 자동 생성
- ✅ scorer 버그 수정: JSON response format 명시 + max_tokens 8000 증가
- ✅ HTTP /run 동기 실행으로 변경 (waitUntil 타임아웃 해결)
- ✅ Discovery-X Pages 프로덕션 재배포 (Radar UI 포함)

### 이전 변경 (세션 26)
**Radar 자동 토픽 수집 Phase 1-2 구현 완료**:
- ✅ DB 마이그레이션 `0004_add_radar_tables.sql` — `radar_sources`, `radar_items`, `radar_runs` 테이블 + `system-radar` 시스템 사용자
- ✅ Drizzle 스키마 확장 — `radarSources`, `radarItems`, `radarRuns` + 타입/enum 추가
- ✅ `/radar` 설정 UI 페이지 — 소스 추가/토글/삭제, 실행 이력, 최근 수집 아이템 뷰
- ✅ API 라우트 3개 — `api.radar.sources.ts` (CRUD), `api.radar.runs.ts` (이력), `api.radar.trigger.ts` (수동 트리거)
- ✅ MainNav에 Radar 링크 추가
- ✅ `radar-worker/` — 별도 Cloudflare Worker 프로젝트

### 이전 변경 (2026-01-31 세션 25)
**프로젝트 점검 및 정리 — 문서 현행화 + 파일 정리 + Git 태그**:
- ✅ `.gitignore` 업데이트 — Claude Code 로컬 파일 패턴 추가
- ✅ 불필요 파일 삭제 — `docs/qa-checklist-content.txt`, `.claude/skills/.claude/`
- ✅ CLAUDE.md 현행화 — 프로덕션 URL(dx.minu.best), 운영 실험 상태 반영
- ✅ README.md 현행화 — 프로덕션 URL, 기술 스택, 문서 목록 정리
- ✅ GitHub Project #4 확인 — 8개 항목 상태 동기화 완료 확인
- ✅ Git 버전 태그 부여 — v0.1.0 ~ v0.4.0 + v1.0.0-rc (5개)
- ✅ SPEC.md §5 세션 25 기록

### 이전 변경 (2026-01-31 세션 24)
**커스텀 도메인 dx.minu.best 연결 완료**:
- ✅ Cloudflare Pages 커스텀 도메인 `dx.minu.best` 연결 확인
- ✅ SSL 인증서 정상 발급, HTTPS 접속 검증 완료
- ✅ SPEC.md 배포 상태에 커스텀 도메인 정보 반영

### 이전 변경 (2026-01-31 세션 23)
**Resend secrets 설정 + cron-job.org 연동 — 이메일 알림 활성화**:
- ✅ `RESEND_API_KEY` wrangler secret 설정 완료
- ✅ `CRON_SECRET` 생성 및 wrangler secret 설정 완료
- ✅ cron-job.org 외부 cron 서비스 연동 (매일 0:00 UTC = 9:00 KST)
- ✅ 프로덕션 배포 완료 (`from` 주소 `noreply@ideaonaction.ai` 반영)
- ✅ 남은 P0 작업 전체 완료 — Resend secrets + 외부 cron 연동

### 이전 변경 (세션 22)
**UI 일관성 개선 (P0~P2) + 이메일 도메인 변경**:
- ✅ P0: `discoveries.new.tsx` 버튼 영역 `border-t` 누락 수정
- ✅ P0: `decide-dead-end.tsx` 에러 박스 `ring-1 ring-red-400` 제거 (다른 라우트와 통일)
- ✅ P1: `STATUS_CONFIG` 상수 파일 추출 (`app/lib/constants/status.ts`) — 3곳 중복 제거
- ✅ P1: `StatusBadge.tsx` → 상수 파일 import로 전환
- ✅ P1: MainNav 햄버거 `aria-label`, `aria-expanded`, SVG `aria-hidden` 추가
- ✅ P1: 4개 테이블 `<th>`에 `scope="col"` 추가 (discoveries, review, recall, metrics)
- ✅ P2: 상세 페이지 액션 버튼 그룹핑 (주요 액션 / 보조 액션 2행 분리)
- ✅ P2: 빈 상태 메시지 톤 통일 ("없습니다!" → "없습니다.")
- ✅ P2: `discoveries._index.tsx` + `discoveries.$id.tsx` 인라인 배지 → `StatusBadge` 컴포넌트 교체
- ✅ 이메일 발신 도메인 변경: `noreply@discovery-x.ax-bd.com` → `noreply@ideaonaction.ai`
- ✅ `pnpm typecheck` + `pnpm build` + `pnpm lint` + `pnpm test` (129개) 모두 통과

### 이전 변경 (2026-01-31 세션 21)
**운영 실험 시작 — 프로덕션 환경 셋업**:
- ✅ 프로덕션 배포 완료 (QA 버그 수정 포함)
- ✅ 프로덕션 DB 사용자 5명 등록 (김탐험, 이실험, 박근거, 최검토, 정큐레이터)
- ✅ 프로덕션 DB 상태 확인: 마이그레이션 4/4, 테이블 정상, Discovery 0건 (클린 스타트)
- ✅ 이메일 알림: 미설정 상태로 시작 (인앱 배지로 대체, 나중에 Resend 연동 가능)
- ✅ 운영 실험 공식 시작 (30-60일, 최대 5명, Discovery 5-10건 목표)

### 이전 변경 (2026-01-31 세션 20)
**전체 QA 테스트 수행 + 버그 수정**:
- ✅ QA 체크리스트 기반 전체 플로우 수동 테스트 (Flow A~P, 80+ 항목)
- ✅ 모든 핵심 워크플로우 검증 완료: CRUD, Promote, Experiments, Evidence, Decisions (NEXT/NOT_NOW/DEAD_END), Extension Request
- ✅ 운영 뷰 검증: Review, Recall, Metrics, CSV/Brief Export
- ✅ 모바일 반응형 검증 (375px 뷰포트)
- ✅ 상태 필터 8종 검증 (전체/Inbox/진행중/전진/보류/중단/연장요청/기한초과)
- ✅ **버그 수정**: add-experiment 서브타이틀 "/2" 하드코딩 → 동적 `maxExperiments` (OPEN: 2, EXTENSION_REQUESTED: 3)
- ✅ `functions/[[path]].ts` 추가 — wrangler pages dev 로컬 서버 엔트리
- ✅ `pnpm typecheck` + `pnpm build` + `pnpm lint` 모두 통과

### 이전 변경 (2026-01-31 세션 19)
**3개 스트림 구현 완료 확인 — approval workflow, FTS5 검색, 고급 지표**:
- ✅ 세션 17-18에서 구현된 3개 스트림 전체 코드 검증 완료
- ✅ `pnpm typecheck` + `pnpm build` + `pnpm lint` 모두 통과
- ✅ SPEC.md 현행화 — 현재 단계 업데이트, 유사도 추천 항목 완료 표시

### 이전 변경 (2026-01-31 세션 18)
**승인 워크플로우 타입 에러 수정 + 유사 Seed 검색 + 고급 지표 + 프로덕션 배포**:
- ✅ env 캐스팅 타입 에러 수정 (5개 라우트: `as unknown as Record<string, string>`)
- ✅ approve.tsx `pendingDecisionData` 타입 안전성 개선
- ✅ useRef strict mode 호환 수정 (`useRef<T>(undefined)`)
- ✅ 유사 Seed 검색: `/api/similar-seeds` + `StatusBadge` 컴포넌트 + 생성 폼 연동
- ✅ 고급 지표: Failure Pattern 재사용률, Owner 부하, Evidence 품질 분석
- ✅ 테스트 헬퍼 DB에 `0002_add_approval_columns.sql` 마이그레이션 추가
- ✅ 129개 테스트 전체 통과 + typecheck/build 정상
- ✅ 프로덕션 배포 완료

### 이전 변경 (2026-01-31 세션 17)
**Reviewer 승인 워크플로우 구현 + 프로덕션 배포**:
- ✅ DB 스키마: `approvalStatus`, `pendingDecision`, `approvedAt/By` 등 7개 컬럼 추가
- ✅ Validation: Reviewer 필수 검증, 승인 대기 중복 제출 차단, `ApprovalDecisionSchema`
- ✅ 이메일 템플릿: 승인 요청/결과 알림 (`buildApprovalRequestEmail`, `buildApprovalResultEmail`)
- ✅ Decision 라우트 4개: 결정 시 Reviewer 승인 요청 → PENDING 상태 전환
- ✅ Approve 라우트: `/discoveries/:id/approve` — Reviewer 승인/거부 처리
- ✅ Discovery 상세: 승인 대기 상태 표시 + approve 라우트 연결
- ✅ DB 마이그레이션: `0002_add_approval_columns.sql`, `0003_add_fts5.sql`
- ✅ 프로덕션 배포 완료 (`https://04ec6e15.discovery-x.pages.dev`)

### 이전 변경 (2026-01-31 세션 16)
**테스트 인프라 구축 + 전체 테스트 통과**:
- ✅ Vitest + Playwright 테스트 인프라 설정 (vitest.config.ts, playwright.config.ts)
- ✅ Unit 테스트 76개 — Zod schemas, discovery business rules, form-error util
- ✅ Integration 테스트 53개 — promote, decide-next/not-now/dead-end, add-experiment/evidence, complete-experiment, request-extension, review, recall
- ✅ E2E 테스트 스펙 4개 — happy-path, dead-end, not-now-recall, extension
- ✅ 테스트 헬퍼 — better-sqlite3 인메모리 DB, fixtures
- ✅ 전체 129개 테스트 통과 (13 파일)

### 이전 변경 (2026-01-31 세션 15)
**라우트 파일 정리 + GitHub Project 동기화**:
- ✅ 라우트 파일 rename: `discoveries.$id.*` → `discoveries_.$id.*` (9개 파일, Remix v2 flat route 컨벤션)
- ✅ GitHub Project #4 초기 동기화 — SPEC.md §6 체크박스 8개 항목 push 완료

### 이전 변경 (2026-01-31 세션 14)
**4개 병렬 스트림으로 P1/Phase 3~4 작업 일괄 구현**:

**Stream 1: 코드 품질**:
- ✅ `catch (error: any)` → `catch (error: unknown)` + `getFormErrorMessage` 유틸 (10개 라우트)
- ✅ `app/lib/utils/form-error.ts` 공통 에러 핸들링 유틸 생성
- ✅ ESLint config에서 route 파일 예외 규칙 제거 (no-explicit-any/no-unused-vars)
- ✅ Unused imports/parameters/dead code 제거
- ✅ `pnpm lint` 경고 0개, 에러 0개 (클린)

**Stream 2: 운영 문서 (한국어)**:
- ✅ `docs/USER_CHEAT_SHEET.md` — 1페이지 사용자 치트시트
- ✅ `docs/OPERATIONAL_RUNBOOK.md` — 주간/월간 운영 런북 (Weekly Review + Monthly Failure Replay)
- ✅ `docs/KICKOFF_TEMPLATE.md` — 35분 킥오프 프레젠테이션 템플릿

**Stream 3: Export 확장 + Brief 생성**:
- ✅ CSV Export에 실험 1~3 상세 + 근거 목록 컬럼 추가
- ✅ JSON Export 신규 (`/api/export/discoveries-json`) — 전체 Discovery 중첩 데이터
- ✅ 1-page Brief 다운로드 (`/api/export/brief/:id`) — Markdown 형식
- ✅ Discovery 상세에 "Brief 다운로드" 버튼 추가

**Stream 4: 이메일 알림 + Cron 자동화**:
- ✅ Resend 이메일 클라이언트 (`app/lib/notifications/email.ts`)
- ✅ 3종 HTML 이메일 템플릿 — 기한 초과, 마감 임박(3일), 재검토 도래
- ✅ Daily cron 핸들러 (`/api/cron/daily`) — 수동 트리거 + cron 지원
- ✅ `wrangler.toml`에 cron trigger + secrets 문서 추가
- ✅ `resend@6.9.1` 패키지 추가

**추가 수정 (tsconfig + 재배포)**:
- ✅ `tsconfig.json`에 `exclude` 추가 (`functions/`, `build/`, `.wrangler/`) — 생성 파일 typecheck 에러 해결
- ✅ `wrangler.toml` compatibility_date `2024-11-01` + `nodejs_compat` 플래그 추가
- ✅ 프로덕션 재배포 완료

### 이전 변경 (2026-01-31 세션 13)
**차트/모바일 반응형 포함 전체 배포 완료**:
- ✅ 세션 12에서 커밋된 차트(StatusDonut, WeeklyBar) + 모바일 반응형(Review/Recall) 프로덕션 배포
- ✅ `git push` + `pnpm run deploy` 완료 — 전체 코드 Cloudflare Pages 반영

### 이전 변경 (2026-01-31 세션 12)
**EXTENSION_REQUESTED + overdue/mobile/notification 개선, 프로덕션 배포 완료**:

**EXTENSION_REQUESTED 워크플로우**:
- ✅ `ExtensionRequestedSchema` Zod 스키마 추가 (extensionRationale 필수, 400자)
- ✅ `/discoveries/:id/request-extension` 라우트 신규 — 보라색 테마 연장 요청 폼
- ✅ 상세 페이지: OPEN + 실험 2개 시 "연장 요청" 버튼 표시
- ✅ EXTENSION_REQUESTED 상태에서 실험 추가(최대 3개) + 결정(NEXT/NOT_NOW/DEAD_END) 가능
- ✅ due_date +14일 자동 연장 (calculateExtensionDueDate 활용)

**Overdue/알림 시스템**:
- ✅ 대시보드: 기한 초과/3일 이내 마감 경고 배너 + 기한 초과/재검토 대기 카드
- ✅ Discovery 목록: OVERDUE 필터 + 기한 초과 배지
- ✅ 상세 페이지: 기한 초과 경고 배너, 실험 완료/미완료 시각 구분
- ✅ MainNav: 모바일 햄버거 메뉴, Review/Recall 알림 배지 (root loader에서 카운트)

**실험 완료 기록**:
- ✅ `CompleteExperimentSchema` + `/discoveries/:id/complete-experiment` 라우트
- ✅ 상세 페이지에서 미완료 실험에 "결과 기록" 버튼 표시

**차트 + 모바일 반응형**:
- ✅ `StatusDonut` 차트 컴포넌트 (상태 분포 도넛 차트, SVG 기반)
- ✅ `WeeklyBar` 차트 컴포넌트 (주간 생성 추이 막대 차트, SVG 기반)
- ✅ Metrics: 상태 분포 + 주간 생성 추이 차트 추가
- ✅ Review/Recall: 모바일 카드 레이아웃 (sm 이하에서 테이블 대신 카드)

**배포**: 프로덕션 배포 완료 (`pnpm run deploy`)

### 이전 변경 (2026-01-31 세션 11)
**ESLint 도입 + /lint 스킬 + CLAUDE.md 개선**:
- ✅ ESLint 9 (flat config) + typescript-eslint + react-hooks 설치/설정
- ✅ `eslint.config.js` 생성, `package.json`에 `lint` 스크립트 추가
- ✅ `/lint` 스킬 생성 (변경 파일 대상 ESLint + TypeScript 점검/수정)
- ✅ CLAUDE.md 품질 개선 — 명령어, 디렉토리 구조, 경로 별칭 추가; 비기술 섹션 축소
- ✅ INBOX TTL impure render call 수정 (Date.now() → loader로 이동)

### 이전 변경 (2026-01-31 세션 10)
**빌드 검증 및 구문 수정**:
- ✅ discoveries._index.tsx 구문 에러 수정 (map callback 닫기 괄호)
- ✅ `pnpm build` 성공 (203KB server bundle)
- ✅ `pnpm typecheck` 성공 (타입 에러 0건)

### 이전 변경 (2026-01-31 세션 9)
**문서 정합성 반영**:
- ✅ PRD/CLAUDE.md 실제 구현 상태에 맞게 업데이트

### 이전 변경 (2026-01-31 세션 8)
**PRD P0 갭 보완**:
- ✅ Reviewer 지정 UI — 승격 시 Reviewer 선택, 상세에서 변경 가능
- ✅ Owner 변경 — INBOX/OPEN 상태에서 Owner 재지정 action
- ✅ Discovery 편집 — `/discoveries/:id/edit` 라우트 신규 (INBOX/OPEN만)
- ✅ INBOX 7일 TTL 경고 — 목록/대시보드에서 방치 INBOX 경고 표시
- ✅ SPEC.md 현행화 — 실제 구현 상태에 맞게 §5, §6 전면 업데이트

### 이전 변경 이력
<details>
<summary>세션 2~7 이력 (접기)</summary>

#### 세션 7 (2026-01-31) — 구현 계획 검토
- ✅ Remix 스택 유지 결정, Phase 2 기능 완료 확인, 빌드 테스트 통과

#### 세션 6 (2026-01-31) — 스킬 파일 점검
- ✅ deploy/session-end/session-start SKILL.md 재작성/수정

#### 세션 5 (2026-01-31) — Phase 2 운영 지원 뷰 완성
- ✅ Weekly Review, Recall Queue, Metrics, CSV Export API

#### 세션 2 (2026-01-31) — Discovery CRUD 완성 (15개 라우트)
- ✅ 인증, 대시보드, Discovery 전체 CRUD, Decision 3종

#### 세션 3 (2026-01-31) — 프로젝트 정리
- ✅ 기획 문서 docs/ 이동, README 교체

#### 세션 4 (2026-01-31) — GitHub 연동
- ✅ GitHub 리포 생성, CF Pages Git 연동, 버전 관리 원칙
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
- **배포 상태**: ✅ 세션 68 프로덕션 배포 완료 — 웹 폼 이벤트 로깅 5건 보완 (배포 ID: e8abb313)
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
| **테스트 인프라** | ✅ | Vitest + Playwright, unit 76 + integration 53 = 129개 통과 |
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
| **테스트 DB 마이그레이션 현행화** | ✅ | tests/helpers/db.ts에 0003~0006 마이그레이션 추가 → 129개 전체 통과 |
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

### 남은 작업
- [x] 최종 프로덕션 배포 — 세션 14에서 완료
- [x] Resend secrets 설정 + 외부 cron 서비스 연동 — 세션 23에서 완료
- [x] Radar 프로덕션 배포 — 세션 27에서 완료 (DB 마이그레이션 + Worker 배포 + 소스 시딩 + 수동 트리거 검증)

- [x] R0 마이그레이션 적용 + 프로덕션 배포 — 세션 56에서 완료
- [x] R0 프로덕션 E2E 검증 (11단계 칸반, Agent 채팅 정상) — 세션 56에서 완료
- [x] R1 마이그레이션 적용 + 프로덕션 배포 — 세션 56에서 완료
- [x] R1 프로덕션 검증 (Method Pack 12종, Tier 필터) — 세션 56에서 완료

### 미래 작업

**후속 순차 작업 (병렬 완료 후)**
- [x] Reviewer 승인 워크플로우 (DB 스키마 변경: `approval_status` 컬럼) — 세션 17에서 완료
- [x] 유사 Seed 검색 — 세션 18에서 완료 (FTS5 기반, `/api/similar-seeds`)
- [x] 고급 지표 — 세션 18에서 완료 (Failure Pattern 재사용률, Owner 부하, Evidence 품질)

**Design Token 마이그레이션 (완료)**
- [x] 전체 라우트 페이지 디자인 토큰 컴포넌트 전환 — 세션 29-30에서 완료 (하드코딩 색상 0건)

**Radar 확장 (선택)**
- [x] Web/YouTube 소스 추가 — 세션 32에서 완료 (Product Hunt, Hugging Face Papers, Two Minute Papers, Y Combinator Blog)
- [x] GeekNews RSS 대안 확인 — web 스크래핑 전환 완료 (User-Agent 개선 + 프로덕션 DB 소스 추가 — 세션 36)

**v2 배포 작업 (완료)**
- [x] `pnpm db:migrate:prod` — 프로덕션 마이그레이션 0005 적용
- [x] `wrangler secret put ANTHROPIC_API_KEY` — Claude API 키 설정
- [x] `pnpm deploy` — 프로덕션 배포
- [x] cron-job.org에 `/api/cron/agent-review` 엔드포인트 추가 — 세션 44에서 완료 (매일 10:00 KST, POST)

**v3 R3b (완료)**
- [x] 알림 엔진: alert_rules → cron 연동 → alerts 생성 (KPI 임계치, 단계 SLA, 기한 초과) — 세션 61에서 완료
- [x] 웹훅 커넥터: webhook_configs → 이벤트 발생 시 외부 전송 (Slack/Teams) — 세션 61에서 완료
- [x] Agent 도구 3개: get_alerts + acknowledge_alert + manage_webhook — 세션 61에서 완료
- [x] Dashboard Alerts: /dashboard/alerts 라우트 + AlertList 컴포넌트 — 세션 61에서 완료
- [x] 프로덕션 배포 — 세션 62에서 완료

**v3 후속 (미정)**
- [x] Gatekeeper 역할: UserRole + requireGatekeeper + admin.users Select + Discovery 상세 — 세션 63에서 완료
- [x] 감사 로그: 주요 액션 audit trail 기록 — 세션 66에서 완료 (event_logs + /dashboard/audit-log + Discovery 타임라인)
- [x] UI 폴리시: KPI 카드, Discovery 링크 시각화, Gate 승인 UI — 세션 64에서 완료
- [x] cron-job.org에 `/api/cron/alerts` 엔드포인트 추가 — 세션 67에서 완료 (매일 09:30 KST, GET)

**운영 후 판단 (보류)**
- [x] 기한 초과 강제 종료 — 세션 32에서 구현 (daily cron 자동 DEAD_END + TIME_CONSTRAINT 패턴 + 이메일 알림)
- [x] 유사도 기반 추천 (새 Seed 입력 시 유사 Dead End 제안) — 세션 18에서 FTS5 기반 구현 완료
