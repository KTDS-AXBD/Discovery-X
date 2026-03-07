---
code: DX-SPEC-007
title: Framework Architecture Mapping v1
version: 1.0
status: Active
category: SPEC
created: 2026-03-07
updated: 2026-03-07
author: Sinclair Seo
system-version: ">=0.1.0"
---

# Discovery-X Framework Porting — PRD v3 아키텍처 매핑 문서

**Graph-First 아키텍처 위에 산업×기능 매트릭스를 이식하기 위한 설계 명세**

| 항목 | 내용 |
|------|------|
| 작성일 | 2026-02-18 |
| 버전 | v1.0 |
| 기반 문서 | Discovery-X PRD v3 Final, KTDS AX Framework DevPlan |
| 대상 | AX BD팀 개발자, PM |

---

# 1. 문서 목적

본 문서는 「KT DS AX BD Framework DevPlan」에서 정의한 **산업×기능 매트릭스 체계**를
Discovery-X PRD v3의 Graph-First 아키텍처 위에 정합성 있게 이식하기 위한 **계층별 매핑 명세**다.

PRD v3의 5대 원칙을 위반하지 않으면서, Framework의 비즈니스 요구를 충족하는 것이 목표이다.

### 설계 판단 기준 (PRD v3 원칙 재확인)

```
[원칙 1] Discovery Pipeline이 시스템의 중심이다
[원칙 2] Graph Layer는 파이프라인 데이터의 정본(Source of Truth)이다
[원칙 3] Agent는 Graph를 읽고 사용자에게 맥락을 전달하는 접점이다
[원칙 4] Agent의 Graph 직접 수정은 제한적으로만 허용한다
[원칙 5] 협업(Topic)은 파이프라인 위의 조직화 수단이다
```

---

# 2. 핵심 설계 결정

## 2.1 Matrix Cell과 Topic의 관계: N:M (다대다)

### 결정 근거

| 선택지 | 장점 | 단점 | 판정 |
|--------|------|------|------|
| 1:1 (Cell = Topic) | 단순 | 산업×기능 = 72개 조합 → Topic 폭발, 대부분 빈 셀 | ❌ |
| N:1 (여러 Cell → 하나의 Topic) | 유연 | Cell 단위 추적 불가 | ❌ |
| **N:M (Cell ↔ Topic, Signal로 연결)** | 현실 반영, 유연 | 매핑 테이블 필요 | ✅ 채택 |
| 독립 차원 | 간섭 없음 | 시너지 없음, 이중 관리 | ❌ |

**이유:** 현실에서 하나의 Topic("AI 기반 공급망 혁신")은 여러 Matrix Cell에 걸칠 수 있고
(제조×공급망, 유통×AI자동화), 하나의 Cell("금융×CRM")에도 여러 Topic이 존재할 수 있다.
Signal이 자연스러운 교차점 역할을 한다.

### 관계 모델

```
Industry ──┐
           ├── MatrixCell (N:M 교차) ──→ cell_topic_map ←── Topic
Function ──┘         │
                     │
                     ↓
              MatrixScore (C-Level + Execution)
                     │
                     ↓
              Signal (topic_id + cell_id 동시 보유)
```

## 2.2 Stage-Gate ↔ PRD v3 파이프라인 매핑

두 체계는 동일한 파이프라인의 다른 표현이다. 아래와 같이 매핑한다:

| Stage-Gate | PRD v3 파이프라인 | 설명 |
|------------|------------------|------|
| S0 | Activity | 초기 활동/아이디어 수집 |
| S1 | Signal | 탐지된 시그널, 기본 스코어링 |
| S2 | Scorecard → Brief | 평가표 작성 + 브리프 문서화 |
| S3 | Validation | 검증 단계, 파일럿 준비 |
| S4 | Pilot-ready | 실행 확정, 파일럿 진행 |

**구현 방침:** DB에는 PRD v3의 파이프라인 단계명을 정본으로 사용하고,
UI에서는 S0~S4 레이블을 병기한다. `enums.ts`에 양방향 매핑을 정의한다.

```typescript
// app/lib/types/enums.ts (추가)
export const STAGE_GATE_MAP = {
  activity: 'S0',
  signal: 'S1',
  scorecard: 'S2',
  brief: 'S2',      // S2는 scorecard + brief를 포괄
  validation: 'S3',
  pilot_ready: 'S4',
} as const;

export const PIPELINE_STAGE_MAP = {
  S0: 'activity',
  S1: 'signal',
  S2: 'scorecard',   // S2 진입 = scorecard, S2 완료 = brief
  S3: 'validation',
  S4: 'pilot_ready',
} as const;
```

## 2.3 스코어링 모델: 혼합형 (수동 입력 + 시그널 보정)

