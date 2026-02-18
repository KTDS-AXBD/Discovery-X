# Discovery-X Framework Porting — DB 스키마 구체화 문서

**PRD v3 Graph-First 아키텍처 위의 산업×기능 매트릭스 데이터 계층 설계**

| 항목 | 내용 |
|------|------|
| 작성일 | 2026-02-18 |
| 버전 | v1.0 |
| 선행 문서 | PRD v3 Final, 아키텍처 매핑 v1 |
| 대상 | AX BD팀 개발자 |

---

# 1. 문서 목적

본 문서는 아키텍처 매핑 문서에서 정의한 설계를
**D1(SQLite) 위에 구현 가능한 수준의 완전한 스키마**로 구체화한다.

테이블별로 DDL, 제약조건, 인덱스, 초기 시딩 데이터, 마이그레이션 전략,
그리고 서비스 레이어에서의 조회 패턴까지 포함한다.

### 설계 결정 요약 (매핑 문서에서 확정)

| 결정 사항 | 선택 |
|----------|------|
| Cell ↔ Topic 관계 | N:M (`cell_topic_map`) |
| Stage-Gate ↔ 파이프라인 | 동일 파이프라인의 다른 표현 (DB는 PRD v3 단계명 사용) |
| 스코어링 입력 | 혼합형 (수동 + 시그널 보정) |
| 마스터 데이터 범위 | 8×9 풀 스키마, 초기 시딩은 핵심만 |
| 스코어 주기 | 월별 (2026-01 형식) |
| 스코어 입력 방식 | 개별 입력 + 합의 확정 2계층 |
| Framework 데이터 Scope | org scope (팀 공통) |

---

# 2. 테이블 관계도 (ERD 개요)

```
teams (기존)
  │
  ├──→ industries         ← 산업군 마스터
  │       │
  ├──→ functions          ← 기능 마스터
  │       │
  │       ↓
  ├──→ matrix_cells ←──── industry_id + function_id (UNIQUE)
  │       │
  │       ├──→ individual_scores   ← 팀원 개별 스코어 (N건/cell/period)
  │       │       │
  │       │       ↓
  │       ├──→ consensus_scores    ← 합의 확정 스코어 (1건/cell/period)
  │       │
  │       ├──→ cell_topic_map ←──→ topics (기존)
  │       │
  │       └──→ shared_signals.cell_id (기존 테이블 확장)
  │
  └──→ scoring_config     ← 스코어링 가중치/설정
  
user_profiles (기존)
  │
  ├──→ individual_scores.scored_by
  ├──→ consensus_scores.confirmed_by
  ├──→ matrix_cells.created_by
  └──→ cell_topic_map.linked_by
```

---

# 3. 테이블 정의

## 3.1 industries — 산업군 마스터

```sql
-- ============================================================
-- industries: X축 산업군 마스터
-- Scope: org (team 단위)
-- 초기 8개 + 확장 가능
-- ============================================================
CREATE TABLE industries (
  id               TEXT PRIMARY KEY,
  team_id          TEXT NOT NULL,
  name             TEXT NOT NULL,
  name_en          TEXT,
  description      TEXT,
  display_order    INTEGER NOT NULL DEFAULT 0,
  strategic_weight REAL NOT NULL DEFAULT 1.0
                   CHECK (strategic_weight >= 0.0 AND strategic_weight <= 5.0),
  icon             TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1
                   CHECK (is_active IN (0, 1)),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(team_id, name),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE INDEX idx_industries_team ON industries(team_id, display_order);
CREATE INDEX idx_industries_active ON industries(team_id, is_active);
```

### ID 규칙

`{team_id}_ind_{slug}` 형식.
예: `axbd_ind_finance`, `axbd_ind_manufacturing`

### 컬럼 상세

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | TEXT PK | ✅ | `{team_id}_ind_{slug}` |
| team_id | TEXT FK | ✅ | teams.id 참조 |
| name | TEXT | ✅ | 한글 표시명 (예: '금융') |
| name_en | TEXT | | 영문명 (예: 'Finance') — Agent/API용 |
| description | TEXT | | 산업 설명, Heatmap 툴팁에 표시 |
| display_order | INTEGER | ✅ | Heatmap Y축 정렬 순서 |
| strategic_weight | REAL | ✅ | KT DS 강점 산업 가중치 (0.0~5.0), composite 계산에 반영 |
| icon | TEXT | | UI 아이콘 식별자 |
| is_active | INTEGER | ✅ | 0=비활성(Heatmap에서 숨김), 1=활성 |

---

## 3.2 functions — 기능 마스터

```sql
-- ============================================================
-- functions: Y축 기능 마스터
-- Scope: org (team 단위)
-- category로 SAP 기반 / AI 서비스 구분
-- ============================================================
CREATE TABLE functions (
  id               TEXT PRIMARY KEY,
  team_id          TEXT NOT NULL,
  name             TEXT NOT NULL,
  name_en          TEXT,
  description      TEXT,
  category         TEXT NOT NULL
                   CHECK (category IN ('sap_based', 'ai_service', 'hybrid')),
  display_order    INTEGER NOT NULL DEFAULT 0,
  is_active        INTEGER NOT NULL DEFAULT 1
                   CHECK (is_active IN (0, 1)),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(team_id, name),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE
);

CREATE INDEX idx_functions_team ON functions(team_id, display_order);
CREATE INDEX idx_functions_category ON functions(team_id, category);
CREATE INDEX idx_functions_active ON functions(team_id, is_active);
```

### ID 규칙

`{team_id}_fn_{slug}` 형식.
예: `axbd_fn_finance_accounting`, `axbd_fn_ai_automation`

### category 구분

| category | 설명 | 해당 기능 |
|----------|------|----------|
| sap_based | SAP 기능 기반 | 재무/회계, 공급망/물류, HR, CRM/고객경험, 운영/생산 |
| ai_service | AI 서비스 중심 | AI 자동화, AI 프로세스 혁신, AI 서비스 플랫폼 |
| hybrid | 혼합 | 데이터/분석 (SAP 데이터 + AI 분석) |

---

## 3.3 matrix_cells — 산업×기능 교차점

