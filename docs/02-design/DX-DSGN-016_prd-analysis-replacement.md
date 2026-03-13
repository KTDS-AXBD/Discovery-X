---
code: DX-DSGN-016
title: "F44 Phase 3 — 아이디어 분석 대체 (claude -p + PRD 프로세스)"
version: "0.1"
status: Draft
category: DSGN
created: 2026-03-12
updated: 2026-03-12
author: Sinclair Seo
---

# F44 Phase 3 — 아이디어 분석 대체

> **Req**: DX-REQ-015 (F44 Phase 3)
> **Plan**: [[DX-PLAN-010]] §Phase 3
> **Parent Design**: [[DX-DSGN-015]]

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | Ideas 12카테고리 분석이 API 크레딧을 소비하며 ($15-20/1M tokens), 분석 품질 검증(리뷰/스코어링) 기능이 없음 |
| **Solution** | PRD Studio 8섹션 프로세스를 Ideas에 통합. 분석 엔진을 `claude -p` (Claude Sonnet 4.6 구독) 기반 배치로 전환 → API 비용 0 |
| **Function/UX Effect** | 아이디어에서 "PRD 분석" 클릭 → 소스 자동 수집 → 배치 분석 대기 → 8섹션 PRD + 스코어카드 결과 확인 → 사업제안 생성 |
| **Core Value** | API 비용 제거 + 구조화된 PRD 품질 검증(스코어카드) + 기존 12카테고리 분석 병행 유지 |

---

## 1. 아키텍처 개요

### 1.1 현재 vs 대체

```
[현재] Ideas 분석 — 실시간 API 호출
┌──────────┐     ┌──────────────┐     ┌───────────┐
│ Ideas UI │ ──→ │ SSE API      │ ──→ │ LLM API   │ (API Credit 소비)
│          │ ←── │ (실시간 스트림)│ ←── │ Anthropic │
└──────────┘     └──────────────┘     └───────────┘

[Phase 3] PRD 분석 — 배치 claude -p
┌──────────┐     ┌──────────────┐     ┌──────────────┐     ┌───────────┐
│ Ideas UI │ ──→ │ Web API      │ ──→ │ D1 Remote    │ ←── │ claude -p │ (구독, 비용 0)
│ (polling)│ ←── │ (상태 조회)   │ ←── │ (큐 테이블)  │ ──→ │ Sonnet4.6 │
└──────────┘     └──────────────┘     └──────────────┘     └───────────┘
                                            ↑
                                     batch-runner.sh (로컬 실행)
```

### 1.2 핵심 결정

| 항목 | 결정 | 이유 |
|------|------|------|
| 분석 엔진 | `claude -p` (Sonnet 4.6) | API 비용 0, 구독 활용 |
| 실행 방식 | 배치 (로컬 스크립트) | CF Workers에서 CLI 실행 불가 |
| UI 패턴 | Polling (비동기) | 배치 처리 = 즉시 응답 불가 |
| 기존 분석 | 병행 유지 | 전환 기간 데이터 수집 |
| PRD 생성+검토 | 단일 claude -p 호출 | 1회 호출로 생성+검토 동시 처리 (비용 최적) |

---

## 2. 데이터 모델

### 2.1 신규 테이블: `prd_analysis_queue`

배치 처리 큐. Ideas에서 PRD 분석 요청 시 레코드 생성, `batch-runner.sh`가 PENDING을 소비.

```sql
CREATE TABLE prd_analysis_queue (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL REFERENCES ideas(id),
  prd_id TEXT REFERENCES prds(id),          -- 생성 후 연결
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDING',    -- PENDING | PROCESSING | COMPLETED | FAILED
  source_context TEXT,                       -- 소스 텍스트 (buildSourceContext 결과)
  source_ids TEXT,                           -- JSON array of radarItemId
  result_sections TEXT,                      -- JSON: 8섹션 생성 결과
  result_review TEXT,                        -- JSON: 스코어카드 + 피드백
  error_message TEXT,
  model_version TEXT,                        -- "claude-sonnet-4-6"
  tokens_used INTEGER,
  latency_ms INTEGER,
  requested_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER
);

CREATE INDEX idx_prd_analysis_queue_status ON prd_analysis_queue(status);
CREATE INDEX idx_prd_analysis_queue_idea ON prd_analysis_queue(idea_id);
```

### 2.2 상태 흐름

```
PENDING ──→ PROCESSING ──→ COMPLETED
                │                ↓
                └──→ FAILED   (PRD 자동 생성 + 검토 결과 저장)
```

