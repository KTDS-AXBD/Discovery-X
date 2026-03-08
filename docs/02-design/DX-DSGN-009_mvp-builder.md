---
code: DX-DSGN-009
title: MVP 빌더 Agent 설계
version: 1.0
status: Active
category: DSGN
created: 2026-03-08
updated: 2026-03-08
author: Sinclair Seo
---

# MVP 빌더 Agent — 설계 문서

> F36 | 세션 334 | 2026-03-08

---

## 0. 요구사항 인터뷰 요약

| 항목 | 결정 |
|------|------|
| **입력 소스** | Proposal 10개 섹션 + Ideas 12종 분석 결과 통합 |
| **출력 범위** | 랜딩페이지(히어로+CTA, 기능소개, FAQ) + API 목업(정적 mock) |
| **기술 스택** | Next.js + Tailwind CSS |
| **실행 위치** | 실험실(Lab) "MVP 빌더" 전용 탭 |
| **결과물 형태** | DB 저장 + ZIP 다운로드 (둘 다) |
| **LLM 전략** | 멀티스텝 Agent 루프 (4단계, SSE 스트리밍) |
| **이력 관리** | 제안별 최신 1건만 (덮어쓰기) |

---

## 1. 아키텍처 개요

```
┌─ Lab "MVP 빌더" 탭 ──────────────────────────────────────┐
│ [1] 사업제안 선택 → [2] 옵션 설정 → [3] 생성 → [4] 결과 │
└───────────┬───────────────────────────────────────────────┘
            │ POST /api/lab/mvp-builder (SSE)
            ▼
┌─ MvpBuilderService ──────────────────────────────────────┐
│ Step 1: analyzeProposal()   — 데이터 추출 + 구조화       │
│ Step 2: designArchitecture() — 페이지/API/컴포넌트 설계  │
│ Step 3: generateCode()       — 파일별 코드 생성          │
│ Step 4: validateOutput()     — 일관성 검증               │
└───────────┬───────────────────────────────────────────────┘
            │ callLLM() + FallbackContext
            ▼
┌─ DB 저장 ─────────────────────────────────────────────────┐
│ mvp_builds 테이블 (제안별 1건, 파일 목록 JSON)            │
└───────────────────────────────────────────────────────────┘
```

---

## 2. DB 스키마

### mvp_builds 테이블

```sql
CREATE TABLE mvp_builds (
  id TEXT PRIMARY KEY,
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  -- 생성 설정
  stack TEXT NOT NULL DEFAULT 'nextjs',         -- 'nextjs' | 'remix' | 'html'
  sections TEXT NOT NULL DEFAULT '[]',          -- JSON: 포함 섹션 ['hero','features','faq']
  -- 생성 결과
  project_name TEXT NOT NULL,                   -- 생성된 프로젝트명
  files TEXT NOT NULL DEFAULT '[]',             -- JSON: [{path, content, language}]
  architecture TEXT DEFAULT NULL,               -- JSON: Step 2 설계 결과 (페이지맵, API목록, 컴포넌트트리)
  summary TEXT DEFAULT NULL,                    -- 생성 요약 텍스트
  file_count INTEGER NOT NULL DEFAULT 0,
  total_lines INTEGER NOT NULL DEFAULT 0,
  -- 메타
  status TEXT NOT NULL DEFAULT 'generating',    -- 'generating' | 'completed' | 'failed'
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_mvp_builds_proposal ON mvp_builds(proposal_id);
CREATE INDEX idx_mvp_builds_tenant ON mvp_builds(tenant_id);
```

**Drizzle 스키마** → `app/features/lab/db/schema.ts`에 추가

### 관계
- `mvp_builds.proposal_id` → `proposals.id` (N:1)
- 제안별 최신 1건만 유지 (INSERT OR REPLACE 패턴)

---

## 3. API 설계

### POST /api/lab/mvp-builder — SSE 스트리밍 생성

**Request:**
```typescript
{ proposalId: string; stack?: 'nextjs'; sections?: string[] }
```