```sql
-- ============================================================
-- matrix_cells: 산업×기능 매트릭스의 개별 셀
-- 활성 셀만 생성 (72개 전체가 아닌 필요한 것만)
-- time_horizon + pipeline_stage로 전략/실행 상태 추적
-- ============================================================
CREATE TABLE matrix_cells (
  id                TEXT PRIMARY KEY,
  team_id           TEXT NOT NULL,
  industry_id       TEXT NOT NULL,
  function_id       TEXT NOT NULL,
  time_horizon      TEXT NOT NULL DEFAULT 'short'
                    CHECK (time_horizon IN ('short', 'mid', 'long')),
  pipeline_stage    TEXT NOT NULL DEFAULT 'activity'
                    CHECK (pipeline_stage IN (
                      'activity', 'signal', 'scorecard',
                      'brief', 'validation', 'pilot_ready'
                    )),
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'watching', 'paused', 'archived')),
  description       TEXT,
  revenue_potential REAL,
  revenue_unit      TEXT DEFAULT 'krw_100m'
                    CHECK (revenue_unit IN ('krw_100m', 'usd_1k', 'custom')),
  owner_id          TEXT,
  priority          INTEGER DEFAULT 0
                    CHECK (priority >= 0 AND priority <= 5),
  tags              TEXT,
  created_by        TEXT NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(team_id, industry_id, function_id),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE RESTRICT,
  FOREIGN KEY (function_id) REFERENCES functions(id) ON DELETE RESTRICT,
  FOREIGN KEY (owner_id) REFERENCES user_profiles(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES user_profiles(id)
);

CREATE INDEX idx_cells_team ON matrix_cells(team_id, status);
CREATE INDEX idx_cells_industry ON matrix_cells(industry_id);
CREATE INDEX idx_cells_function ON matrix_cells(function_id);
CREATE INDEX idx_cells_horizon ON matrix_cells(team_id, time_horizon);
CREATE INDEX idx_cells_stage ON matrix_cells(team_id, pipeline_stage);
CREATE INDEX idx_cells_owner ON matrix_cells(owner_id) WHERE owner_id IS NOT NULL;
CREATE INDEX idx_cells_priority ON matrix_cells(team_id, priority DESC);
```

### ID 규칙

`{industry_slug}_{function_slug}` 형식.
예: `finance_crm`, `manufacturing_ai_automation`

### 컬럼 상세

| 컬럼 | 타입 | 필수 | 설명 |
|------|------|------|------|
| time_horizon | TEXT | ✅ | `short`(0~3개월), `mid`(1~2년), `long`(3년 이내) |
| pipeline_stage | TEXT | ✅ | PRD v3 파이프라인 단계 (UI에서 S0~S4 병기) |
| status | TEXT | ✅ | `active`(진행), `watching`(관찰), `paused`(보류), `archived`(종료) |
| revenue_potential | REAL | | 예상 매출 (revenue_unit에 따라 해석) |
| revenue_unit | TEXT | | `krw_100m`(억원), `usd_1k`(천달러), `custom` |
| owner_id | TEXT FK | | 담당자 — 해당 Cell의 주 책임자 |
| priority | INTEGER | | 0(미지정)~5(최고) 수동 우선순위 |
| tags | TEXT | | JSON 배열 문자열, 자유 태깅 (예: `'["긴급","파일럿중"]'`) |

### pipeline_stage ↔ Stage-Gate 매핑 (참조)

| pipeline_stage | Stage-Gate | 의미 |
|---------------|------------|------|
| activity | S0 | 초기 활동/아이디어 |
| signal | S1 | 시그널 탐지 |
| scorecard | S2 (진입) | 평가표 작성 중 |
| brief | S2 (완료) | 브리프 문서화 완료 |
| validation | S3 | 검증/파일럿 준비 |
| pilot_ready | S4 | 실행 확정 |

---

## 3.4 individual_scores — 팀원 개별 스코어

```sql
-- ============================================================
-- individual_scores: 팀원 각자의 평가 입력
-- 하나의 Cell × Period에 팀원마다 1건씩 입력 가능
-- 합의 전 개별 시각을 수집하는 1차 계층
-- ============================================================
CREATE TABLE individual_scores (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id             TEXT NOT NULL,
  scored_by           TEXT NOT NULL,
  score_period        TEXT NOT NULL,

  -- === C-Level 관점 (1.0 ~ 5.0) ===
  strategic_fit       REAL NOT NULL DEFAULT 3.0
                      CHECK (strategic_fit >= 1.0 AND strategic_fit <= 5.0),
  profitability       REAL NOT NULL DEFAULT 3.0
                      CHECK (profitability >= 1.0 AND profitability <= 5.0),
  market_scalability  REAL NOT NULL DEFAULT 3.0
                      CHECK (market_scalability >= 1.0 AND market_scalability <= 5.0),
  brand_impact        REAL NOT NULL DEFAULT 3.0
                      CHECK (brand_impact >= 1.0 AND brand_impact <= 5.0),
  roi_expectation     REAL NOT NULL DEFAULT 3.0
                      CHECK (roi_expectation >= 1.0 AND roi_expectation <= 5.0),

  -- === 실무자 관점 (1.0 ~ 5.0) ===
  feasibility         REAL NOT NULL DEFAULT 3.0
                      CHECK (feasibility >= 1.0 AND feasibility <= 5.0),
  tech_difficulty     REAL NOT NULL DEFAULT 3.0
                      CHECK (tech_difficulty >= 1.0 AND tech_difficulty <= 5.0),
  reference_exists    REAL NOT NULL DEFAULT 3.0
                      CHECK (reference_exists >= 1.0 AND reference_exists <= 5.0),
  resource_available  REAL NOT NULL DEFAULT 3.0
                      CHECK (resource_available >= 1.0 AND resource_available <= 5.0),
  risk_level          REAL NOT NULL DEFAULT 3.0
                      CHECK (risk_level >= 1.0 AND risk_level <= 5.0),

  -- === 산출 (서비스 레이어에서 계산 후 저장) ===
  clevel_avg          REAL,
  execution_avg       REAL,

  -- === 메타 ===
  comment             TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(cell_id, scored_by, score_period),
  FOREIGN KEY (cell_id) REFERENCES matrix_cells(id) ON DELETE CASCADE,
  FOREIGN KEY (scored_by) REFERENCES user_profiles(id)
);

CREATE INDEX idx_indiv_scores_cell ON individual_scores(cell_id, score_period);
CREATE INDEX idx_indiv_scores_user ON individual_scores(scored_by, score_period);
CREATE INDEX idx_indiv_scores_period ON individual_scores(score_period);
```