### 2.3 기존 테이블 활용

- `prds` — 분석 완료 시 자동 생성 (sourceIdeaId 연결, 이미 존재)
- `prd_sections` — 8섹션 generatedContent 저장
- `prd_reviews` — 스코어카드 저장
- `ideas.analysisData` — 기존 12카테고리 분석은 그대로 유지

---

## 3. 배치 분석 엔진 (`claude -p`)

### 3.1 batch-runner.sh 확장

기존 `scripts/batch-runner.sh`에 `prd` 모드 추가.

```bash
# 사용법
bash scripts/batch-runner.sh prd       # PRD 분석만
bash scripts/batch-runner.sh all       # 기존 radar + ontology + prd 전체
```

### 3.2 처리 흐름

```bash
# Step 1: PENDING 큐 조회 (최대 3건 — PRD는 토큰 소비 많음)
SELECT id, idea_id, tenant_id, requested_by, source_context, source_ids
FROM prd_analysis_queue
WHERE status = 'PENDING'
ORDER BY requested_at ASC
LIMIT 3;

# Step 2: PROCESSING 상태 전환
UPDATE prd_analysis_queue
SET status = 'PROCESSING', started_at = unixepoch()
WHERE id = '{queue_id}';

# Step 3: claude -p 호출 (단일 호출로 생성+검토)
claude -p "$PROMPT" \
  --model claude-sonnet-4-6 \
  --output-format json \
  --max-turns 3 \
  --append-system-prompt "JSON만 출력하세요."

# Step 4: 결과 파싱 + D1 저장
#   a) prd_analysis_queue.result_sections / result_review 업데이트
#   b) prds 테이블에 PRD 생성 (sourceIdeaId = idea_id)
#   c) prd_sections 8개 INSERT (generatedContent)
#   d) prd_reviews 1개 INSERT (Sonnet 4.6 검토 결과)
#   e) prd_analysis_queue.status = 'COMPLETED'

# Step 5: 실패 시
UPDATE prd_analysis_queue
SET status = 'FAILED', error_message = '...', completed_at = unixepoch()
WHERE id = '{queue_id}';
```

### 3.3 통합 프롬프트 (생성 + 검토 1회)

```
너는 PRD(Product Requirements Document) 전문 작성자이자 검토자야.

## Task 1: PRD 생성
아래 소스 자료를 바탕으로 8개 섹션의 PRD를 작성해.

## Task 2: PRD 검토
작성한 PRD를 8개 기준으로 자체 검토해.

## 소스 자료
{sourceContext}

## 출력 형식 (JSON)
{
  "prd": {
    "title": "PRD 제목 (소스 기반 자동 생성)",
    "sections": {
      "summary": "## 프로젝트 요약\n...",
      "background": "## 배경 & 문제\n...",
      "objectives": "## 목표 & 성공 기준\n...",
      "target_users": "## 대상 사용자\n...",
      "requirements": "## 핵심 요구사항\n...",
      "solution": "## 해결 방안\n...",
      "risks": "## 리스크 & 제약\n...",
      "timeline": "## 일정 & 마일스톤\n..."
    }
  },
  "review": {
    "verdict": "READY | CONDITIONAL | NOT_READY",
    "scorecard": {
      "totalScore": 0~100,
      "items": [
        { "criteria": "문제 정의 명확성", "score": 0~10, "maxScore": 10, "comment": "..." },
        ...8개 기준
      ]
    },
    "feedbackItems": [
      { "section": "summary|background|...", "severity": "critical|major|minor|suggestion", "message": "...", "suggestion": "..." }
    ]
  }
}

## 규칙
- 각 섹션 200~500자, 마크다운 형식, 한국어
- 소스에 없는 내용은 "추정" 또는 "확인 필요" 표기
- 검토 점수: totalScore = (8개 score 합) × (100/80)
- feedbackItems 최소 3개, 최대 10개
```

### 3.4 Rate Limiting

```bash
PRD_BATCH_SIZE=3              # 3건/배치 (토큰 5K~10K/건)
PRD_RATE_LIMIT_WAIT=60        # 60초 간격 (radar 30초보다 보수적)
```

---

## 4. API 설계

### 4.1 분석 요청 API

```
POST /api/prd-studio/analyze-idea
Body: { ideaId: string }

Response: { ok: true, queueId: string, position: number }
  or
  { error: string } (404 아이디어 없음, 409 이미 진행 중)
```

