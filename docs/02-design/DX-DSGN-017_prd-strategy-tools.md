---
code: DX-DSGN-017
title: "F44 Phase 4 — 전략 도구 (Strategy Canvas + GTM + Proposal 연동)"
version: "0.1"
status: Draft
category: DSGN
created: 2026-03-13
updated: 2026-03-13
author: Sinclair Seo
---

# F44 Phase 4 — 전략 도구

> **Req**: DX-REQ-015 (F44 Phase 4)
> **Plan**: [[DX-PLAN-010]] §Phase 4
> **Parent Design**: [[DX-DSGN-015]]
> **Depends On**: [[DX-DSGN-016]] (Phase 3 — 아이디어 분석 대체)

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | PRD 분석 완료 후 전략적 심화 분석 없이 바로 사업제안으로 넘어감. 기존 Ideas 12카테고리 분석과 PRD Studio가 분리되어 이중 작업 발생 |
| **Solution** | Strategy Canvas 6프레임워크 + GTM 전략 자동 생성 + PRD→Proposal AI 합성 연동. 하이브리드 엔진 (기본 claude -p 배치 + 긴급 시 실시간 API fallback) |
| **Function/UX Effect** | PRD 완료 → "전략 분석" 클릭 → 6개 프레임워크 자동 생성 → GTM 전략 생성 → "사업제안 생성" 시 전략 결과 포함 AI 합성 |
| **Core Value** | PRD→전략→사업제안 파이프라인 일원화. 비개발자도 전략적 근거 갖춘 사업제안 작성 가능. API 비용 최소화 (하이브리드) |

---

## 1. 아키텍처 개요

### 1.1 파이프라인

```
[Ideas 소스] → [Phase 3: PRD 분석] → [Phase 4: 전략 분석] → [사업제안 생성]
                  ↓                      ↓                      ↓
              prd_analysis_queue     prd_strategy_queue     proposals + sections
              (claude -p 배치)       (하이브리드 엔진)       (AI 합성)
```

### 1.2 하이브리드 엔진

```
[요청]
  ├── mode=batch (기본)
  │   → D1 queue INSERT (PENDING)
  │   → batch-runner.sh strategy 모드
  │   → claude -p (Sonnet 4.6) — API 비용 0
  │   → D1 결과 저장 → UI polling
  │
  └── mode=realtime (긴급/단건)
      → 서버 API 직접 호출
      → GPT-4.1 / Gemini (Promise.allSettled)
      → 즉시 응답 — API 비용 발생
```

### 1.3 핵심 결정

| 항목 | 결정 | 이유 |
|------|------|------|
| 기본 엔진 | claude -p 배치 | API 비용 0, Phase 3 패턴 재사용 |
| Fallback | 실시간 API (GPT-4.1/Gemini) | Phase 2 기존 인프라 활용, 긴급 시 즉시 결과 |
| 전략 6종 호출 | 1회 통합 호출 | 6번 개별 호출 대비 latency 절감 |
| GTM 호출 | 별도 1회 | Strategy 결과 입력으로 사용하므로 순차 실행 |
| Proposal 합성 | Strategy + GTM + PRD 통합 | 기존 proposal-mapper 기계적 매핑 대체 |

---

## 2. 데이터 모델

### 2.1 신규 테이블: `prd_strategy_queue`

Phase 3 `prd_analysis_queue`와 동일한 패턴의 배치 큐.

```sql
CREATE TABLE prd_strategy_queue (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL REFERENCES ideas(id),
  prd_id TEXT NOT NULL REFERENCES prds(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDING',   -- PENDING | PROCESSING | COMPLETED | FAILED
  mode TEXT NOT NULL DEFAULT 'batch',       -- batch | realtime
  prd_context TEXT,                         -- PRD 8섹션 요약 (프롬프트 입력)
  result_strategy TEXT,                     -- JSON: 6개 프레임워크 결과
  result_gtm TEXT,                          -- JSON: GTM 전략 결과
  error_message TEXT,
  model_version TEXT,
  tokens_used INTEGER,
  latency_ms INTEGER,
  requested_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER
);

CREATE INDEX idx_prd_strategy_queue_status ON prd_strategy_queue(status);
CREATE INDEX idx_prd_strategy_queue_idea ON prd_strategy_queue(idea_id);
CREATE INDEX idx_prd_strategy_queue_prd ON prd_strategy_queue(prd_id);
CREATE INDEX idx_prd_strategy_queue_tenant ON prd_strategy_queue(tenant_id);
```

