-- ACL 감사 로그 테이블
CREATE TABLE IF NOT EXISTS acl_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  action TEXT NOT NULL,
  result TEXT NOT NULL DEFAULT 'denied',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_acl_audit_logs_user ON acl_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_acl_audit_logs_scope ON acl_audit_logs(scope_type, scope_id);

--> statement-breakpoint

-- agent_memory_v2 추가 인덱스 (compact 쿼리 최적화)
CREATE INDEX IF NOT EXISTS idx_agent_memory_v2_compact ON agent_memory_v2(user_id, archived_at, importance);
CREATE INDEX IF NOT EXISTS idx_agent_memory_v2_expires ON agent_memory_v2(user_id, expires_at);