**처리 로직**:
1. ideaId 존재 + 소유자 확인
2. 이미 PENDING/PROCESSING인 큐 항목이 있으면 409 반환
3. `buildSourceContext()` → 소스 컨텍스트 조립
4. `prd_analysis_queue` INSERT (PENDING)
5. 큐 위치(position) 반환

### 4.2 상태 조회 API

```
GET /api/prd-studio/analyze-idea/:ideaId/status

Response:
  { status: "none" }                                  -- 요청 없음
  { status: "PENDING", queueId, position, requestedAt }
  { status: "PROCESSING", queueId, startedAt }
  { status: "COMPLETED", queueId, prdId, completedAt }
  { status: "FAILED", queueId, error, completedAt }
```

### 4.3 기존 API 유지

- `POST /api/ideas/:id/analyze` — 기존 12카테고리 실시간 분석 (그대로)
- `GET /api/ideas/:id/analysis` — 기존 분석 데이터 조회 (그대로)

---

## 5. UI/UX 설계

### 5.1 Ideas 상세 페이지 변경 (`ideas.$id.tsx`)

중앙 패널(MethodologyCards)에 **PRD 분석 섹션**을 추가.

```
┌─────────────────────────────────────────────────────────────────┐
│  Left Panel              Center Panel              Right Panel   │
│ (Sources)              (Analysis)                  (Chat)        │
│                                                                   │
│                    ┌─ PRD 분석 ──────────────────┐               │
│                    │                              │               │
│                    │  [상태에 따라 다른 뷰]        │               │
│                    │                              │               │
│                    └──────────────────────────────┘               │
│                                                                   │
│                    ┌─ 방법론 분석 (기존) ─────────┐               │
│                    │                              │               │
│                    │  [시장][고객][비판][BMC] [+]  │               │
│                    │  (기존 12카테고리 그대로)      │               │
│                    │                              │               │
│                    └──────────────────────────────┘               │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 PRD 분석 섹션 — 상태별 UI

#### State A: 미요청 (none)

```
┌─────────────────────────────────────────────────────┐
│  📋 PRD 분석                                         │
│                                                      │
│  소스를 기반으로 체계적인 PRD를 자동 생성하고          │
│  AI가 8개 기준으로 검토해요.                          │
│                                                      │
│  ┌─ 포함 항목 ─────────────────────────────────┐     │
│  │ 프로젝트 요약 · 배경 & 문제 · 목표 · 대상 사용자 │  │
│  │ 요구사항 · 해결 방안 · 리스크 · 일정           │  │
│  └────────────────────────────────────────────┘     │
│                                                      │
│  ⚡ Claude Sonnet 4.6 기반 · API 비용 없음           │
│                                                      │
│  소스 N개 선택됨                                      │
│                                                      │
│  [ 🚀 PRD 분석 시작 ]                                │
│                                                      │
└─────────────────────────────────────────────────────┘
```

- 소스가 0개면 버튼 비활성화 + "소스를 먼저 추가해주세요" 안내
- 버튼 클릭 → `POST /api/prd-studio/analyze-idea`

#### State B: 대기 중 (PENDING)

```
┌─────────────────────────────────────────────────────┐
│  📋 PRD 분석                                         │
│                                                      │
│  ⏳ 분석 대기 중 (큐 {position}번째)                  │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │  ░░░░░░░░░░░░░░░░░░░░  대기 중              │     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  요청 시각: 2026-03-12 14:30                          │
│  로컬 배치 프로세서가 순차 처리해요.                   │
│                                                      │
│  [ 취소 ]                                             │
│                                                      │
└─────────────────────────────────────────────────────┘
```

- 10초 간격 polling (`GET .../status`)
- 취소 버튼: `DELETE /api/prd-studio/analyze-idea/:ideaId/cancel`

#### State C: 처리 중 (PROCESSING)

```
┌─────────────────────────────────────────────────────┐
│  📋 PRD 분석                                         │
│                                                      │
│  🔄 분석 진행 중...                                   │
│                                                      │
│  ┌─────────────────────────────────────────────┐     │
│  │  ████████████░░░░░░░░  Claude Sonnet 4.6    │     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  시작: 2026-03-12 14:32                               │
│  PRD 8섹션 생성 + AI 검토를 한 번에 수행해요.          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

- pulse 애니메이션, 취소 불가 (이미 처리 시작)

#### State D: 완료 (COMPLETED)

