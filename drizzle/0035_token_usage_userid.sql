ALTER TABLE token_usage_logs ADD COLUMN user_id TEXT;
--> statement-breakpoint
CREATE INDEX idx_token_usage_user_month ON token_usage_logs(user_id, created_at);
