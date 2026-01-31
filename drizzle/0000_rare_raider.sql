CREATE TABLE `discoveries` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text(80) NOT NULL,
	`seed_summary` text(400) NOT NULL,
	`seed_links` text,
	`source_type` text NOT NULL,
	`owner_id` text,
	`reviewer_id` text,
	`status` text DEFAULT 'INBOX' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`due_date` integer,
	`decision_state` text,
	`decision_rationale` text(400),
	`decided_at` integer,
	`not_now_trigger_type` text,
	`not_now_trigger_condition` text(200),
	`revisit_date` integer,
	`dead_end_failure_pattern` text,
	`dead_end_evidence_reason` text(200),
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reviewer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_discoveries_status` ON `discoveries` (`status`);--> statement-breakpoint
CREATE INDEX `idx_discoveries_owner_id` ON `discoveries` (`owner_id`);--> statement-breakpoint
CREATE INDEX `idx_discoveries_due_date` ON `discoveries` (`due_date`);--> statement-breakpoint
CREATE INDEX `idx_discoveries_revisit_date` ON `discoveries` (`revisit_date`);--> statement-breakpoint
CREATE TABLE `event_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`timestamp` integer DEFAULT (unixepoch()) NOT NULL,
	`actor_id` text NOT NULL,
	`discovery_id` text NOT NULL,
	`event_type` text NOT NULL,
	`metadata` text,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`discovery_id`) REFERENCES `discoveries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_event_logs_discovery_timestamp` ON `event_logs` (`discovery_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `idx_event_logs_event_type_timestamp` ON `event_logs` (`event_type`,`timestamp`);--> statement-breakpoint
CREATE TABLE `evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`discovery_id` text NOT NULL,
	`experiment_id` text,
	`type` text NOT NULL,
	`strength` text NOT NULL,
	`content` text(400) NOT NULL,
	`link_or_attachment` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`created_by_id` text NOT NULL,
	FOREIGN KEY (`discovery_id`) REFERENCES `discoveries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`experiment_id`) REFERENCES `experiments`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `experiments` (
	`id` text PRIMARY KEY NOT NULL,
	`discovery_id` text NOT NULL,
	`hypothesis` text(200) NOT NULL,
	`minimal_action` text(200) NOT NULL,
	`deadline` integer NOT NULL,
	`expected_evidence` text(200) NOT NULL,
	`result_summary` text(400),
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`discovery_id`) REFERENCES `discoveries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);