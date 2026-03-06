-- feature_requests status CHECK 확장: 기존 4개 + AI_REVIEWING, CLASSIFIED, HUMAN_REVIEW 추가
-- SQLite는 ALTER CONSTRAINT 미지원 → 테이블 재생성 필요

PRAGMA foreign_keys = OFF;
--> statement-breakpoint

CREATE TABLE feature_requests_new (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'IN_REVIEW', 'ACCEPTED', 'REJECTED', 'AI_REVIEWING', 'CLASSIFIED', 'HUMAN_REVIEW')),
  reason TEXT,
  submitter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reviewer_id TEXT REFERENCES users(id),
  linked_discovery_id TEXT REFERENCES discoveries(id),
  linked_idea_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  reviewed_at INTEGER,
  ai_review_id TEXT REFERENCES request_reviews(id)
);
--> statement-breakpoint

INSERT INTO feature_requests_new SELECT id, title, description, priority, status, reason, submitter_id, reviewer_id, linked_discovery_id, linked_idea_id, created_at, reviewed_at, ai_review_id FROM feature_requests;
--> statement-breakpoint

DROP TABLE feature_requests;
--> statement-breakpoint

ALTER TABLE feature_requests_new RENAME TO feature_requests;
--> statement-breakpoint

CREATE INDEX idx_feature_requests_status ON feature_requests(status);
--> statement-breakpoint

CREATE INDEX idx_feature_requests_submitter ON feature_requests(submitter_id);
--> statement-breakpoint

CREATE INDEX idx_feature_requests_priority ON feature_requests(priority);
--> statement-breakpoint

PRAGMA foreign_keys = ON;
