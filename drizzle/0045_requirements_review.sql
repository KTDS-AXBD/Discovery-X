-- 요구사항 검토 Agent: AI 리뷰 + 이벤트 로그 + 작업계획
-- ADR-1: request_events 별도 테이블 (eventLogs.discoveryId NOT NULL FK)

CREATE TABLE IF NOT EXISTS request_reviews (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  request_id TEXT NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
  classification TEXT NOT NULL CHECK(classification IN ('ALREADY_DONE', 'IN_PLAN', 'NEW_VALUABLE', 'OUT_OF_SCOPE')),
  impact_score INTEGER NOT NULL DEFAULT 0 CHECK(impact_score BETWEEN 0 AND 5),
  feasibility_score INTEGER NOT NULL DEFAULT 0 CHECK(feasibility_score BETWEEN 0 AND 5),
  rationale TEXT NOT NULL,
  matched_routes TEXT,
  matched_spec_sections TEXT,
  work_plan_draft TEXT,
  model_id TEXT,
  token_usage INTEGER DEFAULT 0,
  human_verdict TEXT CHECK(human_verdict IN ('APPROVED', 'REJECTED', 'NEEDS_REVISION')),
  human_comment TEXT,
  reviewed_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  reviewed_at INTEGER
);
--> statement-breakpoint
CREATE INDEX idx_request_reviews_request ON request_reviews(request_id);
--> statement-breakpoint
CREATE INDEX idx_request_reviews_classification ON request_reviews(classification);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS request_events (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  request_id TEXT NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_id TEXT REFERENCES users(id),
  actor_type TEXT NOT NULL DEFAULT 'user' CHECK(actor_type IN ('user', 'agent', 'system')),
  payload TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX idx_request_events_request ON request_events(request_id);
--> statement-breakpoint
CREATE INDEX idx_request_events_type ON request_events(event_type);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS work_plans (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  request_id TEXT NOT NULL REFERENCES feature_requests(id) ON DELETE CASCADE,
  review_id TEXT REFERENCES request_reviews(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  steps TEXT,
  estimated_effort TEXT,
  linked_discovery_id TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  created_by TEXT REFERENCES users(id),
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX idx_work_plans_request ON work_plans(request_id);
--> statement-breakpoint
CREATE INDEX idx_work_plans_status ON work_plans(status);
--> statement-breakpoint

-- feature_requests 테이블에 ai_review_id 컬럼 추가
ALTER TABLE feature_requests ADD COLUMN ai_review_id TEXT REFERENCES request_reviews(id);
--> statement-breakpoint

-- status CHECK 제약조건 업데이트를 위해 새 인덱스 추가 (SQLite는 CHECK 수정 불가 — 앱 레벨에서 검증)
