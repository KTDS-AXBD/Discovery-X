# Discovery-X 전략적 진화 Phase 2 설계서

> Plan 문서: `docs/01-plan/features/dx-strategic-evolution-p2.plan.md` 기반 상세 설계

## 1. 설계 개요

### 1.1 범위

Phase 2 (L3 연결 준비) 2개 기능의 상세 설계:
- F2. Shadow Mode 운영 검증 통합 (P0)
- F4. Value-up 시나리오 평가 엔진 (P1)

### 1.2 설계 원칙

1. **Phase 1 호환**: 기존 36 테이블 + 55 Agent 도구와 충돌 없이 확장
2. **Phase 1 연동**: industry_adapters, decision_logs, compliance-tools 적극 활용
3. **모듈 독립성**: F2/F4 각각 독립 활성화 가능

### 1.3 현재 시스템 기준

| 지표 | 값 |
|------|-----|
| DB 테이블 | 36 (core) |
| Agent 도구 | 55 (10개 파일) |
| Cron 작업 | 7 |
| 라우트 | ~78 |

---

## 2. F2. Shadow Mode 운영 검증 상세 설계

### 2.1 목표

- **Shadow Run**: 실제 의사결정과 AI 제안을 병행 비교
- **일치율 추적**: 시간 경과에 따른 AI 신뢰도 트렌드 측정
- **이탈 분석**: 불일치 원인을 분류하고 개선 피드백 루프 구축

### 2.2 데이터 모델

#### 2.2.1 신규 테이블: `shadow_runs`

```sql
CREATE TABLE shadow_runs (
  id TEXT PRIMARY KEY,
  discovery_id TEXT NOT NULL REFERENCES discoveries(id) ON DELETE CASCADE,
  experiment_id TEXT REFERENCES experiments(id),

  -- 트리거
  trigger_type TEXT NOT NULL,  -- 'gate_decision' | 'stage_transition' | 'evidence_evaluation' | 'method_selection'
  trigger_ref_id TEXT,          -- 트리거 원본 ID (gate_package, event_log 등)

  -- 비교 데이터
  baseline_decision TEXT NOT NULL,  -- JSON: 실제 판단 { action, rationale, actor }
  ai_suggestion TEXT NOT NULL,      -- JSON: AI 제안 { action, rationale, confidence }
  context_snapshot TEXT,            -- JSON: 판단 시점 상태 (Discovery 스냅샷)

  -- 비교 결과
  match_result TEXT NOT NULL DEFAULT 'pending',  -- 'match' | 'partial' | 'mismatch' | 'pending'
  match_score INTEGER,             -- 0~100
  deviation_analysis TEXT,         -- JSON: { category, severity, description, suggestion }
  deviation_category TEXT,         -- 'risk_tolerance' | 'information_gap' | 'methodology' | 'timing' | 'domain_expertise'

  -- 메타
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  analyzed_at INTEGER,
  reviewed_at INTEGER,
  reviewed_by TEXT REFERENCES users(id)
);

CREATE INDEX idx_shadow_runs_discovery ON shadow_runs(discovery_id);
CREATE INDEX idx_shadow_runs_trigger ON shadow_runs(trigger_type);
CREATE INDEX idx_shadow_runs_result ON shadow_runs(match_result);
CREATE INDEX idx_shadow_runs_created ON shadow_runs(created_at);
```

#### 2.2.2 신규 테이블: `shadow_configs`

```sql
CREATE TABLE shadow_configs (
  id TEXT PRIMARY KEY,
  discovery_id TEXT REFERENCES discoveries(id) ON DELETE CASCADE,  -- NULL = 글로벌

  -- 설정
  trigger_types TEXT NOT NULL DEFAULT '["gate_decision","stage_transition"]',  -- JSON: 활성 트리거
  enabled INTEGER NOT NULL DEFAULT 1,
  auto_analyze INTEGER NOT NULL DEFAULT 1,  -- 자동 이탈 분석

  -- 메타
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_by TEXT REFERENCES users(id)
);

CREATE INDEX idx_shadow_configs_discovery ON shadow_configs(discovery_id);
CREATE INDEX idx_shadow_configs_enabled ON shadow_configs(enabled);
```

