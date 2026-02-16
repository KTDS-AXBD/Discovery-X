-- notification_queue 테이블 (collab-worker 알림 큐)
CREATE TABLE IF NOT EXISTS notification_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata TEXT,
  read_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_notification_queue_user ON notification_queue(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notification_queue_type ON notification_queue(type, created_at);

--> statement-breakpoint

-- tenants 확장: 프로필 JSON-LD + 운영 규칙 Markdown
ALTER TABLE tenants ADD COLUMN profile_ld TEXT;
ALTER TABLE tenants ADD COLUMN rules_md TEXT;

--> statement-breakpoint

-- cron_logs 테이블 (Cron 실행 이력)
CREATE TABLE IF NOT EXISTS cron_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cron_expression TEXT NOT NULL,
  results_json TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
