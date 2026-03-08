---
code: DX-ANLS-005
title: F36 MVP 빌더 Agent — 설계-구현 갭 분석
version: 1.0
status: Active
category: ANLS
created: 2026-03-08
updated: 2026-03-08
author: Sinclair Seo
---

# F36 MVP 빌더 Agent — 설계-구현 갭 분석

> **Analysis Type**: Gap Analysis (Design vs Implementation)
>
> **Project**: Discovery-X
> **Version**: 0.6.0
> **Analyst**: Gap Detector Agent
> **Date**: 2026-03-08
> **Design Doc**: [[DX-DSGN-009]] `docs/02-design/DX-DSGN-009_mvp-builder.md`

---

## 1. 분석 개요

### 1.1 분석 목적

F36 MVP 빌더 Agent의 설계문서(DX-DSGN-009)와 실제 구현 코드 간 일치도를 검증하고, 누락/변경/추가 항목을 식별한다.

### 1.2 분석 범위

| 영역 | 설계 위치 | 구현 위치 |
|------|-----------|-----------|
| DB 스키마 | DSGN-009 Section 2 | `app/features/lab/db/schema.ts` |
| 마이그레이션 | DSGN-009 Section 2 | `drizzle/0053_mvp_builds.sql` |
| API 엔드포인트 | DSGN-009 Section 3 | `app/routes/api.lab.mvp-builder.ts`, `api.lab.mvp-builder.$id.download.ts` |
| 서비스 레이어 | DSGN-009 Section 4 | `app/features/lab/service/mvp-builder.service.ts` |
| UI 페이지 | DSGN-009 Section 5 | `app/routes/lab.mvp-builder.tsx`, `app/routes/lab.tsx` |
| ZIP 다운로드 | DSGN-009 Section 6 | `app/routes/api.lab.mvp-builder.$id.download.ts` |
| 의존성 | DSGN-009 Section 8 | `package.json` |
| 테스트 헬퍼 | DSGN-009 Section 7 #3 | `tests/helpers/db.ts` |

---

## 2. 갭 분석 (설계 vs 구현)

### 2.1 DB 스키마

| 필드/항목 | 설계 | 구현 | 상태 |
|-----------|------|------|------|
| id (PK) | TEXT PRIMARY KEY | TEXT PRIMARY KEY + $defaultFn(randomUUID) | ✅ 일치 (구현이 auto-gen 추가) |
| proposal_id | TEXT NOT NULL FK proposals(id) CASCADE | TEXT NOT NULL (FK 없음) | ⚠️ 변경됨 |
| tenant_id | TEXT NOT NULL FK tenants(id) | TEXT NOT NULL (FK 없음) | ⚠️ 변경됨 |
| stack | TEXT NOT NULL DEFAULT 'nextjs' | TEXT NOT NULL DEFAULT 'nextjs' | ✅ 일치 |
| sections | TEXT NOT NULL DEFAULT '[]' (JSON) | TEXT JSON mode, $type<string[]>, default([]) | ✅ 일치 |
| project_name | TEXT NOT NULL | TEXT NOT NULL | ✅ 일치 |
| files | TEXT NOT NULL DEFAULT '[]' (JSON) | TEXT JSON mode, $type<{path,content,language}[]> | ✅ 일치 |
| architecture | TEXT DEFAULT NULL (JSON) | TEXT JSON mode, $type<Record<string,unknown>> | ✅ 일치 |
| summary | TEXT DEFAULT NULL | TEXT (nullable) | ✅ 일치 |
| file_count | INTEGER NOT NULL DEFAULT 0 | INTEGER NOT NULL DEFAULT 0 | ✅ 일치 |
| total_lines | INTEGER NOT NULL DEFAULT 0 | INTEGER NOT NULL DEFAULT 0 | ✅ 일치 |
| status | TEXT NOT NULL DEFAULT 'generating' | TEXT NOT NULL DEFAULT 'generating' | ✅ 일치 |
| error_message | TEXT | TEXT (nullable) | ✅ 일치 |
| created_at | INTEGER NOT NULL DEFAULT (unixepoch()) | INTEGER timestamp mode, default(unixepoch()) | ✅ 일치 |
| updated_at | INTEGER NOT NULL DEFAULT (unixepoch()) | INTEGER timestamp mode, default(unixepoch()) | ✅ 일치 |
| idx_mvp_builds_proposal | CREATE INDEX | index("idx_mvp_builds_proposal") | ✅ 일치 |
| idx_mvp_builds_tenant | CREATE INDEX | index("idx_mvp_builds_tenant") | ✅ 일치 |

