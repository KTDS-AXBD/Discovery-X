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
- `app/components/` — 재사용 UI 컴포넌트 (예정)
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
                ↓
           EXTENSION_REQUESTED (2회 실험 초과 시)
```

Validation:
- Owner 없으면 OPEN 이상 전환 불가
- OPEN 전환 시 due_date = created_at + 28일
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
| `pnpm typecheck` | TypeScript 타입 체크 |

---

## 5. Current Status

> **이 섹션은 매 세션마다 업데이트한다.**

### 현재 단계
**Phase 2 완료 → 운영 실험 시작 가능 (Ready for Production)**

✅ 모든 핵심 기능 완성! Weekly Review, Recall Queue, Metrics 뷰까지 구현되어 30-60일 운영 실험을 즉시 시작할 수 있습니다.
PRD §7.1 P0 요구사항 100% 달성.

### 최근 변경 (2026-01-31 세션 6)
**스킬 파일 점검 및 보강**:
- ✅ `deploy/SKILL.md` 전면 재작성 — 브랜치명(`main`→`master`), 배포 방식(wrangler 직접), 명령어 명시화, DB 마이그레이션 확인 단계 추가
- ✅ `session-end/SKILL.md` 수정 — 빌드 확인을 `pnpm typecheck` + `pnpm build`로 명시
- ✅ `session-start/SKILL.md` 수정 — CLAUDE.md 읽기 단계 추가
- ⚠️ 기존 TypeScript 에러 다수 발견 (Drizzle ORM extraConfig 타입, Env 타입, Date 직렬화) — 향후 수정 필요

### 이전 세션 (2026-01-31 세션 5)
**Phase 2 운영 지원 뷰 완성**:
- ✅ Weekly Review (`/review`) — OPEN 목록, Age 기반 색상, Due Date 추적
- ✅ Recall Queue (`/recall`) — Revisit Date 도래 NOT_NOW 목록, 트리거 정보 표시
- ✅ Metrics 대시보드 (`/metrics`) — P0/P1 성공 기준 추적, 핵심 지표 카드
- ✅ CSV Export API — Discovery 전체 데이터 + 지표 집계 다운로드
- ✅ MainNav 업데이트 — Metrics 링크 추가

### 이전 세션 (2026-01-31 세션 2)
**Discovery CRUD 완성 (15개 라우트)**:
- ✅ 인증: 로그인/로그아웃 (`/login`, `/logout`) + Session 관리
- ✅ 홈 대시보드 (`/`) — 통계 카드 (전체/Inbox/Open/Next 개수)
- ✅ Discovery 목록 (`/discoveries`) — 상태별 필터, 테이블 뷰
- ✅ Discovery 생성 (`/discoveries/new`) — Seed 입력 (INBOX 생성)
- ✅ Discovery 상세 (`/discoveries/:id`) — Seed, Experiments, Evidence 표시
- ✅ INBOX → OPEN 승격 (`/discoveries/:id/promote`) — Owner + 첫 Experiment 등록
- ✅ Experiment 추가 (`/discoveries/:id/add-experiment`) — 최대 2개 제한 강제
- ✅ Evidence 추가 (`/discoveries/:id/add-evidence`) — 타입/강도 선택
- ✅ Decision 3가지 (`decide-next`, `decide-not-now`, `decide-dead-end`)
- ✅ 관리: Seed 데이터 생성 (`/admin/seed`)

**Decision Dialogs 구현**:
- ✅ NEXT: decisionRationale + A/B급 Evidence 2개 미만 시 경고
- ✅ NOT_NOW: triggerType(4가지) + triggerCondition + revisitDate(미래 필수)
- ✅ DEAD_END: failurePattern(1-3개) + evidenceReason

**UI 컴포넌트**:
- ✅ MainNav: 전역 내비게이션 (Discoveries, Weekly Review, Recall Queue)
- ✅ 상태별 색상 테마 (INBOX: 파랑, OPEN: 노랑, NEXT: 초록, NOT_NOW: 회색, DEAD_END: 빨강)
- ✅ 상태 기반 액션 버튼 (승격, 실험/근거 추가, 결정)

**Validation 강제**:
- ✅ Owner 없이 OPEN 전환 불가
- ✅ Experiment 최대 2개 (3번째 시도 시 에러)
- ✅ NOT_NOW/DEAD_END 필수 필드 누락 시 저장 불가
- ✅ EventLog에 모든 상태 전환 기록

### 프로젝트 정리 (2026-01-31 세션 3)
- ✅ 기획 문서 `docs/`로 이동 (Discovery-X_v1.4.md, PRD_v0.1.md)
- ✅ README.md 프로젝트용으로 교체 (템플릿 가이드 → Discovery-X 소개)
- ✅ CLAUDE.md 문서 경로 참조 `docs/` 반영
- ✅ `.gitignore`에 `nul` 패턴 추가 (Windows 아티팩트 재발 방지)

### GitHub 연동 및 버전 관리 (2026-01-31 세션 4)
- ✅ GitHub 리포지토리 생성 (AX-BD-Team/Discovery-X, private)
- ✅ Cloudflare Pages Git 연동 설정 (master push → 자동 배포)
- ✅ 버전 관리 원칙 수립 (CLAUDE.md에 기록)
  - master 단일 브랜치, Conventional Commits, Phase별 태깅
- ✅ CLAUDE.md 기술 스택 섹션 현행화 (outdated Confluence/Next.js 참조 제거)
- ✅ `.gitignore`에서 `pnpm-lock.yaml` 제거 (CF Pages 빌드 실패 수정)

### 활성 결정사항
- **인증 방식**: Session 기반 (D1 `sessions` 테이블)
- **기술 스택**: Remix v2 유지 (React Router v7 마이그레이션은 향후)
- **프로젝트 구조**: 기획 문서는 `docs/`, SDD 핵심(CLAUDE.md, SPEC.md)은 루트
- **브랜치 전략**: master 단일 브랜치 (Prototype 기간)
- **배포**: Cloudflare Pages Git 연동 (master push → 자동 빌드/배포)
- **프로덕션 준비 상태**: Phase 0-2 완료, 운영 실험 시작 가능
- **다음 단계**: TypeScript 에러 수정 → 프로덕션 배포 → 운영 실험 시작 (30-60일)
- **알려진 이슈**: `pnpm typecheck` 실패 — Drizzle ORM extraConfig 타입, Env 타입 불일치, Date 직렬화 에러

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
| **CSV Export API** | ✅ | Discovery 데이터 + 지표 다운로드 |
| **스킬 파일 보강** | ✅ | deploy 전면 재작성, session-end/start 수정 |

### 미래 작업

**Phase 3 — 운영 자동화 (선택)**
- [ ] TTL 리마인드 (Inbox 7일, due_date 임박)
- [ ] Revisit Date 도래 자동 등재
- [ ] 이메일 알림 (SendGrid/Resend)

**Phase 4 — 추가 개선 (선택)**
- [ ] 실시간 차트 (현재는 숫자 카드만)
- [ ] Experiment 진행률 추적 (현재 진행 중인 실험 표시)
- [ ] 유사도 기반 추천 (새 Seed 입력 시 유사 Dead End 제안)
- [ ] 모바일 반응형 UI (현재는 데스크톱 전용)
- [ ] 1-pager Brief 자동 생성
