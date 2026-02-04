-- Add embedding tracking columns
ALTER TABLE discoveries ADD COLUMN embedding_updated_at INTEGER;
--> statement-breakpoint
ALTER TABLE evidence ADD COLUMN embedding_updated_at INTEGER;
