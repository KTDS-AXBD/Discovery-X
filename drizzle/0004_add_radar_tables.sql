-- Radar: auto topic collection + seed generation tables

-- System user for automated radar actions
INSERT OR IGNORE INTO users (id, email, name) VALUES ('system-radar', 'radar@system', 'Radar');

-- radar_sources: collection source configuration
CREATE TABLE radar_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,          -- 'rss' | 'web' | 'youtube'
  url TEXT NOT NULL,
  config TEXT,                         -- JSON: { keywords, selector, ... }
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- radar_items: collected items (dedup + audit trail)
CREATE TABLE radar_items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES radar_sources(id),
  run_id TEXT,
  url_hash TEXT NOT NULL UNIQUE,       -- SHA256(url)
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  title_ko TEXT,
  summary_ko TEXT,
  relevance_score INTEGER,             -- 0-100
  discovery_id TEXT REFERENCES discoveries(id),
  status TEXT NOT NULL DEFAULT 'COLLECTED',  -- COLLECTED | SCORED | SEEDED | SKIPPED
  collected_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- radar_runs: execution log
CREATE TABLE radar_runs (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  sources_checked INTEGER DEFAULT 0,
  items_collected INTEGER DEFAULT 0,
  items_deduplicated INTEGER DEFAULT 0,
  seeds_created INTEGER DEFAULT 0,
  errors TEXT,                          -- JSON array
  status TEXT NOT NULL DEFAULT 'RUNNING'  -- RUNNING | COMPLETED | FAILED
);

-- Indexes for radar_items
CREATE INDEX idx_radar_items_source_id ON radar_items(source_id);
CREATE INDEX idx_radar_items_url_hash ON radar_items(url_hash);
CREATE INDEX idx_radar_items_status ON radar_items(status);
CREATE INDEX idx_radar_items_collected_at ON radar_items(collected_at);

-- Indexes for radar_runs
CREATE INDEX idx_radar_runs_status ON radar_runs(status);
CREATE INDEX idx_radar_runs_started_at ON radar_runs(started_at);
