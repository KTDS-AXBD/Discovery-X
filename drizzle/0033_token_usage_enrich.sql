-- PRD v3 §8.3: token_usage에 cost_usd, purpose 컬럼 추가
ALTER TABLE token_usage_logs ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0.0;
--> statement-breakpoint
ALTER TABLE token_usage_logs ADD COLUMN purpose TEXT;
