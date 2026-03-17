-- F47: changelog_feedback 테이블 (세션별 이모지 반응 + 코멘트)
CREATE TABLE IF NOT EXISTS "changelog_feedback" (
  "id" TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  "session_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" TEXT NOT NULL CHECK("type" IN ('emoji', 'comment')),
  "emoji" TEXT,
  "comment" TEXT,
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS "idx_changelog_feedback_session" ON "changelog_feedback" ("session_id");
CREATE INDEX IF NOT EXISTS "idx_changelog_feedback_user" ON "changelog_feedback" ("user_id");