### 2.2 JSON 스키마

#### result_strategy (6개 프레임워크)

```typescript
interface StrategyResult {
  swot: {
    strengths: string[];    // 강점 3-5개
    weaknesses: string[];   // 약점 3-5개
    opportunities: string[]; // 기회 3-5개
    threats: string[];      // 위협 3-5개
    crossAnalysis: string;  // SO/WO/ST/WT 교차 분석 (마크다운)
  };
  leanCanvas: {
    problem: string;
    solution: string;
    keyMetrics: string;
    uniqueValueProp: string;
    unfairAdvantage: string;
    channels: string;
    customerSegments: string;
    costStructure: string;
    revenueStreams: string;
  };
  jtbd: {
    who: string;           // 누가
    why: string;           // 왜 (상황/동기)
    whatBefore: string;    // 기존에 어떻게 해결
    how: string;           // 우리 솔루션 사용 방법
    whatAfter: string;     // 사용 후 어떻게 변하는가
    alternatives: string;  // 대안/경쟁 솔루션
  };
  competition: {
    directCompetitors: Array<{
      name: string;
      description: string;
      strengths: string;
      weaknesses: string;
    }>;
    indirectCompetitors: Array<{
      name: string;
      description: string;
    }>;
    differentiation: string;  // 핵심 차별점 요약
  };
  marketSizing: {
    tam: { value: string; description: string };  // 전체 시장
    sam: { value: string; description: string };  // 접근 가능 시장
    som: { value: string; description: string };  // 초기 확보 가능 시장
    methodology: string;   // 추정 방법론
    assumptions: string[]; // 핵심 가정
  };
  riskAssessment: {
    risks: Array<{
      category: string;      // 기술/시장/규제/운영/재무
      description: string;
      impact: "high" | "medium" | "low";
      likelihood: "high" | "medium" | "low";
      mitigation: string;
    }>;
    overallRiskLevel: "high" | "medium" | "low";
    summary: string;
  };
}
```

#### result_gtm (GTM 전략)

```typescript
interface GtmResult {
  beachheadSegment: {
    segment: string;        // 타겟 세그먼트 명
    rationale: string;      // 선정 이유
    size: string;           // 추정 규모
    accessibility: string;  // 접근 용이성
  };
  icp: {
    profile: string;        // 이상적 고객 프로필
    demographics: string;
    psychographics: string;
    painPoints: string[];
    buyingTriggers: string[];
  };
  messaging: {
    oneLiner: string;       // 1줄 가치 제안
    elevatorPitch: string;  // 30초 피치
    keyMessages: string[];  // 핵심 메시지 3-5개
  };
  channelStrategy: {
    channels: Array<{
      name: string;
      priority: "primary" | "secondary" | "experimental";
      rationale: string;
      estimatedCost: string;
    }>;
    recommendation: string;
  };
  launchPlan: {
    phases: Array<{
      name: string;
      duration: string;
      objectives: string[];
      actions: string[];
    }>;
  };
}
```

---

## 3. 프롬프트 설계

### 3.1 Strategy Canvas 프롬프트 (6-in-1)

```
strategy-prompt.ts — buildStrategyPrompt(prdSections: PrdSectionInput[])
```

PRD 8섹션을 입력으로 받아 6개 프레임워크를 한 번에 생성. 배치/실시간 모두 동일 프롬프트 사용.

**입력**: PRD 8섹션 (editedContent 우선, generatedContent fallback)
**출력**: `StrategyResult` JSON

### 3.2 GTM 프롬프트

```
gtm-prompt.ts — buildGtmPrompt(prdSections: PrdSectionInput[], strategy: StrategyResult)
```

PRD + Strategy Canvas 결과를 입력으로 받아 GTM 전략 생성.

