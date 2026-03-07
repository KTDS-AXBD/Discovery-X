---
code: DX-SPEC-011
title: 요구사항 정리
version: 1.0
status: Active
category: SPEC
created: 2026-03-07
updated: 2026-03-07
author: Sinclair Seo
system-version: ">=6.27"
---

# Discovery-X 요구사항 정리

> 작성 기준: 2026-03-06 | 대상: AX BD팀 Discovery-X (세션 257 이후 상태 기준)

---

## A. 리팩토링

### A-1. 공통 서비스 레이어 패키지 분리

**설명**
현재 `app/lib/`, `app/services/`에 집중된 서비스 로직(DiscoveryService, ProposalService, IdeaService 등)을 독립 패키지(`@axis-dx/services`)로 분리한다. Cloudflare D1 + Drizzle ORM 기반의 공통 DB 접근 패턴, 페이지네이션 헬퍼, 오류 처리 래퍼를 포함한 공유 라이브러리로 만들어 타 프로젝트(향후 신규 AX 프로토타입)에서 재사용 가능하도록 한다.

**액션 아이템**
- [ ] `services/` 디렉토리 의존성 그래프 분석 — Remix/routes 직접 참조 여부 확인
- [ ] 순수 비즈니스 로직(DB 접근 없는 유틸) vs DB 의존 서비스 분류
- [ ] `packages/dx-services/` 모노레포 서브패키지 스캐폴딩 (pnpm workspace)
- [ ] DiscoveryService / ProposalService / IdeaService 이식 + barrel export 검증
- [ ] 기존 import 경로 일괄 마이그레이션 후 typecheck/lint/test 통과 확인

**우선순위**: 보통

---

### A-2. Agent 실행 모듈 독립 패키지화

**설명**
`app/lib/agent/` (executor, executor-stream, agent-session, tool-handlers, tool-schemas 등 ~10파일)를 독립 패키지(`@axis-dx/agent-runtime`)로 분리한다. 현재 Discovery-X에서만 사용하지만, 향후 BD 제안 자동화 Agent, MVP 빌더 Agent 등 신규 프로젝트에서도 동일한 Claude API 호출 + SSE 스트리밍 패턴을 재활용할 수 있다.

**액션 아이템**
- [ ] `app/lib/agent/` 외부 의존성 조사 (D1 직접 바인딩 vs 서비스 레이어 경유)
- [ ] CF Workers Durable Object 의존 구간(AgentSessionDO) 분리 가능 여부 판단
- [ ] 순수 실행 로직(executor, stream, pipeline) 패키지화 우선 추진
- [ ] tool-schemas 8개 도메인 파일을 JSON Schema 기반으로 표준화
- [ ] `@axis-dx/agent-runtime` 패키지 README + 사용 예시 작성

**우선순위**: 보통

---

### A-3. 디자인 시스템(@axis-ds) 전환율 완성

**설명**
현재 `@axis-ds/ui-react` 활용률이 11/28 (DS 감사 세션 247 기준)로 절반에 못 미친다. 미전환 컴포넌트 17개(Input, Checkbox, Radio, Switch, Tooltip, Popover, Tabs 등 추정)가 자체 구현으로 남아 있어 디자인 일관성이 깨지고, DS 업데이트 시 양쪽을 동시에 관리해야 하는 유지보수 부담이 있다. 특히 native `<select>` + `<option>` 패턴(12파일 잔류)은 세션 250에서 보류된 상태로 조속한 처리가 필요하다.

**액션 아이템**
- [ ] DS 감사 보고서(세션 247 도출 H1-H5) 기반 미전환 컴포넌트 목록 재확인
- [ ] native `<select>` 12파일 → DS Select (Radix 기반) 일괄 전환 (API 불일치 해결 방안 포함)
- [ ] Input, Checkbox, Switch, Tooltip 등 고빈도 미전환 컴포넌트 DS 래퍼 생성
- [ ] `var()` 인라인 잔류 149건 중 허용 목록 외 케이스 추가 제거
- [ ] DS 전환율 목표 설정 (예: 20/28 → 24/28) 및 주기적 감사 자동화 (lint 규칙)

**우선순위**: 높음

---

### A-4. 공통 UI 컴포넌트 라이브러리 분리

**설명**
`app/components/ui/` 의 DS 래퍼 컴포넌트들(Button, Card, Badge, Dialog, Select 등 현재 ~20개)은 Discovery-X 전용이 아닌 범용 컴포넌트다. 이를 `@axis-dx/ui` 패키지로 분리하면 신규 AX 프로토타입이 동일한 컴포넌트를 즉시 가져다 쓸 수 있다. `@axis-ds/ui-react` 위에 올라가는 프로젝트 공통 래퍼 레이어로 포지셔닝한다.

**액션 아이템**
- [ ] `components/ui/` 중 Discovery-X 도메인 의존이 없는 순수 UI 컴포넌트 목록 추출
- [ ] `packages/ui/` 스캐폴딩 + Storybook 또는 간단한 카탈로그 페이지 구성
- [ ] Tailwind CSS 4 + `@axis-ds` 토큰 의존 방식 표준화 문서 작성
- [ ] dx-custom-tokens.css의 공통 토큰을 패키지 내 CSS로 이동