### 2.3 Agent 도구 설계 (3개)

#### 2.3.1 `run_shadow_comparison`

```typescript
{
  name: "run_shadow_comparison",
  description: "특정 의사결정에 대해 AI가 독립적으로 판단한 결과를 생성하고, 실제 판단과 비교합니다.",
  input_schema: {
    type: "object",
    required: ["discoveryId", "triggerType", "baselineDecision"],
    properties: {
      discoveryId: { type: "string" },
      triggerType: {
        type: "string",
        enum: ["gate_decision", "stage_transition", "evidence_evaluation", "method_selection"]
      },
      baselineDecision: {
        type: "object",
        description: "실제 판단 { action, rationale, actor }",
        properties: {
          action: { type: "string" },
          rationale: { type: "string" },
          actor: { type: "string" }
        },
        required: ["action"]
      },
      triggerRefId: { type: "string", description: "원본 참조 ID (gate_package ID 등)" },
      contextOverride: { type: "object", description: "컨텍스트 오버라이드 (테스트용)" }
    }
  }
}
```

**구현 로직** (`app/lib/agent/tools/shadow-tools.ts`):
```typescript
export async function runShadowComparison(
  db: D1Database,
  input: {
    discoveryId: string;
    triggerType: string;
    baselineDecision: { action: string; rationale?: string; actor?: string };
    triggerRefId?: string;
    contextOverride?: Record<string, unknown>;
  }
) {
  // 1. Discovery 현재 상태 스냅샷 수집
  //    - discovery 기본 정보, experiments, evidence, 최근 event_logs
  // 2. context_snapshot 저장
  // 3. AI 독립 판단 생성 (동일 컨텍스트로)
  //    - triggerType별 판단 로직 분기
  //    - gate_decision: 승인/반려/보류 판단
  //    - stage_transition: 다음 단계 추천
  //    - evidence_evaluation: 근거 등급 평가
  //    - method_selection: 적합 Method Pack 추천
  // 4. baseline vs ai_suggestion 비교
  //    - action 동일 → match (100)
  //    - action 유사 → partial (50~80)
  //    - action 상이 → mismatch (0~49)
  // 5. shadow_runs 레코드 저장
  // 6. decision_logs에도 기록 (actor_type: 'system')
  // 7. 결과 반환
}
```

#### 2.3.2 `get_shadow_stats`

```typescript
{
  name: "get_shadow_stats",
  description: "Shadow Mode 운영 통계를 조회합니다. 일치율 트렌드, 이탈 유형 분포, 기간별 분석을 제공합니다.",
  input_schema: {
    type: "object",
    properties: {
      discoveryId: { type: "string", description: "특정 Discovery (생략 시 전체)" },
      period: {
        type: "string",
        enum: ["7d", "30d", "90d", "all"],
        default: "30d"
      },
      groupBy: {
        type: "string",
        enum: ["trigger_type", "deviation_category", "discovery"],
        default: "trigger_type"
      }
    }
  }
}
```

**출력 예시**:
```json
{
  "period": "30d",
  "totalRuns": 47,
  "overallMatchRate": 72.3,
  "byResult": { "match": 28, "partial": 11, "mismatch": 8 },
  "byTrigger": {
    "gate_decision": { "runs": 15, "matchRate": 80.0 },
    "stage_transition": { "runs": 20, "matchRate": 65.0 },
    "evidence_evaluation": { "runs": 12, "matchRate": 75.0 }
  },
  "trend": [
    { "week": "2026-W05", "matchRate": 68.0, "runs": 12 },
    { "week": "2026-W06", "matchRate": 75.0, "runs": 15 }
  ],
  "topDeviations": [
    { "category": "risk_tolerance", "count": 5, "avgScore": 35 },
    { "category": "information_gap", "count": 3, "avgScore": 42 }
  ]
}
```

#### 2.3.3 `analyze_shadow_deviation`

