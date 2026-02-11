-- Proposal redesign: status migration + new columns + new tables
-- DRAFT/REVIEWING → PROPOSAL, APPROVED → COMPLETED, REJECTED → CLOSED

-- 1) Migrate existing statuses
UPDATE `proposals` SET `status` = 'PROPOSAL' WHERE `status` IN ('DRAFT', 'REVIEWING');
--> statement-breakpoint
UPDATE `proposals` SET `status` = 'COMPLETED' WHERE `status` = 'APPROVED';
--> statement-breakpoint
UPDATE `proposals` SET `status` = 'CLOSED' WHERE `status` = 'REJECTED';
--> statement-breakpoint

-- 2) Add new columns to proposals
ALTER TABLE `proposals` ADD COLUMN `category` text;
--> statement-breakpoint
ALTER TABLE `proposals` ADD COLUMN `close_type` text;
--> statement-breakpoint
ALTER TABLE `proposals` ADD COLUMN `closed_at` integer;
--> statement-breakpoint
ALTER TABLE `proposals` ADD COLUMN `submitted_at` integer;
--> statement-breakpoint
ALTER TABLE `proposals` ADD COLUMN `like_count` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `proposals` ADD COLUMN `comment_count` integer NOT NULL DEFAULT 0;
--> statement-breakpoint

-- 3) proposal_likes table
CREATE TABLE `proposal_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_proposal_likes_unique` ON `proposal_likes` (`proposal_id`, `user_id`);
--> statement-breakpoint
CREATE INDEX `idx_proposal_likes_proposal` ON `proposal_likes` (`proposal_id`);
--> statement-breakpoint

-- 4) proposal_categories table
CREATE TABLE `proposal_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`usage_count` integer NOT NULL DEFAULT 0,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_proposal_categories_unique` ON `proposal_categories` (`tenant_id`, `name`);
--> statement-breakpoint

-- 5) Sync comment_count from existing data
UPDATE `proposals` SET `comment_count` = (
	SELECT COUNT(*) FROM `proposal_comments` WHERE `proposal_comments`.`proposal_id` = `proposals`.`id`
);
