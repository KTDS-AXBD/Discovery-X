-- PRD Studio (F44) — 5개 테이블
-- prds, prd_sections, prd_versions, prd_reviews, prd_events

CREATE TABLE IF NOT EXISTS `prds` (
  `id` text PRIMARY KEY NOT NULL,
  `tenant_id` text NOT NULL REFERENCES `tenants`(`id`),
  `title` text NOT NULL,
  `status` text NOT NULL DEFAULT 'DRAFT',
  `version` integer NOT NULL DEFAULT 1,
  `created_by` text NOT NULL REFERENCES `users`(`id`),
  `source_idea_id` text,
  `interview_progress` integer NOT NULL DEFAULT 0,
  `final_rating` integer,
  `final_comment` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS `idx_prds_tenant` ON `prds`(`tenant_id`);
CREATE INDEX IF NOT EXISTS `idx_prds_created_by` ON `prds`(`created_by`);
CREATE INDEX IF NOT EXISTS `idx_prds_status` ON `prds`(`status`);

CREATE TABLE IF NOT EXISTS `prd_sections` (
  `id` text PRIMARY KEY NOT NULL,
  `prd_id` text NOT NULL REFERENCES `prds`(`id`) ON DELETE CASCADE,
  `type` text NOT NULL,
  `interview_answer` text,
  `generated_content` text,
  `edited_content` text,
  `sort_order` integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS `idx_prd_sections_prd` ON `prd_sections`(`prd_id`);

CREATE TABLE IF NOT EXISTS `prd_versions` (
  `id` text PRIMARY KEY NOT NULL,
  `prd_id` text NOT NULL REFERENCES `prds`(`id`) ON DELETE CASCADE,
  `version` integer NOT NULL,
  `snapshot` text,
  `change_note` text,
  `changed_by` text NOT NULL REFERENCES `users`(`id`),
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS `idx_prd_versions_prd` ON `prd_versions`(`prd_id`);

CREATE TABLE IF NOT EXISTS `prd_reviews` (
  `id` text PRIMARY KEY NOT NULL,
  `prd_id` text NOT NULL REFERENCES `prds`(`id`) ON DELETE CASCADE,
  `round` integer NOT NULL,
  `model` text NOT NULL,
  `verdict` text,
  `feedback_items` text,
  `scorecard` text,
  `raw_response` text,
  `prd_version` integer NOT NULL,
  `tokens` integer,
  `latency` integer,
  `error` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS `idx_prd_reviews_prd` ON `prd_reviews`(`prd_id`);
CREATE INDEX IF NOT EXISTS `idx_prd_reviews_round` ON `prd_reviews`(`prd_id`, `round`);

CREATE TABLE IF NOT EXISTS `prd_events` (
  `id` text PRIMARY KEY NOT NULL,
  `prd_id` text REFERENCES `prds`(`id`) ON DELETE CASCADE,
  `tenant_id` text NOT NULL REFERENCES `tenants`(`id`),
  `event_type` text NOT NULL,
  `actor_id` text REFERENCES `users`(`id`),
  `payload` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS `idx_prd_events_prd` ON `prd_events`(`prd_id`);
CREATE INDEX IF NOT EXISTS `idx_prd_events_type` ON `prd_events`(`event_type`);
CREATE INDEX IF NOT EXISTS `idx_prd_events_tenant` ON `prd_events`(`tenant_id`);