### score_period 형식

`YYYY-MM` (월별). 예: `2026-01`, `2026-02`

정렬 및 범위 조회가 TEXT 기반 사전순으로 자연스럽게 동작한다.

```sql
-- 특정 월 스코어 조회
SELECT * FROM individual_scores
WHERE cell_id = ? AND score_period = '2026-02';

-- 최근 3개월 추이
SELECT * FROM individual_scores
WHERE cell_id = ? AND score_period >= '2025-12' AND score_period <= '2026-02'
ORDER BY score_period;
```

### clevel_avg / execution_avg 계산 규칙

서비스 레이어에서 INSERT/UPDATE 시 자동 계산하여 저장한다.

```
clevel_avg = AVG(strategic_fit, profitability, market_scalability, 
                 brand_impact, roi_expectation)

execution_avg = AVG(feasibility, INVERT(tech_difficulty), reference_exists, 
                    resource_available, INVERT(risk_level))

INVERT(x) = 6.0 - x   (5점 척도 역전: 5→1, 4→2, 3→3, 2→4, 1→5)
```

역수 처리 이유: `tech_difficulty`와 `risk_level`은 **높을수록 부정적**이므로
execution_avg에서는 역전하여 "높을수록 좋음" 방향으로 통일한다.

---

## 3.5 consensus_scores — 합의 확정 스코어

```sql
-- ============================================================
-- consensus_scores: 팀 합의를 거쳐 확정된 공식 스코어
-- Cell × Period당 최대 1건
-- individual_scores를 기반으로 논의 후 확정
-- Heatmap, Dashboard, Agent 브리핑은 이 테이블을 참조
-- ============================================================
CREATE TABLE consensus_scores (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  cell_id             TEXT NOT NULL,
  score_period        TEXT NOT NULL,

  -- === 확정 스코어 (1.0 ~ 5.0) ===
  clevel_score        REAL NOT NULL
                      CHECK (clevel_score >= 1.0 AND clevel_score <= 5.0),
  execution_score     REAL NOT NULL
                      CHECK (execution_score >= 1.0 AND execution_score <= 5.0),

  -- === 시그널 보정 ===
  signal_adjustment   REAL NOT NULL DEFAULT 0.0
                      CHECK (signal_adjustment >= -2.0 AND signal_adjustment <= 2.0),
  signal_count        INTEGER NOT NULL DEFAULT 0,

  -- === 최종 종합 스코어 ===
  composite_score     REAL NOT NULL
                      CHECK (composite_score >= 0.0 AND composite_score <= 5.0),

  -- === 합의 프로세스 추적 ===
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft', 'confirmed', 'revised')),
  confirmed_by        TEXT,
  confirmed_at        TEXT,
  participant_count   INTEGER NOT NULL DEFAULT 0,
  deviation           REAL,
  rationale           TEXT,
  prev_composite      REAL,

  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(cell_id, score_period),
  FOREIGN KEY (cell_id) REFERENCES matrix_cells(id) ON DELETE CASCADE,
  FOREIGN KEY (confirmed_by) REFERENCES user_profiles(id)
);

CREATE INDEX idx_consensus_cell ON consensus_scores(cell_id, score_period);
CREATE INDEX idx_consensus_period ON consensus_scores(score_period);
CREATE INDEX idx_consensus_composite ON consensus_scores(composite_score DESC);
CREATE INDEX idx_consensus_status ON consensus_scores(status);
```

### 컬럼 상세

| 컬럼 | 타입 | 설명 |
|------|------|------|
| clevel_score | REAL | 확정된 C-Level 종합 스코어 (개별 평균 기반 or 직접 입력) |
| execution_score | REAL | 확정된 Execution 종합 스코어 |
| signal_adjustment | REAL | 시그널 보정값 (-2.0 ~ +2.0) |
| signal_count | INTEGER | 보정 계산에 사용된 시그널 수 |
| composite_score | REAL | 최종 = clevel × w_c + execution × w_e + signal_adj × w_s |
| status | TEXT | `draft`(초안/자동생성), `confirmed`(합의 확정), `revised`(수정) |
| confirmed_by | TEXT FK | 확정한 사람 (owner 또는 대표자) |
| participant_count | INTEGER | 개별 스코어 제출 인원 수 |
| deviation | REAL | 개별 스코어 간 표준편차 — 의견 분산도 표시용 |
| rationale | TEXT | 합의 근거 메모 (선택) |
| prev_composite | REAL | 직전 기간 composite — 변동 추적용 |

### 2계층 스코어링 플로우

```
Phase 1: 개별 입력
  팀원 A → individual_scores (cell_X, 2026-02, A의 평가)
  팀원 B → individual_scores (cell_X, 2026-02, B의 평가)
  팀원 C → individual_scores (cell_X, 2026-02, C의 평가)
        ↓
Phase 2: 자동 초안 생성
  ScoringService.generateDraft(cell_X, '2026-02')
    → 개별 스코어 평균 계산
    → 시그널 보정 적용
    → consensus_scores INSERT (status = 'draft')
        ↓
Phase 3: 팀 리뷰 & 확정
  UI에서 draft 확인 → 논의 → 조정(선택) → 확정
    → consensus_scores UPDATE (status = 'confirmed', confirmed_by, rationale)
        ↓
Heatmap / Dashboard / Agent는 consensus_scores(status = 'confirmed')만 참조
draft 상태일 때는 '(미확정)' 라벨과 함께 표시
```

---

## 3.6 cell_topic_map — Cell ↔ Topic N:M 매핑