**우선순위**: 낮음

---

### A-5. Cloudflare 인프라 공통 템플릿화

**설명**
현재 `wrangler.toml`, CI/CD 워크플로우(`.github/workflows/deploy.yml`), D1 마이그레이션 패턴, Session Secret 관리 방식이 프로젝트 내부에 묻혀 있다. 이를 "AX 신규 프로토타입 스타터킷"으로 추출하면 다음 프로젝트 셋업 시간을 대폭 줄일 수 있다.

**액션 아이템**
- [ ] `create-ax-app` 또는 GitHub Template Repository 형태로 스캐폴딩 도구 생성
- [ ] Remix v2 + CF Pages + D1 + Drizzle + @axis-ds 기본 통합 템플릿 구성
- [ ] Google OAuth, Tenant 기반 멀티유저, Agent 채팅 UI를 옵셔널 플러그인으로 분리
- [ ] README에 "30분 안에 프로덕션 배포" 가이드 작성

**우선순위**: 낮음

---

## B. 가젯 (있으면 좋을 기능)

### B-1. 사업제안 PPT 슬라이드 자동 생성 Agent

**설명**
Discovery-X의 `/proposals/:id` 상세 페이지(제목, 배경, 목표, 섹션 5개, 마일스톤, 액션)에 있는 데이터를 기반으로 임원 보고용 PPT 슬라이드(10~15장)를 자동으로 생성하는 Agent 가젯이다. 아이디어 워크스페이스(`/ideas/:id`)의 방법론 분석 결과(BMC, SWOT, 린캔버스 등)도 슬라이드 섹션으로 자동 배치한다. 현재 이미 `/api/ideas/:id/create-proposal` 엔드포인트가 있어 연결 지점이 명확하다.

**액션 아이템**
- [ ] 슬라이드 구조 템플릿 설계: 표지 / 문제정의 / 시장 / 솔루션 / BMC / 실행계획 / 마일스톤 / 근거 / 리스크 / 요청사항
- [ ] `proposals/:id` + `ideas/:id` 데이터를 슬라이드 JSON 스키마로 변환하는 LLM 프롬프트 설계
- [ ] `@axis-dx/agent-runtime` 기반 Agent 도구 `generate_proposal_slides` 신규 추가
- [ ] pptxgenjs 또는 Google Slides API를 통한 실제 파일 생성 구현
- [ ] `/proposals/:id` 상세 페이지에 "슬라이드 내보내기" 버튼 + SSE 진행 상태 표시

**우선순위**: 높음

---

### B-2. 자동 MVP 구축 Agent (형상화 → 코드 스캐폴딩)

**설명**
Discovery-X 파이프라인의 `HYPOTHESIS → EXPERIMENT` 전환 시점에서, 가설에 대한 최소 기능 제품(MVP) 코드를 자동으로 스캐폴딩하는 Agent다. 예를 들어 "AI 기반 계약서 검토 서비스" 가설이 있으면 → Remix + CF Pages 기반의 기본 앱 구조, DB 스키마, 핵심 API 엔드포인트 1~2개, 간단한 UI를 자동 생성해 GitHub 리포지토리로 Push까지 연결한다. A-5의 스타터킷 템플릿을 베이스로 활용한다.

**액션 아이템**
- [ ] MVP 스캐폴딩 범위 정의: 어느 수준까지 자동화할지 명확히 (스키마만 / API까지 / UI까지)
- [ ] Discovery 가설(hypothesis, experiment 목표)에서 기능 목록을 추출하는 LLM 프롬프트 설계
- [ ] `create-ax-app` 스타터킷(A-5)을 CLI 입력 없이 LLM이 파라미터로 구동하는 방식 구현
- [ ] GitHub API 연동: 리포지토리 생성 + 초기 커밋 자동화
- [ ] Discovery 상세(`/discoveries/:id/methods`)에 "MVP 초안 생성" 버튼 진입점 추가
- [ ] 생성된 리포지토리 URL을 Evidence로 자동 등록 (근거 추적)

**우선순위**: 보통

---

## 요약 매트릭스

| # | 타이틀 | 카테고리 | 우선순위 | 의존성 |
|---|--------|---------|---------|--------|
| A-1 | 공통 서비스 레이어 패키지 분리 | 리팩토링 | 보통 | — |
| A-2 | Agent 실행 모듈 독립 패키지화 | 리팩토링 | 보통 | A-1 선행 권장 |
| A-3 | @axis-ds 전환율 완성 | 리팩토링/DS | **높음** | — |
| A-4 | 공통 UI 컴포넌트 라이브러리 분리 | 리팩토링 | 낮음 | A-3 이후 |
| A-5 | CF 인프라 공통 템플릿화 | 리팩토링 | 낮음 | A-1, A-3 이후 |
| B-1 | PPT 슬라이드 자동 생성 Agent | 가젯 | **높음** | — |
| B-2 | 자동 MVP 구축 Agent | 가젯 | 보통 | A-5 선행 권장 |
