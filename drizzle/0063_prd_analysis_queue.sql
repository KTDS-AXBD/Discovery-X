-- PRD Analysis Queue (F44 Phase 3: 아이디어 분석 대체)
-- claude -p 배치 처리를 위한 비동기 큐 테이블

CREATE TABLE prd_analysis_queue (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL,
  prd_id TEXT,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  requested_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'PENDING',
  source_context TEXT,
  source_ids TEXT,
  result_sections TEXT,
  result_review TEXT,
  error_message TEXT,
  model_version TEXT,
  tokens_used INTEGER,
  latency_ms INTEGER,
  requested_at INTEGER NOT NULL DEFAULT (unixepoch()),
  started_at INTEGER,
  completed_at INTEGER
);

CREATE INDEX idx_prd_analysis_queue_status ON prd_analysis_queue(status);
CREATE INDEX idx_prd_analysis_queue_idea ON prd_analysis_queue(idea_id);
CREATE INDEX idx_prd_analysis_queue_tenant ON prd_analysis_queue(tenant_id);