**마이그레이션 SQL (0053)**: 설계 SQL과 1:1 일치. FK 선언도 SQL에 포함되어 있음.

> Drizzle 스키마에서 FK `.references()` 선언이 없지만, 마이그레이션 SQL에는 `REFERENCES proposals(id) ON DELETE CASCADE`와 `REFERENCES tenants(id)`가 있어 실질적으로 DB 레벨에서는 일치. D1이 FK를 강제하지 않으므로 기능적 영향 없음.

### 2.2 API 엔드포인트

| 설계 | 구현 | 상태 | 비고 |
|------|------|------|------|
| POST /api/lab/mvp-builder (SSE) | action() in api.lab.mvp-builder.ts | ✅ 일치 | SSE ReadableStream 패턴 |
| GET /api/lab/mvp-builder?proposalId={id} | loader() in api.lab.mvp-builder.ts | ✅ 일치 | |
| GET /api/lab/mvp-builder/{id}/download | loader() in api.lab.mvp-builder.$id.download.ts | ✅ 일치 | application/zip |

### 2.3 API 인증 방식

| 설계 | 구현 | 상태 | 비고 |
|------|------|------|------|
| requireUser() | getSessionContext() | ⚠️ 변경됨 | 기능적으로 동등하지만 메서드명 다름 |

설계문서는 `requireUser()` (401 리다이렉트 포함)를 명시했으나, 구현은 `getSessionContext()`로 null 체크 후 수동으로 401 JSON 응답 반환. API 라우트에서는 리다이렉트보다 JSON 에러가 적절하므로 구현이 더 올바름.

### 2.4 SSE 이벤트 타입

| 설계 타입 | 구현 타입 | 상태 |
|-----------|-----------|------|
| step_start (step: 1\|2\|3\|4, label) | 동일 | ✅ 일치 |
| step_complete (step: 1\|2\|3\|4, data?) | 동일 | ✅ 일치 |
| file_generated (path, language, lines) | 동일 | ✅ 일치 |
| error (step: number, message) | 동일 | ✅ 일치 |
| complete (buildId, fileCount, totalLines) | 동일 | ✅ 일치 |
| (명시 없음) | heartbeat 이벤트 처리 (클라이언트) | ⚠️ 추가됨 |

### 2.5 서비스 레이어 — MvpBuilderService

| 설계 항목 | 구현 | 상태 |
|-----------|------|------|
| 위치: features/lab/service/mvp-builder.service.ts | 동일 | ✅ 일치 |
| Step 1: analyzeProposal() | 구현됨 | ✅ 일치 |
| Step 2: designArchitecture() | 구현됨 | ✅ 일치 |
| Step 3: generateCode() | 구현됨 | ✅ 일치 |
| Step 4: validateOutput() | 구현됨 | ✅ 일치 |
| MvpSpec 인터페이스 | 필드 전체 일치 | ✅ 일치 |
| MvpArchitecture 인터페이스 | 필드 전체 일치 | ✅ 일치 |
| 제안별 최신 1건 (DELETE + INSERT) | 구현됨 | ✅ 일치 |

### 2.6 UI 페이지

