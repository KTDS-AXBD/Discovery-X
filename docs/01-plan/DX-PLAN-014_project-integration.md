---
code: DX-PLAN-014
title: 프로젝트 연동/병합 준비 — Foundry-X 서비스 연동 + GitHub/Cloudflare 계정 전환
version: "1.0"
status: Draft
category: PLAN
created: 2026-03-18
updated: 2026-03-18
author: Sinclair Seo
req: DX-REQ-021
spec-item: F51
---

# DX-PLAN-014: 프로젝트 연동/병합 준비

## Executive Summary

| 항목 | 값 |
|------|-----|
| Feature | F51 — 프로젝트 연동/병합 준비 |
| REQ | DX-REQ-021 (P1) |
| 마일스톤 | v0.8.0 |
| 예상 Phase | 6 Phase (순차) |
| 유형 | Chore (인프라 전환) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | Discovery-X와 Foundry-X가 별도 GitHub Org/Cloudflare 계정에 분산 — 팀 협업·리소스 관리·비용 추적 비효율 |
| **Solution** | GitHub Org 통합(KTDS-AXBD) + Cloudflare 계정 통합 + 서비스 간 연동 기반 마련 |
| **Function / UX Effect** | 단일 조직에서 두 프로젝트 관리, 향후 API 연동 또는 데이터 공유 가능 |
| **Core Value** | 팀 인프라 표준화 — 운영 효율 + 확장 기반 |

---

## 1. 배경 및 목표

### 1.1 현재 상태

| 항목 | Discovery-X | Foundry-X |
|------|------------|-----------|
| GitHub Org | AX-BD-Team (sinclairseo@gmail.com) | KTDS-AXBD (ktds.axbd@gmail.com) |
| Cloudflare | sinclair.seo@gmail.com | ktds.axbd@gmail.com |
| 프레임워크 | Remix v2 (Vite) | Hono API + Next.js 14 |
| DB | D1 (124 tables, 67 migrations) | D1 (6 tables, 3 migrations) |
| 도메인 | dx.minu.best | fx.minu.best (계획) |
| 규모 | ~99K LOC, 2,668 tests | ~403K LOC (문서 포함), 216 tests |
| 비즈니스 | 신사업 탐색/실험 11단계 | AI-인간 협업 하네스 (SDD Triangle) |

### 1.2 목표

1. **GitHub 조직 통합**: Discovery-X를 KTDS-AXBD org으로 이전
2. **Cloudflare 계정 통합**: KTDS-AXBD Cloudflare 계정에서 운영
3. **서비스 연동 기반 마련**: API 레벨 연동 아키텍처 설계
4. **운영 연속성 보장**: 이전 중 서비스 다운타임 최소화

### 1.3 비목표 (Non-Goals)

- 코드 레벨 병합 (프레임워크 불일치로 현실적이지 않음)
- Foundry-X 기능을 Discovery-X에 이식
- 디자인 시스템 통합 (axis-ds vs shadcn/ui)
- 인증 체계 통합 (Session vs JWT)

---

## 2. 연동/병합 전략 비교

### 2.1 Option 분석

| Option | 결합도 | 작업량 | 리스크 | 적합도 |
|--------|--------|--------|--------|--------|
| **A: API 연동** | 낮음 | 소 | 낮음 | ⭐ 권장 |
| B: DB 공유 (Service Binding) | 중간 | 중 | 중 | 조건부 |
| C: 코드 병합 | 높음 | 대 | 높음 | ❌ 비권장 |

### 2.2 권장: Option A — API 레벨 연동

```
┌─────────────────┐     HTTP/JSON     ┌─────────────────┐
│  Discovery-X    │ ◄──────────────► │  Foundry-X API  │
│  (Remix/Pages)  │   Service Token   │  (Hono/Workers) │
│  dx.minu.best   │                   │  fx.minu.best   │
└────────┬────────┘                   └────────┬────────┘
         │                                      │
    ┌────┴────┐                           ┌────┴────┐
    │  D1 DB  │                           │  D1 DB  │
    │ (124 tbl)│                           │ (6 tbl) │
    └─────────┘                           └─────────┘
```

**연동 포인트 (향후 구현)**:
- FX의 하네스 건강도 점수 → DX 대시보드에 표시
- DX의 Discovery 파이프라인 상태 → FX 워크스페이스에 표시
- 공유 사용자 인증 (API 키 또는 JWT 교환)

---

## 3. 실행 계획 (6 Phase)