```
┌─────────────────────────────────────────────────────┐
│  📋 PRD 분석 결과                                     │
│                                                      │
│  "클라우드 기반 HR SaaS 플랫폼 PRD"                   │
│                                                      │
│  ┌─ 판정 ──────────────────────────────────────┐     │
│  │  🟡 CONDITIONAL (72/100)                    │     │
│  │  Claude Sonnet 4.6 · 2026-03-12 14:35      │     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  ┌─ 점수 상세 ─────────────────────────────────┐     │
│  │ 문제 정의 ████████░░ 8/10                   │     │
│  │ 대상 사용자 ███████░░░ 7/10                  │     │
│  │ 목표       ████████░░ 8/10                   │     │
│  │ 요구사항   ██████████ 10/10                  │     │
│  │ 해결 방안  ████████░░ 8/10                   │     │
│  │ 리스크     █████░░░░░ 5/10                   │     │
│  │ 일정       ██████░░░░ 6/10                   │     │
│  │ 일관성     ██████████ 10/10                  │     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  ┌─ 주요 피드백 (3건) ─────────────────────────┐     │
│  │ 🔴 critical: 리스크 섹션에 규제 리스크 누락   │     │
│  │ 🟡 major: 일정에 마일스톤 정의 부족           │     │
│  │ 🔵 suggestion: MVP 범위 축소 권장             │     │
│  └─────────────────────────────────────────────┘     │
│                                                      │
│  [ PRD 상세 보기 ]  [ 사업제안 생성 ]  [ 재분석 ]     │
│                                                      │
└─────────────────────────────────────────────────────┘
```

- "PRD 상세 보기" → `/prd-studio/{prdId}` (편집/재검토 가능)
- "사업제안 생성" → PRD 기반 Proposal 생성 모달
- "재분석" → 기존 큐 항목 삭제 + 새 요청

#### State E: 실패 (FAILED)

```
┌─────────────────────────────────────────────────────┐
│  📋 PRD 분석                                         │
│                                                      │
│  ❌ 분석에 실패했어요                                  │
│                                                      │
│  오류: claude -p 타임아웃 (60초 초과)                  │
│                                                      │
│  [ 재시도 ]                                           │
│                                                      │
└─────────────────────────────────────────────────────┘
```

### 5.3 PRD 상세에서 Ideas 역참조

`prd-studio.$id.tsx` 상단에 소스 아이디어 링크 표시:

```
┌─────────────────────────────────────────────────────┐
│  ← PRD 목록    연결된 아이디어: "클라우드 HR SaaS"    │
└─────────────────────────────────────────────────────┘
```

### 5.4 Proposal 생성 변경

PRD 기반 사업제안 생성 시, 기존 12카테고리 → 10섹션 매핑 대신 **PRD 8섹션 → 10섹션 매핑** 사용.

```typescript
const PRD_TO_PROPOSAL_MAP: Record<string, string[]> = {
  overview:          ["summary", "background"],
  content:           ["solution", "requirements"],
  hypothesis:        ["background", "objectives"],
  target_market:     ["target_users", "background"],
  target_customer:   ["target_users"],
  value_proposition: ["objectives", "solution"],
  revenue_model:     ["requirements", "timeline"],
  scenario:          ["risks", "timeline"],
  mvp:               ["solution", "requirements"],
  execution_plan:    ["timeline", "risks"],
};
```

---

## 6. TDD 테스트 시나리오

### 6.1 Unit Tests — 서비스 레이어

**파일**: `tests/unit/prd-studio/prd-analysis-queue.service.test.ts`

