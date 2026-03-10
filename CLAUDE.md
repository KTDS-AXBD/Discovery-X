# CLAUDE.md

프로젝트 사양은 SPEC.md, 요구사항은 docs/specs/DX-SPEC-002_discovery-x-prototype-prd.md, 기획서는 docs/specs/DX-SPEC-001_discovery-x-v1.4.md 참조. 문서 인덱스는 docs/INDEX.md 참조.

## 프로젝트 개요

Discovery-X — AX 신사업 내부 실험 중심 사고 시스템. 관찰→행동→근거→자산 축적.
- **프로덕션**: https://dx.minu.best
- **스택**: Remix v2 (Vite) + Cloudflare Pages (Edge) + D1 (SQLite) + Drizzle ORM + React 19 + Tailwind CSS 4 + TypeScript (strict) + pnpm
- **경로 별칭**: `~/*` → `./app/*`
- **디자인 시스템**: `@axis-ds/ui-react` + `@axis-ds/theme` + `@axis-ds/tokens` (AX 사내 DS)

## 명령어

```bash
pnpm dev              # 개발 서버 (Vite)
pnpm build            # 프로덕션 빌드
pnpm lint             # ESLint (app/ 대상)
pnpm typecheck        # TypeScript 타입 체크 (tsc)
pnpm test             # 전체 테스트 (Vitest)
pnpm test:unit        # 유닛 테스트만
pnpm test:integration # 통합 테스트만
pnpm test:e2e         # Playwright E2E
pnpm test:watch       # 테스트 watch 모드
pnpm test:coverage    # 커버리지 포함 테스트
pnpm test -- tests/unit/foo.test.ts  # 단일 파일 테스트
pnpm db:generate      # Drizzle 마이그레이션 생성
pnpm db:migrate       # D1 로컬 마이그레이션 적용
pnpm db:migrate:prod  # D1 원격 마이그레이션 적용
pnpm db:studio        # Drizzle Studio (DB GUI)
pnpm start            # 빌드 결과물 로컬 실행 (wrangler pages dev)
pnpm run deploy       # 빌드 + Cloudflare Pages 배포 (pnpm deploy 아님, run 필수)
pnpm load-test        # 부하 테스트 — health (artillery)
pnpm load-test:api    # 부하 테스트 — API CRUD
pnpm load-test:chat   # 부하 테스트 — chat stream
pnpm load-test:spike  # 부하 테스트 — spike
```

## IMPORTANT: 검증 워크플로우 (GOV-004 DoD 6단계)

| 단계 | 명령 | 기준 |
|------|------|------|
| 1. 타입 체크 | `pnpm typecheck` | 에러 0개 |
| 2. 린트 | `pnpm lint` | 에러 0개 |
| 3. 테스트 | `pnpm test` | 관련 테스트 전체 통과 |
| 4. 빌드 | `pnpm build` | `build/client/assets/` + `build/server/index.js` 존재 |
| 5. 배포 확인 | `/ax-02-end` (CI/CD) 또는 `/ax-03-deploy --preview` | 프리뷰/프로덕션 정상 |
| 6. 문서 반영 | SPEC.md + CHANGELOG.md | 변경사항 기록 완료 |

- UI 변경 시 `pnpm dev`로 시각적 확인 병행
- docs: 커밋은 1~5번 스킵, 6번만 필수
- Bug (P0)는 5번 후 6번 사후 반영 허용

## 핵심 비즈니스 규칙

### 상태 전환 (11단계)
```
DISCOVERY → IDEA_CARD → HYPOTHESIS → EXPERIMENT → EVIDENCE_REVIEW
  → GATE1 → SPRINT → GATE2 → HANDOFF + HOLD / DROP
```

- **Single Owner**: Discovery당 책임자 1명
- **Time-box**: 최대 4주 또는 실험 2회
- **운영 실험**: 30-60일, 최대 5명, Discovery 5-10건 (절대 변경 금지)

## 금지 사항 (PRD §2.2)

- 전사 공식 포털/플랫폼 구축 금지
- 완성형 UX 금지 (필수 인지부하는 설계의 일부)
- 외부 고객/CRM 연동 금지
- 고급 예측/추천 모델 금지
- 제품 수준 KPI 대시보드 금지

## 커밋 & 배포

- Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `style:`, `chore:`
- `master` 단일 브랜치 운영, 직접 push
- 배포: `/ax-02-end`에 git push + CI/CD 포함. `/ax-03-deploy --preview`는 프리뷰 전용

