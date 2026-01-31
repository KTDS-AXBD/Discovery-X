# SPEC.md — Project Specification

## 1. Project Overview

### 미션
AX 신사업 발굴 과정에서 **관찰→내부 실험→근거→결정**을 강제로 닫게 하여, 조직이 "더 잘 틀리고 더 빨리 배우는" 루프를 만든다.

### 범위

**In-scope (PRD §7.1 P0)**
- Discovery CRUD + 상태 전환 (INBOX → OPEN → NEXT/NOT_NOW/DEAD_END)
- Owner/Reviewer 지정 및 승계
- Experiment 최대 2개 관리
- Evidence 타입/강도/링크 기록
- NOT_NOW: Trigger Type + Revisit Date 강제
- DEAD_END: Failure Pattern 태깅 강제
- Weekly Review 뷰 (OPEN 목록, 경과일 순)
- Recall Queue 뷰 (Revisit 도래 NOT_NOW 목록)
- 최소 지표 집계/Export

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
Flow A: Seed Inbox 입력 (5분)
  → 제목/요약/링크 입력 → Owner=등록자(기본) → status=INBOX

Flow B: 실험으로 승격 (OPEN)
  → Owner 지정(필수) → Experiment 1개 등록 → status=OPEN → due_date 자동(+28일)

Flow C: Evidence 기록
  → 타입/강도 선택 → 요약 + 링크

Flow D: Decision 닫기
  → NEXT: 근거 A/B 최소 2개 권장
  → NOT_NOW: Trigger Type + Condition + Revisit Date 필수
  → DEAD_END: Failure Pattern 1~3 + 증거 기반 이유 필수

Flow E: Recall (재호출)
  → Revisit Date 도래 → Review 큐 자동 등재
  → 유사 Seed 검색 시 Not Now/Dead End 제안

Flow F: Weekly Decision Review (30분)
  → OPEN 항목을 Age 순 정렬 → Owner 1줄 요약 + 상태 제안
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

### 페이지 구성 (Remix Routes)

```
/                     → 대시보드 (Discovery 요약 + 빠른 액션)
/discoveries          → Discovery 목록 (필터: 상태별)
/discoveries/new      → Seed 입력 (INBOX 생성)
/discoveries/:id      → Discovery 상세 (Experiments, Evidence, Decision)
/discoveries/:id/edit → Discovery 편집
/review               → Weekly Review 뷰
/recall               → Recall Queue 뷰
```

---

## 3. Architecture Patterns

### 기술 스택
- **Runtime**: Cloudflare Pages (Edge)
- **Framework**: Remix v2 (Vite plugin)
- **DB**: Cloudflare D1 (SQLite)
- **ORM**: Drizzle ORM
- **UI**: React 19 + Tailwind CSS 3
- **Language**: TypeScript (strict mode)
- **Package Manager**: pnpm

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
```

### DB 스키마 (구현 완료)

| 테이블 | 역할 | PRD 매핑 |
|--------|------|----------|
| `users` | 사용자 (Owner/Reviewer) | §4 |
| `discoveries` | 메인 레코드 (Seed~Decision) | §5.1 |
| `experiments` | 실험 (Discovery당 최대 2개) | §5.2 |
| `evidence` | 근거 기록 (타입/강도) | §5.3 |
| `event_logs` | 감사/지표 수집 | §5.4 |

### 상태 전환 규칙 (DB에 반영됨)
```
INBOX → OPEN → { NEXT | NOT_NOW | DEAD_END }
                ↓ (실험 2개 완료 시)
           EXTENSION_REQUESTED → { NEXT | NOT_NOW | DEAD_END }
                ↓
           실험 추가 가능 (최대 3개)
```

Validation:
- Owner 없으면 OPEN 이상 전환 불가
- OPEN 전환 시 due_date = created_at + 28일
- EXTENSION_REQUESTED 전환 시 due_date += 14일, 실험 최대 3개 허용
- NOT_NOW: trigger_type + revisit_date 필수
- DEAD_END: failure_pattern 필수

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
**P0 완료 + 전체 후속 기능 구현 + QA 검증 완료 — 운영 실험 시작 준비 완료**

P0 전 항목 + Reviewer 승인 워크플로우 + FTS5 유사 Seed 검색 + 고급 지표 5종 + Export 확장 + 이메일 알림 + 테스트 129개 통과. QA 체크리스트 전체 플로우(A~P) 수동 테스트 완료. 배포 후 30-60일 운영 실험 시작 가능.

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

### 최근 변경 (2026-01-31 세션 20)
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
- **인증 방식**: Session 기반 (D1 `sessions` 테이블)
- **기술 스택**: Remix v2 + D1 확정
- **프로젝트 구조**: 기획 문서는 `docs/`, SDD 핵심(CLAUDE.md, SPEC.md)은 루트
- **브랜치 전략**: master 단일 브랜치 (Prototype 기간)
- **배포**: Cloudflare Pages Git 연동 (master push → 자동 빌드/배포)
- **EXTENSION_REQUESTED**: ✅ 구현 완료 (OPEN + 실험 2개 → 연장 요청 → +14일, 3번째 실험 가능)
- **다음 단계**: Resend secrets 설정 + 외부 cron 연동 후 30-60일 운영 실험 시작
- **DB 마이그레이션**: ✅ 4개 마이그레이션 프로덕션 적용 완료 (0000~0003)
- **빌드 상태**: `pnpm build` (310KB server) + `pnpm typecheck` + `pnpm lint` + `pnpm test` (129개) 모두 통과
- **배포 상태**: ✅ 세션 18 프로덕션 배포 완료
- **이메일 설정 필요**: `wrangler secret put RESEND_API_KEY` + `CRON_SECRET` 후 외부 cron 서비스 연동
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
| 인증 시스템 | ✅ | Session 기반 (D1 저장, 30일 만료) |
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

### 남은 작업
- [x] 최종 프로덕션 배포 — 세션 14에서 완료
- [ ] Resend secrets 설정 (`wrangler secret put RESEND_API_KEY` + `CRON_SECRET`)
- [ ] 외부 cron 서비스 연동 (daily 알림 활성화)

### 미래 작업

**후속 순차 작업 (병렬 완료 후)**
- [x] Reviewer 승인 워크플로우 (DB 스키마 변경: `approval_status` 컬럼) — 세션 17에서 완료
- [x] 유사 Seed 검색 — 세션 18에서 완료 (FTS5 기반, `/api/similar-seeds`)
- [x] 고급 지표 — 세션 18에서 완료 (Failure Pattern 재사용률, Owner 부하, Evidence 품질)

**운영 후 판단 (보류)**
- [ ] 기한 초과 강제 종료 (현재 OVERDUE 배지만 표시)
- [x] 유사도 기반 추천 (새 Seed 입력 시 유사 Dead End 제안) — 세션 18에서 FTS5 기반 구현 완료