```typescript
{
  name: "analyze_shadow_deviation",
  description: "특정 Shadow Run의 이탈 원인을 심층 분석합니다. 이탈 카테고리를 분류하고 개선 제안을 생성합니다.",
  input_schema: {
    type: "object",
    required: ["shadowRunId"],
    properties: {
      shadowRunId: { type: "string" },
      generateSuggestion: { type: "boolean", default: true }
    }
  }
}
```

### 2.4 Cron 설계

#### 2.4.1 Shadow 분석 Cron

**파일**: `app/routes/api.cron.shadow-analyze.ts`

```typescript
// 매일 05:00 실행
// match_result = 'pending' 인 shadow_runs를 자동 분석
export async function analyzePendingShadowRuns(db: D1Database) {
  // 1. pending 상태 shadow_runs 조회
  // 2. 각각에 대해:
  //    a. baseline_decision과 ai_suggestion 비교
  //    b. match_score 계산
  //    c. match_result 판정 (match/partial/mismatch)
  //    d. deviation_analysis 생성 (mismatch일 경우)
  //    e. deviation_category 분류
  //    f. analyzed_at 업데이트
  // 3. 통계 기록 (event_logs)
}
```

### 2.5 UI 설계

#### 2.5.1 Dashboard "Shadow Mode" 탭

**라우트**: `app/routes/dashboard.shadow.tsx`

```
┌─────────────────────────────────────────────────┐
│  Shadow Mode 운영 현황                            │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐        │
│  │ 47   │  │ 72%  │  │  8   │  │ 5    │        │
│  │ 전체 │  │일치율│  │이탈  │  │이탈유형│       │
│  └──────┘  └──────┘  └──────┘  └──────┘        │
│                                                  │
│  ┌─ 최근 Shadow Runs ──────────────────────────┐│
│  │ Discovery │ 유형    │ 결과   │ 점수 │ 날짜  ││
│  │ Disc-1    │ Gate    │ Match  │ 95   │ 02-06 ││
│  │ Disc-2    │ Stage   │ Mismatch│ 30  │ 02-05 ││
│  └─────────────────────────────────────────────┘│
└─────────────────────────────────────────────────┘
```

#### 2.5.2 컴포넌트

- `app/components/shadow/ShadowRunCard.tsx` — 개별 Shadow Run 비교 카드
- `app/components/shadow/ShadowStatsBar.tsx` — 통계 요약 바 (일치율 게이지)

---

## 3. F4. Value-up 시나리오 평가 엔진 상세 설계

### 3.1 목표

- **대상 프로필** 입력 및 관리
- **6차원 자동 진단**: AI Readiness, Market, Tech, Culture, Finance, Regulatory
- **시나리오 생성**: 3가지 전환 시나리오 (Optimistic/Base/Pessimistic)
- **DD 체크리스트**: 산업별 자동 생성

### 3.2 데이터 모델

#### 3.2.1 신규 테이블: `valueup_assessments`

```sql
CREATE TABLE valueup_assessments (
  id TEXT PRIMARY KEY,
  discovery_id TEXT REFERENCES discoveries(id) ON DELETE SET NULL,
  industry_adapter_id TEXT REFERENCES industry_adapters(id),

  -- 대상 정보
  target_name TEXT NOT NULL,
  target_description TEXT,
  target_profile TEXT,             -- JSON: { revenue, employees, techStack, marketPosition, ... }
  assessment_type TEXT NOT NULL,   -- 'acquisition' | 'partnership' | 'investment' | 'transformation'

  -- 상태
  status TEXT NOT NULL DEFAULT 'draft',  -- 'draft' | 'in_progress' | 'completed' | 'archived'
  overall_score INTEGER,           -- 0~100 (6차원 가중 평균)

  -- 메타
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  created_by TEXT NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_valueup_assessments_discovery ON valueup_assessments(discovery_id);
CREATE INDEX idx_valueup_assessments_status ON valueup_assessments(status);
CREATE INDEX idx_valueup_assessments_industry ON valueup_assessments(industry_adapter_id);
```

#### 3.2.2 신규 테이블: `valueup_scores`