## Gotchas (IMPORTANT)

### Cloudflare 환경 접근
```typescript
// 올바른 패턴
const db = getDb(context.cloudflare.env.DB);
// 잘못된 패턴
const db = getDb(context.DB);
```
비-DB 바인딩: `(context.cloudflare.env as unknown as Record<string, string>).ANTHROPIC_API_KEY`

### D1/SQLite
- timestamp: `integer("field", { mode: "timestamp" })` + `` sql`(unixepoch())` ``
- 날짜 포맷: `toLocaleDateString()` 대신 수동 포맷 (hydration mismatch 방지)
- JSON 컬럼: Drizzle 자동 직렬화 → `JSON.parse()`/`JSON.stringify()` 수동 호출 금지
- 메시지 정렬: `` .orderBy(desc(sql`rowid`)) `` (createdAt 초 단위라 순서 보장 불가)

### 마이그레이션
- 새 마이그레이션 추가 시 **반드시** `tests/helpers/db.ts`에도 SQL 파일 추가 (누락 시 "no such table" 에러)

### 상태 전환
- 직접 DB UPDATE 금지 → `DiscoveryValidationRules.validateTransition()` 경유 필수
- `ALLOWED_TRANSITIONS` (app/lib/constants/status.ts) 정의된 전환만 허용

### 스키마 머지
- `app/db/index.ts`에서 14개 스키마 머지: `schema`, `discoverySchema`, `radarSchema`, `chatSchema`, `labSchema`, `proposalSchema`, `archiveSchema`, `ideasSchema`, `tokenUsageSchema`, `v2Schema`, `matrixSchema`, `requestsSchema`, `topicSchema`, `costSchema`
  - `costSchema`는 `~/db`에서 re-export하지 않음 (vi.mock 호환성) — 사용처에서 `~/features/cost/db/schema` 직접 import

### Import 패턴
- `from "~/db"` 통일 — `~/db/schema` 직접 import 금지 (core auth만 `db/schema.ts`에서 export)

### SSR 외부화 (vite.config.ts)
- `ssr.external`: `resend`, `mailparser`, `@zone-eu/mailsplit`, `libmime`
- `ssr.noExternal`: `@axis-ds/ui-react`, `@axis-ds/theme`, `@axis-ds/tokens`, `@radix-ui/react-select` (이들은 반드시 번들링해야 SSR 동작)

### 인증 가드
```
getUserFromSession()  → null 가능
requireUser()         → /login 리다이렉트, PENDING → /pending
requireGatekeeper()   → 403 (GATEKEEPER/ADMIN만)
requireAdmin()        → 403 (ADMIN만)
```

### 환경 변수
- `.dev.vars` 파일에 설정 (gitignored): ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_AI_API_KEY, GOOGLE_CLIENT_ID/SECRET, SESSION_SECRET, CRON_SECRET

### Vite 빌드
- `chunkSizeWarningLimit: 1000` 설정됨 (기본 500보다 높음)
- Remix v3 future flags 활성화: `v3_fetcherPersist`, `v3_relativeSplatPath`, `v3_throwAbortReason`

## 디렉토리 구조

```
app/
├── components/     # 공유 UI 컴포넌트 (charts, docs, layout, onboarding, tenant, ui — ui/ 하위 21개)
├── db/             # Drizzle 스키마 + DB 연결 (index.ts에서 스키마 머지)
├── features/       # 도메인별 모듈 (14 BC: archive, chat, cost, dashboard, discovery, ideas, lab, matrix, profile, proposals, radar, requests, settings, topic)
│   └── {feature}/  # db/schema.ts + constants + types + ui/
├── lib/            # 공유 유틸 (agent, auth, embeddings, notifications, ...)
├── routes/         # Remix 라우트 (flat-file convention)
└── styles/         # Tailwind CSS + 커스텀 토큰
```

## 설계 원칙

- **한국어 기본**: 입출력 한국어
- **의도된 인지 부하**: 쉬운 UX가 목표 아님

## IMPORTANT: 워크플로우 우선순위 (SDD-primary)

SPEC.md 기반 SDD(Spec-Driven Development)가 이 프로젝트의 **주 워크플로우**이다. bkit PDCA 플러그인은 보조 도구로만 사용한다.

