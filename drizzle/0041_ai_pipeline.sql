-- AI 파이프라인 실행 이력
CREATE TABLE IF NOT EXISTS `ai_pipeline_runs` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text REFERENCES `tenants`(`id`),
  `started_at` integer NOT NULL DEFAULT (unixepoch()),
  `completed_at` integer,
  `status` text NOT NULL DEFAULT 'RUNNING',
  `radar_items_processed` integer DEFAULT 0,
  `ideas_created` integer DEFAULT 0,
  `discoveries_created` integer DEFAULT 0,
  `errors` text,
  `token_usage_input` integer DEFAULT 0,
  `token_usage_output` integer DEFAULT 0
);
--> statement-breakpoint
-- Radar 아이템 AI 처리 추적
ALTER TABLE `radar_items` ADD COLUMN `ai_processed_at` integer;
--> statement-breakpoint
-- Discovery ← Idea 역추적
ALTER TABLE `discoveries` ADD COLUMN `source_idea_id` text REFERENCES `ideas`(`id`);
--> statement-breakpoint
-- Ideas에 AI 생성 플래그
ALTER TABLE `ideas` ADD COLUMN `created_by_agent` integer NOT NULL DEFAULT 0;