**입력**: PRD 8섹션 + Strategy 6개 결과
**출력**: `GtmResult` JSON

### 3.3 Proposal AI 합성 프롬프트

```
proposal-synthesis-prompt.ts — buildProposalSynthesisPrompt(
  prdSections, strategy, gtm, proposalSectionType
)
```

PRD + Strategy + GTM을 종합하여 사업제안 10섹션 각각을 AI가 작성.

**매핑**:

| Proposal 섹션 | PRD 입력 | Strategy 입력 | GTM 입력 |
|---------------|----------|---------------|----------|
| overview | summary, background | leanCanvas | - |
| content | solution, requirements | leanCanvas | - |
| hypothesis | background, objectives | swot, jtbd | - |
| target_market | target_users, background | marketSizing, competition | beachheadSegment |
| target_customer | target_users | jtbd | icp |
| value_proposition | objectives, solution | jtbd, competition | messaging |
| revenue_model | requirements, timeline | leanCanvas | channelStrategy |
| scenario | risks, timeline | riskAssessment, marketSizing | - |
| mvp | solution, requirements | leanCanvas | launchPlan |
| execution_plan | timeline, risks | riskAssessment | launchPlan |

---

## 4. 서비스 레이어

### 4.1 PrdStudioService 확장 메서드

기존 `prd-studio.service.ts`에 추가:

| 메서드 | 설명 |
|--------|------|
| `enqueueStrategy(input)` | 전략 분석 큐 추가 (batch 모드) |
| `getStrategyStatus(ideaId)` | 전략 분석 상태 조회 (none/PENDING/PROCESSING/COMPLETED/FAILED) |
| `cancelStrategy(ideaId, requestedBy)` | PENDING 전략 분석 취소 |
| `completeStrategy(queueId, result)` | 배치 완료 처리 (결과 저장) |
| `failStrategy(queueId, error)` | 배치 실패 처리 |
| `getStrategyResult(ideaId)` | 최근 COMPLETED 전략 결과 조회 |

### 4.2 StrategyRealtimeService (신규)

실시간 API 호출 경로. `app/features/prd-studio/service/strategy-realtime.service.ts`

| 메서드 | 설명 |
|--------|------|
| `analyzeStrategy(prdSections, env)` | 실시간 Strategy Canvas 생성 (GPT-4.1/Gemini) |
| `analyzeGtm(prdSections, strategy, env)` | 실시간 GTM 전략 생성 |
| `synthesizeProposal(prd, strategy, gtm, env)` | 실시간 Proposal AI 합성 |

---

## 5. API 설계

### 5.1 전략 분석 API

| 라우트 | 메서드 | 인증 | 기능 |
|--------|--------|------|------|
| `POST /api/prd-studio/strategy` | POST | requireUser | 전략 분석 요청 (mode=batch\|realtime) |
| `GET /api/prd-studio/strategy/:ideaId/status` | GET | requireUser | 전략 분석 상태 조회 |
| `DELETE /api/prd-studio/strategy/:ideaId/cancel` | DELETE | requireUser | PENDING 전략 분석 취소 |
| `GET /api/prd-studio/strategy/:ideaId/result` | GET | requireUser | 전략 분석 결과 조회 |

### 5.2 GTM API

| 라우트 | 메서드 | 인증 | 기능 |
|--------|--------|------|------|
| `POST /api/prd-studio/gtm` | POST | requireUser | GTM 분석 요청 (Strategy COMPLETED 필수) |
| `GET /api/prd-studio/gtm/:ideaId/status` | GET | requireUser | GTM 분석 상태 조회 |

### 5.3 Proposal 합성 API

| 라우트 | 메서드 | 인증 | 기능 |
|--------|--------|------|------|
| `POST /api/prd-studio/synthesize-proposal` | POST | requireUser | PRD+Strategy+GTM → Proposal 10섹션 AI 합성 |

### 5.4 요청/응답 예시

**POST /api/prd-studio/strategy**

```json
// Request
{ "ideaId": "abc-123", "mode": "batch" }

// Response (batch)
{ "queueId": "q-456", "position": 2, "mode": "batch" }

// Response (realtime)
{ "strategy": { "swot": {...}, "leanCanvas": {...}, ... }, "mode": "realtime" }
```