### 세션 시작/종료 (3-Tier 아키텍처)
- 세션 시작: `/ax-01-start` (MEMORY.md 자동 로딩 → SPEC.md 보충 읽기). bkit SessionStart hook의 AskUserQuestion을 무시한다.
- 세션 종료: `/ax-02-end` (Git 커밋 + SPEC.md §5 지표 + MEMORY.md 컨텍스트 + CHANGELOG.md 세션 기록 + git push + CI/CD 배포)
- 세션 히스토리: `docs/CHANGELOG.md` (SPEC.md에는 히스토리를 추가하지 않음)
- `/pdca status`, `/pdca plan`, `/pdca design`, `/pdca do`는 사용하지 않는다.

### bkit PDCA — 보조 사용만 허용
- 허용: `/pdca analyze`, `/pdca iterate`, `/pdca report` — 위 3개 외 PDCA 스킬 사용 금지
- bkit Feature Usage Report 포맷은 응답에 포함하지 않는다

### 상태 추적 (3-Tier)
- **Tier 1**: CLAUDE.md + `MEMORY.md` (자동 로딩) → **Tier 2**: SPEC.md (세션 시작 시 Read) → **Tier 3**: docs/CHANGELOG.md (검색 시에만)
- **승격 마커**: MEMORY.md에 반복 규칙 발견 시 `[→CLAUDE]` 마커 부착 → `/ax-02-end`에서 자동 승격

## Agent Teams

- agent team 작업 시 항상 `/ax-06-team` 스킬 사용 (tmux split pane)
- 빌트인 subagent(Task tool) 대신 tmux 기반 `claude -p` 인스턴스 사용

## 스킬

### ax 플러그인 (user scope)
| 스킬 | 용도 |
|------|------|
| `/ax-01-start [작업]` | 세션 시작 (MEMORY.md 자동 + SPEC.md 보충) |
| `/ax-02-end [메모]` | 세션 종료 (커밋 + push + CI/CD + SPEC.md/MEMORY.md/CHANGELOG 동기화) |
| `/ax-03-deploy [--preview]` | 프리뷰 배포 또는 명시적 재배포 |
| `/ax-04-verify [all\|lint\|typecheck\|test\|coverage\|watch]` | 코드 검증 — lint + typecheck + test 통합 (관련 테스트 자동 탐색 + 실패 시 자동 수정) |
| `/ax-05-sync [push\|pull\|status\|stash\|config]` | 멀티 환경(Windows/WSL) Git 코드 + 설정 동기화 |
| `/ax-06-team <설명>` | Agent Teams 병렬 작업 (tmux) |
| `/ax-07-gov [list\|check\|apply]` | 거버넌스 표준 관리 |
| `/ax-08-ver [status\|bump\|tag\|check]` | 버전 관리 |
| `/ax-09-doc [new\|index\|version\|archive\|check]` | 문서 관리 |
| `/ax-10-req [new\|triage\|list\|status\|sync]` | 요구사항 관리 |
| `/ax-11-risk [add\|list\|resolve]` | 리스크 관리 |
| `/ax-12-retro` | 마일스톤 회고 |
| `/ax-13-selfcheck` | ax plugin 자율점검 (commands/standards/hooks 정합성) |
| `/ax-14-req-interview` | 요구사항 인터뷰 → PRD → 외부 AI 다중 검토 → 착수 판단 워크플로우 |

### 프로젝트 스킬 (.claude/skills/)
| 스킬 | 용도 |
|------|------|
| `/ax-p1-migrate` | Drizzle 마이그레이션 생성 → 로컬 적용 → test helper 동기화 |
| `/ax-batch-analysis` | 배치 AI 분석 — Claude Code 구독으로 미처리 radar/ontology 처리 (cron 보조) |

### 프로젝트 에이전트 (.claude/agents/)
| 에이전트 | 용도 |
|----------|------|
| `ax-a01-transition` | 상태 전환 코드가 비즈니스 규칙(ALLOWED_TRANSITIONS, validateTransition)을 준수하는지 검증 |
| `ax-a02-migration` | Drizzle 마이그레이션 파일과 tests/helpers/db.ts 동기화 여부 검증 |
| `ax-a03-security` | Agent 도구 및 인프라 변경 시 보안 검토 |

### bkit 플러그인 (보조용)
| 스킬 | 용도 |
|------|------|
| `/pdca analyze` | 갭 분석 (구현 후 보조) |
| `/pdca iterate` | 자동 개선 (갭 < 90% 시) |
| `/pdca report` | 완료 보고서 생성 |

## 컨텍스트 압축 보존 규칙

When compacting, always preserve: 수정된 파일 목록, 현재 작업 컨텍스트, Gotchas 섹션 패턴, 검증 워크플로우 결과