```sql
CREATE TABLE valueup_scores (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES valueup_assessments(id) ON DELETE CASCADE,

  -- 스코어링
  dimension TEXT NOT NULL,    -- 'ai_readiness' | 'market_position' | 'tech_maturity' | 'culture_fit' | 'financial_health' | 'regulatory_compliance'
  score INTEGER NOT NULL,     -- 0~100
  evidence_summary TEXT,      -- 스코어 근거 설명
  auto_scored INTEGER NOT NULL DEFAULT 1,  -- AI 자동 채점 여부

  scored_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_valueup_scores_assessment ON valueup_scores(assessment_id);
CREATE INDEX idx_valueup_scores_dimension ON valueup_scores(dimension);
```

#### 3.2.3 신규 테이블: `valueup_scenarios`

```sql
CREATE TABLE valueup_scenarios (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES valueup_assessments(id) ON DELETE CASCADE,

  -- 시나리오
  scenario_type TEXT NOT NULL,     -- 'optimistic' | 'base' | 'pessimistic'
  transformation_plan TEXT,        -- JSON: [{ phase, duration, actions, milestones }]
  value_projection TEXT,           -- JSON: [{ month, revenue, cost, margin, note }]
  risk_factors TEXT,               -- JSON: [{ factor, probability, impact, mitigation }]
  key_assumptions TEXT,            -- JSON: [{ assumption, confidence, validationMethod }]

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_valueup_scenarios_assessment ON valueup_scenarios(assessment_id);
CREATE INDEX idx_valueup_scenarios_type ON valueup_scenarios(scenario_type);
```

#### 3.2.4 신규 테이블: `valueup_checklists`

```sql
CREATE TABLE valueup_checklists (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES valueup_assessments(id) ON DELETE CASCADE,

  -- 체크리스트
  checklist_type TEXT NOT NULL,    -- 'due_diligence' | 'pmi' | 'regulatory' | 'technical'
  items TEXT NOT NULL,             -- JSON: [{ label, checked, note, priority }]
  progress INTEGER NOT NULL DEFAULT 0,  -- 0~100 (체크된 비율)

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_valueup_checklists_assessment ON valueup_checklists(assessment_id);
CREATE INDEX idx_valueup_checklists_type ON valueup_checklists(checklist_type);
```

### 3.3 Agent 도구 설계 (4개)

#### 3.3.1 `create_valueup_assessment`

```typescript
{
  name: "create_valueup_assessment",
  description: "Value-up 평가를 시작합니다. 대상 프로필을 입력받아 평가를 생성합니다.",
  input_schema: {
    type: "object",
    required: ["targetName", "assessmentType"],
    properties: {
      targetName: { type: "string", description: "평가 대상명" },
      targetDescription: { type: "string" },
      assessmentType: {
        type: "string",
        enum: ["acquisition", "partnership", "investment", "transformation"]
      },
      discoveryId: { type: "string", description: "연결할 Discovery ID (선택)" },
      industryCode: {
        type: "string",
        enum: ["manufacturing", "finance", "healthcare", "public", "energy", "other"],
        description: "산업 분류"
      },
      targetProfile: {
        type: "object",
        description: "대상 프로필 { revenue, employees, techStack, marketPosition }",
        properties: {
          revenue: { type: "string" },
          employees: { type: "integer" },
          techStack: { type: "array", items: { type: "string" } },
          marketPosition: { type: "string" }
        }
      }
    }
  }
}
```

**구현 로직** (`app/lib/agent/tools/valueup-tools.ts`):
```typescript
export async function createValueupAssessment(
  db: D1Database,
  userId: string,
  input: CreateValueupAssessmentInput
) {
  // 1. industryCode → industry_adapter_id 조회
  // 2. valueup_assessments 레코드 생성 (status: 'draft')
  // 3. decision_logs에 기록 (decision_type: 'valueup_creation')
  // 4. 결과 반환
}
```

#### 3.3.2 `run_ai_readiness_diagnosis`