**SSE 이벤트 흐름:**
```typescript
type MvpBuildProgress =
  | { type: 'step_start'; step: 1|2|3|4; label: string }
  | { type: 'step_complete'; step: 1|2|3|4; data?: unknown }
  | { type: 'file_generated'; path: string; language: string; lines: number }
  | { type: 'error'; step: number; message: string }
  | { type: 'complete'; buildId: string; fileCount: number; totalLines: number };
```

**인증:** `requireUser()` — 로그인 사용자만

### GET /api/lab/mvp-builder?proposalId={id} — 기존 빌드 조회

**Response:** `MvpBuild | null`

### GET /api/lab/mvp-builder/{id}/download — ZIP 다운로드

**Response:** `application/zip` 바이너리 스트림

---

## 4. 서비스 레이어 — MvpBuilderService

**위치:** `app/features/lab/service/mvp-builder.service.ts`

### 4.1 Step 1: analyzeProposal()

**입력:** proposalId
**동작:**
1. `proposalSections` 테이블에서 10개 섹션 조회 (overview, target_market, value_proposition, revenue_model, scenario, mvp, execution_plan, content, hypothesis, target_customer)
2. 연결된 Ideas의 `analysisData` JSON 조회 (Proposal → Ideas 매핑은 proposalSections의 content에서 추출하거나, 같은 conversationId 기반)
3. LLM에 구조화 요청 → MVP 명세(제품명, 핵심기능 3~5개, 대상고객, 가치제안 1줄, API 엔드포인트 목록)

**출력:**
```typescript
interface MvpSpec {
  productName: string;
  tagline: string;
  features: { name: string; description: string; icon?: string }[];
  targetCustomer: string;
  valueProposition: string;
  apiEndpoints: { method: string; path: string; description: string; mockData: unknown }[];
  faqItems: { question: string; answer: string }[];
}
```

### 4.2 Step 2: designArchitecture()

**입력:** MvpSpec
**동작:** LLM에 Next.js 프로젝트 구조 설계 요청
- 페이지 목록 (app/ 하위)
- API 라우트 목록 (app/api/ 하위)
- 컴포넌트 트리 (components/ 하위)
- Tailwind 설정 (brandColor 등)

**출력:**
```typescript
interface MvpArchitecture {
  pages: { path: string; description: string }[];
  apis: { path: string; method: string; description: string }[];
  components: { name: string; props: string; description: string }[];
  tailwindConfig: { primaryColor: string; fontFamily: string };
}
```

### 4.3 Step 3: generateCode()

**입력:** MvpSpec + MvpArchitecture
**동작:** 파일별 순차 코드 생성 (LLM 호출)
1. `package.json` — 의존성 정의
2. `tailwind.config.ts` — 브랜드 컬러 적용
3. `app/layout.tsx` — 공통 레이아웃
4. `app/page.tsx` — 랜딩페이지 (히어로 + 기능소개 + FAQ)
5. `app/api/*/route.ts` — API 목업 엔드포인트들
6. `components/*.tsx` — 공유 컴포넌트
7. `README.md` — 실행 가이드

각 파일 생성 시 `file_generated` SSE 이벤트 발행

### 4.4 Step 4: validateOutput()

**입력:** 생성된 파일 배열
**동작:**
1. import 경로 일관성 검증 (존재하는 파일만 import)
2. 컴포넌트명/함수명 일관성 검증
3. package.json 의존성과 실제 사용 비교
4. 문제 발견 시 해당 파일만 재생성

---

## 5. UI 설계

### 5.1 Lab 탭 추가

`app/routes/lab.tsx`의 `TABS` 배열에 추가:
```typescript
{ to: "/lab/mvp-builder", label: "MVP 빌더", end: false }
```

### 5.2 페이지 구성 — `app/routes/lab.mvp-builder.tsx`

**상태 흐름:** 선택 → 설정 → 생성중 → 완료