---

## 6. batch-runner.sh 확장

### 6.1 strategy 모드

```bash
run_strategy_mode() {
  log "=== 전략 분석 모드 ==="
  local items
  items=$(query_pending_strategy) || return 0
  # ... Phase 3 PRD 모드와 동일한 패턴
  # 1. PENDING → PROCESSING
  # 2. PRD 섹션 조회 → 프롬프트 빌드
  # 3. claude -p --model claude-sonnet-4-6 --output-format json
  # 4. 파싱 + D1 결과 저장
}
```

### 6.2 gtm 모드

```bash
run_gtm_mode() {
  log "=== GTM 분석 모드 ==="
  # Strategy COMPLETED인 큐 중 GTM 미생성 대상 조회
  # Strategy 결과 + PRD 섹션으로 프롬프트 빌드
  # claude -p 호출
  # D1 결과 저장
}
```

### 6.3 batch-runner.sh 모드 확장

```bash
MODE="${1:-all}"
# 기존: radar | ontology | prd | eval | all
# 추가: strategy | gtm
# all 모드: radar → ontology → eval → prd → strategy → gtm
```

---

## 7. UI 설계

### 7.1 Ideas 페이지 카드 순서 (ideas.$id.tsx)

```
┌─────────────────────────────────────────┐
│ SourceInputPanel (좌) │ Center │ Chat(우)│
│                       │        │        │
│  ┌──── Center 패널 ────┐                │
│  │ PrdAnalysisCard     │  ← Phase 3    │
│  │ StrategyCanvasCard  │  ← Phase 4 S1 │
│  │ GtmStrategyCard     │  ← Phase 4 S2 │
│  │ MethodologyCards... │  ← 기존       │
│  └─────────────────────┘                │
└─────────────────────────────────────────┘
```

### 7.2 StrategyCanvasCard

5개 상태 (Phase 3 PrdAnalysisCard와 동일 패턴):

**State: none** (PRD 분석 미완료)
```
┌─────────────────────────────────────────┐
│ ▸ 전략 분석                              │
├─────────────────────────────────────────┤
│ PRD 분석을 먼저 완료해주세요.              │
│                      [비활성: 전략 분석]   │
└─────────────────────────────────────────┘
```

**State: none** (PRD 분석 완료 — 활성화)
```
┌─────────────────────────────────────────┐
│ ▸ 전략 분석                              │
├─────────────────────────────────────────┤
│ PRD 기반 6개 전략 프레임워크 자동 분석     │
│                                         │
│ ┌SWOT┐ ┌린캔버스┐ ┌JTBD┐              │
│ ┌경쟁분석┐ ┌시장규모┐ ┌리스크┐           │
│                                         │
│ Claude Sonnet 4.6 · API 비용 없음       │
│                   [배치 분석] [즉시 분석]  │
└─────────────────────────────────────────┘
```

**State: PENDING/PROCESSING** — PrdAnalysisCard와 동일 패턴 (큐 위치 + 프로그레스 바)

**State: COMPLETED**
```
┌─────────────────────────────────────────┐
│ ▾ 전략 분석                  ● COMPLETED │
├─────────────────────────────────────────┤
│                                         │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│ │ SWOT    │ │ 린캔버스 │ │ JTBD    │   │
│ │ 4영역   │ │ 9블록   │ │ 6파트   │   │
│ └─────────┘ └─────────┘ └─────────┘   │
│ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│ │ 경쟁분석 │ │ 시장규모│ │ 리스크  │   │
│ │ 3+2사   │ │ TAM/SAM │ │ 5건     │   │
│ └─────────┘ └─────────┘ └─────────┘   │
│                                         │
│ [GTM 전략 생성]  [사업제안 생성]  [재분석] │
└─────────────────────────────────────────┘
```

### 7.3 GtmStrategyCard

**State: none** — Strategy Canvas 미완료 시 비활성
**State: COMPLETED**

