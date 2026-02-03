-- Venture Discovery Sprint Tables
-- v4 기능: 5일 스프린트 기반 기회 발굴

-- 1. vd_sprints - 스프린트 메인 테이블
CREATE TABLE `vd_sprints` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`owner_id` text NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`target_end_date` integer,
	`current_day` integer DEFAULT 0,
	`config` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_vd_sprints_status` ON `vd_sprints` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_vd_sprints_owner` ON `vd_sprints` (`owner_id`);

--> statement-breakpoint
-- 2. vd_sprint_scopes - 산업/범위 설정
CREATE TABLE `vd_sprint_scopes` (
	`id` text PRIMARY KEY NOT NULL,
	`sprint_id` text NOT NULL,
	`industry` text NOT NULL,
	`function` text,
	`technology` text,
	`geography` text,
	`keywords` text,
	`exclusions` text,
	`selected` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`sprint_id`) REFERENCES `vd_sprints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_vd_sprint_scopes_sprint` ON `vd_sprint_scopes` (`sprint_id`);
--> statement-breakpoint
CREATE INDEX `idx_vd_sprint_scopes_selected` ON `vd_sprint_scopes` (`selected`);

--> statement-breakpoint
-- 3. vd_signals - 신호 수집
CREATE TABLE `vd_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`sprint_id` text NOT NULL,
	`signal_type` text NOT NULL,
	`title` text NOT NULL,
	`summary` text,
	`source_url` text,
	`source_title` text,
	`published_at` integer,
	`relevance_score` integer,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`sprint_id`) REFERENCES `vd_sprints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_vd_signals_sprint` ON `vd_signals` (`sprint_id`);
--> statement-breakpoint
CREATE INDEX `idx_vd_signals_type` ON `vd_signals` (`signal_type`);
--> statement-breakpoint
CREATE INDEX `idx_vd_signals_relevance` ON `vd_signals` (`relevance_score`);

--> statement-breakpoint
-- 4. vd_problems - 문제 정의
CREATE TABLE `vd_problems` (
	`id` text PRIMARY KEY NOT NULL,
	`sprint_id` text NOT NULL,
	`statement` text NOT NULL,
	`severity` integer,
	`frequency` integer,
	`target_segment` text,
	`signal_ids` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`sprint_id`) REFERENCES `vd_sprints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_vd_problems_sprint` ON `vd_problems` (`sprint_id`);

--> statement-breakpoint
-- 5. vd_themes - 토픽/클러스터
CREATE TABLE `vd_themes` (
	`id` text PRIMARY KEY NOT NULL,
	`sprint_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`parent_theme_id` text,
	`opportunity_count` integer DEFAULT 0,
	`depth_score` integer,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`sprint_id`) REFERENCES `vd_sprints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_vd_themes_sprint` ON `vd_themes` (`sprint_id`);
--> statement-breakpoint
CREATE INDEX `idx_vd_themes_parent` ON `vd_themes` (`parent_theme_id`);

--> statement-breakpoint
-- 6. vd_opportunities - 기회 카드
CREATE TABLE `vd_opportunities` (
	`id` text PRIMARY KEY NOT NULL,
	`sprint_id` text NOT NULL,
	`theme_id` text,
	`title` text NOT NULL,
	`description` text,
	`problem_ids` text,
	`target_segment` text,
	`potential_score` integer,
	`confidence_score` integer,
	`depth_score` integer,
	`effort_score` integer,
	`recommendation` text,
	`is_shortlisted` integer DEFAULT 0,
	`is_final` integer DEFAULT 0,
	`rank` integer,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`sprint_id`) REFERENCES `vd_sprints`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`theme_id`) REFERENCES `vd_themes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_vd_opportunities_sprint` ON `vd_opportunities` (`sprint_id`);
--> statement-breakpoint
CREATE INDEX `idx_vd_opportunities_theme` ON `vd_opportunities` (`theme_id`);
--> statement-breakpoint
CREATE INDEX `idx_vd_opportunities_shortlist` ON `vd_opportunities` (`is_shortlisted`);
--> statement-breakpoint
CREATE INDEX `idx_vd_opportunities_final` ON `vd_opportunities` (`is_final`);

--> statement-breakpoint
-- 7. vd_evidences - 근거
CREATE TABLE `vd_evidences` (
	`id` text PRIMARY KEY NOT NULL,
	`sprint_id` text NOT NULL,
	`opportunity_id` text,
	`signal_id` text,
	`type` text NOT NULL,
	`strength` text NOT NULL,
	`content` text NOT NULL,
	`source_url` text,
	`source_title` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`sprint_id`) REFERENCES `vd_sprints`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`opportunity_id`) REFERENCES `vd_opportunities`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`signal_id`) REFERENCES `vd_signals`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_vd_evidences_sprint` ON `vd_evidences` (`sprint_id`);
--> statement-breakpoint
CREATE INDEX `idx_vd_evidences_opportunity` ON `vd_evidences` (`opportunity_id`);

--> statement-breakpoint
-- 8. vd_assumptions - 가정
CREATE TABLE `vd_assumptions` (
	`id` text PRIMARY KEY NOT NULL,
	`opportunity_id` text NOT NULL,
	`statement` text NOT NULL,
	`criticality` integer,
	`confidence` integer,
	`validation_method` text,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`evidence_ids` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `vd_opportunities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_vd_assumptions_opportunity` ON `vd_assumptions` (`opportunity_id`);
--> statement-breakpoint
CREATE INDEX `idx_vd_assumptions_status` ON `vd_assumptions` (`status`);

--> statement-breakpoint
-- 9. vd_premortems - Pre-mortem
CREATE TABLE `vd_premortems` (
	`id` text PRIMARY KEY NOT NULL,
	`opportunity_id` text NOT NULL,
	`failure_scenario` text NOT NULL,
	`probability` integer,
	`impact` integer,
	`mitigation_strategy` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `vd_opportunities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_vd_premortems_opportunity` ON `vd_premortems` (`opportunity_id`);

--> statement-breakpoint
-- 10. vd_artifacts - Lean Canvas, 피치 등
CREATE TABLE `vd_artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`opportunity_id` text NOT NULL,
	`artifact_type` text NOT NULL,
	`title` text NOT NULL,
	`content` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `vd_opportunities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_vd_artifacts_opportunity` ON `vd_artifacts` (`opportunity_id`);