```
┌─────────────────────────────────────┐
│        MatrixScore 산출 흐름         │
├─────────────────────────────────────┤
│                                     │
│  [수동 입력]                         │
│    C-Level: 전략적합성, 수익성,      │
│            시장확장성, 브랜드영향력    │
│    Execution: 실행가능성, 기술난이도,  │
│              레퍼런스, 인력가용성      │
│         ↓                           │
│  [기본 스코어] (가중 평균)            │
│         ↓                           │
│  [시그널 보정]                       │
│    해당 Cell 연결 시그널의            │
│    평균 score × 보정 계수(0.2)       │
│         ↓                           │
│  [최종 CompositeScore]              │
│    = base_clevel × 0.4              │
│    + base_execution × 0.4           │
│    + signal_adjustment × 0.2        │
│                                     │
└─────────────────────────────────────┘
```

보정 계수(0.2)는 초기 설정이며, 운영 후 조정 가능하도록 설정 테이블에서 관리한다.

---

# 3. Graph Layer 매핑

## 3.1 JSON-LD @context 확장

PRD v3의 기존 `@context`에 Framework 전용 타입을 추가한다.

```json
{
  "@context": {
    "dx": "https://discovery-x.app/ns/",
    "schema": "https://schema.org/",

    // === PRD v3 기존 ===
    "dx:User": { "@id": "dx:User" },
    "dx:Topic": { "@id": "dx:Topic" },
    "dx:Decision": { "@id": "dx:Decision" },
    "dx:Signal": { "@id": "dx:Signal" },
    "dx:Glossary": { "@id": "dx:Glossary" },
    "dx:Expertise": { "@id": "dx:Expertise" },
    "dx:Preference": { "@id": "dx:Preference" },

    // === Framework 확장 ===
    "dx:Industry": { "@id": "dx:Industry" },
    "dx:Function": { "@id": "dx:Function" },
    "dx:MatrixCell": { "@id": "dx:MatrixCell" },
    "dx:MatrixScore": { "@id": "dx:MatrixScore" },
    "dx:TimeHorizon": { "@id": "dx:TimeHorizon" },

    // === 관계 속성 ===
    "dx:expertise": { "@type": "@id" },
    "dx:relatedTo": { "@type": "@id" },
    "dx:decidedBy": { "@type": "@id" },
    "dx:belongsToIndustry": { "@type": "@id" },
    "dx:belongsToFunction": { "@type": "@id" },
    "dx:linkedCell": { "@type": "@id" },
    "dx:importance": { "@type": "schema:Float" },
    "dx:confidence": { "@type": "schema:Float" },
    "dx:strategicWeight": { "@type": "schema:Float" }
  }
}
```

### @id 네이밍 규칙 (확장)

| 엔티티 | @id 패턴 | 예시 |
|--------|---------|------|
| Industry | `dx:industry/{industryId}` | `dx:industry/finance` |
| Function | `dx:function/{functionId}` | `dx:function/crm` |
| MatrixCell | `dx:cell/{industryId}/{functionId}` | `dx:cell/finance/crm` |
| MatrixScore | `dx:cell/{industryId}/{functionId}/score/{scoreId}` | `dx:cell/finance/crm/score/2026Q1` |
| TimeHorizon | `dx:horizon/{short\|mid\|long}` | `dx:horizon/short` |

## 3.2 Graph 저장 전략

Framework 데이터는 **org scope Graph**에 저장한다.

```
graphs 테이블 활용:
┌──────────────────────────────────────────┐
│ scope_type = 'org'                        │
│ scope_id   = '{team_id}'                  │
│ jsonld     = { Industry, Function,        │
│                MatrixCell, MatrixScore,    │
│                TimeHorizon 노드 포함 }     │
└──────────────────────────────────────────┘
```

**이유:** 산업×기능 매트릭스는 팀 공통 지식이며, 개인(user) 또는 토픽(topic) 단위가 아니다.
PRD v3의 org scope가 정확히 이 용도다.

### Graph 조회 예시

```sql
-- 전체 매트릭스 구조 조회
SELECT jsonld FROM graphs WHERE scope_type = 'org' AND scope_id = ?;

-- 특정 Cell의 스코어 조회 (json_extract 활용)
SELECT json_extract(jsonld, '$.["dx:cell/finance/crm"]') 
FROM graphs WHERE scope_type = 'org' AND scope_id = ?;
```

### GraphQueryEngine 확장 메서드

```typescript
// app/lib/graph/query.ts (확장)
class GraphQueryEngine {
  // ... 기존 메서드 유지 ...

  // Matrix 전용 조회
  async getMatrixCells(teamId: string, filters?: MatrixFilter): Promise<MatrixCell[]>

  // Industry별 Cell 목록
  async getCellsByIndustry(teamId: string, industryId: string): Promise<MatrixCell[]>

  // Function별 Cell 목록
  async getCellsByFunction(teamId: string, functionId: string): Promise<MatrixCell[]>

  // Cell에 연결된 Signal 목록
  async getSignalsByCell(cellId: string): Promise<Signal[]>

  // Cell에 연결된 Topic 목록
  async getTopicsByCell(cellId: string): Promise<Topic[]>

  // Heatmap 데이터 (전체 매트릭스 + 스코어)
  async getHeatmapData(teamId: string, horizonFilter?: TimeHorizon): Promise<HeatmapData>
}
```

