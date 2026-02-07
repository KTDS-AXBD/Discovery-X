-- Strategic Evolution Phase 2: F2 Shadow Mode
-- shadow_runs + shadow_configs

CREATE TABLE shadow_runs (
  id TEXT PRIMARY KEY,
  discovery_id TEXT NOT NULL REFERENCES discoveries(id) ON DELETE CASCADE,
  experiment_id TEXT REFERENCES experiments(id),

  -- trigger
  trigger_type TEXT NOT NULL,
  trigger_ref_id TEXT,

  -- comparison data
  baseline_decision TEXT NOT NULL,
  ai_suggestion TEXT NOT NULL,
  context_snapshot TEXT,

  -- comparison result
  match_result TEXT NOT NULL DEFAULT 'pending',
  match_score INTEGER,
  deviation_analysis TEXT,
  deviation_category TEXT,

  -- meta
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  analyzed_at INTEGER,
  reviewed_at INTEGER,
  reviewed_by TEXT REFERENCES users(id)
);

CREATE INDEX idx_shadow_runs_discovery ON shadow_runs(discovery_id);
CREATE INDEX idx_shadow_runs_trigger ON shadow_runs(trigger_type);
CREATE INDEX idx_shadow_runs_result ON shadow_runs(match_result);
CREATE INDEX idx_shadow_runs_created ON shadow_runs(created_at);

CREATE TABLE shadow_configs (
  id TEXT PRIMARY KEY,
  discovery_id TEXT REFERENCES discoveries(id) ON DELETE CASCADE,

  trigger_types TEXT NOT NULL DEFAULT '["gate_decision","stage_transition"]',
  enabled INTEGER NOT NULL DEFAULT 1,
  auto_analyze INTEGER NOT NULL DEFAULT 1,

  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  created_by TEXT REFERENCES users(id)
);

CREATE INDEX idx_shadow_configs_discovery ON shadow_configs(discovery_id);
CREATE INDEX idx_shadow_configs_enabled ON shadow_configs(enabled);