```sql
-- ============================================================
-- cell_topic_map: Matrix Cell과 Topic의 다대다 관계
-- 하나의 Topic이 여러 Cell에, 하나의 Cell이 여러 Topic에 걸침
-- ============================================================
CREATE TABLE cell_topic_map (
  cell_id     TEXT NOT NULL,
  topic_id    TEXT NOT NULL,
  relevance   REAL NOT NULL DEFAULT 1.0
              CHECK (relevance >= 0.0 AND relevance <= 1.0),
  linked_by   TEXT NOT NULL,
  note        TEXT,
  linked_at   TEXT NOT NULL DEFAULT (datetime('now')),

  PRIMARY KEY (cell_id, topic_id),
  FOREIGN KEY (cell_id) REFERENCES matrix_cells(id) ON DELETE CASCADE,
  FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
  FOREIGN KEY (linked_by) REFERENCES user_profiles(id)
);

CREATE INDEX idx_ctm_cell ON cell_topic_map(cell_id);
CREATE INDEX idx_ctm_topic ON cell_topic_map(topic_id);
```

---

## 3.7 scoring_config — 스코어링 설정

```sql
-- ============================================================
-- scoring_config: 팀별 스코어링 가중치 및 보정 파라미터
-- composite_score 계산의 모든 변수를 런타임에 조정 가능
-- ============================================================
CREATE TABLE scoring_config (
  id            TEXT PRIMARY KEY,
  team_id       TEXT NOT NULL,
  config_key    TEXT NOT NULL,
  config_value  REAL NOT NULL,
  value_type    TEXT NOT NULL DEFAULT 'float'
                CHECK (value_type IN ('float', 'integer', 'percentage')),
  description   TEXT,
  min_value     REAL,
  max_value     REAL,
  updated_by    TEXT,
  updated_at    TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE(team_id, config_key),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by) REFERENCES user_profiles(id)
);
```

### 초기 설정 데이터

```sql
INSERT INTO scoring_config
  (id, team_id, config_key, config_value, value_type, description, min_value, max_value)
VALUES
  -- === Composite 가중치 (합계 = 1.0) ===
  ('cfg_w_clevel',    '{team_id}', 'weight_clevel',          0.4,  'percentage',
   'C-Level 스코어 가중치',                    0.0, 1.0),
  ('cfg_w_exec',      '{team_id}', 'weight_execution',       0.4,  'percentage',
   'Execution 스코어 가중치',                  0.0, 1.0),
  ('cfg_w_signal',    '{team_id}', 'weight_signal',          0.2,  'percentage',
   '시그널 보정 가중치',                        0.0, 1.0),

  -- === 시그널 보정 파라미터 ===
  ('cfg_s_decay',     '{team_id}', 'signal_decay_days',      90,   'integer',
   '시그널 보정 감쇠 기준일 (이 기간 이내 시그널만 반영)', 30, 365),
  ('cfg_s_min',       '{team_id}', 'min_signals_for_adjust', 3,    'integer',
   '보정 적용 최소 시그널 수',                  1,   20),
  ('cfg_s_max_adj',   '{team_id}', 'max_signal_adjustment',  2.0,  'float',
   '시그널 보정 최대 절대값',                   0.5, 3.0),

  -- === 산업 가중치 적용 여부 ===
  ('cfg_ind_weight',  '{team_id}', 'apply_industry_weight',  1,    'integer',
   'composite 계산 시 산업 strategic_weight 반영 여부 (0/1)', 0, 1),

  -- === 합의 프로세스 ===
  ('cfg_min_voters',  '{team_id}', 'min_voters_for_confirm', 2,    'integer',
   '합의 확정 최소 개별 스코어 제출 인원',      1,   10),
  ('cfg_dev_alert',   '{team_id}', 'deviation_alert_threshold', 1.5, 'float',
   '개별 스코어 표준편차 경고 임계값',          0.5, 3.0);
```

---

# 4. 기존 테이블 변경

## 4.1 shared_signals — cell_id 컬럼 추가

```sql
-- 기존 shared_signals 테이블에 cell_id 추가
-- nullable: 기존 시그널은 cell_id 없이 유지
ALTER TABLE shared_signals ADD COLUMN cell_id TEXT
  REFERENCES matrix_cells(id) ON DELETE SET NULL;

CREATE INDEX idx_signals_cell ON shared_signals(cell_id)
  WHERE cell_id IS NOT NULL;
```

기존 데이터 영향: 없음 (nullable 컬럼 추가).
새 시그널부터 cell_id 매핑을 지원하며, 기존 시그널은 점진적으로 매핑.

## 4.2 projections — proj_type 확장

D1(SQLite)에서는 CHECK 제약을 ALTER로 변경할 수 없으므로,
마이그레이션에서 테이블 재생성이 필요하다.

```sql
-- 기존 projections 테이블 백업 → 재생성
CREATE TABLE projections_new (
  id            TEXT PRIMARY KEY,
  scope_type    TEXT NOT NULL CHECK (scope_type IN ('user', 'topic', 'org')),
  scope_id      TEXT NOT NULL,
  proj_type     TEXT NOT NULL
                CHECK (proj_type IN (
                  'USER.md', 'TOPIC.md', 'BRIEFING.md', 'SOUL.md',
                  'MATRIX.md'   -- [NEW]
                )),
  content       TEXT NOT NULL,
  source_hash   TEXT NOT NULL,
  graph_version INTEGER NOT NULL,
  generated_at  TEXT DEFAULT (datetime('now')),

  UNIQUE(scope_type, scope_id, proj_type)
);

INSERT INTO projections_new SELECT * FROM projections;
DROP TABLE projections;
ALTER TABLE projections_new RENAME TO projections;
```

---

# 5. 초기 시딩 데이터

스키마는 8×9 풀 구조이되, 초기 시딩은 핵심 산업/기능만 포함한다.
나머지는 팀이 운영하면서 UI를 통해 추가.

## 5.1 Industries (8개 전체 정의, 핵심 5개 활성화)

