-- F46: 범용 스킬 엔진 — skill_catalog + skill_executions

CREATE TABLE skill_catalog (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  input_type TEXT NOT NULL DEFAULT 'sources',
  prompt_template TEXT NOT NULL,
  output_schema TEXT,
  chain_next TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_skill_catalog_category ON skill_catalog(category);
CREATE INDEX idx_skill_catalog_slug ON skill_catalog(slug);

--> statement-breakpoint

CREATE TABLE skill_executions (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL REFERENCES skill_catalog(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  executed_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDING',
  input_context TEXT,
  result_data TEXT,
  result_markdown TEXT,
  error_message TEXT,
  model_version TEXT,
  tokens_used INTEGER,
  latency_ms INTEGER,
  requested_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER
);

CREATE INDEX idx_skill_exec_idea ON skill_executions(idea_id);
CREATE INDEX idx_skill_exec_skill ON skill_executions(skill_id);
CREATE INDEX idx_skill_exec_tenant ON skill_executions(tenant_id);
CREATE INDEX idx_skill_exec_status ON skill_executions(status);
CREATE INDEX idx_skill_exec_requested ON skill_executions(requested_at);
