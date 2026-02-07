-- Strategic Evolution Phase 2: F4 Value-up Engine
-- valueup_assessments + valueup_scores + valueup_scenarios + valueup_checklists

CREATE TABLE valueup_assessments (
  id TEXT PRIMARY KEY,
  discovery_id TEXT REFERENCES discoveries(id) ON DELETE SET NULL,
  industry_adapter_id TEXT REFERENCES industry_adapters(id),

  -- target info
  target_name TEXT NOT NULL,
  target_description TEXT,
  target_profile TEXT,
  assessment_type TEXT NOT NULL,

  -- status
  status TEXT NOT NULL DEFAULT 'draft',
  overall_score INTEGER,

  -- meta
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  created_by TEXT NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_valueup_assessments_discovery ON valueup_assessments(discovery_id);
CREATE INDEX idx_valueup_assessments_status ON valueup_assessments(status);
CREATE INDEX idx_valueup_assessments_industry ON valueup_assessments(industry_adapter_id);

CREATE TABLE valueup_scores (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES valueup_assessments(id) ON DELETE CASCADE,

  dimension TEXT NOT NULL,
  score INTEGER NOT NULL,
  evidence_summary TEXT,
  auto_scored INTEGER NOT NULL DEFAULT 1,

  scored_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_valueup_scores_assessment ON valueup_scores(assessment_id);
CREATE INDEX idx_valueup_scores_dimension ON valueup_scores(dimension);

CREATE TABLE valueup_scenarios (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES valueup_assessments(id) ON DELETE CASCADE,

  scenario_type TEXT NOT NULL,
  transformation_plan TEXT,
  value_projection TEXT,
  risk_factors TEXT,
  key_assumptions TEXT,

  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_valueup_scenarios_assessment ON valueup_scenarios(assessment_id);
CREATE INDEX idx_valueup_scenarios_type ON valueup_scenarios(scenario_type);

CREATE TABLE valueup_checklists (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES valueup_assessments(id) ON DELETE CASCADE,

  checklist_type TEXT NOT NULL,
  items TEXT NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0,

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_valueup_checklists_assessment ON valueup_checklists(assessment_id);
CREATE INDEX idx_valueup_checklists_type ON valueup_checklists(checklist_type);