```
describe("PrdAnalysisQueueService")

  describe("enqueue()")
    ✗ T1: 존재하지 않는 ideaId → NotFoundError
    ✗ T2: 다른 테넌트의 아이디어 → ForbiddenError
    ✗ T3: 이미 PENDING/PROCESSING 큐 존재 → ConflictError (409)
    ✗ T4: 소스 0개인 아이디어 → ValidationError ("소스를 먼저 추가해주세요")
    ✗ T5: 정상 요청 → PENDING 레코드 생성, queueId 반환
    ✗ T6: sourceContext에 연결된 소스 텍스트 포함 확인
    ✗ T7: sourceIds에 현재 selectedSourceIds JSON 배열 저장

  describe("getStatus()")
    ✗ T8: 큐 항목 없음 → { status: "none" }
    ✗ T9: PENDING → position 계산 (자신보다 앞선 PENDING 수 + 1)
    ✗ T10: PROCESSING → startedAt 포함
    ✗ T11: COMPLETED → prdId + completedAt 포함
    ✗ T12: FAILED → error + completedAt 포함

  describe("cancel()")
    ✗ T13: PENDING 상태 → 삭제 성공
    ✗ T14: PROCESSING 상태 → 취소 불가 (ConflictError)
    ✗ T15: COMPLETED 상태 → 취소 불가 (ConflictError)
    ✗ T16: 다른 사용자의 큐 → ForbiddenError

  describe("processNext()")
    ✗ T17: PENDING 없음 → null 반환
    ✗ T18: 가장 오래된 PENDING → PROCESSING 전환 + 해당 레코드 반환
    ✗ T19: 동시 호출 → 동일 레코드 중복 처리 방지

  describe("completeWithResult()")
    ✗ T20: 정상 결과 → COMPLETED + result_sections/result_review 저장
    ✗ T21: PRD 자동 생성 확인 (prds 테이블 INSERT)
    ✗ T22: 8개 prd_sections INSERT 확인
    ✗ T23: prd_reviews INSERT 확인 (verdict, scorecard, feedbackItems)
    ✗ T24: sourceIdeaId 연결 확인 (prds.sourceIdeaId = ideaId)
    ✗ T25: prd_analysis_queue.prd_id 업데이트 확인

  describe("failWithError()")
    ✗ T26: FAILED 상태 전환 + error_message 저장
    ✗ T27: completed_at 타임스탬프 기록
```

### 6.2 Unit Tests — 프롬프트 빌더

**파일**: `tests/unit/prd-studio/prd-analysis-prompt.test.ts`

```
describe("buildPrdAnalysisPrompt()")

  ✗ T28: 소스 1개 → 프롬프트에 소스 제목/요약 포함
  ✗ T29: 소스 5개 → 모든 소스 컨텍스트 포함, 번호 매김
  ✗ T30: 소스에 한글/영문 혼합 → 정상 처리
  ✗ T31: 출력 JSON 스키마 지시 포함 확인 (prd + review 구조)
  ✗ T32: 8개 섹션 타입 모두 지시에 포함 확인
  ✗ T33: 검토 기준 8개 항목 포함 확인
```

### 6.3 Unit Tests — 결과 파서

**파일**: `tests/unit/prd-studio/prd-analysis-parser.test.ts`

```
describe("parsePrdAnalysisResult()")

  ✗ T34: 정상 JSON → sections 8개 + review 파싱
  ✗ T35: markdown 래핑된 JSON (```json...```) → 정상 파싱
  ✗ T36: 빈 응답 → ParseError
  ✗ T37: sections 누락 → ParseError
  ✗ T38: review 누락 → sections만 반환 (review = null)
  ✗ T39: 잘못된 verdict 값 → "NOT_READY"로 기본값
  ✗ T40: score 범위 초과 (11/10) → clamp(0, 10)
  ✗ T41: feedbackItems 누락 → 빈 배열
  ✗ T42: feedback_items (snake_case) → feedbackItems로 매핑
  ✗ T43: totalScore 자동 계산 확인 (items 합산 × 100/80)
```

### 6.4 Unit Tests — PRD→Proposal 매핑

**파일**: `tests/unit/prd-studio/prd-proposal-mapper.test.ts`

```
describe("mapPrdToProposalSections()")

  ✗ T44: 8섹션 모두 있음 → 10개 proposal 섹션 매핑
  ✗ T45: overview ← summary + background 내용 결합
  ✗ T46: 빈 섹션 → 해당 proposal 섹션도 빈 문자열
  ✗ T47: editedContent 우선 (generatedContent fallback)
  ✗ T48: 매핑되지 않는 proposal 섹션 → 빈 문자열 (에러 아님)
```

### 6.5 Integration Tests — API 라우트

**파일**: `tests/integration/api/prd-analysis-queue.test.ts`

```
describe("POST /api/prd-studio/analyze-idea")

  ✗ T49: 미인증 → 401
  ✗ T50: ideaId 누락 → 400
  ✗ T51: 존재하지 않는 ideaId → 404
  ✗ T52: 다른 테넌트 아이디어 → 403
  ✗ T53: 소스 없는 아이디어 → 400 ("소스를 먼저 추가해주세요")
  ✗ T54: 이미 PENDING → 409
  ✗ T55: 정상 요청 → 200 { ok, queueId, position }
  ✗ T56: DB에 PENDING 레코드 생성 확인

describe("GET /api/prd-studio/analyze-idea/:ideaId/status")

  ✗ T57: 큐 없음 → { status: "none" }
  ✗ T58: PENDING → position 포함
  ✗ T59: COMPLETED → prdId 포함
  ✗ T60: 다른 테넌트 → 404 (아이디어 접근 불가)

describe("DELETE /api/prd-studio/analyze-idea/:ideaId/cancel")

  ✗ T61: PENDING → 삭제 성공
  ✗ T62: PROCESSING → 409 (취소 불가)
  ✗ T63: 없음 → 404
```

