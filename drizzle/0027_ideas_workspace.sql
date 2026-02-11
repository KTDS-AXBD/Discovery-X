-- ideas workspace table
CREATE TABLE IF NOT EXISTS `ideas` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL REFERENCES `tenants`(`id`) ON DELETE CASCADE,
  `owner_id` text NOT NULL REFERENCES `users`(`id`),
  `title` text NOT NULL,
  `status` text NOT NULL DEFAULT 'ACTIVE',
  `conversation_id` text REFERENCES `conversations`(`id`),
  `analysis_data` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ideas_tenant` ON `ideas` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ideas_owner` ON `ideas` (`owner_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ideas_status` ON `ideas` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ideas_created_at` ON `ideas` (`created_at`);
--> statement-breakpoint
-- idea_sources join table
CREATE TABLE IF NOT EXISTS `idea_sources` (
  `id` text PRIMARY KEY NOT NULL,
  `idea_id` text NOT NULL REFERENCES `ideas`(`id`) ON DELETE CASCADE,
  `radar_item_id` text NOT NULL REFERENCES `radar_items`(`id`) ON DELETE CASCADE,
  `added_at` integer NOT NULL DEFAULT (unixepoch())
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_idea_sources_idea` ON `idea_sources` (`idea_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_idea_sources_radar_item` ON `idea_sources` (`radar_item_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_idea_sources_unique` ON `idea_sources` (`idea_id`, `radar_item_id`);