---

# 4. Storage Layer 매핑

## 4.1 신규 테이블 스키마

### industries (산업군 마스터)

```sql
CREATE TABLE industries (
  id              TEXT PRIMARY KEY,          -- 'finance', 'public', 'telecom' 등
  team_id         TEXT NOT NULL,
  name            TEXT NOT NULL,             -- '금융', '공공', '통신'
  display_order   INTEGER NOT NULL DEFAULT 0,
  strategic_weight REAL DEFAULT 1.0,         -- KT DS 강점 산업 가중치
  is_active       INTEGER DEFAULT 1,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (team_id) REFERENCES teams(id)
);
```

### functions (기능 마스터)

```sql
CREATE TABLE functions (
  id              TEXT PRIMARY KEY,          -- 'finance_accounting', 'scm', 'hr' 등
  team_id         TEXT NOT NULL,
  name            TEXT NOT NULL,             -- '재무/회계', '공급망/물류', 'HR'
  category        TEXT NOT NULL              -- 'sap_based', 'ai_service'
                  CHECK (category IN ('sap_based', 'ai_service')),
  display_order   INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER DEFAULT 1,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (team_id) REFERENCES teams(id)
);
```

### matrix_cells (산업×기능 교차점)

```sql
CREATE TABLE matrix_cells (
  id              TEXT PRIMARY KEY,          -- '{industry_id}_{function_id}'
  team_id         TEXT NOT NULL,
  industry_id     TEXT NOT NULL,
  function_id     TEXT NOT NULL,
  time_horizon    TEXT NOT NULL DEFAULT 'short'
                  CHECK (time_horizon IN ('short', 'mid', 'long')),
  status          TEXT DEFAULT 'active'
                  CHECK (status IN ('active', 'watching', 'archived')),
  description     TEXT,
  revenue_potential REAL,                    -- 예상 매출 (억원 단위)
  pipeline_stage  TEXT DEFAULT 'activity'
                  CHECK (pipeline_stage IN (
                    'activity', 'signal', 'scorecard', 'brief', 'validation', 'pilot_ready'
                  )),
  created_by      TEXT NOT NULL,
  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now')),

  UNIQUE(team_id, industry_id, function_id),
  FOREIGN KEY (team_id) REFERENCES teams(id),
  FOREIGN KEY (industry_id) REFERENCES industries(id),
  FOREIGN KEY (function_id) REFERENCES functions(id),
  FOREIGN KEY (created_by) REFERENCES user_profiles(id)
);

CREATE INDEX idx_cells_team ON matrix_cells(team_id);
CREATE INDEX idx_cells_industry ON matrix_cells(industry_id);
CREATE INDEX idx_cells_function ON matrix_cells(function_id);
CREATE INDEX idx_cells_horizon ON matrix_cells(time_horizon);
CREATE INDEX idx_cells_stage ON matrix_cells(pipeline_stage);
```

### matrix_scores (이중 스코어링)

```sql
CREATE TABLE matrix_scores (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id         TEXT NOT NULL,
  scored_by       TEXT NOT NULL,
  score_period    TEXT NOT NULL,             -- '2026Q1' 등

  -- C-Level 관점 (각 1.0~5.0)
  strategic_fit       REAL NOT NULL DEFAULT 3.0,
  profitability       REAL NOT NULL DEFAULT 3.0,
  market_scalability  REAL NOT NULL DEFAULT 3.0,
  brand_impact        REAL NOT NULL DEFAULT 3.0,
  roi_expectation     REAL NOT NULL DEFAULT 3.0,

  -- 실무자 관점 (각 1.0~5.0)
  feasibility         REAL NOT NULL DEFAULT 3.0,
  tech_difficulty     REAL NOT NULL DEFAULT 3.0,  -- 역수 처리: 높을수록 어려움
  reference_exists    REAL NOT NULL DEFAULT 3.0,
  resource_available  REAL NOT NULL DEFAULT 3.0,
  risk_level          REAL NOT NULL DEFAULT 3.0,  -- 역수 처리: 높을수록 위험

  -- 산출 스코어 (트리거 또는 서비스에서 계산)
  clevel_score        REAL,                  -- C-Level 가중 평균
  execution_score     REAL,                  -- Execution 가중 평균
  signal_adjustment   REAL DEFAULT 0.0,      -- 시그널 보정값
  composite_score     REAL,                  -- 최종 종합 스코어

  created_at      TEXT DEFAULT (datetime('now')),
  updated_at      TEXT DEFAULT (datetime('now')),

  UNIQUE(cell_id, scored_by, score_period),
  FOREIGN KEY (cell_id) REFERENCES matrix_cells(id),
  FOREIGN KEY (scored_by) REFERENCES user_profiles(id)
);

CREATE INDEX idx_scores_cell ON matrix_scores(cell_id);
CREATE INDEX idx_scores_period ON matrix_scores(score_period);
CREATE INDEX idx_scores_composite ON matrix_scores(composite_score);
```

