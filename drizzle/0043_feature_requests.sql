CREATE TABLE IF NOT EXISTS feature_requests (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'IN_REVIEW', 'ACCEPTED', 'REJECTED')),
  reason TEXT,
  submitter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_id TEXT REFERENCES users(id),
  linked_discovery_id TEXT REFERENCES discoveries(id),
  linked_idea_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  reviewed_at INTEGER
);

--> statement-breakpoint

CREATE INDEX idx_feature_requests_status ON feature_requests(status);

--> statement-breakpoint

CREATE INDEX idx_feature_requests_submitter ON feature_requests(submitter_id);

--> statement-breakpoint

CREATE INDEX idx_feature_requests_priority ON feature_requests(priority);