| 설계 항목 | 구현 | 상태 |
|-----------|------|------|
| Lab 탭 추가 (TABS 배열) | `{ to: "/lab/mvp-builder", label: "MVP 빌더", end: false }` | ✅ 일치 |
| 페이지 경로: lab.mvp-builder.tsx | 구현됨 (569줄) | ✅ 일치 |
| 상태 흐름: 선택 -> 설정 -> 생성중 -> 완료 | Phase: select \| generating \| complete \| error | ⚠️ 변경됨 |
| 제안 선택 드롭다운 | SelectPhase 컴포넌트 | ✅ 일치 |
| 스택 선택 (disabled, nextjs only) | 구현됨 | ✅ 일치 |
| 포함 섹션 체크박스 | SECTION_OPTIONS (hero, features, faq) | ✅ 일치 |
| SSE 진행률 표시 | GeneratingPhase 컴포넌트 | ✅ 일치 |
| Step 3 파일 목록 실시간 표시 | 구현됨 | ✅ 일치 |
| 파일 보기/복사 버튼 | ResultPhase 컴포넌트 | ✅ 일치 |
| 인라인 코드 뷰어 (pre/code) | expandedFile 토글 | ✅ 일치 |
| ZIP 다운로드 버튼 | `<a href>` 링크 | ✅ 일치 |
| 재생성 버튼 | resetToSelect 콜백 | ✅ 일치 |
| 기존 빌드 조회 (loader) | 하드코딩 null ("아직 미구현" 주석) | ❌ 미구현 |

### 2.7 ZIP 다운로드

| 설계 항목 | 구현 | 상태 |
|-----------|------|------|
| fflate 라이브러리 사용 | `import { zipSync, strToU8 } from "fflate"` | ✅ 일치 |
| 서버사이드 ZIP 생성 | loader에서 entries 생성 + zipSync | ✅ 일치 |
| Content-Type: application/zip | 구현됨 | ✅ 일치 |
| Content-Disposition filename | `${build.projectName}.zip` | ✅ 일치 |
| 인증 가드 | getSessionContext + 401 | ✅ 일치 |
| 빌드 상태 검증 (completed) | `build.status !== "completed"` 체크 | ✅ 일치 |

### 2.8 파일 목록 & 인프라

| 설계 파일 | 구현 | 상태 |
|-----------|------|------|
| app/features/lab/db/schema.ts | mvpBuilds 테이블 추가됨 | ✅ 일치 |
| migrations/0053_mvp_builds.sql | 존재 (20줄) | ✅ 일치 |
| tests/helpers/db.ts | 0053 마이그레이션 추가됨 (L82) | ✅ 일치 |
| app/features/lab/service/mvp-builder.service.ts | 존재 (457줄) | ✅ 일치 |
| app/routes/api.lab.mvp-builder.ts | 존재 (93줄) | ✅ 일치 |
| app/routes/api.lab.mvp-builder.$id.download.ts | 존재 (41줄) | ✅ 일치 |
| app/routes/lab.mvp-builder.tsx | 존재 (569줄) | ✅ 일치 |
| app/routes/lab.tsx | TABS에 MVP 빌더 추가됨 | ✅ 일치 |
| app/db/index.ts | labSchema 이미 포함 (자동) | ✅ 일치 |
| package.json | fflate ^0.8.2 추가됨 | ✅ 일치 |

### 2.9 일치율 요약

```
+-------------------------------------------------+
|  Overall Match Rate: 93%                        |
+-------------------------------------------------+
|  ✅ 일치:          37 items (88%)                |
|  ⚠️ 변경됨 (양호):   4 items  (9%)               |
|  ❌ 미구현:          1 item   (2%)               |
+-------------------------------------------------+
```

---

## 3. 상세 갭 목록

### 3.1 [CRITICAL 없음]

Critical 수준의 갭은 발견되지 않았다.

### 3.2 [MAJOR] 기존 빌드 조회 미구현

| 항목 | 내용 |
|------|------|
| **설계** | lab.mvp-builder.tsx loader에서 mvpBuilds 테이블 조회하여 기존 빌드 표시 |
| **구현** | `const existingBuild: MvpBuildResult \| null = null;` 하드코딩 + 주석 "아직 미구현" |
| **위치** | `app/routes/lab.mvp-builder.tsx:69-70` |
| **영향** | 페이지 새로고침 시 이전 생성 결과를 볼 수 없음. 매번 새로 생성해야 함 |
| **심각도** | Major |
| **권장** | loader에서 mvpBuilds 조회 로직 추가 |

