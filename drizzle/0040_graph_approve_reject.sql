-- graph_events CHECK 제약에 'approve', 'reject' 추가
-- SQLite는 ALTER CONSTRAINT 미지원 → 테이블 재생성 방식

CREATE TABLE IF NOT EXISTS `graph_events_new` (
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
	CHECK (action IN ('create', 'update', 'delete', 'rollback', 'suggest', 'approve', 'reject'))
);
--> statement-breakpoint
INSERT INTO `graph_events_new` SELECT * FROM `graph_events`;
--> statement-breakpoint
DROP TABLE `graph_events`;
--> statement-breakpoint
ALTER TABLE `graph_events_new` RENAME TO `graph_events`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_graph_events_graph_created` ON `graph_events` (`graph_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_graph_events_actor` ON `graph_events` (`actor_id`);