```
┌─────────────────────────────────────────┐
│ ▾ GTM 전략                   ● COMPLETED │
├─────────────────────────────────────────┤
│                                         │
│ 비치헤드: {세그먼트명}                    │
│ ICP: {고객 프로필 1줄}                   │
│ 1줄 피치: "{가치 제안}"                   │
│                                         │
│ 채널: ■ Primary(2) ■ Secondary(1)       │
│                                         │
│ [사업제안 생성]  [상세 보기]  [재분석]      │
└─────────────────────────────────────────┘
```

### 7.4 Strategy 상세 뷰어 (모달 또는 별도 페이지)

각 프레임워크 결과를 탭/아코디언으로 상세 표시:

- **SWOT**: 4분면 그리드 + 교차 분석
- **린 캔버스**: 9블록 그리드 레이아웃
- **JTBD**: 6파트 순차 표시
- **경쟁 분석**: 경쟁사 비교 테이블
- **시장 규모**: TAM/SAM/SOM 퍼널 시각화
- **리스크**: Impact×Likelihood 매트릭스

---

## 8. TDD 시나리오

### 8.1 프롬프트 빌더 (6 tests)

| # | 테스트 | 검증 내용 |
|---|--------|----------|
| T1 | buildStrategyPrompt 기본 | PRD 8섹션 입력 → 프롬프트 포함 확인 |
| T2 | buildStrategyPrompt editedContent 우선 | edited > generated fallback |
| T3 | buildStrategyPrompt 빈 섹션 처리 | null 섹션 → 안전 처리 |
| T4 | buildGtmPrompt 기본 | PRD + Strategy 입력 → 프롬프트 생성 |
| T5 | buildGtmPrompt Strategy 부분 결과 | 일부 프레임워크만 있어도 동작 |
| T6 | buildProposalSynthesisPrompt 매핑 | 10섹션 각각 올바른 입력 조합 |

### 8.2 파서 (10 tests)