```typescript
{
  name: "run_ai_readiness_diagnosis",
  description: "6차원 AI Readiness 자동 진단을 실행합니다. 대상 프로필을 분석하여 각 차원별 점수와 근거를 생성합니다.",
  input_schema: {
    type: "object",
    required: ["assessmentId"],
    properties: {
      assessmentId: { type: "string" },
      dimensions: {
        type: "array",
        items: {
          type: "string",
          enum: ["ai_readiness", "market_position", "tech_maturity", "culture_fit", "financial_health", "regulatory_compliance"]
        },
        description: "진단할 차원 (생략 시 6개 전체)"
      },
      useIndustryBenchmark: { type: "boolean", default: true }
    }
  }
}
```

**구현 로직**:
```typescript
export async function runAiReadinessDiagnosis(
  db: D1Database,
  input: { assessmentId: string; dimensions?: string[]; useIndustryBenchmark?: boolean }
) {
  // 1. assessment 조회 + target_profile 파싱
  // 2. industry_adapter 규칙 조회 (useIndustryBenchmark)
  // 3. 6차원별 스코어링:
  //    - ai_readiness: 기술 스택, 데이터 성숙도, AI 도입 이력
  //    - market_position: 시장 점유율, 성장률, 경쟁 구도
  //    - tech_maturity: 기술 스택 현대성, 클라우드 비율, API 구조
  //    - culture_fit: 조직 문화, 혁신 지표, 변화 수용도
  //    - financial_health: 매출 성장, 이익률, 투자 여력
  //    - regulatory_compliance: 산업 규제 준수, 인증 현황
  // 4. valueup_scores에 저장 (upsert)
  // 5. overall_score 계산 → assessment 업데이트
  // 6. status → 'in_progress'
  // 7. decision_logs에 기록
}
```

#### 3.3.3 `generate_valueup_scenario`

```typescript
{
  name: "generate_valueup_scenario",
  description: "Value-up 전환 시나리오를 생성합니다. Optimistic/Base/Pessimistic 3가지 시나리오와 가치 예측을 제공합니다.",
  input_schema: {
    type: "object",
    required: ["assessmentId"],
    properties: {
      assessmentId: { type: "string" },
      scenarioTypes: {
        type: "array",
        items: { type: "string", enum: ["optimistic", "base", "pessimistic"] },
        default: ["optimistic", "base", "pessimistic"]
      },
      projectionMonths: { type: "integer", default: 24, description: "가치 예측 기간 (월)" }
    }
  }
}
```

**구현 로직**:
```typescript
export async function generateValueupScenario(
  db: D1Database,
  input: { assessmentId: string; scenarioTypes?: string[]; projectionMonths?: number }
) {
  // 1. assessment + scores 조회
  // 2. industry_adapter 규칙 참조
  // 3. 시나리오별 생성:
  //    - transformation_plan: [{ phase: "Phase 1: 진단", duration: "3M", actions: [...], milestones: [...] }]
  //    - value_projection: [{ month: 6, revenue: "120%", margin: "+5%", note: "AI 도입 효과" }]
  //    - risk_factors: [{ factor: "인력 이탈", probability: 30, impact: 70, mitigation: "..." }]
  //    - key_assumptions: [{ assumption: "...", confidence: 80, validationMethod: "..." }]
  // 4. valueup_scenarios에 저장 (기존 삭제 후 재생성)
  // 5. decision_logs에 기록
}
```

#### 3.3.4 `generate_due_diligence_checklist`

```typescript
{
  name: "generate_due_diligence_checklist",
  description: "산업별 Due Diligence 체크리스트를 자동 생성합니다. 산업 어댑터의 규제 요건을 반영합니다.",
  input_schema: {
    type: "object",
    required: ["assessmentId"],
    properties: {
      assessmentId: { type: "string" },
      checklistTypes: {
        type: "array",
        items: { type: "string", enum: ["due_diligence", "pmi", "regulatory", "technical"] },
        default: ["due_diligence"]
      }
    }
  }
}
```

### 3.4 TOOL_MIN_AUTONOMY 설정