```sql
INSERT INTO industries (id, team_id, name, name_en, display_order, strategic_weight, is_active)
VALUES
  -- 핵심 (is_active = 1)
  ('axbd_ind_finance',       '{team_id}', '금융',         'Finance',        1, 1.5, 1),
  ('axbd_ind_public',        '{team_id}', '공공',         'Public',         2, 1.3, 1),
  ('axbd_ind_telecom',       '{team_id}', '통신',         'Telecom',        3, 1.5, 1),
  ('axbd_ind_manufacturing', '{team_id}', '제조',         'Manufacturing',  4, 1.2, 1),
  ('axbd_ind_retail',        '{team_id}', '유통/커머스',   'Retail',         5, 1.0, 1),

  -- 확장 대기 (is_active = 0)
  ('axbd_ind_healthcare',    '{team_id}', '헬스케어',      'Healthcare',     6, 1.0, 0),
  ('axbd_ind_energy',        '{team_id}', '에너지',        'Energy',         7, 0.8, 0),
  ('axbd_ind_emerging',      '{team_id}', '전략 신산업',   'Emerging',       8, 1.0, 0);
```

## 5.2 Functions (9개 전체 정의, 핵심 6개 활성화)

```sql
INSERT INTO functions (id, team_id, name, name_en, category, display_order, is_active)
VALUES
  -- 핵심 (is_active = 1)
  ('axbd_fn_finance_acct',    '{team_id}', '재무/회계',            'Finance/Accounting',   'sap_based',  1, 1),
  ('axbd_fn_scm',             '{team_id}', '공급망/물류',          'SCM/Logistics',        'sap_based',  2, 1),
  ('axbd_fn_crm',             '{team_id}', 'CRM/고객경험',         'CRM/CX',              'sap_based',  3, 1),
  ('axbd_fn_data_analytics',  '{team_id}', '데이터/분석',          'Data/Analytics',       'hybrid',     4, 1),
  ('axbd_fn_ai_automation',   '{team_id}', 'AI 자동화',            'AI Automation',        'ai_service', 5, 1),
  ('axbd_fn_ai_process',      '{team_id}', 'AI 프로세스 혁신',     'AI Process Innovation','ai_service', 6, 1),

  -- 확장 대기 (is_active = 0)
  ('axbd_fn_hr',              '{team_id}', 'HR',                   'HR',                   'sap_based',  7, 0),
  ('axbd_fn_operations',      '{team_id}', '운영/생산',            'Operations',           'sap_based',  8, 0),
  ('axbd_fn_ai_platform',     '{team_id}', 'AI 서비스 플랫폼',     'AI Service Platform',  'ai_service', 9, 0);
```

## 5.3 초기 Matrix Cell (예시 5개)

```sql
INSERT INTO matrix_cells
  (id, team_id, industry_id, function_id, time_horizon, pipeline_stage, status, created_by)
VALUES
  ('finance_crm',
   '{team_id}', 'axbd_ind_finance', 'axbd_fn_crm',
   'short', 'signal', 'active', '{user_id}'),

  ('finance_ai_automation',
   '{team_id}', 'axbd_ind_finance', 'axbd_fn_ai_automation',
   'mid', 'activity', 'active', '{user_id}'),

  ('telecom_crm',
   '{team_id}', 'axbd_ind_telecom', 'axbd_fn_crm',
   'short', 'scorecard', 'active', '{user_id}'),

  ('manufacturing_ai_automation',
   '{team_id}', 'axbd_ind_manufacturing', 'axbd_fn_ai_automation',
   'mid', 'signal', 'watching', '{user_id}'),

  ('public_data_analytics',
   '{team_id}', 'axbd_ind_public', 'axbd_fn_data_analytics',
   'short', 'brief', 'active', '{user_id}');
```

---

# 6. 주요 조회 패턴

서비스 레이어에서 사용할 핵심 쿼리들을 사전 정의한다.
D1(SQLite)의 특성을 고려하여 작성.

## 6.1 Heatmap 데이터 조회

전체 매트릭스를 한 번에 로드하여 Heatmap을 렌더링한다.

```sql
-- 활성 산업×기능의 최신 확정 스코어 조회
SELECT
  mc.id           AS cell_id,
  i.name          AS industry_name,
  i.display_order AS industry_order,
  f.name          AS function_name,
  f.display_order AS function_order,
  mc.time_horizon,
  mc.pipeline_stage,
  mc.status,
  cs.composite_score,
  cs.clevel_score,
  cs.execution_score,
  cs.signal_adjustment,
  cs.status       AS score_status,
  cs.prev_composite,
  (cs.composite_score - COALESCE(cs.prev_composite, cs.composite_score)) AS score_delta
FROM industries i
CROSS JOIN functions f
LEFT JOIN matrix_cells mc
  ON mc.industry_id = i.id
  AND mc.function_id = f.id
  AND mc.status != 'archived'
LEFT JOIN consensus_scores cs
  ON cs.cell_id = mc.id
  AND cs.score_period = ?   -- 조회 대상 월 (예: '2026-02')
WHERE i.team_id = ?
  AND i.is_active = 1
  AND f.team_id = ?
  AND f.is_active = 1
ORDER BY i.display_order, f.display_order;
```

**설계 포인트:** CROSS JOIN으로 빈 셀도 포함하여 Heatmap 그리드 전체를 반환.
`mc.id IS NULL`이면 해당 위치에 Cell이 아직 생성되지 않은 것.

## 6.2 Cell 상세 조회 (드릴다운)

```sql
-- Cell 기본 정보 + 최근 3개월 스코어 추이
SELECT
  mc.*,
  i.name AS industry_name,
  f.name AS function_name,
  f.category AS function_category,
  u.display_name AS owner_name
FROM matrix_cells mc
JOIN industries i ON mc.industry_id = i.id
JOIN functions f ON mc.function_id = f.id
LEFT JOIN user_profiles u ON mc.owner_id = u.id
WHERE mc.id = ?;

-- 최근 3개월 확정 스코어 추이
SELECT score_period, composite_score, clevel_score, execution_score,
       signal_adjustment, status
FROM consensus_scores
WHERE cell_id = ?
ORDER BY score_period DESC
LIMIT 3;

-- 개별 스코어 (현재 월)
SELECT
  isc.*,
  u.display_name AS scorer_name
FROM individual_scores isc
JOIN user_profiles u ON isc.scored_by = u.id
WHERE isc.cell_id = ?
  AND isc.score_period = ?
ORDER BY isc.created_at;
```

## 6.3 연결 Topic/Signal 조회