### cell_topic_map (Cell ↔ Topic N:M 매핑)

```sql
CREATE TABLE cell_topic_map (
  cell_id     TEXT NOT NULL,
  topic_id    TEXT NOT NULL,
  relevance   REAL DEFAULT 1.0,             -- 관련도 (0.0~1.0)
  linked_by   TEXT NOT NULL,
  linked_at   TEXT DEFAULT (datetime('now')),

  PRIMARY KEY (cell_id, topic_id),
  FOREIGN KEY (cell_id) REFERENCES matrix_cells(id),
  FOREIGN KEY (topic_id) REFERENCES topics(id),
  FOREIGN KEY (linked_by) REFERENCES user_profiles(id)
);

CREATE INDEX idx_cell_topic_cell ON cell_topic_map(cell_id);
CREATE INDEX idx_cell_topic_topic ON cell_topic_map(topic_id);
```

### cell_signals (Cell ↔ Signal 연결)

```sql
-- shared_signals 테이블에 cell_id 컬럼 추가
ALTER TABLE shared_signals ADD COLUMN cell_id TEXT
  REFERENCES matrix_cells(id);

CREATE INDEX idx_signals_cell ON shared_signals(cell_id) WHERE cell_id IS NOT NULL;
```

### scoring_config (스코어링 설정)

```sql
CREATE TABLE scoring_config (
  id              TEXT PRIMARY KEY,
  team_id         TEXT NOT NULL,
  config_key      TEXT NOT NULL,
  config_value    REAL NOT NULL,
  description     TEXT,
  updated_at      TEXT DEFAULT (datetime('now')),

  UNIQUE(team_id, config_key),
  FOREIGN KEY (team_id) REFERENCES teams(id)
);

-- 초기 설정 데이터
INSERT INTO scoring_config (id, team_id, config_key, config_value, description) VALUES
  ('cfg_01', '{team_id}', 'weight_clevel', 0.4, 'C-Level 스코어 가중치'),
  ('cfg_02', '{team_id}', 'weight_execution', 0.4, 'Execution 스코어 가중치'),
  ('cfg_03', '{team_id}', 'weight_signal', 0.2, '시그널 보정 가중치'),
  ('cfg_04', '{team_id}', 'signal_decay_days', 90, '시그널 보정 시 감쇠 기준일'),
  ('cfg_05', '{team_id}', 'min_signals_for_adjust', 3, '보정 적용 최소 시그널 수');
```

## 4.2 기존 테이블 변경 사항

| 기존 테이블 | 변경 내용 | 영향도 |
|------------|----------|--------|
| `shared_signals` | `cell_id` 컬럼 추가 (nullable FK) | 낮음 — 기존 데이터 영향 없음 |
| `graphs` | 변경 없음 — org scope로 활용 | 없음 |
| `graph_events` | 변경 없음 — 감사 로그 그대로 활용 | 없음 |
| `topics` | 변경 없음 — `cell_topic_map`으로 연결 | 없음 |
| `projections` | `proj_type`에 `'MATRIX.md'` 추가 | 낮음 — CHECK 제약 수정 |

### projections 테이블 수정

```sql
-- proj_type CHECK 제약 확장
-- 기존: ('USER.md', 'TOPIC.md', 'BRIEFING.md', 'SOUL.md')
-- 변경: ('USER.md', 'TOPIC.md', 'BRIEFING.md', 'SOUL.md', 'MATRIX.md')

-- D1에서는 ALTER로 CHECK 변경 불가 → 마이그레이션에서 테이블 재생성
```

---

# 5. ACL Layer 매핑

## 5.1 Scope 확장

Framework 데이터는 **org scope**에 속하므로, 기존 ACL 구조를 그대로 활용한다.

```
Request: /matrix/*
  ↓
Scope 판정: scope_type = 'org', scope_id = team_id
  ↓
Role 확인: teams 소속 여부 → 소속이면 'editor', 미소속이면 'none'
  ↓
Permission 매핑: editor → read ✅, write ✅
```

### Matrix 전용 권한 세분화

| 행위 | 필요 Role | 비고 |
|------|----------|------|
| Matrix 조회 (Heatmap) | viewer 이상 | 팀원 전체 열람 가능 |
| Cell 생성/수정 | editor 이상 | 일반 팀원 |
| Score 입력/수정 | editor 이상 | 본인 스코어만 수정 가능 |
| Industry/Function 마스터 수정 | owner | 팀장/PM만 |
| Scoring Config 변경 | owner | 팀장/PM만 |
| Cell 삭제 | owner | 팀장/PM만 |

### 구현

```typescript
// app/lib/acl/policies.ts (확장)
export const MATRIX_POLICIES = {
  'matrix.view':     { minRole: 'viewer' },
  'matrix.cell.edit': { minRole: 'editor' },
  'matrix.score.edit': { minRole: 'editor', selfOnly: true },
  'matrix.master.edit': { minRole: 'owner' },
  'matrix.config.edit': { minRole: 'owner' },
  'matrix.cell.delete': { minRole: 'owner' },
} as const;
```