### 6.6 Integration Tests — 배치 처리

**파일**: `tests/integration/batch/prd-analysis-batch.test.ts`

```
describe("배치 PRD 분석 E2E")

  ✗ T64: PENDING 큐 → processNext() → PROCESSING 전환
  ✗ T65: 결과 저장 → prds + prd_sections + prd_reviews 생성
  ✗ T66: 큐 COMPLETED + prd_id 연결
  ✗ T67: 실패 시 → FAILED + error_message
  ✗ T68: COMPLETED 이후 status API → prdId 반환
```

### 6.7 UI Component Tests (선택)

**파일**: `tests/unit/prd-studio/prd-analysis-card.test.ts`

```
describe("PrdAnalysisCard")

  ✗ T69: status="none" → "PRD 분석 시작" 버튼 표시
  ✗ T70: selectedSourceCount=0 → 버튼 비활성화
  ✗ T71: status="PENDING" → 대기 중 UI + position 표시
  ✗ T72: status="PROCESSING" → 진행 중 UI + pulse 애니메이션
  ✗ T73: status="COMPLETED" → 판정 배지 + 점수 바 + 피드백
  ✗ T74: status="FAILED" → 에러 메시지 + 재시도 버튼
  ✗ T75: "PRD 상세 보기" 클릭 → /prd-studio/{prdId} 이동
  ✗ T76: "사업제안 생성" 클릭 → ProposalCreationModal 열기
```

---

## 7. 구현 순서 (TDD)

| # | 단계 | 테스트 범위 | 구현 파일 |
|---|------|-------------|----------|
| 1 | 스키마 + 마이그레이션 | — | `drizzle/0063_prd_analysis_queue.sql`, `tests/helpers/db.ts` |
| 2 | 서비스 레이어 | T1~T27 | `prd-studio.service.ts` (큐 메서드 추가) |
| 3 | 프롬프트 빌더 | T28~T33 | `prd-studio/lib/analysis-prompt.ts` (신규) |
| 4 | 결과 파서 | T34~T43 | `prd-studio/lib/analysis-parser.ts` (신규) |
| 5 | PRD→Proposal 매핑 | T44~T48 | `prd-studio/lib/proposal-mapper.ts` (신규) |
| 6 | API 라우트 | T49~T63 | `api.prd-studio.analyze-idea.ts` 등 (신규) |
| 7 | batch-runner.sh 확장 | T64~T68 | `scripts/batch-runner.sh` (prd 모드) |
| 8 | UI 컴포넌트 | T69~T76 | `PrdAnalysisCard.tsx` (신규), `ideas.$id.tsx` (수정) |

**TDD 싸이클**:
```
각 단계별:
1. 테스트 파일 작성 (RED — 전체 실패)
2. 최소 구현 (GREEN — 통과)
3. 리팩토링 (REFACTOR — 품질 개선)
4. 다음 단계로 이동
```

---

## 8. 리스크 & 완화

| 리스크 | 영향 | 완화 |
|--------|------|------|
| `claude -p` 속도 (30~120초/건) | Medium | 비동기 큐 + polling으로 UX 차단 없음 |
| 배치 프로세서 미실행 시 큐 적체 | High | PENDING 시간 표시로 사용자에게 상태 인지 |
| Sonnet 4.6 출력 JSON 파싱 실패 | Medium | markdown 래핑 제거 + 유연한 파서 |
| 기존 12카테고리와 혼란 | Low | UI에서 명확히 구분 (PRD 분석 / 방법론 분석) |
| 소스 변경 후 재분석 필요 | Medium | stale 감지 + "재분석" 버튼 |
| Rate limit (구독 토큰 한도) | Medium | 배치 크기 3 + 60초 간격 |

---

## 9. 향후 확장 (Phase 4)

- Strategy Canvas + GTM 전략 도구 웹 UI
- PRD→사업제안 AI 합성 (현재 기계적 매핑 → LLM 재구성)
- 실시간 모드 추가 (Anthropic API fallback — 긴급 시)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-12 | Initial — 아키텍처 + 데이터 모델 + API + UI/UX + TDD 76개 시나리오 | Sinclair Seo |
