CREATE TABLE mvp_builds (
  id TEXT PRIMARY KEY NOT NULL,
  proposal_id TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  stack TEXT NOT NULL DEFAULT 'nextjs',
  sections TEXT NOT NULL DEFAULT '[]',
  project_name TEXT NOT NULL,
  files TEXT NOT NULL DEFAULT '[]',
  architecture TEXT,
  summary TEXT,
  file_count INTEGER NOT NULL DEFAULT 0,
  total_lines INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'generating',
  error_message TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_mvp_builds_proposal ON mvp_builds(proposal_id);
CREATE INDEX idx_mvp_builds_tenant ON mvp_builds(tenant_id);