---

# 6. Service Layer 매핑

## 6.1 신규 서비스

```
app/lib/services/
├── discovery.service.ts      (기존)
├── idea.service.ts           (기존)
├── proposal.service.ts       (기존)
├── radar.service.ts          (기존)
├── venture.service.ts        (기존)
├── matrix.service.ts         [NEW] — 매트릭스 CRUD + 조회
├── scoring.service.ts        [NEW] — 스코어 계산 + 시그널 보정
└── matrix-sync.service.ts    [NEW] — Graph ↔ DB 동기화
```

### matrix.service.ts

```typescript
// app/lib/services/matrix.service.ts
class MatrixService {
  // === Industry/Function 마스터 ===
  async getIndustries(teamId: string): Promise<Industry[]>
  async createIndustry(teamId: string, data: IndustryInput): Promise<Industry>
  async updateIndustry(id: string, data: Partial<IndustryInput>): Promise<Industry>

  async getFunctions(teamId: string): Promise<Function[]>
  async createFunction(teamId: string, data: FunctionInput): Promise<Function>
  async updateFunction(id: string, data: Partial<FunctionInput>): Promise<Function>

  // === Matrix Cell ===
  async getCells(teamId: string, filters?: CellFilter): Promise<MatrixCell[]>
  async getCell(cellId: string): Promise<MatrixCell | null>
  async createCell(data: CellInput): Promise<MatrixCell>
  async updateCell(cellId: string, data: Partial<CellInput>): Promise<MatrixCell>

  // === Cell ↔ Topic 연결 ===
  async linkCellToTopic(cellId: string, topicId: string, relevance?: number): Promise<void>
  async unlinkCellFromTopic(cellId: string, topicId: string): Promise<void>
  async getCellTopics(cellId: string): Promise<TopicWithRelevance[]>
  async getTopicCells(topicId: string): Promise<CellWithRelevance[]>

  // === Heatmap ===
  async getHeatmapData(teamId: string, filters?: HeatmapFilter): Promise<HeatmapData>
}
```

### scoring.service.ts

```typescript
// app/lib/services/scoring.service.ts
class ScoringService {
  // === 스코어 입력 ===
  async submitScore(cellId: string, userId: string, period: string, scores: ScoreInput): Promise<MatrixScore>
  async getScores(cellId: string, period?: string): Promise<MatrixScore[]>
  async getMyScores(userId: string, period?: string): Promise<MatrixScore[]>

  // === 스코어 계산 ===
  async calculateComposite(scoreId: number): Promise<CompositeResult> {
    // 1. C-Level 가중 평균 계산
    //    clevel = avg(strategic_fit, profitability, market_scalability, brand_impact, roi_expectation)
    //
    // 2. Execution 가중 평균 계산 (역수 항목 변환)
    //    execution = avg(feasibility, invert(tech_difficulty), reference_exists,
    //                    resource_available, invert(risk_level))
    //
    // 3. 시그널 보정
    //    signal_adj = calculateSignalAdjustment(cellId)
    //
    // 4. 종합 스코어
    //    composite = clevel × w_c + execution × w_e + signal_adj × w_s
  }

  // === 시그널 보정 계산 ===
  async calculateSignalAdjustment(cellId: string): Promise<number> {
    // 1. Cell에 연결된 시그널 조회
    // 2. 최근 N일 이내 시그널만 필터 (config: signal_decay_days)
    // 3. 최소 시그널 수 확인 (config: min_signals_for_adjust)
    // 4. 시그널 평균 score를 0~5 스케일로 정규화
    // 5. 미달 시 0 반환 (보정 없음)
  }

  // === 설정 관리 ===
  async getConfig(teamId: string): Promise<ScoringConfig>
  async updateConfig(teamId: string, key: string, value: number): Promise<void>
}
```

---

# 7. Integration Layer 매핑

## 7.1 PipelineBridge 확장

```typescript
// app/lib/integration/pipeline-bridge.ts (확장)

// 기존 인터페이스 유지 + Matrix 전용 추가
interface PipelineToAgent {
  // ... 기존 메서드 ...

  // [NEW] Matrix 관련
  getMatrixContext(userId: string): Promise<MatrixContext>;
  getCellBriefing(cellId: string): Promise<CellBriefing>;
  getTopCellsByScore(teamId: string, limit?: number): Promise<RankedCell[]>;
}

interface AgentToPipeline {
  // ... 기존 메서드 ...

  // [NEW] Matrix 관련
  suggestCellForSignal(signalId: string, cellId: string): Promise<void>;
  updateCellStage(cellId: string, newStage: PipelineStage): Promise<void>;
}
```

## 7.2 BriefingBuilder 확장

일간 브리핑에 Matrix 변동 정보를 포함한다.