```sql
-- Cell에 연결된 Topic
SELECT t.*, ctm.relevance, ctm.note
FROM cell_topic_map ctm
JOIN topics t ON ctm.topic_id = t.id
WHERE ctm.cell_id = ?
ORDER BY ctm.relevance DESC;

-- Cell에 연결된 시그널
SELECT ss.*
FROM shared_signals ss
WHERE ss.cell_id = ?
  AND ss.status != 'dismissed'
ORDER BY ss.score DESC, ss.created_at DESC
LIMIT 20;
```

## 6.4 Executive Dashboard 집계

```sql
-- 파이프라인 단계별 Cell 수
SELECT pipeline_stage, COUNT(*) AS cell_count
FROM matrix_cells
WHERE team_id = ? AND status = 'active'
GROUP BY pipeline_stage;

-- Time Horizon별 분포
SELECT time_horizon, COUNT(*) AS cell_count
FROM matrix_cells
WHERE team_id = ? AND status IN ('active', 'watching')
GROUP BY time_horizon;

-- 상위 N개 기회 (확정 스코어 기준)
SELECT
  mc.id, i.name AS industry, f.name AS function,
  mc.time_horizon, mc.pipeline_stage,
  cs.composite_score, cs.score_period
FROM matrix_cells mc
JOIN industries i ON mc.industry_id = i.id
JOIN functions f ON mc.function_id = f.id
JOIN consensus_scores cs ON cs.cell_id = mc.id
WHERE mc.team_id = ?
  AND mc.status = 'active'
  AND cs.status = 'confirmed'
  AND cs.score_period = ?
ORDER BY cs.composite_score DESC
LIMIT ?;
```

## 6.5 시그널 보정 계산용 조회

```sql
-- 특정 Cell에 연결된 최근 시그널의 평균 score
SELECT
  COUNT(*)      AS signal_count,
  AVG(ss.score) AS avg_signal_score
FROM shared_signals ss
WHERE ss.cell_id = ?
  AND ss.status IN ('reviewed', 'actioned')
  AND ss.created_at >= datetime('now', '-' || ? || ' days')  -- signal_decay_days
;
```

---

# 7. Composite Score 계산 상세

## 7.1 전체 산출 흐름

```
┌─────────────────────────────────────────────────────┐
│  ScoringService.calculateComposite(cellId, period)  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Step 1: 개별 스코어 집계                            │
│    SELECT * FROM individual_scores                  │
│    WHERE cell_id = ? AND score_period = ?            │
│                                                     │
│    clevel_avg  = AVG(각 팀원의 clevel_avg)           │
│    exec_avg    = AVG(각 팀원의 execution_avg)        │
│    deviation   = STDDEV(각 팀원의 composite 추정치)   │
│    participant_count = COUNT(*)                      │
│                                                     │
│  Step 2: 시그널 보정                                 │
│    signals = 최근 {decay_days}일 이내,               │
│              cell_id 연결 시그널                      │
│    IF signal_count >= {min_signals}:                 │
│      raw_adj = (avg_signal_score / 10.0) × 5.0      │
│               - 2.5                                  │
│      signal_adj = CLAMP(raw_adj, -{max_adj}, +{max_adj}) │
│    ELSE:                                             │
│      signal_adj = 0.0                               │
│                                                     │
│  Step 3: 산업 가중치 (선택)                           │
│    IF {apply_industry_weight} = 1:                   │
│      ind_weight = industries.strategic_weight        │
│    ELSE:                                             │
│      ind_weight = 1.0                               │
│                                                     │
│  Step 4: Composite 산출                              │
│    raw_composite =                                   │
│      clevel_avg × {weight_clevel}                    │
│      + exec_avg × {weight_execution}                 │
│      + signal_adj × {weight_signal}                  │
│                                                     │
│    composite = CLAMP(raw_composite × ind_weight,     │
│                      1.0, 5.0)                       │
│                                                     │
│  Step 5: consensus_scores UPSERT (status = 'draft') │
│    prev_composite = 직전 period의 composite_score    │
│                                                     │
└─────────────────────────────────────────────────────┘
```

## 7.2 시그널 보정 상세

시그널 score는 0~10 범위(PRD v3 shared_signals.score 기준).
이를 composite에 반영할 수 있는 -2.0 ~ +2.0 보정값으로 변환한다.

```
raw_adj = (avg_signal_score / 10.0) × 5.0 - 2.5

예시:
  avg_signal_score = 8.0 → raw_adj = +1.5  (긍정 보정)
  avg_signal_score = 5.0 → raw_adj = 0.0   (중립)
  avg_signal_score = 2.0 → raw_adj = -1.5  (부정 보정)

CLAMP으로 max_signal_adjustment 이내로 제한
```

## 7.3 TypeScript 구현 시그니처

```typescript
// app/lib/services/scoring.service.ts

interface CompositeResult {
  clevel_score: number;
  execution_score: number;
  signal_adjustment: number;
  signal_count: number;
  composite_score: number;
  participant_count: number;
  deviation: number;
  prev_composite: number | null;
}

class ScoringService {
  /**
   * 개별 스코어 제출
   * clevel_avg, execution_avg 자동 계산 후 저장
   */
  async submitIndividualScore(
    cellId: string,
    userId: string,
    period: string,
    input: IndividualScoreInput
  ): Promise<IndividualScore>

  /**
   * 합의 초안 자동 생성
   * individual_scores 집계 → 시그널 보정 → consensus_scores(draft) UPSERT
   */
  async generateDraft(
    cellId: string,
    period: string
  ): Promise<CompositeResult>

  /**
   * 합의 확정
   * draft → confirmed, confirmed_by/at 기록
   * 선택적으로 clevel_score, execution_score 직접 오버라이드 가능
   */
  async confirmConsensus(
    cellId: string,
    period: string,
    userId: string,
    override?: { clevel_score?: number; execution_score?: number; rationale?: string }
  ): Promise<ConsensusScore>

  /**
   * 시그널 보정 일괄 재계산 (Cron: 매일 06:30)
   * 모든 활성 Cell의 최신 기간 consensus_scores.signal_adjustment 갱신
   */
  async recalculateSignalAdjustments(teamId: string): Promise<RecalcResult>

  /**
   * 특정 Cell의 스코어 추이 (최근 N개월)
   */
  async getScoreTrend(
    cellId: string,
    months: number
  ): Promise<ScoreTrendEntry[]>
}
```