```typescript
export const TOOL_MIN_AUTONOMY_P2 = {
  // F2: Shadow Mode
  run_shadow_comparison: 2,
  get_shadow_stats: 1,
  analyze_shadow_deviation: 1,

  // F4: Value-up Engine
  create_valueup_assessment: 2,
  run_ai_readiness_diagnosis: 2,
  generate_valueup_scenario: 2,
  generate_due_diligence_checklist: 2,
};
```

### 3.5 UI 설계

#### 3.5.1 Value-up 목록

**라우트**: `app/routes/valueup.tsx`

```
┌──────────────────────────────────────────────────┐
│  Value-up 평가 목록                               │
├──────────────────────────────────────────────────┤
│ [+ 새 평가 생성]                                  │
│                                                   │
│  ┌─ Card ───────────────────────────────────────┐│
│  │ TargetCo / 금융·보험                         ││
│  │ 투자 | Score: 78 | 진행 중                    ││
│  │ 2026-02-06                                    ││
│  └──────────────────────────────────────────────┘│
│  ┌─ Card ───────────────────────────────────────┐│
│  │ HealthAI / 헬스케어·의료                      ││
│  │ 인수 | Score: 65 | 완료                       ││
│  └──────────────────────────────────────────────┘│
└──────────────────────────────────────────────────┘
```

#### 3.5.2 Value-up 상세

**라우트**: `app/routes/valueup.$id.tsx`

```
┌──────────────────────────────────────────────────┐
│  ← Value-up 목록                                  │
│  TargetCo — 투자 평가                             │
├──────────────────────────────────────────────────┤
│                                                   │
│  ┌─ 6차원 스코어 ────────────────────────────────┐│
│  │  AI Readiness    ████████░░ 82               ││
│  │  Market Position ██████░░░░ 65               ││
│  │  Tech Maturity   ███████░░░ 75               ││
│  │  Culture Fit     █████░░░░░ 55               ││
│  │  Financial Health████████░░ 80               ││
│  │  Reg. Compliance ██████████ 95               ││
│  │                          Overall: 75          ││
│  └──────────────────────────────────────────────┘│
│                                                   │
│  ┌─ 시나리오 탭 ────────────────────────────────┐│
│  │ [Optimistic] [Base] [Pessimistic]            ││
│  │                                               ││
│  │ 전환 계획:                                    ││
│  │ Phase 1 (3M): AI 진단 + PoC                  ││
│  │ Phase 2 (6M): 핵심 프로세스 AI 전환          ││
│  │ Phase 3 (12M): 전사 확산 + 운영 안정화       ││
│  │                                               ││
│  │ 가치 예측: +35% (24M)                         ││
│  │ 주요 리스크: 인력 이탈 (30%), 기술 부채 (45%)││
│  └──────────────────────────────────────────────┘│
└──────────────────────────────────────────────────┘
```

#### 3.5.3 체크리스트

**라우트**: `app/routes/valueup.$id.checklist.tsx`

#### 3.5.4 컴포넌트

- `app/components/valueup/AssessmentCard.tsx` — 평가 카드 (목록용)
- `app/components/valueup/ScoreDimension.tsx` — 차원별 스코어 바
- `app/components/valueup/ScenarioView.tsx` — 시나리오 탭 뷰
- `app/components/valueup/ChecklistProgress.tsx` — 체크리스트 진행 바

---

## 4. 구현 순서

### 4.1 Phase 2-A: 스키마 마이그레이션

```
drizzle/0017_shadow_mode.sql
├── shadow_runs 테이블 생성 (4 인덱스)
└── shadow_configs 테이블 생성 (2 인덱스)

drizzle/0018_valueup_engine.sql
├── valueup_assessments 테이블 생성 (3 인덱스)
├── valueup_scores 테이블 생성 (2 인덱스)
├── valueup_scenarios 테이블 생성 (2 인덱스)
└── valueup_checklists 테이블 생성 (2 인덱스)
```

### 4.2 Phase 2-B: Agent 도구 구현