```typescript
// app/lib/integration/briefing-builder.ts (확장)
class BriefingBuilder {
  async buildDailyBriefing(userId: string): Promise<BriefingData> {
    return {
      // 기존
      signals: await this.getRelevantSignals(userId),
      pipelineChanges: await this.getPipelineChanges(),

      // [NEW] Matrix 섹션
      matrix: {
        scoreChanges: await this.getScoreChanges(),        // 전일 대비 스코어 변동
        newSignalsByCell: await this.getNewSignalsByCell(), // Cell별 신규 시그널
        stageAdvances: await this.getStageAdvances(),       // 파이프라인 진행 Cell
        topOpportunities: await this.getTopCells(5),        // 상위 5개 기회
      }
    };
  }
}
```

## 7.3 Cron Trigger 확장

```
기존:
  매일 07:00 KST  — 일간 브리핑 생성
  매주 일 03:00   — Memory compaction
  매주 일 04:00   — Projection 일괄 동기화

추가:
  매일 06:30 KST  — 시그널 보정 스코어 일괄 재계산 (ScoringService.recalculateAll)
  매주 월 09:00   — Matrix 주간 리포트 생성 (스코어 변동 요약)
```

---

# 8. Projection 매핑

## 8.1 MATRIX.md Projection

Graph(org scope)에서 매트릭스 요약 Markdown을 생성하여 Agent bootstrap 시 주입한다.

```typescript
// app/lib/graph/projection.ts (확장)
class ProjectionBuilder {
  // ... 기존 메서드 ...

  private buildMatrixProjection(graph: JsonLdGraph, teamId: string): string {
    return `## 산업×기능 매트릭스 현황

### 상위 기회 (Composite Score 기준)
${formatTopCells(graph, 10)}

### Time Horizon 분포
- 단기(0~3개월): ${countByHorizon(graph, 'short')}건
- 중기(1~2년): ${countByHorizon(graph, 'mid')}건
- 장기(3년 이내): ${countByHorizon(graph, 'long')}건

### 파이프라인 분포
${formatPipelineDistribution(graph)}

### 최근 스코어 변동 (전주 대비)
${formatScoreChanges(graph)}
`;
  }
}
```

## 8.2 Agent SOUL 프롬프트 확장

Agent가 Matrix 맥락을 활용할 수 있도록 SOUL 템플릿에 섹션을 추가한다.

```markdown
<!-- schemas/templates/SOUL.md 확장 -->

## 매트릭스 맥락

당신은 KT DS AX BD팀의 신사업 기회 발굴을 돕는 에이전트입니다.
팀은 산업(X축) × 기능(Y축) 매트릭스를 통해 기회를 체계적으로 관리합니다.

### 활용 규칙
- 사용자가 특정 산업이나 기능을 언급하면, 해당 Matrix Cell의 현재 스코어와 연결된 시그널을 참조하세요.
- 새로운 시그널이 어느 Cell에 해당하는지 제안할 수 있습니다. (suggestCellForSignal)
- C-Level 관점과 실무자 관점의 균형을 유지하여 조언하세요.
- Time Horizon을 고려하여 단기 실행과 장기 전략을 구분하세요.

{MATRIX.md Projection 내용이 여기에 주입됨}
```

---

# 9. UI Layer 매핑

## 9.1 화면 목록 (확장)

| Phase | 화면 | 경로 | 핵심 기능 |
|-------|------|------|----------|
| P2 | Matrix Heatmap | `/matrix` | 산업×기능 히트맵, Time Horizon 필터, 드릴다운 |
| P2 | Cell 상세 | `/matrix/:cellId` | 스코어 상세, 연결 Topic/Signal, 파이프라인 상태 |
| P2 | Score 입력 | `/matrix/:cellId/score` | C-Level + Execution 스코어 입력 폼 |
| P3 | Executive Dashboard | `/dashboard/exec` | 상위 기회 랭킹, 파이프라인 분포, Time Horizon 요약 |
| P3 | Operational Dashboard | `/dashboard/ops` | 실행 현황, 리스크 매트릭스, 팀원별 담당 Cell |

## 9.2 화면별 상세

### Matrix Heatmap (`/matrix`)

```
┌─────────────────────────────────────────────────┐
│ [Time: 전체 ▼] [Status: active ▼] [기간: 2026Q1]│
├──────┬──────┬──────┬──────┬──────┬──────┬───────┤
│      │ 재무 │ SCM  │ HR   │ CRM  │ 운영 │ AI자동│
├──────┼──────┼──────┼──────┼──────┼──────┼───────┤
│ 금융 │ 4.2  │ 3.1  │  —   │ 4.5  │ 2.8  │ 3.9  │
│      │ 🟢   │ 🟡   │      │ 🟢   │ 🔴   │ 🟡   │
├──────┼──────┼──────┼──────┼──────┼──────┼───────┤
│ 공공 │ 3.5  │  —   │ 2.9  │ 3.2  │ 3.8  │ 4.1  │
│      │ 🟡   │      │ 🔴   │ 🟡   │ 🟡   │ 🟢   │
├──────┼──────┼──────┼──────┼──────┼──────┼───────┤
│ 통신 │  —   │ 3.7  │  —   │ 4.0  │ 3.5  │ 4.3  │
│      │      │ 🟡   │      │ 🟢   │ 🟡   │ 🟢   │
└──────┴──────┴──────┴──────┴──────┴──────┴───────┘

색상: 🟢 4.0+ (High)  🟡 2.5~3.9 (Medium)  🔴 <2.5 (Low)  — 미등록
클릭 → /matrix/:cellId 로 드릴다운
```

