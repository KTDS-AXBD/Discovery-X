ALTER TABLE users ADD COLUMN onboarding_completed INTEGER NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE users ADD COLUMN onboarding_completed_at INTEGER;