```
app/lib/agent/tools/
├── shadow-tools.ts (신규) — F2 도구 3개
└── valueup-tools.ts (신규) — F4 도구 4개

app/lib/agent/tool-registry.ts (수정)
└── 7개 도구 등록 + TOOL_MIN_AUTONOMY 추가

app/lib/agent/executor.ts (수정)
└── 7개 case 추가
```

### 4.3 Phase 2-C: Cron

```
app/routes/
└── api.cron.shadow-analyze.ts (신규)
```

### 4.4 Phase 2-D: UI

```
app/routes/
├── dashboard.shadow.tsx (신규) — F2 Dashboard 탭
├── valueup.tsx (신규) — F4 목록
├── valueup.$id.tsx (신규) — F4 상세
└── valueup.$id.checklist.tsx (신규) — F4 체크리스트

app/routes/dashboard.tsx (수정)
└── ShadowIcon + "Shadow Mode" 탭 추가

app/components/
├── shadow/ShadowRunCard.tsx (신규)
├── shadow/ShadowStatsBar.tsx (신규)
├── valueup/AssessmentCard.tsx (신규)
├── valueup/ScoreDimension.tsx (신규)
├── valueup/ScenarioView.tsx (신규)
└── valueup/ChecklistProgress.tsx (신규)
```

---

## 5. 테스트 계획

### 5.1 Unit 테스트

| 영역 | 테스트 파일 | 테스트 케이스 |
|------|------------|-------------|
| Shadow Comparison | `shadow-tools.test.ts` | match/partial/mismatch 판정, deviation 분류 |
| Shadow Stats | `shadow-stats.test.ts` | 기간별 집계, groupBy 로직 |
| Valueup Assessment | `valueup-tools.test.ts` | CRUD, 스코어링, 시나리오 생성 |
| DD Checklist | `valueup-checklist.test.ts` | 산업별 항목 생성, progress 계산 |

### 5.2 Integration 테스트

| 시나리오 | 설명 |
|---------|------|
| Shadow 전체 플로우 | Gate 결정 → Shadow 비교 → 이탈 분석 → 통계 조회 |
| Value-up 전체 플로우 | 평가 생성 → 6차원 진단 → 시나리오 생성 → DD 체크리스트 |
| Phase 1 연동 | industry_adapter → regulatory_compliance 스코어 반영 |

---

## 6. 성공 지표

| 지표 | 기준 |
|------|------|
| 신규 테이블 | 6개 (shadow 2 + valueup 4) |
| 신규 Agent 도구 | 7개 (55→62) |
| 신규 Cron 작업 | 1개 (7→8) |
| 신규 라우트 | 4개 (shadow 1 + valueup 3) |
| 신규 컴포넌트 | 6개 (shadow 2 + valueup 4) |
| 테스트 커버리지 | 신규 코드 80% 이상 |

---

## 7. 의존성 및 제약

### 7.1 Phase 1 의존성

| Phase 1 산출물 | F2 활용 | F4 활용 |
|---------------|---------|---------|
| `industry_adapters` | - | 산업 분류, 벤치마크 |
| `industry_rules` | - | regulatory_compliance 스코어링 |
| `decision_logs` | Shadow 비교 기준 | 판단 기록 |
| `compliance-tools` | - | 규제 준수 검증 |
| `extracted_patterns` | 이탈 패턴 분류 | - |

### 7.2 제약

- Shadow AI 판단은 Claude API 호출 필요 → 비용 고려 (auto_analyze 설정으로 제어)
- Value-up 스코어링의 정확도는 target_profile 입력 품질에 의존
- 시나리오 생성은 도메인 전문 지식 한계 → 산업 어댑터 + 외부 프레임워크 참조

---

## 참조 문서

- Plan: `docs/01-plan/features/dx-strategic-evolution-p2.plan.md`
- Phase 1 Design: `docs/02-design/features/dx-strategic-evolution.design.md`
- Phase 1 Report: `docs/04-report/dx-strategic-evolution.report.md`
- 현재 스키마: `app/db/schema.ts` (36개 테이블)
- Agent 도구: `app/lib/agent/tool-registry.ts` (55개)

---

*Design 작성일: 2026-02-06*
*PDCA Feature: dx-strategic-evolution-p2*
