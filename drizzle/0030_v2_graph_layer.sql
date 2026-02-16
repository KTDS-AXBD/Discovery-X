-- v2 Graph-First 아키텍처 테이블 (schema-v2.ts)

CREATE TABLE IF NOT EXISTS `graphs` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`jsonld` text NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`content_hash` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CHECK (scope_type IN ('user', 'topic', 'org'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_graphs_scope` ON `graphs` (`scope_type`,`scope_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `graph_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`graph_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_type` text DEFAULT 'user' NOT NULL,
	`action` text NOT NULL,
	`diff_json` text,
	`reason` text,
	`prev_version` integer,
	`new_version` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`graph_id`) REFERENCES `graphs`(`id`) ON UPDATE no action ON DELETE no action,
	CHECK (actor_type IN ('user', 'agent', 'system')),
	CHECK (action IN ('create', 'update', 'delete', 'rollback', 'suggest'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_graph_events_graph_created` ON `graph_events` (`graph_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_graph_events_actor` ON `graph_events` (`actor_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `projections` (
	`id` text PRIMARY KEY NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`proj_type` text NOT NULL,
	`content` text NOT NULL,
	`source_hash` text NOT NULL,
	`graph_version` integer NOT NULL,
	`generated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CHECK (scope_type IN ('user', 'topic', 'org')),
	CHECK (proj_type IN ('USER.md', 'TOPIC.md', 'BRIEFING.md', 'SOUL.md'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `uq_projections_scope_proj` ON `projections` (`scope_type`,`scope_id`,`proj_type`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	CHECK (status IN ('active', 'completed', 'archived'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_topics_team` ON `topics` (`team_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_topics_status` ON `topics` (`status`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `topic_members` (
	`topic_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text DEFAULT 'editor' NOT NULL,
	`joined_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`topic_id`, `user_id`),
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action,
	CHECK (role IN ('owner', 'editor', 'viewer'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `shared_signals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source_user_id` text NOT NULL,
	`team_id` text NOT NULL,
	`topic_id` text,
	`content_summary` text NOT NULL,
	`score` real NOT NULL,
	`opportunity_id` text,
	`routed_to` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CHECK (status IN ('pending', 'reviewed', 'actioned', 'dismissed'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_shared_signals_team_score` ON `shared_signals` (`team_id`,`score`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_shared_signals_topic` ON `shared_signals` (`topic_id`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `agent_memory_v2` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`memory_type` text NOT NULL,
	`category` text,
	`content` text NOT NULL,
	`metadata` text,
	`log_date` text,
	`importance` real DEFAULT 0.5 NOT NULL,
	`token_count` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`expires_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	CHECK (memory_type IN ('daily_log', 'long_term', 'learned_pref'))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_agent_memory_v2_user_type` ON `agent_memory_v2` (`user_id`,`memory_type`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_agent_memory_v2_user_date` ON `agent_memory_v2` (`user_id`,`log_date`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `agent_sessions_v2` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`ended_at` integer,
	`token_count` integer DEFAULT 0 NOT NULL,
	`token_cost` real DEFAULT 0 NOT NULL,
	`summary` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_agent_sessions_v2_user` ON `agent_sessions_v2` (`user_id`);