```
┌─ MVP 빌더 ─────────────────────────────────────────────┐
│                                                         │
│  ① 사업제안 선택                                        │
│  ┌─────────────────────────────────────┐                │
│  │ ▼ 사업제안을 선택해 주세요            │                │
│  └─────────────────────────────────────┘                │
│                                                         │
│  ② 생성 옵션                                            │
│  스택: [Next.js ▼]                                      │
│  포함: ☑ 히어로+CTA  ☑ 기능소개  ☑ FAQ/문의            │
│                                                         │
│  [MVP 생성 시작]                                        │
│                                                         │
│  ③ 생성 진행률 (SSE)                                    │
│  ├ ✅ Step 1: 제안 분석 완료                            │
│  ├ ✅ Step 2: 아키텍처 설계 완료                        │
│  ├ ⏳ Step 3: 코드 생성 중... (4/7 파일)                │
│  │   ├ ✅ package.json                                  │
│  │   ├ ✅ tailwind.config.ts                            │
│  │   ├ ✅ app/layout.tsx                                │
│  │   ├ ✅ app/page.tsx                                  │
│  │   ├ ⏳ app/api/products/route.ts                     │
│  │   └ ○ components/Hero.tsx                            │
│  └ ○ Step 4: 검증                                      │
│                                                         │
│  ④ 결과 (완료 시)                                       │
│  ┌─ 프로젝트: my-mvp ──────────────────────────────┐   │
│  │ 📁 7개 파일 | 420줄 | Next.js + Tailwind        │   │
│  │                                                   │   │
│  │ 📄 app/page.tsx              [보기] [복사]       │   │
│  │ 📄 app/api/products/route.ts [보기] [복사]       │   │
│  │ 📄 components/Hero.tsx       [보기] [복사]       │   │
│  │ ...                                               │   │
│  │                                                   │   │
│  │ [다운로드 ZIP] [재생성]                           │   │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### 5.3 코드 뷰어

파일 클릭 시 모달 또는 인라인 확장으로 코드 표시. 구문 강조는 `<pre><code>` + CSS 클래스로 경량 처리 (외부 라이브러리 미사용).

---

## 6. ZIP 다운로드

**서버사이드 ZIP 생성** (Cloudflare Workers 호환):
- `fflate` 라이브러리 사용 (경량, Workers 호환)
- `files` JSON 배열 → fflate zip → Response blob

```typescript
import { zipSync, strToU8 } from "fflate";

function buildZip(files: MvpFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const f of files) {
    entries[f.path] = strToU8(f.content);
  }
  return zipSync(entries);
}
```

---

## 7. 파일 목록 — 구현 범위

| # | 파일 | 설명 | LOC(예상) |
|---|------|------|-----------|
| 1 | `app/features/lab/db/schema.ts` | mvp_builds 테이블 추가 | +40 |
| 2 | `migrations/0053_mvp_builds.sql` | 마이그레이션 SQL | +15 |
| 3 | `tests/helpers/db.ts` | 마이그레이션 목록 추가 | +1 |
| 4 | `app/features/lab/service/mvp-builder.service.ts` | 4단계 Agent 서비스 | ~350 |
| 5 | `app/routes/api.lab.mvp-builder.ts` | SSE API 라우트 | ~80 |
| 6 | `app/routes/api.lab.mvp-builder.$id.download.ts` | ZIP 다운로드 API | ~40 |
| 7 | `app/routes/lab.mvp-builder.tsx` | Lab 탭 UI 페이지 | ~400 |
| 8 | `app/routes/lab.tsx` | 탭 배열 수정 (+1행) | +1 |
| 9 | `app/db/index.ts` | labSchema에 포함 (자동) | 0 |
| **합계** | | | **~930** |

---

## 8. 의존성

- **신규 패키지**: `fflate` (ZIP 생성, ~8KB gzip)
- **기존 활용**: `callLLM`, `FallbackContext`, `ReadableStream` SSE 패턴

---

## 9. 제약사항 & 리스크

| # | 리스크 | 대응 |
|---|--------|------|
| R1 | LLM 코드 생성 품질 불안정 | Step 4 검증 + 재생성 루프 (최대 1회 재시도) |
| R2 | D1 텍스트 용량 (files JSON) | 파일당 ~500줄 × 7파일 = ~3500줄 → ~100KB, D1 한도 내 |
| R3 | ZIP 생성 메모리 | fflate는 스트리밍 미지원이나 ~100KB 수준이라 Workers 메모리 내 처리 가능 |
| R4 | SSE 타임아웃 | Cloudflare 30초 idle timeout → 각 Step 사이에 heartbeat 이벤트 발행 |