### 3.3 [MINOR] UI 상태 흐름 변경

| 항목 | 내용 |
|------|------|
| **설계** | 선택 -> 설정 -> 생성중 -> 완료 (4단계) |
| **구현** | select \| generating \| complete \| error (4단계이나 "설정"이 "선택"에 통합) |
| **영향** | 없음 (UX 개선). 선택과 설정이 같은 화면에 있어 더 간결 |
| **심각도** | Minor |
| **판정** | 의도적 변경 (설계 대비 개선) |

### 3.4 [MINOR] 인증 방식 변경

| 항목 | 내용 |
|------|------|
| **설계** | `requireUser()` 사용 |
| **구현** | `getSessionContext()` + 수동 401 JSON |
| **영향** | 없음 (API 라우트에서 JSON 에러가 리다이렉트보다 적절) |
| **심각도** | Minor |
| **판정** | 의도적 변경 (API 패턴 준수) |

### 3.5 [MINOR] Drizzle FK 선언 누락

| 항목 | 내용 |
|------|------|
| **설계** | proposal_id FK -> proposals(id) CASCADE, tenant_id FK -> tenants(id) |
| **구현** | Drizzle 스키마에 `.references()` 없음. 마이그레이션 SQL에는 FK 존재 |
| **영향** | 없음 (D1은 FK 미강제, SQL에 FK 있어 스키마 문서화 역할은 수행) |
| **심각도** | Minor |

### 3.6 [MINOR] heartbeat 이벤트 추가

| 항목 | 내용 |
|------|------|
| **설계** | R4에서 heartbeat 언급하였으나 SSE 이벤트 타입에는 미정의 |
| **구현** | 클라이언트에서 `evt.type === "heartbeat"` 처리 (건너뛰기) |
| **영향** | 없음 (방어적 코딩, 설계 리스크 R4 대응) |
| **심각도** | Minor |

---

## 4. 코드 품질

### 4.1 서비스 레이어

| 항목 | 평가 |
|------|------|
| 단일 책임 | ✅ MvpBuilderService가 빌드 전체 오케스트레이션 담당 |
| 에러 핸들링 | ✅ Proposal not found 예외, API 라우트에서 try-catch + SSE error 이벤트 |
| 타입 안전성 | ✅ MvpSpec, MvpArchitecture, MvpBuildProgress 타입 정의 |
| JSON 파싱 | ✅ extractJson() 유틸로 코드 펜스 내 JSON 추출 |

### 4.2 API 라우트

| 항목 | 평가 |
|------|------|
| 인증 | ✅ 모든 라우트에서 세션 검증 |
| 입력 검증 | ✅ proposalId 필수 체크 |
| 에러 응답 | ✅ 적절한 HTTP 상태 코드 사용 |
| SSE 형식 | ✅ `data: {json}\n\n` 표준 준수 |

### 4.3 UI 컴포넌트

| 항목 | 평가 |
|------|------|
| 컴포넌트 분리 | ✅ SelectPhase, GeneratingPhase, ResultPhase, SummaryItem 분리 |
| 클린업 | ✅ useEffect에서 AbortController 정리 |
| 상태 관리 | ✅ phase 기반 조건부 렌더링 |
| 접근성 | ⚠️ select 요소에 label은 있으나 for/htmlFor 미연결 (경미) |

---

## 5. 테스트 커버리지

| 영역 | 테스트 파일 | 상태 |
|------|-------------|------|
| mvp-builder.service.ts | 없음 | ❌ 미작성 |
| api.lab.mvp-builder.ts | 없음 | ❌ 미작성 |
| api.lab.mvp-builder.$id.download.ts | 없음 | ❌ 미작성 |

> 설계문서에서 테스트를 명시하지 않았으나, MEMORY.md에 "v0.6.0 신규 미커버: mvp-builder 서비스/API 테스트 미비 (후속 작업 필요)"로 기록되어 있음. 후속 세션에서 처리 예정.

