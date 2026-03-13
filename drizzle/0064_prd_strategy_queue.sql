CREATE TABLE prd_strategy_queue (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL REFERENCES ideas(id),
  prd_id TEXT NOT NULL REFERENCES prds(id),
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDING',
  mode TEXT NOT NULL DEFAULT 'batch',
  prd_context TEXT,
  result_strategy TEXT,
  result_gtm TEXT,
  error_message TEXT,
  model_version TEXT,
  tokens_used INTEGER,
  latency_ms INTEGER,
  requested_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER
);
--> statement-breakpoint
CREATE INDEX idx_prd_strategy_queue_status ON prd_strategy_queue(status);
--> statement-breakpoint
CREATE INDEX idx_prd_strategy_queue_idea ON prd_strategy_queue(idea_id);
--> statement-breakpoint
CREATE INDEX idx_prd_strategy_queue_prd ON prd_strategy_queue(prd_id);
--> statement-breakpoint
CREATE INDEX idx_prd_strategy_queue_tenant ON prd_strategy_queue(tenant_id);