---

# 8. 마이그레이션 전략

## 8.1 마이그레이션 순서

PRD v3 Phase 0에서 전체 DB 마이그레이션을 일괄 실행한다.
Framework 테이블을 포함하여 한 번에 적용.

```
drizzle/migrations/
├── 0001_initial_schema.sql          ← PRD v3 기존 테이블
├── 0002_framework_tables.sql        ← Framework 신규 테이블 (아래)
└── 0003_framework_seed.sql          ← 초기 시딩 데이터
```

### 0002_framework_tables.sql

```sql
-- === 실행 순서: FK 의존성 순 ===

-- 1. 마스터 테이블 (의존성 없음)
CREATE TABLE industries ( ... );
CREATE TABLE functions ( ... );
CREATE TABLE scoring_config ( ... );

-- 2. 교차점 (industries, functions 의존)
CREATE TABLE matrix_cells ( ... );

-- 3. 스코어 (matrix_cells 의존)
CREATE TABLE individual_scores ( ... );
CREATE TABLE consensus_scores ( ... );

-- 4. 매핑 (matrix_cells, topics 의존)
CREATE TABLE cell_topic_map ( ... );

-- 5. 기존 테이블 확장
ALTER TABLE shared_signals ADD COLUMN cell_id TEXT
  REFERENCES matrix_cells(id) ON DELETE SET NULL;
CREATE INDEX idx_signals_cell ON shared_signals(cell_id)
  WHERE cell_id IS NOT NULL;

-- 6. projections 재생성 (CHECK 확장)
-- (Section 4.2의 재생성 SQL)

-- 7. 인덱스 (테이블 생성 시 포함되지 않은 추가 인덱스)
-- (각 테이블 정의에 이미 포함)
```

## 8.2 롤백 전략

```sql
-- 0002_framework_tables_rollback.sql
DROP TABLE IF EXISTS cell_topic_map;
DROP TABLE IF EXISTS consensus_scores;
DROP TABLE IF EXISTS individual_scores;
DROP TABLE IF EXISTS matrix_cells;
DROP TABLE IF EXISTS scoring_config;
DROP TABLE IF EXISTS functions;
DROP TABLE IF EXISTS industries;

-- shared_signals.cell_id 제거는 ALTER DROP COLUMN 미지원으로
-- 테이블 재생성 필요 (데이터 백업 후)
```

## 8.3 스키마 버전 관리

```typescript
// app/lib/db/schema-v3.ts

export const FRAMEWORK_SCHEMA_VERSION = '0002';

export const FRAMEWORK_TABLES = [
  'industries',
  'functions',
  'matrix_cells',
  'individual_scores',
  'consensus_scores',
  'cell_topic_map',
  'scoring_config',
] as const;
```

---

# 9. Graph 동기화 규칙

## 9.1 DB → Graph 동기화

D1 테이블이 정본이고, org scope Graph는 Agent가 빠르게 읽을 수 있는
JSON-LD 캐시 역할을 한다.

```
matrix_cells INSERT/UPDATE
  → MatrixSyncService.syncToGraph(teamId)
    → org Graph의 JSON-LD 업데이트
    → graph_events 기록
    → projections(MATRIX.md) source_hash 불일치
    → ProjectionBuilder.syncProjection('org', teamId) 트리거
```

### 동기화 시점

| 이벤트 | 동기화 |
|--------|--------|
| Cell 생성/수정/삭제 | 즉시 |
| consensus_scores 확정 | 즉시 |
| individual_scores 제출 | 동기화 안 함 (draft 생성 시 반영) |
| Industry/Function 마스터 수정 | 즉시 |
| 시그널 보정 재계산 (Cron) | 일괄 동기화 |

## 9.2 Graph → Projection

```
org Graph 변경
  → content_hash 갱신
  → ProjectionBuilder가 MATRIX.md source_hash와 비교
  → 불일치 시 MATRIX.md 재생성
  → Agent bootstrap 시 최신 MATRIX.md 주입
```

---

# 10. 데이터 무결성 규칙

## 10.1 CHECK 제약 요약

| 테이블 | 컬럼 | 제약 |
|--------|------|------|
| industries | strategic_weight | 0.0 ~ 5.0 |
| industries | is_active | 0 또는 1 |
| functions | category | 'sap_based', 'ai_service', 'hybrid' |
| matrix_cells | time_horizon | 'short', 'mid', 'long' |
| matrix_cells | pipeline_stage | 6개 파이프라인 단계 |
| matrix_cells | status | 'active', 'watching', 'paused', 'archived' |
| matrix_cells | priority | 0 ~ 5 |
| individual_scores | 모든 스코어 컬럼 | 1.0 ~ 5.0 |
| consensus_scores | clevel_score, execution_score | 1.0 ~ 5.0 |
| consensus_scores | signal_adjustment | -2.0 ~ 2.0 |
| consensus_scores | composite_score | 0.0 ~ 5.0 |
| consensus_scores | status | 'draft', 'confirmed', 'revised' |
| cell_topic_map | relevance | 0.0 ~ 1.0 |

## 10.2 FK CASCADE 규칙

| FK 관계 | ON DELETE |
|---------|-----------|
| industries → teams | CASCADE |
| functions → teams | CASCADE |
| matrix_cells → industries | RESTRICT (삭제 방지) |
| matrix_cells → functions | RESTRICT (삭제 방지) |
| matrix_cells → teams | CASCADE |
| individual_scores → matrix_cells | CASCADE |
| consensus_scores → matrix_cells | CASCADE |
| cell_topic_map → matrix_cells | CASCADE |
| cell_topic_map → topics | CASCADE |
| shared_signals.cell_id → matrix_cells | SET NULL |

**핵심:** Industry/Function 마스터를 삭제하면 연결된 Cell이 고아가 되므로 RESTRICT.
Cell 삭제 시에는 연결된 스코어/매핑이 함께 정리되도록 CASCADE.

## 10.3 비즈니스 규칙 (서비스 레이어 강제)