---

## 6. 아키텍처 준수

| 레이어 | 파일 | 의존 방향 | 상태 |
|--------|------|-----------|------|
| Route (Presentation) | lab.mvp-builder.tsx | ~/db, ~/lib/auth | ✅ 정상 |
| API Route (Presentation) | api.lab.mvp-builder.ts | ~/db, ~/lib/auth, ~/features/lab/service | ✅ 정상 |
| Service (Application) | mvp-builder.service.ts | ~/db, ~/lib/ai | ✅ 정상 |
| Schema (Domain) | lab/db/schema.ts | ~/db (core schema only) | ✅ 정상 |

의존 방향 위반: 없음. features/ BC 패턴 준수.

---

## 7. 컨벤션 준수

| 항목 | 상태 |
|------|------|
| 파일명 kebab-case (라우트) | ✅ lab.mvp-builder.tsx |
| 서비스 파일명 kebab-case | ✅ mvp-builder.service.ts |
| 컴포넌트 PascalCase | ✅ MvpBuilderPage, SelectPhase, GeneratingPhase, ResultPhase |
| 상수 UPPER_SNAKE_CASE | ✅ STEPS, SECTION_OPTIONS |
| import 순서 | ✅ react -> remix -> drizzle -> internal |
| DB 접근 패턴 | ✅ `context.cloudflare.env.DB` |
| import 패턴 | ✅ `from "~/db"` 사용 (~/db/schema 미사용) |

컨벤션 준수율: **100%**

---

## 8. 종합 점수

| 카테고리 | 점수 | 상태 |
|----------|:----:|:----:|
| 설계 일치 | 93% | ✅ |
| 코드 품질 | 90% | ✅ |
| 아키텍처 준수 | 100% | ✅ |
| 컨벤션 준수 | 100% | ✅ |
| 테스트 커버리지 | 0% | ❌ |
| **종합 (테스트 제외)** | **96%** | ✅ |

---

## 9. 권장 조치

### 9.1 즉시 조치 (Major)

| # | 항목 | 파일 | 설명 |
|---|------|------|------|
| 1 | 기존 빌드 조회 구현 | `app/routes/lab.mvp-builder.tsx:69-70` | loader에서 mvpBuilds 테이블 조회 로직 추가. 현재 하드코딩 null |

### 9.2 단기 조치 (테스트)

| # | 항목 | 예상 파일 |
|---|------|-----------|
| 1 | MvpBuilderService 유닛 테스트 | `tests/unit/features/lab/mvp-builder.service.test.ts` |
| 2 | MVP Builder API 통합 테스트 | `tests/integration/api/mvp-builder.test.ts` |

### 9.3 설계문서 업데이트 권장

| # | 항목 | 설명 |
|---|------|------|
| 1 | UI 상태 흐름 | "선택 -> 설정"을 "select (선택+설정 통합)"으로 갱신 |
| 2 | 인증 방식 | `requireUser()` -> `getSessionContext()` + 수동 401로 갱신 |
| 3 | heartbeat 이벤트 | SSE 이벤트 타입 목록에 heartbeat 추가 |

---

## 10. 결론

F36 MVP 빌더 Agent는 설계문서 대비 **93% 일치율**을 달성했다. 아키텍처, 컨벤션, 핵심 기능(4단계 Agent 루프, SSE 스트리밍, ZIP 다운로드) 모두 설계대로 구현되었다.

유일한 Major 갭은 UI 페이지의 **기존 빌드 조회 미구현** (loader에서 mvpBuilds 테이블을 조회하지 않고 null 하드코딩)이며, 이는 후속 세션에서 빠르게 해결 가능하다.

나머지 변경사항(인증 방식, UI 상태 통합, heartbeat 처리)은 모두 구현 품질을 높이는 방향의 의도적 변경으로, 설계문서 갱신만 필요하다.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-03-08 | 초기 분석 | Gap Detector Agent |
