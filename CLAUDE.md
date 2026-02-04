# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

Discovery-X는 AX 신사업을 위한 내부 실험 중심 사고 시스템입니다. 관찰을 행동으로 전환하고, 행동을 근거 있는 문서로 남기며, 실패를 조직 자산으로 축적하는 것을 목표로 합니다.

**현재 상태**: 🚀 v4.2 Venture Discovery Sprint + Embeddings 운영 중 (2026-02-04~)
**프로덕션 URL**: https://dx.minu.best (커스텀 도메인) / https://discovery-x.pages.dev

## 프로젝트 문서 구조

이 프로젝트는 **문서 기반(Spec-Driven Development)**으로 진행됩니다.

### 핵심 문서
- **SPEC.md**: 프로젝트 사양서 (6개 섹션 구조 - 매 세션 업데이트)
- **docs/Discovery-X_v1.4.md**: 최종 기획서 (30-60일 운영 실험 전제)
- **docs/Discovery-X_Prototype_PRD_v0.1.md**: 요구사항 정의서 및 개발 계획

### 문서 우선순위
1. PRD가 구현 요구사항의 최종 기준
2. v1.4 기획서는 비즈니스 컨텍스트 및 운영 전제 제공
3. SPEC.md는 진행 상황 및 현재 단계 기록

## 핵심 시스템 개념

### 주요 엔티티 (PRD §5 참고)
- **Discovery**: 메인 레코드 (Seed → Experiment → Evidence → Decision)
- **Experiment**: Discovery당 최대 2개 (가설 → 최소 행동 → 근거)
- **Evidence**: 근거 기록 (타입/강도/링크)
- **Event Log**: 감사 및 지표 수집

### 상태 전환 규칙 (v3: 11단계 파이프라인)
```
DISCOVERY → IDEA_CARD → HYPOTHESIS → EXPERIMENT → EVIDENCE_REVIEW
  → GATE1 → SPRINT → GATE2 → HANDOFF
  + HOLD (일시 중단) / DROP (폐기)
```

### 필수 운영 규칙
- **Single Owner**: Discovery당 책임자 1명 (실험·문서·결정 담당)
- **Time-box**: 최대 4주 또는 실험 2회 내 종료
- **Mandatory Fields**:
  - NOT_NOW: Trigger Type + Revisit Date
  - DEAD_END: Failure Pattern 태깅
  - NEXT: 근거(Evidence) A/B급 최소 2개 권장

## 명령어

```bash
pnpm dev              # 개발 서버 (Vite)
pnpm build            # 프로덕션 빌드
pnpm lint             # ESLint (app/ 대상)
pnpm typecheck        # TypeScript 타입 체크 (tsc)
pnpm test             # 전체 테스트 (Vitest, 561개)
pnpm test:unit        # 유닛 테스트만
pnpm test:integration # 통합 테스트만
pnpm test:coverage    # 커버리지 리포트
pnpm test:e2e         # Playwright E2E 테스트
pnpm db:generate      # Drizzle 마이그레이션 생성
pnpm db:migrate       # D1 로컬 마이그레이션 적용
pnpm db:migrate:prod  # D1 원격 마이그레이션 적용
pnpm db:studio        # Drizzle Studio (DB 브라우저)
pnpm run deploy       # 빌드 + Cloudflare Pages 배포 (pnpm deploy는 workspace 명령이므로 run 필수)
```

## 기술 스택

- **Runtime**: Cloudflare Pages (Edge)
- **Framework**: Remix v2 (Vite)
- **DB**: Cloudflare D1 (SQLite) + Drizzle ORM
- **UI**: React 19 + Tailwind CSS 4 + @axis-ds (tokens/theme/ui-react) + 다크모드
- **Language**: TypeScript (strict)
- **Package Manager**: pnpm
- **Lint**: ESLint 9 (flat config) + typescript-eslint + react-hooks
- **AI (Chat)**: Claude API (tool_use, SSE 스트리밍)
- **AI (Radar)**: OpenAI gpt-4o-mini (수집 스코어링)
- **AI (Embeddings)**: OpenAI text-embedding-3-small + Cloudflare Vectorize
- **Test**: Vitest (unit/integration 561개) + Playwright (E2E)

