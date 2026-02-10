-- Proposals feature: 6 tables
-- Generated from app/features/proposals/db/schema.ts

CREATE TABLE `proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text NOT NULL DEFAULT 'DRAFT',
	`team_size` integer,
	`start_date` text,
	`budget` text,
	`owner_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_proposals_tenant` ON `proposals` (`tenant_id`);
--> statement-breakpoint
CREATE INDEX `idx_proposals_owner` ON `proposals` (`owner_id`);
--> statement-breakpoint
CREATE INDEX `idx_proposals_status` ON `proposals` (`status`);
--> statement-breakpoint
CREATE TABLE `proposal_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL DEFAULT '',
	`sort_order` integer NOT NULL DEFAULT 0,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_proposal_sections_proposal` ON `proposal_sections` (`proposal_id`);
--> statement-breakpoint
CREATE TABLE `proposal_milestones` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL DEFAULT 'PENDING',
	`start_date` text,
	`end_date` text,
	`sort_order` integer NOT NULL DEFAULT 0,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_proposal_milestones_proposal` ON `proposal_milestones` (`proposal_id`);
--> statement-breakpoint
CREATE TABLE `proposal_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`title` text NOT NULL,
	`assignee_id` text,
	`completed` integer NOT NULL DEFAULT 0,
	`due_date` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignee_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_proposal_actions_proposal` ON `proposal_actions` (`proposal_id`);
--> statement-breakpoint
CREATE TABLE `proposal_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`proposal_id` text NOT NULL,
	`author_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`author_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_proposal_comments_proposal` ON `proposal_comments` (`proposal_id`);
--> statement-breakpoint
CREATE TABLE `proposal_members` (
	`proposal_id` text NOT NULL,
	`user_id` text NOT NULL,
	`joined_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`proposal_id`) REFERENCES `proposals`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_proposal_members_proposal` ON `proposal_members` (`proposal_id`);
--> statement-breakpoint
CREATE INDEX `idx_proposal_members_user` ON `proposal_members` (`user_id`);