### Executive Dashboard (`/dashboard/exec`)

```
┌──────────────────────────────┬──────────────────┐
│  Top 10 기회 (Composite)     │  파이프라인 분포   │
│  1. 통신×AI자동화  4.3       │  S0: ████ 12     │
│  2. 금융×CRM      4.5       │  S1: ███  8      │
│  3. 공공×AI자동화  4.1       │  S2: ██   5      │
│  ...                         │  S3: █    2      │
│                              │  S4: █    1      │
├──────────────────────────────┼──────────────────┤
│  Time Horizon 분포           │  주간 스코어 변동  │
│  단기: 15건 (53%)            │  ↑ 통신×CRM +0.3 │
│  중기: 9건 (32%)             │  ↑ 금융×AI  +0.2 │
│  장기: 4건 (15%)             │  ↓ 공공×HR  -0.4 │
└──────────────────────────────┴──────────────────┘
```

---

# 10. Agent 활용 시나리오

## 10.1 대화 시나리오

### 시나리오 A: 매트릭스 기반 기회 탐색

```
사용자: "금융 산업에서 AI 자동화 관련 기회가 뭐가 있어?"

Agent 내부 흐름:
  1. MatrixContext에서 cell_id = 'finance_ai_automation' 조회
  2. 해당 Cell의 composite_score, 연결 시그널, 연결 토픽 로드
  3. Time Horizon별 분류

Agent: "금융×AI자동화 셀의 현재 종합 스코어는 3.9입니다.
        - 단기(3개월): 반복 업무 자동화 RPA 고도화 — 레퍼런스 3건 보유
        - 중기(1~2년): AI 기반 자산관리 어드바이저 — 시그널 4건 포착 중
        연결된 토픽 'AI 금융 혁신'에 최근 시그널 2건이 추가되었어요.
        자세히 볼까요?"
```

### 시나리오 B: 시그널 → Cell 자동 제안

```
[Radar Worker가 score ≥ 7 시그널 탐지]
  시그널: "삼성SDS, 제조업 AI 품질검사 플랫폼 출시"

Agent 내부 흐름:
  1. 시그널 키워드 분석: '제조업', 'AI', '품질검사'
  2. Matrix Cell 매칭: '제조×AI자동화', '제조×운영/생산'
  3. suggestCellForSignal() 호출

Agent (브리핑에서):
  "새로운 시그널이 탐지되었습니다: [삼성SDS 제조업 AI 품질검사 플랫폼]
   추천 매트릭스 위치: 제조×AI자동화 (현재 스코어 3.7)
   이 시그널을 해당 셀에 연결할까요?"
```

### 시나리오 C: 일간 브리핑

```
Agent (07:00 자동 브리핑):
  "오늘의 매트릭스 현황입니다.

   📊 스코어 변동
   - 통신×CRM: 4.0 → 4.3 (시그널 보정 반영)
   - 공공×HR: 3.3 → 2.9 (리스크 평가 하향)

   🚀 파이프라인 진행
   - 금융×AI자동화: S1(Signal) → S2(Scorecard) 진입

   📡 신규 시그널 2건
   - [제조×공급망] 관련 시그널 1건
   - [헬스케어×데이터분석] 관련 시그널 1건"
```

---

# 11. 디렉터리 구조 변경

PRD v3 기존 구조에 추가되는 파일:

```
app/lib/
├── services/
│   ├── matrix.service.ts          [NEW]
│   ├── scoring.service.ts         [NEW]
│   └── matrix-sync.service.ts     [NEW]
│
├── graph/
│   └── query.ts                   [EXTEND] — Matrix 전용 조회 메서드 추가
│
├── integration/
│   ├── pipeline-bridge.ts         [EXTEND] — Matrix 관련 인터페이스 추가
│   └── briefing-builder.ts        [EXTEND] — Matrix 섹션 추가
│
├── types/
│   ├── enums.ts                   [EXTEND] — STAGE_GATE_MAP 추가
│   └── matrix.types.ts            [NEW] — Matrix 전용 타입 정의
│
└── db/
    └── schema-v3.ts               [NEW] — Framework 테이블 스키마

app/routes/
├── matrix/
│   ├── index.tsx                  [NEW] — Heatmap 뷰
│   └── $cellId.tsx                [NEW] — Cell 상세
├── matrix.$cellId.score.tsx       [NEW] — Score 입력
└── dashboard/
    ├── exec.tsx                   [NEW] — Executive Dashboard
    └── ops.tsx                    [NEW] — Operational Dashboard

schemas/
├── validation/
│   ├── industry.schema.json       [NEW]
│   ├── function.schema.json       [NEW]
│   ├── matrix-cell.schema.json    [NEW]
│   └── matrix-score.schema.json   [NEW]
└── templates/
    └── SOUL.md                    [EXTEND] — 매트릭스 맥락 섹션 추가
```