## 디렉토리 구조

```
app/
├── root.tsx              # Remix root layout (다크모드, 알림 배지)
├── routes/               # 75개 라우트
│   ├── _index.tsx        # / (채팅 인터페이스 — 메인)
│   ├── dashboard.tsx     # /dashboard (레이아웃 + 5탭)
│   ├── dashboard.*.tsx   # /dashboard/* (Pipeline/Metrics/Health/Alerts/Audit Log)
│   ├── settings.tsx      # /settings (Agent 설정)
│   ├── discoveries.*.tsx           # /discoveries (목록/생성/상세)
│   ├── discoveries_.$id.*.tsx      # /discoveries/:id/* (편집/승격/실험/근거/결정/Gate/Graph/Methods)
│   ├── venture.*.tsx               # /venture/* (13개 — 스프린트 관리/분석)
│   ├── review.tsx / recall.tsx     # Weekly Review / Recall Queue
│   ├── metrics.tsx / radar.tsx     # Metrics / Radar UI
│   ├── methods.tsx / docs.tsx      # Method Pack 라이브러리 / Docs
│   ├── login.tsx / auth.google.*   # 인증 (Google OAuth)
│   ├── admin.*.tsx                 # 관리자 (users, seed)
│   ├── api.chat.ts                 # SSE 스트리밍 채팅
│   ├── api.conversations.*.ts      # 대화 CRUD + 메시지
│   ├── api.cron.*.ts               # Cron 5개 (daily/agent-review/alerts/embeddings/weekly-summary)
│   ├── api.export.*.ts             # Export (CSV/JSON/Brief/Metrics)
│   ├── api.venture.*.ts            # Venture API 7개 (decisions/tasks/worker/export/analytics)
│   ├── api.radar.*.ts              # Radar (runs/sources/trigger)
│   └── api.similar-seeds.ts        # 유사 Seed 검색 (Vectorize → FTS5 폴백)
├── db/
│   ├── schema.ts         # Drizzle 스키마 (30개 테이블)
│   ├── index.ts          # DB 헬퍼 (getDb, ventureSchema 머지)
│   └── seed.ts           # 시드 데이터 (stages 11개, method_packs 12개, ontology_types 10개)
├── features/
│   └── venture/          # Venture Discovery Sprint 모듈 (v4)
│       ├── db/schema.ts      # vd_* 16개 테이블 (sprints/opportunities/decisions/signals 등)
│       ├── constants/        # 스프린트 상태/태스크 타입/의존성
│       ├── schemas/          # Zod 검증 스키마
│       ├── domain/           # 상태 머신/스코어링 정책/가드
│       ├── repositories/     # Sprint/Task Queue 리포지토리
│       ├── lib/              # Task Executor (8개 AI 핸들러) + Markdown Exporter
│       └── ui/               # EmptyState/OnboardingGuide/투표 UI 등 13개 컴포넌트
├── lib/
│   ├── agent/            # AI Agent 코어
│   │   ├── executor.ts       # 메인 Agent 루프 (MAX_ROUNDS, 모델별 컨텍스트 윈도우)
│   │   ├── claude-client.ts  # Claude API (SSE 스트리밍, fetchWithRetry)
│   │   ├── system-prompt.ts  # 시스템 프롬프트 빌더
│   │   ├── context-builder.ts # 대화 컨텍스트 구성 (30+ 메시지 요약)
│   │   ├── tool-registry.ts  # 도구 정의 45개 (JSON 스키마, TOOL_MIN_AUTONOMY)
│   │   └── tools/            # 도구 실행 함수 (8개 파일)
│   │       ├── discovery-tools.ts  # Discovery CRUD + 상태 전환
│   │       ├── query-tools.ts      # 조회/검색/지표/Radar
│   │       ├── method-tools.ts     # Method Pack 실행/Gate 패키지
│   │       ├── ontology-tools.ts   # 맥락 그래프/엔티티/중복
│   │       ├── indicator-tools.ts  # KPI/파이프라인 건강도
│   │       ├── connector-tools.ts  # Discovery 간 링크
│   │       ├── governance-tools.ts # Gate 승인 요청/결정
│   │       └── alert-tools.ts      # 알림/웹훅 관리
│   ├── auth/             # 인증 (Google OAuth + 세션 쿠키 + 역할 가드)
│   ├── constants/        # 상수 (11단계, 타입 등)
│   ├── embeddings/       # OpenAI Embeddings + Vectorize 동기화
│   └── validation/       # Zod 스키마 + 비즈니스 규칙
├── components/
│   ├── chat/             # 채팅 UI (ChatPanel, MessageBubble, ToolExecution, ConversationList)
│   ├── dashboard/        # 대시보드 (Pipeline, AuditLogList, AlertList, HealthMetrics)
│   ├── layout/           # 레이아웃 (MainNav, PageLayout)
│   ├── ui/               # Axis 디자인 토큰 기반 공통 컴포넌트
│   ├── charts/           # 차트 (StatusDonut, WeeklyBar)
│   ├── docs/             # 문서 뷰어 컴포넌트
│   ├── evidence/         # 근거 중복 관리 (DuplicateCard)
│   ├── graph/            # 맥락 그래프 시각화 (GraphViewer)
│   └── methods/          # Method Pack UI 컴포넌트
└── styles/               # Tailwind CSS 4 + Axis 토큰 + DX 커스텀 토큰
```