### Phase 1: GitHub 이전 (Day 1) — D1 확정: Transfer

| # | 작업 | 명령/상세 | 리스크 |
|---|------|----------|--------|
| 1.1 | 리포 Transfer | GitHub Settings → Transfer → KTDS-AXBD | Issues 21건 + URL 리다이렉트 자동 |
| 1.2 | Actions Secrets 재등록 | 5개: `ANTHROPIC_API_KEY`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `CRON_SECRET`, `SESSION_SECRET` | Transfer 시 Secrets 이전 불가 — 수동 재등록 |
| 1.3 | Environment 재설정 | production (url: https://dx.minu.best) | |
| 1.4 | git remote 갱신 | `git remote set-url origin git@github.com:KTDS-AXBD/Discovery-X.git` | |
| 1.5 | GitHub Project 재생성 | AX-BD-Team → KTDS-AXBD Org 이동으로 Project 75 아이템 재등록 필요 | 스크립트 자동화 가능 |
| 1.6 | CI/CD 동작 확인 | Transfer 후 `git push` → Actions 정상 트리거 확인 | |

### Phase 2: Cloudflare 이전 (Day 2-3)

| # | 작업 | 상세 | 리스크 |
|---|------|------|--------|
| 2.1 | Pages 프로젝트 생성 | 새 CF 계정에 `discovery-x` 프로젝트 | |
| 2.2 | D1 DB 생성 + 마이그레이션 | 새 DB 생성 → 67개 SQL 적용 | 순서 보장 필수 |
| 2.3 | Vectorize 인덱스 6개 생성 | 차원/메트릭 일치 확인 | |
| 2.4 | Workers 4개 배포 | agent/radar/collab/venture | DO 설정 필요 (agent-worker) |
| 2.5 | wrangler.toml 업데이트 | 5개 파일의 database_id, account_id 변경 | |
| 2.6 | Secrets 설정 | Pages 10개 + Worker별 Secrets | |
| 2.7 | Feature Flags (vars) | 14개 Pages vars 설정 | |

### Phase 3: DNS/도메인 (Day 3) — D2 확정: minu.best 유지

| # | 작업 | 상세 | 리스크 |
|---|------|------|--------|
| 3.1 | DNS 이전 | minu.best DNS를 새 CF 계정 nameserver로 전환 | DNS 전파 최대 48시간 |
| 3.2 | Pages custom domain | dx.minu.best → 새 CF 계정 Pages 프로젝트에 연결 | |
| 3.3 | Worker custom domain | agent-worker.dx.minu.best → 새 CF Worker에 연결 | |
| 3.4 | Google OAuth | redirect URI 변경 불필요 (도메인 동일) | ✅ 리스크 제거 |

### Phase 4: 외부 서비스 (Day 4)

| # | 서비스 | 작업 |
|---|--------|------|
| 4.1 | AI API 키 4종 | Anthropic, OpenAI, Google AI, DeepSeek — 새 조직 키 발급 |
| 4.2 | Google OAuth | 새 OAuth 앱 등록 + redirect URI |
| 4.3 | Resend | 이메일 도메인 + API 키 |
| 4.4 | cron-job.org | 13개 엔드포인트 URL 갱신 |

### Phase 5: 데이터 마이그레이션 (Day 5)

| # | 작업 | 방법 | 리스크 |
|---|------|------|--------|
| 5.1 | D1 데이터 export | `wrangler d1 export discovery-x-db --remote --output dx-backup.sql` | 대용량 시 타임아웃 |
| 5.2 | D1 데이터 import | 새 DB에 `wrangler d1 execute --file dx-backup.sql --remote` | |
| 5.3 | Vectorize 재구축 | 임베딩 재계산 배치 (Cron 트리거) | 시간 소요 (6 인덱스) |
| 5.4 | DO 상태 | agent-worker 세션 — 휘발성이므로 이전 불필요 | |

### Phase 6: 검증 (Day 5-6)

| # | 검증 항목 | 방법 |
|---|----------|------|
| 6.1 | CI/CD 파이프라인 | master push → 자동 배포 확인 |
| 6.2 | Workers Cron | 각 Worker Cron 수동 트리거 |
| 6.3 | Pages Cron | 13개 엔드포인트 curl 테스트 |
| 6.4 | Google OAuth | 로그인 플로우 E2E |
| 6.5 | AI Fallback 체인 | 5단계 순차 테스트 |
| 6.6 | 이메일 | Resend 발송 테스트 |
| 6.7 | 기능 테스트 | 핵심 플로우 수동 검증 (Discovery 생성, Agent 채팅, Radar 수집) |

---

## 4. 기술 스택 비교 상세

| 항목 | Discovery-X | Foundry-X | 호환성 |
|------|------------|-----------|--------|
| 프레임워크 | Remix v2 (SSR) | Hono API + Next.js 14 (Static) | ❌ |
| React | 19 | 18 | ⚠️ |
| DB/ORM | D1 + Drizzle | D1 + Drizzle | ✅ |
| Timestamp | integer (unixepoch) | text (ISO string) | ⚠️ |
| 인증 | Session (cookie) | JWT (Access+Refresh) | ❌ |
| 권한 | admin/gatekeeper/user/pending | admin/member/viewer | ⚠️ |
| CSS | Tailwind 4 + @axis-ds | Tailwind 4 + shadcn/ui | ⚠️ |
| 상태 관리 | Remix loader/action | Zustand | ❌ |
| 테스트 | Vitest 3 | Vitest 3 | ✅ |
| CI/CD | GH Actions → CF Pages | GH Actions → CF Workers | ✅ |
| Git 전략 | master 직접 push | PR + Approve + Squash | ⚠️ |

---

## 5. 공유 가능한 모듈

향후 연동 시 재사용 가능한 Foundry-X 모듈:

| 모듈 | 위치 | 용도 | DX 통합 방식 |
|------|------|------|-------------|
| `@foundry-x/shared` | packages/shared/ | 공유 타입 | npm 패키지 참조 |
| spec-parser | api/services/ | SPEC.md 파싱 | DX lib/에 이식 가능 |
| health-calc | api/services/ | 건강도 점수 계산 | API 호출 또는 이식 |
| integrity-checker | api/services/ | 무결성 검증 | API 호출 |
| harness builders | cli/harness/builders/ | 하네스 빌더 | DX Agent 도구로 래핑 |

---

## 6. 리스크 및 완화

| # | 리스크 | 영향 | 확률 | 완화 |
|---|--------|------|------|------|
| R1 | D1 데이터 마이그레이션 실패 | 운영 데이터 손실 | 낮음 | export 전 백업 + 단계별 검증 |
| R2 | DNS 전파 지연 | 최대 48시간 서비스 불가 | 중 | 기존 도메인 유지 + 병행 운영 |
| R3 | API 키 누락 | AI 기능 장애 | 낮음 | 체크리스트 기반 순차 설정 |
| R4 | GitHub Project 이전 불가 | 프로젝트 보드 재생성 필요 | 중 | 75 아이템 수동 재등록 or 스크립트 |
| R5 | Vectorize 재구축 시간 | 검색 품질 저하 (임시) | 낮음 | 배치 재계산 + FTS5 fallback |
| ~~R6~~ | ~~개인 도메인 (minu.best)~~ | ~~조직 이전 시 도메인 변경~~ | — | ✅ 해소 (D2: minu.best 유지 확정) |

---

## 7. 의사결정 (확정, 2026-03-18)

| # | 항목 | 결정 | 근거 |
|---|------|------|------|
| D1 | 리포 이전 방식 | ✅ **Transfer** | Issues 21건 + Project 75건 + PR 히스토리 보존. 기존 URL 자동 리다이렉트 |
| D2 | 도메인 | ✅ **minu.best 유지** | DNS만 새 CF 계정으로 연결. 도메인 변경 시 외부 서비스 13개+ 갱신 부담 회피 |
| D3 | 연동 방식 | ✅ **API 연동 (Option A)** | 프레임워크 불일치(Remix vs Next.js)로 코드 병합 비현실적. 독립 운영 + HTTP 교환 |
| D4 | Git 워크플로우 | ✅ **master 직접 push 유지** | Prototype 단계에서 속도 우선. DX/FX 별도 전략 유지 |
| D5 | CF 계정 공유 | ✅ **같은 계정 (KTDS-AXBD)** | 동일 계정에서 D1 Service Binding, Workers AI 바인딩 공유 가능 |

---

## 8. 참조

- [[DX-REQ-021]] — F51 요구사항
- Foundry-X 리포: https://github.com/KTDS-AXBD/Foundry-X
- Discovery-X 리포: https://github.com/AX-BD-Team/Discovery-X
- Worker 리서치: `.team-tmp/f51-foundry-x-analysis.md`
- 인프라 리서치: `.team-tmp/f51-discovery-x-infra.md`