---

# 12. PRD v3 Phase 로드맵 통합

Framework 포팅 작업을 PRD v3 Phase에 삽입한다.

## 통합 일정

| PRD v3 Phase | 기간 | Framework 포팅 작업 |
|-------------|------|-------------------|
| **P0** (1주) | Week 1 | ▸ `schema-v3.ts` (Framework 테이블 전체) D1 마이그레이션에 포함 |
| | | ▸ `enums.ts`에 STAGE_GATE_MAP, TimeHorizon, MatrixStatus 추가 |
| | | ▸ `matrix.types.ts` 타입 정의 |
| | | ▸ Industry/Function 초기 마스터 데이터 시딩 스크립트 |
| **P1** (2~3주) | Week 2~4 | ▸ Graph @context 확장 (discovery-x.jsonld) |
| | | ▸ GraphQueryEngine Matrix 전용 메서드 추가 |
| **P2** (2주) | Week 5~6 | ▸ `matrix.service.ts` + `scoring.service.ts` 구현 |
| | | ▸ ACL policies에 Matrix 권한 추가 |
| | | ▸ Heatmap UI (`/matrix`) + Cell 상세 (`/matrix/:cellId`) |
| | | ▸ Score 입력 UI (`/matrix/:cellId/score`) |
| | | ▸ `cell_topic_map` 연결 UI (Topic 상세에서) |
| | | ▸ MATRIX.md Projection 구현 |
| **P3** (2~3주) | Week 7~9 | ▸ 시그널 보정 로직 (ScoringService.calculateSignalAdjustment) |
| | | ▸ BriefingBuilder Matrix 섹션 추가 |
| | | ▸ Cron: 시그널 보정 재계산 (매일 06:30) |
| | | ▸ Executive Dashboard + Operational Dashboard |
| | | ▸ Agent SOUL 템플릿 매트릭스 맥락 추가 |
| **P4** (2주) | Week 10~11 | ▸ Vectorize 연동 시 Cell ↔ Signal 시맨틱 매칭 |
| | | ▸ 주간 Matrix 리포트 자동 생성 |
| | | ▸ E2E 테스트 (Matrix 플로우) |

**핵심:** Framework 포팅은 별도 Phase가 아니라 PRD v3 각 Phase에 자연스럽게 녹아든다.
P0에서 스키마를 함께 잡고, P2에서 핵심 기능을 구현하는 것이 가장 효율적이다.

---

# 13. 리스크 평가 (Framework 포팅 추가분)

| 리스크 | 확률 | 영향 | 완화 전략 |
|--------|------|------|----------|
| 산업×기능 조합 폭발 (8×9=72) | 중 | 낮 | 활성 Cell만 생성, 빈 셀은 Heatmap에 '—' 표시 |
| 스코어링 합의 어려움 | 높 | 중 | 초기 5점 척도 + 팀 내 캘리브레이션 세션 |
| 시그널 보정 노이즈 | 중 | 중 | 최소 시그널 수 threshold + 감쇠 계수 적용 |
| 2인 팀 일정 압박 | 높 | 중 | P2에 집중 배치, Dashboard는 P3로 분리 |
| Cell-Topic 매핑 방치 | 중 | 중 | 시그널 생성 시 Cell 자동 제안 + 주간 리뷰 |

---

# 부록: 전체 DB 스키마 요약 (통합)

| 테이블 | 용도 | Phase | 출처 |
|--------|------|-------|------|
| teams | 팀 | 기존 | PRD v3 |
| user_profiles | 사용자 | 기존 | PRD v3 |
| graphs | JSON-LD 정본 | P0 | PRD v3 |
| graph_events | 감사 로그 | P0 | PRD v3 |
| **industries** | **산업군 마스터** | **P0** | **Framework** |
| **functions** | **기능 마스터** | **P0** | **Framework** |
| **matrix_cells** | **산업×기능 교차점** | **P0** | **Framework** |
| **matrix_scores** | **이중 스코어링** | **P0** | **Framework** |
| **cell_topic_map** | **Cell ↔ Topic 매핑** | **P0** | **Framework** |
| **scoring_config** | **스코어링 설정** | **P0** | **Framework** |
| projections | Projection 캐시 | P1 | PRD v3 (수정) |
| agent_memory | 에이전트 메모리 | P1 | PRD v3 |
| agent_sessions | 세션 추적 | P1 | PRD v3 |
| topics | Topic | P2 | PRD v3 |
| topic_members | Topic 멤버/권한 | P2 | PRD v3 |
| shared_signals | 시그널 라우팅 | P3 | PRD v3 (수정: cell_id 추가) |
| token_usage | 토큰 비용 추적 | P3 | PRD v3 |