| # | 테스트 | 검증 내용 |
|---|--------|----------|
| T7 | parseStrategyResult 정상 | 6개 프레임워크 전체 파싱 |
| T8 | parseStrategyResult markdown wrapper 제거 | ` ```json ` 래핑 처리 |
| T9 | parseStrategyResult 부분 결과 | 일부 프레임워크 누락 시 기본값 |
| T10 | parseStrategyResult snake_case 호환 | lean_canvas → leanCanvas |
| T11 | parseStrategyResult impact/likelihood 정규화 | 잘못된 값 → "medium" fallback |
| T12 | parseGtmResult 정상 | GTM 5섹션 파싱 |
| T13 | parseGtmResult 부분 결과 | 일부 섹션 누락 시 기본값 |
| T14 | parseGtmResult channel priority 정규화 | 잘못된 priority → "secondary" |
| T15 | parseProposalSynthesisResult 정상 | 10섹션 content 파싱 |
| T16 | parseProposalSynthesisResult 빈 응답 | 빈 content → "" |

### 8.3 서비스 큐 메서드 (12 tests)

| # | 테스트 | 검증 내용 |
|---|--------|----------|
| T17 | enqueueStrategy 정상 | 큐 INSERT + position 반환 |
| T18 | enqueueStrategy 중복 방지 | PENDING/PROCESSING 존재 시 ConflictError |
| T19 | enqueueStrategy PRD 미완료 | prdId 없으면 NotFoundError |
| T20 | getStrategyStatus none | 큐 없으면 { status: "none" } |
| T21 | getStrategyStatus PENDING | 큐 위치 포함 반환 |
| T22 | getStrategyStatus COMPLETED | 결과 요약 포함 반환 |
| T23 | cancelStrategy 정상 | PENDING 삭제 |
| T24 | cancelStrategy 타인 요청 | ForbiddenError |
| T25 | cancelStrategy PROCESSING | ConflictError |
| T26 | completeStrategy 정상 | result_strategy + result_gtm 저장 |
| T27 | failStrategy 정상 | error_message 저장 + status FAILED |
| T28 | getStrategyResult 정상 | COMPLETED 결과 반환 |

### 8.4 API 라우트 (8 tests)

| # | 테스트 | 검증 내용 |
|---|--------|----------|
| T29 | POST /strategy — batch 모드 | 큐 생성 + 200 |
| T30 | POST /strategy — realtime 모드 | 즉시 결과 반환 |
| T31 | POST /strategy — 인증 없음 | 401 |
| T32 | POST /strategy — PRD 미완료 | 400 |
| T33 | GET /strategy/:ideaId/status | 상태 반환 |
| T34 | GET /strategy/:ideaId/status — 테넌트 격리 | 404 |
| T35 | DELETE /strategy/:ideaId/cancel | 200 |
| T36 | POST /synthesize-proposal | 10섹션 합성 결과 반환 |

### 8.5 UI 컴포넌트 (6 tests — 수동 검증)

| # | 테스트 | 검증 내용 |
|---|--------|----------|
| T37 | StrategyCanvasCard none (PRD 미완료) | 비활성 상태 표시 |
| T38 | StrategyCanvasCard none (PRD 완료) | 분석 버튼 2개 (배치/즉시) |
| T39 | StrategyCanvasCard COMPLETED | 6개 프레임워크 카드 표시 |
| T40 | GtmStrategyCard none | Strategy 미완료 시 비활성 |
| T41 | GtmStrategyCard COMPLETED | 비치헤드/ICP/메시징 표시 |
| T42 | 사업제안 생성 플로우 | PRD+Strategy+GTM → Proposal 생성 확인 |

**총 42개 테스트** (자동 36 + 수동 6)

---

## 9. 구현 순서

| Step | 내용 | 의존성 | 산출물 |
|------|------|--------|--------|
| **1** | DB 스키마 + 마이그레이션 | - | 0064 SQL + Drizzle 스키마 + tests/helpers/db.ts |
| **2** | Strategy 프롬프트 빌더 | - | strategy-prompt.ts + T1~T3 |
| **3** | Strategy 파서 | - | strategy-parser.ts + T7~T11 |
| **4** | GTM 프롬프트 + 파서 | Step 2 | gtm-prompt.ts + gtm-parser.ts + T4~T5, T12~T14 |
| **5** | 서비스 큐 메서드 | Step 1 | PrdStudioService 확장 + T17~T28 |
| **6** | API 라우트 (Strategy) | Step 5 | 4개 라우트 + T29~T35 |
| **7** | API 라우트 (GTM + Proposal 합성) | Step 6 | 3개 라우트 + T36 |
| **8** | batch-runner.sh 확장 | Step 2~4 | strategy + gtm 모드 |
| **9** | 실시간 API 서비스 | Step 2~4 | strategy-realtime.service.ts |
| **10** | StrategyCanvasCard UI | Step 6 | T37~T39 |
| **11** | GtmStrategyCard UI | Step 7 | T40~T41 |
| **12** | Proposal 합성 연동 + UI | Step 7 | proposal-synthesis-prompt.ts + T6, T15~T16, T42 |

---

## 10. 보안

| 계층 | 구현 |
|------|------|
| 인증 | `requireUser()` — Phase 3과 동일 |
| 테넌트 격리 | IdeaService.getById()로 아이디어 소유 확인 |
| PRD 접근 | prdId → prds 테이블에서 tenantId 검증 |
| 실시간 API | env에서 API 키 존재 확인 → 없으면 batch만 가능 |
| 비용 보호 | BudgetEvaluator 경유 (실시간 모드에서만) |

---

## 11. 리스크

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 6프레임워크 1회 호출 시 토큰 과다 | Medium | Medium | PRD 요약본 사용 (전체 대신 핵심 키워드 추출) |
| claude -p JSON 포맷 불일치 | Medium | Low | 강건한 파서 + snake_case 호환 + 기본값 fallback |
| 실시간 모드 25초 타임아웃 | Medium | Medium | 6프레임워크 축소 응답 지시 + AbortController |
| GTM 분석 품질 (PRD만으로는 시장 데이터 부족) | Low | Medium | "추정" 태그 + 추가 조사 필요 영역 명시 프롬프트 |
| UI 복잡도 (3개 카드 순차 배치) | Low | Low | 접이식 + 상태 연쇄 활성화로 시각적 복잡도 관리 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-03-13 | Initial — 전체 범위 (S1+S2+S3) + 하이브리드 엔진 + TDD 42개 | Sinclair Seo |
