# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

Discovery-X는 AX 신사업을 위한 내부 실험 중심 사고 시스템입니다. 관찰을 행동으로 전환하고, 행동을 근거 있는 문서로 남기며, 실패를 조직 자산으로 축적하는 것을 목표로 합니다.

**현재 상태**: 🚀 v3 Ontology Ready AI Platform 운영 중 (2026-02-01~)
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
pnpm db:generate      # Drizzle 마이그레이션 생성
pnpm db:migrate       # D1 로컬 마이그레이션 적용
pnpm db:migrate:prod  # D1 원격 마이그레이션 적용
pnpm deploy           # 빌드 + Cloudflare Pages 배포
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

## 디렉토리 구조

```
app/
├── root.tsx              # Remix root layout (다크모드, 알림 배지)
├── routes/               # 52개 라우트 (주요 그룹)
│   ├── _index.tsx        # / (채팅 인터페이스 — 메인)
│   ├── dashboard.tsx     # /dashboard (레이아웃 + 5탭: Pipeline/Metrics/Health/Alerts/Audit Log)
│   ├── dashboard.*.tsx   # /dashboard/* (5개 탭 라우트)
│   ├── settings.tsx      # /settings (Agent 설정)
│   ├── discoveries.*.tsx           # /discoveries (목록/생성/상세)
│   ├── discoveries_.$id.*.tsx      # /discoveries/:id/* (편집/승격/실험/근거/결정/Gate/Graph/Methods)
│   ├── review.tsx / recall.tsx     # Weekly Review / Recall Queue
│   ├── metrics.tsx / radar.tsx     # Metrics / Radar UI
│   ├── methods.tsx / docs.tsx      # Method Pack 라이브러리 / Docs
│   ├── evidence.duplicates.tsx     # 근거 중복 관리
│   ├── login.tsx / logout.tsx      # 인증
│   ├── auth.google.*.tsx           # Google OAuth
│   ├── admin.*.tsx                 # 관리자 (users, seed)
│   ├── pending.tsx                 # 승인 대기
│   ├── api.chat.ts                 # SSE 스트리밍 채팅
│   ├── api.conversations.*.ts      # 대화 CRUD + 메시지
│   ├── api.cron.*.ts               # Cron 3개 (daily/agent-review/alerts)
│   ├── api.export.*.ts             # Export (CSV/JSON/Brief)
│   ├── api.radar.*.ts              # Radar (runs/sources/trigger)
│   └── api.similar-seeds.ts        # 유사 Seed 검색
├── db/
│   ├── schema.ts         # Drizzle 스키마 (24개 테이블)
│   ├── index.ts          # DB 헬퍼 (getDb)
│   └── seed.ts           # 시드 데이터 (stages 11개, method_packs 12개, ontology_types 10개)
├── lib/
│   ├── agent/            # AI Agent 코어
│   │   ├── executor.ts       # 메인 Agent 루프 (MAX_ROUNDS, 모델별 컨텍스트 윈도우)
│   │   ├── claude-client.ts  # Claude API (SSE 스트리밍, fetchWithRetry)
│   │   ├── system-prompt.ts  # 시스템 프롬프트 빌더
│   │   ├── context-builder.ts # 대화 컨텍스트 구성 (30+ 메시지 요약)
│   │   ├── tool-registry.ts  # 도구 정의 43개 (JSON 스키마, TOOL_MIN_AUTONOMY)
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
└── styles/               # Tailwind CSS + Axis 토큰 + DX 커스텀 토큰
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

### 필수 구현 (PRD §7.1 P0)
1. Discovery CRUD + 상태 전환
2. Owner/Reviewer 지정 및 승계
3. Experiment 최대 2개 제한
4. Evidence 타입/강도 관리
5. NOT_NOW/DEAD_END 필수 필드 강제
6. Weekly Review / Recall Queue 뷰
7. 최소 지표 집계/Export

### 구현 상태 (2026-02-03 기준)
- ✅ P0 전 항목 + v3 R0~R3b 전체 구현 완료
- ✅ 테스트 216개 통과 (Vitest unit 76 + integration 140)
- ✅ 프로덕션 배포 완료 (dx.minu.best)
- ✅ Google OAuth + 역할 분리 (admin/gatekeeper/user/pending)
- ✅ 다크모드 + @axis-ds 패키지 연동

### Agent 시스템 (v3)
- Agent 코어: executor, claude-client, system-prompt, context-builder, tool-registry
- Agent 도구 **43개**: 8개 파일 (discovery/query/method/ontology/indicator/connector/governance/alert)
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

### Agent 도구 카테고리 (43개)
| 카테고리 | 도구 수 | 파일 |
|---------|--------|------|
| Discovery CRUD + 상태 전환 | 11 | discovery-tools.ts |
| 조회/검색/지표/Radar | 10 | query-tools.ts |
| Method Pack 실행/Gate | 6 | method-tools.ts |
| 맥락 그래프/엔티티 | 5 | ontology-tools.ts |
| KPI/건강도 | 4 | indicator-tools.ts |
| Discovery 링크 | 2 | connector-tools.ts |
| Gate 승인 | 2 | governance-tools.ts |
| 알림/웹훅 | 3 | alert-tools.ts |

### 환경 변수
- `ANTHROPIC_API_KEY`: Claude API 키
- `OPENAI_API_KEY`: Radar 스코어링 (gpt-4o-mini)
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Google OAuth
- `RESEND_API_KEY`: 이메일 알림 (Resend)
- `CRON_SECRET`: Cron 엔드포인트 인증

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