**경로 별칭**: `~/*` → `./app/*` (tsconfig paths)

## 버전 관리 원칙

### 브랜치 전략
- **`master` 단일 브랜치**로 운영 (Prototype 기간 동안)
- 모든 커밋은 `master`에 직접 push

### 커밋 컨벤션
[Conventional Commits](https://www.conventionalcommits.org/) 준수:

```
<type>: <description>

[optional body]
```

| type | 용도 |
|------|------|
| `feat` | 새 기능 추가 |
| `fix` | 버그 수정 |
| `docs` | 문서 변경 |
| `refactor` | 동작 변경 없는 코드 개선 |
| `style` | 포매팅, 세미콜론 등 |
| `chore` | 빌드, 설정, 의존성 등 |

### 버전 태깅
- Phase 완료 시 태그 부여: `v0.1.0` (Phase 1), `v0.2.0` (Phase 2), `v0.3.0` (Phase 3)
- Phase 내 주요 마일스톤은 patch 버전: `v0.1.1`, `v0.1.2`, ...
- Prototype 종료(30-60일 Gate) 시: `v1.0.0`

### 배포
- `master` push → 수동 배포 (`pnpm deploy`)
- 프리뷰: `/deploy --preview`
- 프로덕션: `/deploy`
- 프로덕션 URL: https://dx.minu.best (커스텀 도메인)

## 운영 실험 파라미터 (절대 변경 금지)

PRD §3 참고. 핵심: 30-60일, 최대 5명, Discovery 5-10건 목표.

## 구현 시 주의사항

### 금지 사항 (PRD §2.2 Non-Goals)
- ❌ 전사 공식 포털/플랫폼 구축
- ❌ 완성형 UX (필수 인지부하는 설계의 일부)
- ❌ 외부 고객/CRM 연동
- ❌ 고급 예측/추천 모델
- ❌ 제품 수준 KPI 대시보드

### 구현 상태
- ✅ PRD P0 전 항목 + v3 R0~R3b + v4 Venture Sprint 전체 구현 완료
- ✅ 테스트 561개 통과 (unit 76 + integration 342 + venture 143)
- ✅ 프로덕션 배포 완료 (dx.minu.best)
- ✅ Google OAuth + 역할 분리 (admin/gatekeeper/user/pending)
- ✅ 다크모드 + @axis-ds 패키지 연동
- ✅ Embeddings + Vectorize 시맨틱 검색 운영 중

### Agent 시스템 (v3)
- Agent 코어: executor, claude-client, system-prompt, context-builder, tool-registry
- Agent 도구 **45개**: 8개 파일 (discovery/query/method/ontology/indicator/connector/governance/alert)
- 자율도 레벨 0~3 (TOOL_MIN_AUTONOMY로 도구별 강제)
- 채팅 UI: ConversationList, ChatPanel, MessageBubble, ToolExecution
- 대시보드: Pipeline 칸반 (11단계) + Metrics + Health + Alerts + Audit Log
- 자율 리뷰: api.cron.agent-review.ts

### Agent 아키텍처
```
사용자 메시지 → /api/chat (POST) → executor.ts → Claude API (tool_use)
                                         ↓
                                    도구 실행 (8개 도구 파일)
                                         ↓
                                    결과 저장 (messages 테이블)
                                         ↓
                                    SSE 스트리밍 응답 → 채팅 UI
```

### Agent 도구 카테고리 (45개)
| 카테고리 | 도구 수 | 파일 |
|---------|--------|------|
| Discovery CRUD + 상태 전환 | 11 | discovery-tools.ts |
| 조회/검색/지표/Radar | 12 | query-tools.ts |
| Method Pack 실행/Gate | 6 | method-tools.ts |
| 맥락 그래프/엔티티 | 5 | ontology-tools.ts |
| KPI/건강도 | 4 | indicator-tools.ts |
| Discovery 링크 | 2 | connector-tools.ts |
| Gate 승인 | 2 | governance-tools.ts |
| 알림/웹훅 | 3 | alert-tools.ts |

### 환경 변수
- `ANTHROPIC_API_KEY`: Claude API 키 (Agent 채팅)
- `OPENAI_API_KEY`: Radar 스코어링 (gpt-4o-mini) + Embeddings (text-embedding-3-small)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Google OAuth
- `SESSION_SECRET`: 세션 쿠키 서명 키
- `RESEND_API_KEY`: 이메일 알림 (Resend, 발신: noreply@ideaonaction.ai)
- `CRON_SECRET`: Cron 엔드포인트 인증

**로컬 개발**: `.dev.vars` 파일에 위 변수 설정 (gitignored)

### Cloudflare 바인딩 (wrangler.toml)
- `DB`: D1 데이터베이스
- `VECTORIZE_DISCOVERIES`: Vectorize 인덱스 (dx-discovery-embeddings, 1536차원 cosine)
- `VECTORIZE_EVIDENCE`: Vectorize 인덱스 (dx-evidence-embeddings, 1536차원 cosine)

## Gotchas & 주의사항

### Cloudflare 환경 접근
```typescript
// ✅ 올바른 패턴
const db = getDb(context.cloudflare.env.DB);
// ❌ 잘못된 패턴 (타입 정의용일 뿐)
const db = getDb(context.DB);
```
비-DB 바인딩은 타입 캐스팅 필요: `(context.cloudflare.env as unknown as Record<string, string>).ANTHROPIC_API_KEY`

### D1/SQLite 날짜 처리
- 모든 timestamp는 `integer("field", { mode: "timestamp" })` + `sql\`(unixepoch())\`` 사용
- 날짜 포맷은 `toLocaleDateString()` 대신 수동 포맷 사용 (SSR/CSR hydration mismatch 방지)

### JSON 컬럼
- Drizzle가 자동 직렬화/역직렬화 → `JSON.parse()`/`JSON.stringify()` 수동 호출 금지

### 메시지 정렬
```typescript
// ✅ rowid 기반 정렬 (초 단위 createdAt은 순서 보장 불가)
.orderBy(desc(sql`rowid`))
```

### 테스트 마이그레이션 동기화
- 새 마이그레이션 추가 시 **반드시** `tests/helpers/db.ts`에도 해당 SQL 파일 추가
- 누락 시 "no such table/column" 에러 발생

### 상태 전환 검증
- 직접 DB UPDATE 금지 → 반드시 `DiscoveryValidationRules.validateTransition()` 경유
- `ALLOWED_TRANSITIONS` (app/lib/constants/status.ts)에 정의된 전환만 허용

### Vectorize 인덱스
- 인덱스는 수동 생성 필요 (배포 전):
  ```bash
  wrangler vectorize create dx-discovery-embeddings --dimensions=1536 --metric=cosine
  wrangler vectorize create dx-evidence-embeddings --dimensions=1536 --metric=cosine
  ```

### Venture 스키마 머지
- `app/db/index.ts`에서 core schema + venture schema를 `{ ...schema, ...ventureSchema }`로 머지
- 새 feature 모듈 추가 시 동일 패턴 적용

### SSR 외부화
- `resend`, `mailparser` 등은 `vite.config.ts`에서 SSR external 처리 → 번들 포함 금지

### 빌드 검증
- Remix SSR 모드: `build/client/index.html` 없음이 정상
- 빌드 성공 확인: `build/client/assets/` + `build/server/index.js` 존재 여부로 판단

### 인증 가드 계층
```
getUserFromSession()  → null 가능 (미인증)
requireUser()         → /login 리다이렉트, PENDING → /pending
requireGatekeeper()   → JSON 403 (GATEKEEPER/ADMIN만)
requireAdmin()        → JSON 403 (ADMIN만)
```

## 설계 원칙 (v1.4 §5)

- **한국어 기본**: 입출력 언어는 기본적으로 한국어를 사용
- **의도된 인지 부하**: 쉽게 만드는 UX가 목표 아님
- **Single-Threaded Ownership**: Discovery당 책임자 1명
- **Time-boxed**: 무한 탐구 금지 (4주 또는 실험 2회)

## SDD (Spec Driven Development) 워크플로우

프로젝트 사양서 `SPEC.md`에 설계/아키텍처/현재 상태를 기록하고, 세션 스킬로 관리한다.

### 스킬

| 스킬 | 용도 |
|------|------|
| `/session-start [작업내용]` | SPEC.md에서 프로젝트 컨텍스트 복원 |
| `/session-end [메모]` | Git 커밋 + SPEC.md 업데이트 |
| `/deploy [--preview]` | CLAUDE.md 참조 기반 배포 |
| `/lint` | 변경 파일 대상 ESLint + TypeScript 점검/수정 |

### SPEC.md 구조

| 섹션 | 내용 | 업데이트 빈도 |
|------|------|-------------|
| §1 Project Overview | 미션, 범위, 성공 기준, 대상 사용자 | 드물게 |
| §2 Product Design | 핵심 워크플로우, UI 요소, 페이지 구성 | 기능 추가 시 |
| §3 Architecture Patterns | 라우팅, 상태관리, 컴포넌트, 데이터 흐름 | 패턴 변경 시 |
| §4 Technical Constraints | 빌드 산출물, 제약사항 | 드물게 |
| §5 Current Status | 현재 단계, 최근 변경, 활성 결정사항 | **매 세션** |
| §6 Implementation Log | 완료 요약, 미래 작업 | 마일스톤 시 |

### 워크플로우 패턴

```bash
# 패턴 1: 빠른 프로토타이핑 (배포 없이)
/session-start 오늘은 새 컴포넌트 구현
→ 작업 수행
/session-end 컴포넌트 구현 완료

# 패턴 2: 배포 포함
/session-end 기능 구현 완료
/deploy

# 패턴 3: 프리뷰 배포
/session-end QA용 변경사항
/deploy --preview
```