| 규칙 | 강제 위치 | 설명 |
|------|----------|------|
| 같은 Cell × Period에 같은 사용자는 1건만 | UNIQUE 제약 | individual_scores |
| 같은 Cell × Period에 consensus는 1건만 | UNIQUE 제약 | consensus_scores |
| 합의 확정 시 최소 인원 충족 | ScoringService | scoring_config.min_voters_for_confirm |
| 스코어링 가중치 합계 = 1.0 | ScoringService | weight_clevel + weight_execution + weight_signal |
| Cell 생성 시 industry + function 활성 상태 확인 | MatrixService | is_active = 1 체크 |
| confirmed → draft 변경 불가 (revised만 가능) | ScoringService | status 전이 규칙 |

---

# 부록 A: 전체 테이블 목록 (Framework 포팅 범위)

| # | 테이블 | 유형 | Phase | 행 수 추정 (초기) |
|---|--------|------|-------|-----------------|
| 1 | industries | 마스터 | P0 | 8 |
| 2 | functions | 마스터 | P0 | 9 |
| 3 | matrix_cells | 트랜잭션 | P0 | 5~30 |
| 4 | individual_scores | 트랜잭션 | P2 | ~150/월 (5명×30셀) |
| 5 | consensus_scores | 트랜잭션 | P2 | ~30/월 |
| 6 | cell_topic_map | 매핑 | P2 | ~50 |
| 7 | scoring_config | 설정 | P0 | ~10 |
| — | shared_signals (변경) | 기존 확장 | P3 | 기존 데이터 유지 |
| — | projections (변경) | 기존 확장 | P1 | 기존 데이터 유지 |

# 부록 B: TypeScript 타입 정의

```typescript
// app/lib/types/matrix.types.ts

// === Enums ===
export type TimeHorizon = 'short' | 'mid' | 'long';
export type PipelineStage = 'activity' | 'signal' | 'scorecard' | 'brief' | 'validation' | 'pilot_ready';
export type CellStatus = 'active' | 'watching' | 'paused' | 'archived';
export type FunctionCategory = 'sap_based' | 'ai_service' | 'hybrid';
export type RevenueUnit = 'krw_100m' | 'usd_1k' | 'custom';
export type ConsensusStatus = 'draft' | 'confirmed' | 'revised';

// === Entities ===
export interface Industry {
  id: string;
  team_id: string;
  name: string;
  name_en: string | null;
  description: string | null;
  display_order: number;
  strategic_weight: number;
  icon: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Function {
  id: string;
  team_id: string;
  name: string;
  name_en: string | null;
  description: string | null;
  category: FunctionCategory;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MatrixCell {
  id: string;
  team_id: string;
  industry_id: string;
  function_id: string;
  time_horizon: TimeHorizon;
  pipeline_stage: PipelineStage;
  status: CellStatus;
  description: string | null;
  revenue_potential: number | null;
  revenue_unit: RevenueUnit;
  owner_id: string | null;
  priority: number;
  tags: string | null;  // JSON array string
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface IndividualScore {
  id: number;
  cell_id: string;
  scored_by: string;
  score_period: string;  // 'YYYY-MM'
  // C-Level
  strategic_fit: number;
  profitability: number;
  market_scalability: number;
  brand_impact: number;
  roi_expectation: number;
  // Execution
  feasibility: number;
  tech_difficulty: number;
  reference_exists: number;
  resource_available: number;
  risk_level: number;
  // Computed
  clevel_avg: number | null;
  execution_avg: number | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConsensusScore {
  id: number;
  cell_id: string;
  score_period: string;
  clevel_score: number;
  execution_score: number;
  signal_adjustment: number;
  signal_count: number;
  composite_score: number;
  status: ConsensusStatus;
  confirmed_by: string | null;
  confirmed_at: string | null;
  participant_count: number;
  deviation: number | null;
  rationale: string | null;
  prev_composite: number | null;
  created_at: string;
  updated_at: string;
}

export interface CellTopicLink {
  cell_id: string;
  topic_id: string;
  relevance: number;
  linked_by: string;
  note: string | null;
  linked_at: string;
}

// === Input Types ===
export interface IndividualScoreInput {
  strategic_fit: number;
  profitability: number;
  market_scalability: number;
  brand_impact: number;
  roi_expectation: number;
  feasibility: number;
  tech_difficulty: number;
  reference_exists: number;
  resource_available: number;
  risk_level: number;
  comment?: string;
}

export interface CellInput {
  team_id: string;
  industry_id: string;
  function_id: string;
  time_horizon: TimeHorizon;
  description?: string;
  revenue_potential?: number;
  revenue_unit?: RevenueUnit;
  owner_id?: string;
  priority?: number;
  tags?: string[];
  created_by: string;
}

// === Query / View Types ===
export interface HeatmapCell {
  cell_id: string | null;  // null = 아직 미생성 셀
  industry_name: string;
  industry_order: number;
  function_name: string;
  function_order: number;
  time_horizon: TimeHorizon | null;
  pipeline_stage: PipelineStage | null;
  status: CellStatus | null;
  composite_score: number | null;
  clevel_score: number | null;
  execution_score: number | null;
  signal_adjustment: number | null;
  score_status: ConsensusStatus | null;
  score_delta: number | null;
}

export interface HeatmapData {
  cells: HeatmapCell[];
  industries: Pick<Industry, 'id' | 'name' | 'display_order'>[];
  functions: Pick<Function, 'id' | 'name' | 'display_order' | 'category'>[];
  period: string;
}

export interface ScoreTrendEntry {
  period: string;
  composite_score: number;
  clevel_score: number;
  execution_score: number;
  signal_adjustment: number;
  status: ConsensusStatus;
}

// === Stage-Gate Mapping ===
export const STAGE_GATE_MAP: Record<PipelineStage, string> = {
  activity: 'S0',
  signal: 'S1',
  scorecard: 'S2',
  brief: 'S2',
  validation: 'S3',
  pilot_ready: 'S4',
};

export const STAGE_GATE_LABELS: Record<string, string> = {
  S0: '아이디어 수집',
  S1: '시그널 탐지',
  S2: '평가/문서화',
  S3: '검증',
  S4: '파일럿',
};
```