--> statement-breakpoint
CREATE INDEX `idx_vd_artifacts_type` ON `vd_artifacts` (`artifact_type`);

--> statement-breakpoint
-- 11. vd_decisions - Gate 의사결정
CREATE TABLE `vd_decisions` (
	`id` text PRIMARY KEY NOT NULL,
	`sprint_id` text NOT NULL,
	`decision_type` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`agent_recommendation` text,
	`selected_option` text,
	`human_rationale` text,
	`decided_at` integer,
	`decided_by` text,
	`timeout_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`sprint_id`) REFERENCES `vd_sprints`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`decided_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_vd_decisions_sprint` ON `vd_decisions` (`sprint_id`);
--> statement-breakpoint
CREATE INDEX `idx_vd_decisions_type` ON `vd_decisions` (`decision_type`);
--> statement-breakpoint
CREATE INDEX `idx_vd_decisions_status` ON `vd_decisions` (`status`);

--> statement-breakpoint
-- 12. vd_votes - 투표
CREATE TABLE `vd_votes` (
	`id` text PRIMARY KEY NOT NULL,
	`decision_id` text NOT NULL,
	`voter_id` text NOT NULL,
	`opportunity_id` text,
	`vote` integer NOT NULL,
	`comment` text,
	`is_blind` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`decision_id`) REFERENCES `vd_decisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`voter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`opportunity_id`) REFERENCES `vd_opportunities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_vd_votes_decision` ON `vd_votes` (`decision_id`);
--> statement-breakpoint
CREATE INDEX `idx_vd_votes_voter` ON `vd_votes` (`voter_id`);
--> statement-breakpoint
CREATE INDEX `idx_vd_votes_opportunity` ON `vd_votes` (`opportunity_id`);

--> statement-breakpoint
-- 13. vd_scores - 점수
CREATE TABLE `vd_scores` (
	`id` text PRIMARY KEY NOT NULL,
	`opportunity_id` text NOT NULL,
	`dimension` text NOT NULL,
	`value` integer NOT NULL,
	`source` text NOT NULL,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`opportunity_id`) REFERENCES `vd_opportunities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_vd_scores_opportunity` ON `vd_scores` (`opportunity_id`);
--> statement-breakpoint
CREATE INDEX `idx_vd_scores_dimension` ON `vd_scores` (`dimension`);

--> statement-breakpoint
-- 14. vd_work_events - 이벤트 로그
CREATE TABLE `vd_work_events` (
	`id` text PRIMARY KEY NOT NULL,
	`sprint_id` text NOT NULL,
	`event_type` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`entity_type` text,
	`entity_id` text,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`sprint_id`) REFERENCES `vd_sprints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_vd_work_events_sprint` ON `vd_work_events` (`sprint_id`);
--> statement-breakpoint
CREATE INDEX `idx_vd_work_events_type` ON `vd_work_events` (`event_type`);
--> statement-breakpoint
CREATE INDEX `idx_vd_work_events_entity` ON `vd_work_events` (`entity_type`, `entity_id`);
--> statement-breakpoint
CREATE INDEX `idx_vd_work_events_created` ON `vd_work_events` (`created_at`);

--> statement-breakpoint
-- 15. vd_analytics_snapshots - 분석 스냅샷
CREATE TABLE `vd_analytics_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`sprint_id` text,
	`snapshot_type` text NOT NULL,
	`data` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`sprint_id`) REFERENCES `vd_sprints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_vd_analytics_sprint` ON `vd_analytics_snapshots` (`sprint_id`);
--> statement-breakpoint
CREATE INDEX `idx_vd_analytics_type` ON `vd_analytics_snapshots` (`snapshot_type`);

--> statement-breakpoint
-- 16. vd_task_queue - 작업 큐
CREATE TABLE `vd_task_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`sprint_id` text NOT NULL,
	`task_type` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`input` text,
	`output` text,
	`error` text,
	`retry_count` integer DEFAULT 0 NOT NULL,
	`max_retries` integer DEFAULT 3 NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`scheduled_at` integer,
	FOREIGN KEY (`sprint_id`) REFERENCES `vd_sprints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_vd_task_queue_sprint` ON `vd_task_queue` (`sprint_id`);
--> statement-breakpoint
CREATE INDEX `idx_vd_task_queue_status` ON `vd_task_queue` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_vd_task_queue_priority` ON `vd_task_queue` (`priority`);
--> statement-breakpoint
CREATE INDEX `idx_vd_task_queue_scheduled` ON `vd_task_queue` (`scheduled_at`);
